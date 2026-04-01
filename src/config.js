'use strict';

const fs = require('fs');
const path = require('path');

const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*$/i;

function loadConfig(configPath) {
  const resolved = path.resolve(configPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Config file not found: ${resolved}`);
    console.error('Create a localdns.config.json with:\n  { "port": 80, "domains": { "myapp": 3000 } }');
    process.exit(1);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (e) {
    console.error(`Failed to parse config: ${e.message}`);
    process.exit(1);
  }

  const port = raw.port ?? 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid proxy port: ${port}`);
    process.exit(1);
  }

  if (!raw.domains || typeof raw.domains !== 'object' || Array.isArray(raw.domains)) {
    console.error('Config must have a "domains" object, e.g. { "myapp": 3000 }');
    process.exit(1);
  }

  const domains = [];
  const seenNames = new Set();
  const seenPorts = new Set();

  for (const [name, targetPort] of Object.entries(raw.domains)) {
    if (!DOMAIN_RE.test(name)) {
      console.error(`Invalid domain name "${name}". Use only letters, numbers, and hyphens.`);
      process.exit(1);
    }
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      console.error(`Invalid port for domain "${name}": ${targetPort}`);
      process.exit(1);
    }
    if (seenNames.has(name.toLowerCase())) {
      console.error(`Duplicate domain name: ${name}`);
      process.exit(1);
    }
    if (seenPorts.has(targetPort)) {
      console.error(`Duplicate target port: ${targetPort}`);
      process.exit(1);
    }
    seenNames.add(name.toLowerCase());
    seenPorts.add(targetPort);
    domains.push({ name: name.toLowerCase(), targetPort });
  }

  if (domains.length === 0) {
    console.error('No domains configured. Add at least one entry to "domains".');
    process.exit(1);
  }

  return { port, domains };
}

module.exports = { loadConfig };
