'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { withUpdateResponse, saveVerifiedUpdate } = require('../src/update-transfer');
const bytes = Buffer.from('isolated update transfer fixture');
const checksum = crypto.createHash('sha512').update(bytes).digest('base64');
async function fixture(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'woof-transfer-test-'));
  const server = http.createServer((req, res) => {
    if (req.url === '/headers-stall') return;
    if (req.url === '/error') { res.writeHead(503); return res.end(); }
    res.writeHead(200);
    if (req.url === '/body-stall') { res.write(bytes.subarray(0, 1)); return; }
    res.end(bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run({ url: `http://127.0.0.1:${server.address().port}`, destination: path.join(directory, 'update.zip') }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); }
}
const options = { timeoutMs: 3000, userAgent: 'WoofUpdaterTest' };
const save = (url, destination, extra = {}, request = options) => withUpdateResponse(url, request,
  (response, signal) => saveVerifiedUpdate(response, signal, { destination, size: bytes.length, sha512: checksum, ...extra }));

test('real HTTP body completes with matching size/hash and progress', () => fixture(async ({ url, destination }) => {
  const progress = [];
  await save(url, destination, { onProgress: p => progress.push(p) });
  assert.deepEqual(await fs.readFile(destination), bytes);
  assert.equal(progress.at(-1), 100);
}));
test('headers that never arrive have a bounded deadline', () => fixture(async ({ url, destination }) => {
  await assert.rejects(save(url + '/headers-stall', destination, {}, { ...options, timeoutMs: 200 }), /abort/i);
}));
test('body stalled AFTER headers is aborted and can be retried', () => fixture(async ({ url, destination }) => {
  let headersSeen = false;
  await assert.rejects(withUpdateResponse(url + '/body-stall', { ...options, timeoutMs: 500 }, (r, signal) => {
    headersSeen = true;
    return saveVerifiedUpdate(r, signal, { destination, size: bytes.length, sha512: checksum });
  }), /abort/i);
  assert.equal(headersSeen, true, 'deadline must cover the body after headers arrive');
  // The caller owns cleanup of its temporary update directory between retries.
  await fs.unlink(destination);
  await save(url, destination);
  assert.deepEqual(await fs.readFile(destination), bytes);
}));
test('metadata body also remains covered by the deadline', () => fixture(async ({ url }) => {
  await assert.rejects(withUpdateResponse(url + '/body-stall', { ...options, timeoutMs: 200 }, r => r.text()), /abort/i);
}));
test('HTTP failures never create an installer file', () => fixture(async ({ url, destination }) => {
  await assert.rejects(save(url + '/error', destination), /HTTP 503/);
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
}));
test('oversized bodies stop before being accepted', () => fixture(async ({ url, destination }) => {
  await assert.rejects(save(url, destination, { size: bytes.length - 1 }), /larger than expected/);
}));
test('short bodies and corrupt checksums are rejected', () => fixture(async ({ url, destination }) => {
  await assert.rejects(save(url, destination, { size: bytes.length + 1 }), /checksum/);
  await fs.unlink(destination);
  await assert.rejects(save(url, destination, { sha512: crypto.createHash('sha512').update('wrong').digest('base64') }), /checksum/);
}));
test('file errors propagate and existing data is never overwritten', () => fixture(async ({ url, destination }) => {
  await fs.writeFile(destination, 'preserved');
  await assert.rejects(save(url, destination), { code: 'EEXIST' });
  assert.equal(await fs.readFile(destination, 'utf8'), 'preserved');
}));
test('invalid release metadata is rejected before opening a file', () => fixture(async ({ url, destination }) => {
  await assert.rejects(save(url, destination, { size: -1 }), /information invalid/);
  await assert.rejects(save(url, destination, { sha512: 'invalid' }), /information invalid/);
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
}));
