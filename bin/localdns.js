#!/usr/bin/env node
'use strict';

const path = require('path');
const { loadConfig }               = require('../src/config');
const { getLanIp }                 = require('../src/ip');
const { registerAll }              = require('../src/mdns');
const { startProxy }               = require('../src/proxy');
const { checkMkcert, generateCerts, getCaCertPath } = require('../src/certs');

// --- Argument parsing ---
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
localdns - Expose local dev servers as .local mDNS domains on your Wi-Fi

Usage:
  localdns [options]

Options:
  --config <path>   Path to config file (default: ./localdns.config.json)
  --port <n>        Override proxy port (default: 443 with SSL, 80 without)
  --no-ssl          Disable HTTPS (use plain HTTP on port 80)
  --help            Show this help

Config format (localdns.config.json):
  {
    "domains": {
      "inventory": 3000,
      "dashboard": 6000
    }
  }

Each domain key becomes a .local address (e.g. inventory.local -> localhost:3000).
SSL is enabled by default using mkcert (brew install mkcert).
Other devices on the same Wi-Fi can reach these addresses in their browser.
`);
  process.exit(0);
}

let configPath = './localdns.config.json';
let portOverride = null;
let noSsl = args.includes('--no-ssl');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' && args[i + 1]) {
    configPath = args[++i];
  } else if (args[i] === '--port' && args[i + 1]) {
    portOverride = parseInt(args[++i], 10);
    if (isNaN(portOverride) || portOverride < 1 || portOverride > 65535) {
      console.error(`Invalid --port value: ${args[i]}`);
      process.exit(1);
    }
  }
}

// If mkcert isn't installed, silently fall back to HTTP rather than hard-failing
const ssl = !noSsl && checkMkcert();

// --- Startup ---
const config = loadConfig(configPath);
const defaultPort = ssl ? 443 : (config.port || 80);
const proxyPort = portOverride ?? defaultPort;

let lanIp;
try {
  lanIp = getLanIp();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

console.log(`\nlocalDNS starting...`);
console.log(`LAN IP  : ${lanIp}`);
console.log(`Mode    : ${ssl ? 'HTTPS (SSL)' : 'HTTP'}`);
console.log('');

// --- Certificates ---
let sslOpts = null;
if (ssl) {
  console.log('Certificates:');
  const certsDir = path.join(process.cwd(), 'certs');
  const { certFile, keyFile } = generateCerts(config.domains, certsDir);
  const caCertPath = getCaCertPath();
  sslOpts = { certFile, keyFile, redirectPort: 80, caCertPath };
  console.log('');
}

// --- mDNS + Proxy ---
console.log('Registering domains:');
registerAll(config.domains, proxyPort, lanIp, ssl);

console.log('\nStarting proxy:');
startProxy(config.domains, proxyPort, sslOpts);

const proto = ssl ? 'https' : 'http';
console.log('');
console.log('Ready:');
config.domains.forEach(({ name }) => {
  console.log(`  ${proto}://${name}.local`);
});

if (ssl) {
  console.log('');
  console.log('Other devices on this Wi-Fi — to trust HTTPS, install the CA cert once:');
  console.log(`  http://${lanIp}/localdns-ca.crt`);
  console.log('  iOS/macOS : open the URL, tap Install, then enable in Settings > General > VPN & Device Management');
  console.log('  Android   : open the URL, install via Settings > Security > Install certificate');
  console.log('  Windows   : open the URL, double-click the file, install to "Trusted Root Certification Authorities"');
}

console.log('\nPress Ctrl+C to stop.\n');
