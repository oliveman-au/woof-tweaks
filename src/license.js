'use strict';
const https = require('https');
const http = require('http');

function check(site, token, deviceId, appVersion) {
  return new Promise((resolve) => {
    const url = new URL(`${site}/api/app/license`);
    const mod = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({ token, deviceId, platform: process.platform, appVersion });
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j.plan || 'free');
        } catch { resolve('free'); }
      });
    });
    req.on('error', () => resolve('free'));
    req.on('timeout', () => { req.destroy(); resolve('free'); });
    req.write(body);
    req.end();
  });
}

module.exports = { check };
