'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReporter, HEARTBEAT_MS } = require('../src/installations');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(post) {
  const calls = [], timers = [], cancelled = [];
  const reporter = createReporter({
    post: async (path, body) => { calls.push({ path, body }); return post ? post(calls.length) : { status: 200, body: { ok: true } }; },
    deviceId: () => '31d42809-af69-41dd-8c61-7fb405e4f30f', osId: () => 'win32', version: '1.1.1',
    schedule: (fn, ms) => { const timer = { fn, ms, unref() {} }; timers.push(timer); return timer; },
    cancel: timer => cancelled.push(timer),
  });
  return { reporter, calls, timers, cancelled };
}
test('signed-out installation registers without account or hardware data', async () => {
  const f = fixture(); f.reporter.start(); await flush();
  assert.deepEqual(f.calls, [{ path: '/api/app/install', body: { deviceId: '31d42809-af69-41dd-8c61-7fb405e4f30f', platform: 'win32', appVersion: '1.1.1' } }]);
  assert.equal(f.timers[0].ms, HEARTBEAT_MS); f.reporter.stop();
});
test('heartbeat reuses the device ID and start is idempotent', async () => {
  const f = fixture(); f.reporter.start(); f.reporter.start(); await flush();
  assert.equal(f.calls.length, 1); f.timers[0].fn(); await flush();
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1].body, f.calls[0].body); f.reporter.stop();
});
test('offline and rejected responses retry without affecting app use', async () => {
  const f = fixture(n => { if (n === 1) throw Error('offline'); return n === 2 ? { status: 429, body: {} } : { status: 200, body: { ok: true } }; });
  f.reporter.start(); await flush(); assert.equal(f.timers[0].ms, 60_000);
  f.timers[0].fn(); await flush(); assert.equal(f.timers[1].ms, 120_000);
  f.timers[1].fn(); await flush(); assert.equal(f.timers[2].ms, HEARTBEAT_MS); f.reporter.stop();
});
test('shutdown cancels the next check-in and prevents late rescheduling', async () => {
  const f = fixture(); f.reporter.start(); await flush(); f.reporter.stop();
  assert.equal(f.cancelled.length, 1); f.timers[0].fn(); await flush(); assert.equal(f.calls.length, 1);
  let resolve; const waiting = fixture(() => new Promise(r => { resolve = r; }));
  waiting.reporter.start(); waiting.reporter.stop(); resolve({ status: 200, body: { ok: true } }); await flush();
  assert.equal(waiting.timers.length, 0);
});
