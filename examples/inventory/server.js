#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'));

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
}).listen(PORT, () => {
  console.log(`Inventory running on http://localhost:${PORT}`);
  console.log(`Via dynamoip: http://inventory.local`);
});
