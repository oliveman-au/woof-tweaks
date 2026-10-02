'use strict';
// Engine behaviour against a fake in-memory "system": exact restore, tier gating in the main process,
// all-or-nothing tweaks, admin-declined rollback, exclusive groups, prerequisites, drift, crash recovery.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const key = (op) => op.target;
function fakeBackend(system, opts = {}) {
  const snapOf = (op) => (system.has(key(op)) ? { value: system.get(key(op)) } : { value: null, absent: true });
  const restoreOne = (it) => { if (it.snap.absent) system.delete(key(it.op)); else system.set(key(it.op), it.snap.value); };
  return {
    calls: [],
    needsAdmin: (op) => !!op.admin,
    matches: (op, snap) => (snap.na ? null : snap.value === op.value),
    describe: (op, snap) => ({ target: key(op), from: snap.value, to: op.value }),
    async read(groups) { return groups.map((g) => g.ops.map((op) => (op.na ? { na: true } : snapOf(op)))); },
    async apply(groups, admin) {
      this.calls.push({ kind: 'apply', admin, ids: groups.map((g) => g.id) });
      if (admin && opts.declineAdmin) return groups.map((g) => ({ id: g.id, ok: false, cancelled: true, error: 'Admin permission was declined, so nothing was changed.', items: [] }));
      return groups.map((g) => {
        const items = [];
        for (const op of g.ops) {
          if (op.na) { items.push({ op, snap: { na: true }, na: true }); continue; }
          const snap = snapOf(op);
          items.push({ op, snap });
          if (op.fail) { items.reverse().filter((it) => !it.na).forEach(restoreOne); return { id: g.id, ok: false, error: 'boom', items: [] }; }
          system.set(key(op), op.value);
        }
        return { id: g.id, ok: true, items };
      });
    },
    async restore(groups, admin) {
      this.calls.push({ kind: 'restore', admin, ids: groups.map((g) => g.id) });
      if (admin && opts.declineAdmin) return groups.map((g) => ({ id: g.id, ok: false, cancelled: true, error: 'declined' }));
      for (const g of groups) [...g.items].reverse().forEach(restoreOne);
      return groups.map((g) => ({ id: g.id, ok: true }));
    },
  };
}

const T = (id, tier, changes, extra = {}) => ({ id, name: id, tier, os: ['test'], category: 'fps', risk: 'safe', reboot: false, changes, ...extra });
function freshEngine({ plan = 'ultra', system = new Map(), backendOpts = {}, tweaks } = {}) {
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}core${path.sep}`)) delete require.cache[k];
  const engine = require('../src/core/engine');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woof-test-'));
  const list = tweaks || [
    T('a', 'free', [{ target: 'reg:A', value: 1 }]),
    T('b', 'plus', [{ target: 'reg:B', value: 'x' }, { target: 'svc:B', value: 'Disabled', admin: true }]),
    T('pro1', 'pro', [{ target: 'reg:P', value: 9 }]),
    T('ult', 'ultra', [{ target: 'bcd:U', value: 'yes', admin: true }]),
    T('fails', 'free', [{ target: 'reg:F1', value: 1 }, { target: 'reg:F2', value: 2, fail: true }]),
    T('dns1', 'free', [{ target: 'dns', value: '1.1.1.1' }], { exclusive: 'dns' }),
    T('dns2', 'free', [{ target: 'dns', value: '8.8.8.8' }], { exclusive: 'dns' }),
    T('base', 'free', [{ target: 'reg:BASE', value: 1 }]),
    T('dep', 'free', [{ target: 'reg:DEP', value: 1 }], { requires: ['base'] }),
    T('na', 'free', [{ target: 'reg:NA', value: 1, na: true }]),
    T('vol', 'free', [{ target: 'sysfs:V', value: 'performance' }], { volatile: true }),
  ];
  const registry = { osId: 'test', osName: 'Test OS', tweaks: new Map(list.map((t) => [t.id, t])), actions: new Map() };
  const backend = fakeBackend(system, backendOpts);
  let currentPlan = plan;
  engine.init({ registry, dataDir, backend, getPlan: () => currentPlan, getHardware: async () => ({}), getSettings: () => ({}) });
  return { engine, system, backend, dataDir, setPlan: (p) => { currentPlan = p; } };
}

test('apply then revert restores exact original values, including values that did not exist', async () => {
  const system = new Map([['reg:B', 'original'], ['svc:B', 'Automatic']]);
  const { engine } = freshEngine({ system });
  const r = await engine.apply(['a', 'b']);
  assert.strictEqual(r.applied, 2);
  assert.strictEqual(system.get('reg:A'), 1);
  assert.strictEqual(system.get('svc:B'), 'Disabled');
  const rv = await engine.revert(['a', 'b']);
  assert.strictEqual(rv.applied, 2);
  assert.ok(!system.has('reg:A'), 'a value that did not exist before is removed again');
  assert.strictEqual(system.get('reg:B'), 'original');
  assert.strictEqual(system.get('svc:B'), 'Automatic');
});

test('plan gating is enforced in the engine (main process), not just the UI', async () => {
  const { engine, system, setPlan } = freshEngine({ plan: 'free' });
  const r = await engine.apply(['a', 'b', 'pro1', 'ult']);
  assert.deepStrictEqual(r.results.filter((x) => x.ok && !x.skipped).map((x) => x.id), ['a']);
  for (const id of ['b', 'pro1', 'ult']) {
    const x = r.results.find((y) => y.id === id);
    assert.strictEqual(x.code, 'plan', `${id} should be plan-locked`);
  }
  assert.ok(!system.has('reg:P') && !system.has('bcd:U'));
  setPlan('lifetime');
  const r2 = await engine.apply(['ult']);
  assert.strictEqual(r2.applied, 1, 'Lifetime gets Ultra tweaks');
  setPlan('made-up-plan');
  const r3 = await engine.apply(['pro1']);
  assert.strictEqual(r3.results[0].code, 'plan', 'an unknown plan is treated as free');
});

test('a tweak is all-or-nothing: a failing step rolls back its earlier steps', async () => {
  const { engine, system } = freshEngine();
  const r = await engine.apply(['fails']);
  assert.strictEqual(r.failed, 1);
  assert.ok(!system.has('reg:F1') && !system.has('reg:F2'));
  assert.deepStrictEqual(Object.keys(require('../src/core/backup').applied()), []);
});

test('declining the admin prompt rolls back the per-user half of the same tweak', async () => {
  const system = new Map([['reg:B', 'original']]);
  const { engine } = freshEngine({ system, backendOpts: { declineAdmin: true } });
  const r = await engine.apply(['a', 'b']);
  assert.strictEqual(system.get('reg:B'), 'original', 'user half of b restored');
  assert.strictEqual(system.get('reg:A'), 1, 'a (no admin needed) still applied');
  const b = r.results.find((x) => x.id === 'b');
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.cancelled, true);
});

test('only one option per exclusive group (e.g. one DNS provider)', async () => {
  const { engine, system } = freshEngine();
  const r = await engine.apply(['dns1', 'dns2']);
  assert.strictEqual(system.get('dns'), '1.1.1.1');
  assert.strictEqual(r.results.find((x) => x.id === 'dns2').code, 'exclusive');
  const r2 = await engine.apply(['dns2']);
  assert.strictEqual(r2.results[0].code, 'exclusive', 'blocked while dns1 is applied');
  await engine.revert(['dns1']);
  const r3 = await engine.apply(['dns2']);
  assert.strictEqual(r3.applied, 1);
  assert.strictEqual(system.get('dns'), '8.8.8.8');
});

test('prerequisites are applied automatically', async () => {
  const { engine, system } = freshEngine();
  const r = await engine.apply(['dep']);
  assert.strictEqual(r.applied, 2);
  assert.strictEqual(system.get('reg:BASE'), 1);
});

test('settings that do not exist on this PC are reported, not faked', async () => {
  const { engine } = freshEngine();
  const r = await engine.apply(['na']);
  assert.strictEqual(r.results[0].code, 'na');
  assert.strictEqual(r.applied, 0);
});

test('scan reports optimised / default / drift ("changed externally" vs "reset by restart")', async () => {
  const { engine, system } = freshEngine();
  await engine.apply(['a', 'vol']);
  let s = await engine.scan();
  assert.strictEqual(s.a.status, 'optimised');
  assert.strictEqual(s.pro1.status, 'default');
  assert.strictEqual(s.na.status, 'na');
  system.set('reg:A', 0);
  system.set('sysfs:V', 'schedutil');
  s = await engine.scan();
  assert.strictEqual(s.a.drift, 'changed');
  assert.strictEqual(s.vol.drift, 'reset');
});

test('revert undoes newest first so stacked changes unwind correctly', async () => {
  const { engine, backend } = freshEngine();
  await engine.apply(['a']);
  await new Promise((r) => setTimeout(r, 5));
  await engine.apply(['base']);
  backend.calls.length = 0;
  await engine.revertAll();
  const call = backend.calls.find((c) => c.kind === 'restore');
  assert.deepStrictEqual(call.ids, ['base', 'a']);
});

test('history records applies and reverts', async () => {
  const { engine } = freshEngine();
  await engine.apply(['a']);
  await engine.revert(['a']);
  const h = require('../src/core/backup').history();
  assert.deepStrictEqual(h.map((x) => x.action), ['revert', 'apply']);
});

test('a crash mid-apply is recovered on next start so the change can still be reverted', async () => {
  const { dataDir } = freshEngine();
  const backup = require('../src/core/backup');
  backup.startJournal({ action: 'apply', ids: ['a'], pending: [{ id: 'a', name: 'a', items: [{ op: { target: 'reg:A', value: 1 }, snap: { value: null, absent: true }, admin: false }] }] });
  // "Restart" the engine on the same data folder.
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}core${path.sep}`)) delete require.cache[k];
  const engine = require('../src/core/engine');
  const system = new Map([['reg:A', 1]]);
  const registry = { osId: 'test', osName: 'Test', tweaks: new Map([['a', T('a', 'free', [{ target: 'reg:A', value: 1 }])]]), actions: new Map() };
  engine.init({ registry, dataDir, backend: fakeBackend(system), getPlan: () => 'free' });
  const b2 = require('../src/core/backup');
  assert.ok(b2.isApplied('a'), 'interrupted change is listed');
  assert.strictEqual(b2.journal(), null);
  await engine.revert(['a']);
  assert.ok(!system.has('reg:A'));
});

test('the engine refuses a second operation while one is running', async () => {
  const { engine } = freshEngine();
  const p = engine.apply(['a']);
  await assert.rejects(engine.apply(['base']), /Busy/);
  await p;
  assert.strictEqual(engine.isBusy(), false);
});
