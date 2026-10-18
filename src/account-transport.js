'use strict';
// Retry only TLS negotiation failures, before an HTTP response exists. Never
// replay a timed-out mutation or bypass certificate validation.
const https = require('https');
function createTransport({ browserNet, version = '0.0.0', nodeHttps = https } = {}) {
  function send(url, body, timeout, browser) {
    return new Promise((resolve, reject) => {
      let req, timer, settled = false, responded = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) { error.beforeResponse = !responded; reject(error); } else resolve(value);
      };
      const abort = error => { finish(error); if (browser) req?.abort(); else req?.destroy(); };
      const response = res => {
        responded = true;
        let chunks = [], size = 0;
        res.on('data', chunk => {
          size += Buffer.byteLength(chunk);
          if (size > 1_000_000) return abort(new Error('The website returned an oversized response.'));
          chunks.push(Buffer.from(chunk));
        });
        res.on('error', error => finish(error));
        res.on('aborted', () => finish(new Error('The connection was interrupted. Try again.')));
        res.on('end', () => {
          if (res.statusCode >= 300 && res.statusCode < 400) return finish(new Error('Unexpected account redirect. Please contact support.'));
          try { finish(null, { status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
          catch { finish(new Error(`Bad response (${res.statusCode})`)); }
        });
      };
      try {
        const headers = { 'Content-Type': 'application/json', 'User-Agent': `WoofTweaks/${version}` };
        if (browser) {
          req = browserNet.request({ url: url.href, method: 'POST', headers, redirect: 'error', credentials: 'omit', useSessionCookies: false });
          req.on('response', response);
        } else {
          req = nodeHttps.request(url, { method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } }, response);
        }
        req.on('error', error => finish(error));
        timer = setTimeout(() => abort(new Error('The website took too long to answer. Please try again.')), timeout);
        req.end(body);
      } catch (error) { finish(error); }
    });
  }
  return async function post(url, payload, timeout = 12000) {
    url = new URL(url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Account connections require secure HTTPS.');
    const body = JSON.stringify(payload);
    try { return await send(url, body, timeout, false); }
    catch (error) {
      if (browserNet && error.beforeResponse && (error.code === 'EPROTO' || /WRONG_VERSION_NUMBER/.test(error.message))) {
        try { return await send(url, body, timeout, true); }
        catch { throw new Error('A secure connection to Woof could not be established. Check your VPN or proxy settings, then try again. Contact support if this continues.'); }
      }
      if (/CERT|TLS|SSL|EPROTO/i.test(error.code || '')) throw new Error('The secure connection could not be verified. Check your device clock and network settings, then try again.');
      throw error;
    }
  };
}
module.exports = { createTransport };
