'use strict';

const children = new Set();

function register(cp) {
  children.add(cp);
  cp.on('exit', () => children.delete(cp));
}

function cleanup() {
  for (const cp of children) {
    try { cp.kill('SIGTERM'); } catch (_) {}
  }
  children.clear();
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

module.exports = { register, cleanup };
