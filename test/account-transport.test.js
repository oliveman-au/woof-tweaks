'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createTransport } = require('../src/account-transport');
function mock(result, browser = false) {
  const calls = [];
  return { calls, request(...args) {
    calls.push(args);
    const req = new EventEmitter();
    req.abort = req.destroy = () => {};
    req.end = body => queueMicrotask(() => {
      calls.at(-1).body = body;
      if (result.error) return req.emit('error', Object.assign(new Error(result.error), { code: result.code }));
      const res = new EventEmitter(); res.statusCode = result.status || 200;
      if (browser) req.emit('response', res); else args[2](res);
      res.emit('data', result.body || '{"ok":true}'); res.emit('end');
    });
    return req;
  } };
}
test('EPROTO before response retries through Chromium with no cookies or redirects', async () => {
  const node = mock({ error: 'WRONG_VERSION_NUMBER', code: 'EPROTO' }), browser = mock({}, true);
  const post = createTransport({ nodeHttps: node, browserNet: browser, version: '1.2.1' });
  assert.deepEqual(await post('https://woof-services.stream/api/app/link/start', { deviceId: 'test' }), { status: 200, body: { ok: true } });
  assert.equal(node.calls.length, 1); assert.equal(browser.calls.length, 1);
  const options = browser.calls[0][0];
  assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
  assert.equal(options.useSessionCookies, false); assert.equal(options.headers['Content-Length'], undefined);
  assert.equal(browser.calls[0].body, node.calls[0].body);
});
test('certificate rejection and ambiguous network errors never replay a mutation', async () => {
  for (const code of ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ETIMEDOUT', 'ECONNRESET']) {
    const node = mock({ error: code, code }), browser = mock({}, true);
    await assert.rejects(createTransport({ nodeHttps: node, browserNet: browser })('https://woof-services.stream/api/app/logout', { token: 'test' }));
    assert.equal(browser.calls.length, 0);
  }
});
test('HTTP failures are returned once; plaintext URLs and redirects are rejected', async () => {
  const node = mock({ status: 503 }), browser = mock({}, true);
  assert.equal((await createTransport({ nodeHttps: node, browserNet: browser })('https://woof-services.stream/api/app/license', {})).status, 503);
  assert.equal(browser.calls.length, 0);
  await assert.rejects(createTransport()('http://woof-services.stream/api/app/license', {}), /HTTPS/);
  await assert.rejects(createTransport({ nodeHttps: mock({ status: 307 }) })('https://woof-services.stream/api/app/license', {}), /redirect/);
});
