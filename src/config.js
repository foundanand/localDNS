'use strict';

const fs = require('fs');
const path = require('path');

const DOMAIN_RE = /^[a-z0-9][a-z0-9-]*$/i;

// Load .env from the same directory as the config file (or cwd).
// Only sets variables not already present in the environment.
function loadEnv(dir) {
  const envPath = path.join(dir, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const val = (raw.length >= 2 && raw[0] === raw[raw.length - 1] && (raw[0] === '"' || raw[0] === "'"))
      ? raw.slice(1, -1)
      : raw;
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function loadConfig(configPath) {
  const resolved = path.resolve(configPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Config file not found: ${resolved}`);
    console.error('Create a localdns.config.json with:\n  { "domains": { "myapp": 3000 } }');
    process.exit(1);
  }

  // Load .env from the config file's directory before reading env vars
  loadEnv(path.dirname(resolved));

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

  // --- Optional: Cloudflare + Let's Encrypt mode ---
  let baseDomain = null;
  let cloudflare = null;

  if (raw.baseDomain) {
    if (typeof raw.baseDomain !== 'string' || raw.baseDomain.split('.').length < 2) {
      console.error('"baseDomain" must be a string like "local.myteam.dev"');
      process.exit(1);
    }

    const apiToken = process.env.CF_API_TOKEN;
    if (!apiToken) {
      console.error('CF_API_TOKEN is required when using baseDomain.');
      console.error('Add it to your .env file:\n  CF_API_TOKEN=your_token_here');
      process.exit(1);
    }

    baseDomain = raw.baseDomain.toLowerCase();
    cloudflare = {
      apiToken,
      email: process.env.CF_EMAIL || null,
    };
  }

  return { port, domains, baseDomain, cloudflare };
}

module.exports = { loadConfig };
