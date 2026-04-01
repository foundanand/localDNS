'use strict';

const { spawn, spawnSync } = require('child_process');
const { register } = require('./cleanup');

function checkCommand(cmd) {
  const r = spawnSync('which', [cmd], { stdio: 'ignore' });
  return r.status === 0;
}

function spawnDnsSd(name, args) {
  const cp = spawn('dns-sd', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  cp.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.error(`[dns-sd:${name}] ${msg}`);
  });
  cp.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM') {
      console.error(`[dns-sd:${name}] exited unexpectedly (code=${code}), retrying in 3s...`);
      setTimeout(() => spawnDnsSd(name, args), 3000);
    }
  });
  register(cp);
  return cp;
}

function registerMdnsMac(domains, proxyPort, lanIp, ssl) {
  if (!checkCommand('dns-sd')) {
    console.error('dns-sd not found. This tool requires macOS with dns-sd (built-in).');
    process.exit(1);
  }

  const serviceType = ssl ? '_https._tcp' : '_http._tcp';

  for (const { name, targetPort } of domains) {
    const hostname = `${name}.local`;
    // dns-sd -P: register a proxy service with a custom hostname and IP
    // This advertises the service AND registers the A record for hostname.local
    const args = ['-P', name, serviceType, 'local', String(proxyPort), hostname, lanIp, `port=${targetPort}`];
    spawnDnsSd(name, args);
    console.log(`  ${hostname} -> localhost:${targetPort}  [${lanIp}:${proxyPort}]`);
  }
}

function registerMdnsLinux(domains, proxyPort, lanIp, ssl) {
  if (!checkCommand('avahi-publish')) {
    console.error('avahi-publish not found. Install with: sudo apt install avahi-utils');
    process.exit(1);
  }

  for (const { name, targetPort } of domains) {
    const hostname = `${name}.local`;

    // Register the hostname A record
    const addrProc = spawn('avahi-publish-address', ['-R', hostname, lanIp], { stdio: ['ignore', 'ignore', 'pipe'] });
    addrProc.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.error(`[avahi-addr:${name}] ${msg}`);
    });
    register(addrProc);

    // Register the service (so it appears in service browsers)
    const serviceType = ssl ? '_https._tcp' : '_http._tcp';
    const svcProc = spawn('avahi-publish-service', [name, serviceType, String(proxyPort)], { stdio: ['ignore', 'ignore', 'pipe'] });
    svcProc.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.error(`[avahi-svc:${name}] ${msg}`);
    });
    register(svcProc);

    console.log(`  ${hostname} -> localhost:${targetPort}  [${lanIp}:${proxyPort}]`);
  }
}

function registerAll(domains, proxyPort, lanIp, ssl) {
  if (process.platform === 'darwin') {
    registerMdnsMac(domains, proxyPort, lanIp, ssl);
  } else if (process.platform === 'linux') {
    registerMdnsLinux(domains, proxyPort, lanIp, ssl);
  } else {
    console.error(`Unsupported platform: ${process.platform}. Only macOS and Linux are supported.`);
    process.exit(1);
  }
}

module.exports = { registerAll };
