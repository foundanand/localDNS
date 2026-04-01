'use strict';

const https = require('https');

// Minimal Cloudflare v4 API client — only what we need
function cfFetch(apiToken, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: `/client/v4${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.success) {
            const msg = json.errors?.map(e => e.message).join(', ') || 'Unknown Cloudflare error';
            reject(new Error(`Cloudflare API error: ${msg}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Cloudflare response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Parse the apex domain from something like "local.myteam.dev" -> "myteam.dev"
function getApexDomain(baseDomain) {
  const parts = baseDomain.split('.');
  if (parts.length < 2) throw new Error(`Invalid baseDomain: ${baseDomain}`);
  return parts.slice(-2).join('.');
}

async function getZoneId(apiToken, baseDomain) {
  const apex = getApexDomain(baseDomain);
  const res = await cfFetch(apiToken, 'GET', `/zones?name=${apex}&status=active`);
  if (!res.result?.length) {
    throw new Error(
      `No active Cloudflare zone found for "${apex}".\n` +
      `  Make sure the domain is added to your Cloudflare account and the API token has Zone:DNS:Edit permission.`
    );
  }
  return res.result[0].id;
}

// Upsert A records for all domain names pointing to lanIp
async function upsertARecords(apiToken, zoneId, baseDomain, domainNames, lanIp) {
  for (const name of domainNames) {
    const fqdn = `${name}.${baseDomain}`;

    // Check if record already exists
    const existing = await cfFetch(apiToken, 'GET', `/zones/${zoneId}/dns_records?type=A&name=${fqdn}`);
    const record = existing.result?.[0];

    if (record) {
      if (record.content === lanIp) {
        console.log(`  ${fqdn} -> ${lanIp}  (unchanged)`);
      } else {
        await cfFetch(apiToken, 'PATCH', `/zones/${zoneId}/dns_records/${record.id}`, {
          content: lanIp,
          ttl: 60,
          proxied: false,
        });
        console.log(`  ${fqdn} -> ${lanIp}  (updated from ${record.content})`);
      }
    } else {
      await cfFetch(apiToken, 'POST', `/zones/${zoneId}/dns_records`, {
        type: 'A',
        name: fqdn,
        content: lanIp,
        ttl: 60,
        proxied: false,
      });
      console.log(`  ${fqdn} -> ${lanIp}  (created)`);
    }
  }
}

// Set _acme-challenge TXT record for DNS-01 validation.
// Appends rather than replacing — Let's Encrypt may issue multiple challenges
// simultaneously (e.g. for both *.domain.com and domain.com) and both TXT
// values must coexist until each is validated.
async function setAcmeTxtRecord(apiToken, zoneId, baseDomain, txtValue) {
  const name = `_acme-challenge.${baseDomain}`;
  const res = await cfFetch(apiToken, 'POST', `/zones/${zoneId}/dns_records`, {
    type: 'TXT',
    name,
    content: txtValue,
    ttl: 60,
  });
  return res.result.id;
}

// Delete all _acme-challenge TXT records (used to clean up stale records from failed runs)
async function clearAcmeTxtRecords(apiToken, zoneId, baseDomain) {
  const name = `_acme-challenge.${baseDomain}`;
  const existing = await cfFetch(apiToken, 'GET', `/zones/${zoneId}/dns_records?type=TXT&name=${name}`);
  for (const record of existing.result || []) {
    await cfFetch(apiToken, 'DELETE', `/zones/${zoneId}/dns_records/${record.id}`);
  }
}

async function deleteAcmeTxtRecord(apiToken, zoneId, recordId) {
  try {
    await cfFetch(apiToken, 'DELETE', `/zones/${zoneId}/dns_records/${recordId}`);
  } catch (_) {
    // Best-effort cleanup — don't fail the startup if this errors
  }
}

module.exports = { getZoneId, upsertARecords, setAcmeTxtRecord, deleteAcmeTxtRecord, clearAcmeTxtRecords };
