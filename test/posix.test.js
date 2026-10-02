'use strict';
// macOS/Linux change scripts, run for real with /bin/sh against temp files (and a throwaway defaults
// domain on macOS). Checks apply, exact restore, all-or-nothing rollback and quoting of odd values.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const posix = require('../src/core/posix');

if (process.platform === 'win32') { test('posix tests skipped on Windows', () => {}); return; }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'woof-posix-'));
const sh = (script) => execFileSync('/bin/sh', ['-c', script], { encoding: 'utf8' });
async function applyRestore(groups) {
  const items = [];
  for (const g of groups) items.push({ id: g.id, post: g.post, items: await Promise.all(g.ops.map(async (op) => ({ op, snap: await posix.read(op) }))) });
  const out = sh(posix.buildScript(items, 'apply'));
  return { items, results: posix.parseScriptOutput(out, items.length), restore: () => posix.parseScriptOutput(sh(posix.buildScript(items, 'restore')), items.length) };
}

test('file op: writes content and restores the exact original (or deletes a new file)', async () => {
  const a = path.join(tmp, 'a.conf'); fs.writeFileSync(a, "original 'quoted' $HOME `x`\nline2\n");
  const b = path.join(tmp, 'sub', 'b.conf');
  const r = await applyRestore([{ id: 'f', ops: [{ t: 'file', path: a, content: "new it's\n" }, { t: 'file', path: b, content: 'brand new\n' }] }]);
  assert.deepStrictEqual(r.results, [{ ok: true }]);
  assert.strictEqual(fs.readFileSync(a, 'utf8'), "new it's\n");
  assert.strictEqual(fs.readFileSync(b, 'utf8'), 'brand new\n');
  assert.strictEqual(posix.matches({ t: 'file', path: a, content: "new it's\n" }, await posix.read({ t: 'file', path: a })), true);
  assert.deepStrictEqual(r.restore(), [{ ok: true }]);
  assert.strictEqual(fs.readFileSync(a, 'utf8'), "original 'quoted' $HOME `x`\nline2\n");
  assert.ok(!fs.existsSync(b));
});

test('sysfs-style op: picks the [selected] value and restores it per file', async () => {
  const d = path.join(tmp, 'blk'); fs.mkdirSync(path.join(d, 'nvme0n1', 'queue'), { recursive: true }); fs.mkdirSync(path.join(d, 'nvme1n1', 'queue'), { recursive: true });
  fs.writeFileSync(path.join(d, 'nvme0n1/queue/scheduler'), '[mq-deadline] none\n');
  fs.writeFileSync(path.join(d, 'nvme1n1/queue/scheduler'), 'mq-deadline [none]\n');
  const op = { t: 'sysfs', glob: path.join(d, 'nvme*/queue/scheduler'), value: 'none', bracket: true };
  const snap = await posix.read(op);
  assert.deepStrictEqual(snap.files.map((f) => f.value), ['mq-deadline', 'none']);
  const r = await applyRestore([{ id: 's', ops: [op] }]);
  assert.deepStrictEqual(r.results, [{ ok: true }]);
  assert.strictEqual(fs.readFileSync(path.join(d, 'nvme0n1/queue/scheduler'), 'utf8'), 'none');
  r.restore();
  assert.strictEqual(fs.readFileSync(path.join(d, 'nvme0n1/queue/scheduler'), 'utf8'), 'mq-deadline');
  assert.strictEqual(fs.readFileSync(path.join(d, 'nvme1n1/queue/scheduler'), 'utf8'), 'none');
});

test('a value that is not available on this hardware is reported as not available', async () => {
  const d = path.join(tmp, 'cpu0'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'scaling_governor'), 'schedutil\n');
  fs.writeFileSync(path.join(d, 'scaling_available_governors'), 'schedutil powersave\n');
  const snap = await posix.read({ t: 'sysfs', glob: path.join(d, 'scaling_governor'), value: 'performance', availableFrom: 'scaling_available_governors' });
  assert.strictEqual(snap.na, true);
});

test('all-or-nothing: when a later step fails, earlier steps of the same tweak are undone', async () => {
  const a = path.join(tmp, 'keep.conf'); fs.writeFileSync(a, 'before\n');
  const blocker = path.join(tmp, 'readonly'); fs.mkdirSync(blocker); fs.chmodSync(blocker, 0o555);
  const r = await applyRestore([
    { id: 'bad', ops: [{ t: 'file', path: a, content: 'after\n' }, { t: 'file', path: path.join(blocker, 'child.conf'), content: 'x' }] },
    { id: 'good', ops: [{ t: 'file', path: path.join(tmp, 'good.conf'), content: 'ok\n' }] },
  ]);
  assert.strictEqual(r.results[0].ok, false);
  assert.strictEqual(fs.readFileSync(a, 'utf8'), 'before\n', 'first step rolled back');
  assert.deepStrictEqual(r.results[1], { ok: true }, 'other tweaks still apply');
  fs.chmodSync(blocker, 0o755);
});

test('a setting whose current value can\'t be read is never touched', async () => {
  const notDir = path.join(tmp, 'plainfile'); fs.writeFileSync(notDir, 'x');
  assert.strictEqual((await posix.read({ t: 'file', path: path.join(notDir, 'child') })).unknown, true);
});

test('macOS defaults op: write and exact restore on a throwaway domain', { skip: process.platform !== 'darwin' }, async () => {
  const domain = `com.woof-tweaks.selftest.${process.pid}`;
  try {
    execFileSync('defaults', ['write', domain, 'existing', '-int', '7']);
    const ops = [{ t: 'defaults', domain, key: 'existing', type: 'int', value: 2 }, { t: 'defaults', domain, key: 'newkey', type: 'bool', value: true }, { t: 'defaults', domain, key: 'speed', type: 'float', value: 0.15 }];
    const r = await applyRestore([{ id: 'd', ops }]);
    assert.deepStrictEqual(r.results, [{ ok: true }]);
    assert.strictEqual(execFileSync('defaults', ['read', domain, 'existing'], { encoding: 'utf8' }).trim(), '2');
    assert.strictEqual(posix.matches(ops[1], await posix.read(ops[1])), true);
    r.restore();
    assert.strictEqual(execFileSync('defaults', ['read', domain, 'existing'], { encoding: 'utf8' }).trim(), '7');
    assert.strictEqual((await posix.read(ops[1])).exists, false, 'a key that did not exist is deleted again');
  } finally { try { execFileSync('defaults', ['delete', domain]); } catch { /* gone */ } }
});

test('sysctl read works without admin (and unknown keys are not available)', async () => {
  const key = process.platform === 'darwin' ? 'kern.ostype' : 'kernel.ostype';
  assert.ok((await posix.read({ t: 'sysctl', key, value: 'x' })).value);
  assert.strictEqual((await posix.read({ t: 'sysctl', key: 'woof.does.not.exist', value: '1' })).na, true);
});

test('shell quoting survives quotes, $, backticks and newlines', () => {
  const nasty = "it's $(rm -rf /) `x` \"y\"\nz";
  assert.strictEqual(sh(`printf '%s' ${posix.q(nasty)}`), nasty);
});
