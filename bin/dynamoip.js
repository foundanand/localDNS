#!/usr/bin/env node
'use strict';

const path = require('path');
const { loadConfig }    = require('../src/config');
const { getLanIp }      = require('../src/ip');
const { registerAll }   = require('../src/mdns');
const { startProxy }    = require('../src/proxy');
const { obtainCert, scheduleRenewal } = require('../src/acme');
const { upsertARecords, getZoneId }   = require('../src/cloudflare');
const { checkMkcert, generateCerts, getCaCertPath } = require('../src/certs');

// --- Argument parsing ---
const args  = process.argv.slice(2);
const noSsl = args.includes('--no-ssl');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
dynamoip - Expose local dev servers as real domains with trusted HTTPS

Usage:
  dynamoip [options]

Options:
  --config <path>   Path to config file (default: ./dynamoip.config.json)
  --port <n>        Override proxy port (default: 443 with SSL, 80 without)
  --no-ssl          Disable HTTPS (plain HTTP, mDNS .local only)
  --help            Show this help

--- Pro mode (Cloudflare + Let's Encrypt) ---
  Trusted HTTPS on every device. No cert installation needed.

  dynamoip.config.json:
    { "baseDomain": "local.myteam.dev", "domains": { "inventory": 3000 } }

  .env:
    CF_API_TOKEN=your_cloudflare_api_token
    CF_EMAIL=you@example.com   (optional, for cert expiry alerts)

--- Quick mode (mDNS .local) ---
  Works on LAN only. Other devices need to install the CA cert once.

  dynamoip.config.json:
    { "domains": { "inventory": 3000 } }
`);
  process.exit(0);
}

let configPath  = './dynamoip.config.json';
let portOverride = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' && args[i + 1]) configPath = args[++i];
  else if (args[i] === '--port' && args[i + 1]) {
    portOverride = parseInt(args[++i], 10);
    if (isNaN(portOverride) || portOverride < 1 || portOverride > 65535) {
      console.error(`Invalid --port value: ${args[i]}`); process.exit(1);
    }
  }
}

// --- Main (async to support await) ---
async function main() {
  const config  = loadConfig(configPath);
  const useAcme = !noSsl && !!config.baseDomain;
  const useMkcert = !noSsl && !useAcme && checkMkcert();

  let lanIp;
  try { lanIp = getLanIp(); } catch (e) { console.error(e.message); process.exit(1); }

  const defaultPort = (useAcme || useMkcert) ? 443 : (config.port || 80);
  const proxyPort   = portOverride ?? defaultPort;

  const proto = (useAcme || useMkcert) ? 'https' : 'http';
  const domainSuffix = useAcme ? `.${config.baseDomain}` : '.local';

  console.log(`\ndynamoip starting...`);
  console.log(`LAN IP : ${lanIp}`);
  console.log(`Mode   : ${useAcme ? `Cloudflare + Let's Encrypt (${config.baseDomain})` : useMkcert ? 'mkcert (local CA)' : 'HTTP'}`);
  console.log('');

  let sslOpts = null;

  // --- Cloudflare + ACME mode ---
  if (useAcme) {
    const { apiToken, email } = config.cloudflare;
    let zoneId;

    console.log('DNS records (Cloudflare):');
    try {
      zoneId = await getZoneId(apiToken, config.baseDomain);
      await upsertARecords(apiToken, zoneId, config.baseDomain, config.domains.map(d => d.name), lanIp);
    } catch (e) {
      console.error(`\nCloudflare DNS error: ${e.message}\n`);
      process.exit(1);
    }
    console.log('');

    console.log('Certificates (Let\'s Encrypt):');
    try {
      const { certFile, keyFile } = await obtainCert(config.baseDomain, apiToken, email);
      sslOpts = { certFile, keyFile, redirectPort: 80, baseDomain: config.baseDomain };
    } catch (e) {
      console.error(`\nCertificate error: ${e.message}\n`);
      process.exit(1);
    }
    console.log('');
  }

  // --- mkcert fallback mode ---
  if (useMkcert) {
    console.log('Certificates (mkcert):');
    const certsDir = path.join(process.cwd(), 'certs');
    try {
      const { certFile, keyFile } = generateCerts(config.domains, certsDir);
      const caCertPath = getCaCertPath();
      sslOpts = { certFile, keyFile, redirectPort: 80, caCertPath };
    } catch (e) {
      console.error(`\nCert error: ${e.message}\n`);
      process.exit(1);
    }
    console.log('');
  }

  // --- mDNS (quick mode only — skipped when Cloudflare handles real DNS) ---
  if (!useAcme) {
    console.log('Registering mDNS (.local):');
    registerAll(config.domains, proxyPort, lanIp, !!sslOpts);
    console.log('');
  }

  // --- Proxy ---
  console.log('Starting proxy:');
  const { server } = startProxy(config.domains, proxyPort, sslOpts);

  // Schedule background renewal now that we have the server reference for hot-reload
  if (useAcme) {
    scheduleRenewal(config.baseDomain, config.cloudflare.apiToken, config.cloudflare.email, server);
  }

  console.log('');
  console.log('Ready:');
  config.domains.forEach(({ name }) => {
    if (useAcme) console.log(`  ${proto}://${name}${domainSuffix}`);
    else         console.log(`  ${proto}://${name}.local`);
  });

  console.log('\nPress Ctrl+C to stop.\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
