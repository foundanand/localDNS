'use strict';

const acme   = require('acme-client');
const dns    = require('dns');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const cf     = require('./cloudflare');

const LE_DIRECTORY = acme.directory.letsencrypt.production;
const CERT_DIR     = path.join(os.homedir(), '.localmap', 'certs');
const META_FILE    = path.join(CERT_DIR, 'meta.json');
const ACCOUNT_KEY  = path.join(CERT_DIR, 'account-key.pem');
const CERT_FILE    = path.join(CERT_DIR, 'wildcard.pem');
const KEY_FILE     = path.join(CERT_DIR, 'wildcard-key.pem');

// Days remaining before we force-renew
const RENEW_THRESHOLD_DAYS = 30;

function ensureCertDir() {
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
}

function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch (_) { return null; }
}

function isCertValid(meta, baseDomain) {
  if (!meta || meta.baseDomain !== baseDomain) return false;
  if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) return false;
  const expiresAt = new Date(meta.expiresAt);
  const daysLeft  = (expiresAt - Date.now()) / (1000 * 60 * 60 * 24);
  return daysLeft > RENEW_THRESHOLD_DAYS;
}

async function loadOrCreateAccountKey() {
  if (fs.existsSync(ACCOUNT_KEY)) {
    return fs.readFileSync(ACCOUNT_KEY);
  }
  const key = await acme.crypto.createPrivateKey();
  fs.writeFileSync(ACCOUNT_KEY, key);
  return key;
}

// Poll a public resolver until the ACME TXT record is visible
async function waitForTxtPropagation(baseDomain, expectedValue) {
  const resolver = new dns.Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  const challengeHost = `_acme-challenge.${baseDomain}`;

  for (let i = 0; i < 24; i++) { // up to 2 minutes
    try {
      const records = await resolver.resolveTxt(challengeHost);
      const found = records.flat().includes(expectedValue);
      if (found) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 5000));
  }
  console.warn('  Warning: TXT record not confirmed in public DNS — proceeding anyway');
}

async function obtainCert(baseDomain, cloudflareToken, email) {
  ensureCertDir();

  const meta = loadMeta();
  if (isCertValid(meta, baseDomain)) {
    const days = Math.floor((new Date(meta.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24));
    console.log(`  Using cached certificate (${days} days remaining)`);
    return { certFile: CERT_FILE, keyFile: KEY_FILE };
  }

  console.log('  Obtaining Let\'s Encrypt certificate via DNS-01...');

  const zoneId = await cf.getZoneId(cloudflareToken, baseDomain);

  // Clean up any stale _acme-challenge TXT records from a previous failed run
  await cf.clearAcmeTxtRecords(cloudflareToken, zoneId, baseDomain);
  const accountKey = await loadOrCreateAccountKey();

  const client = new acme.Client({
    directoryUrl: LE_DIRECTORY,
    accountKey,
  });

  await client.createAccount({
    termsOfServiceAgreed: true,
    ...(email ? { contact: [`mailto:${email}`] } : {}),
  });

  const [certKey, csr] = await acme.crypto.createCsr({
    altNames: [`*.${baseDomain}`, baseDomain],
  });

  // Map keyAuth value → Cloudflare record ID so concurrent challenges
  // (LE issues one for *.domain and one for domain) each clean up their own record.
  const acmeTxtRecordIds = new Map();

  const cert = await client.auto({
    csr,
    challengePriority: ['dns-01'],
    challengeCreateFn: async (_authz, _challenge, keyAuth) => {
      console.log('  Setting DNS TXT record for ACME challenge...');
      const recordId = await cf.setAcmeTxtRecord(cloudflareToken, zoneId, baseDomain, keyAuth);
      acmeTxtRecordIds.set(keyAuth, recordId);
      console.log('  Waiting for DNS propagation...');
      await waitForTxtPropagation(baseDomain, keyAuth);
      console.log('  DNS propagation confirmed');
    },
    challengeRemoveFn: async (_authz, _challenge, keyAuth) => {
      const recordId = acmeTxtRecordIds.get(keyAuth);
      if (recordId) {
        await cf.deleteAcmeTxtRecord(cloudflareToken, zoneId, recordId);
        acmeTxtRecordIds.delete(keyAuth);
      }
    },
  });

  // Parse expiry from the issued cert
  const certInfo  = await acme.crypto.readCertificateInfo(cert);
  const expiresAt = certInfo.notAfter;

  fs.writeFileSync(CERT_FILE, cert);
  fs.writeFileSync(KEY_FILE, certKey);
  fs.writeFileSync(META_FILE, JSON.stringify({ baseDomain, expiresAt }, null, 2));

  console.log(`  Certificate issued, valid until ${expiresAt.toISOString().split('T')[0]}`);
  return { certFile: CERT_FILE, keyFile: KEY_FILE };
}

// Background renewal — checks daily, renews when < RENEW_THRESHOLD_DAYS remain.
// Backs off exponentially on failure to avoid hammering Let's Encrypt rate limits
// (5 duplicate certs/week, 50 certs/registered domain/week).
function scheduleRenewal(baseDomain, cloudflareToken, email, httpsServer) {
  const CHECK_INTERVAL  = 24 * 60 * 60 * 1000; // 24 hours
  const MAX_BACKOFF_DAYS = 4; // stop retrying after 4 days (well under the 7-day rate-limit window)

  let failedAttempts = 0;
  let nextRetryAfter = null; // Date after which we may retry

  setInterval(async () => {
    const meta = loadMeta();
    if (isCertValid(meta, baseDomain)) {
      // Reset backoff once the cert is healthy again (e.g. after manual fix)
      failedAttempts = 0;
      nextRetryAfter = null;
      return;
    }

    // Backoff: if we've failed before, wait before retrying
    if (nextRetryAfter && Date.now() < nextRetryAfter) {
      const hoursLeft = Math.ceil((nextRetryAfter - Date.now()) / (1000 * 60 * 60));
      console.log(`[localdns] Cert renewal backoff active — retrying in ~${hoursLeft}h`);
      return;
    }

    console.log('\n[localdns] Certificate renewal starting...');
    try {
      await obtainCert(baseDomain, cloudflareToken, email);
      failedAttempts = 0;
      nextRetryAfter = null;
      if (httpsServer) {
        httpsServer.setSecureContext({
          cert: fs.readFileSync(CERT_FILE),
          key:  fs.readFileSync(KEY_FILE),
        });
        console.log('[localdns] Certificate renewed and hot-reloaded — no restart needed');
      }
    } catch (e) {
      failedAttempts++;
      // Exponential backoff: 6h, 12h, 24h, 48h, then cap at 96h (4 days)
      const backoffHours = Math.min(6 * Math.pow(2, failedAttempts - 1), MAX_BACKOFF_DAYS * 24);
      nextRetryAfter = Date.now() + backoffHours * 60 * 60 * 1000;
      const retryDate = new Date(nextRetryAfter).toISOString().replace('T', ' ').slice(0, 16);
      console.error(`[localdns] Certificate renewal failed (attempt ${failedAttempts}): ${e.message}`);
      console.error(`[localdns] Next retry after ${retryDate} UTC. Existing cert is still being served.`);
    }
  }, CHECK_INTERVAL).unref();
}

module.exports = { obtainCert, scheduleRenewal };
