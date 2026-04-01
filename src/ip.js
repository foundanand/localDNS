'use strict';

const os = require('os');

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  throw new Error('No external IPv4 interface found. Are you connected to a network?');
}

module.exports = { getLanIp };
