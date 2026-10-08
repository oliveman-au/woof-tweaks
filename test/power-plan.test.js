'use strict';
// The Woof Gaming power plan adapts to the PC (1.1.2): laptops and CPUs that steer games to their own best cores
// (AMD Ryzen 9 X3D, Intel hybrid) stay on Windows' Balanced plan; core parking is never forced off on them.
const test = require('node:test');
const assert = require('node:assert');
const windows = require('../src/tweaks/windows');

const byId = (id) => windows.find((t) => t.id === id);
const ops = (id, hw) => { const t = byId(id); return typeof t.changes === 'function' ? t.changes({ hw }) : t.changes; };
const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';
const CORE_PARK_MIN = '0cc5b647-c1df-4637-891a-dec35c318583';
const PROC_MIN = '893dee8e-2bef-41e0-89c6-b55d0929964c';
const touches = (list, setting) => list.some((o) => o.t === 'powerSetting' && o.setting === setting);

const PCS = {
  x3d: { cpu: 'AMD Ryzen 9 7950X3D 16-Core Processor', cpuVendor: 'amd', cpuCores: 16, cpuThreads: 32 },
  x3dSingle: { cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor', cpuVendor: 'amd', cpuCores: 8, cpuThreads: 16 },
  hybrid: { cpu: '13th Gen Intel(R) Core(TM) i7-13700K', cpuVendor: 'intel', cpuCores: 16, cpuThreads: 24 },
  ultra: { cpu: 'Intel(R) Core(TM) Ultra 7 265K', cpuVendor: 'intel', cpuCores: 20, cpuThreads: 20 },
  intelNoE: { cpu: '12th Gen Intel(R) Core(TM) i5-12400F', cpuVendor: 'intel', cpuCores: 6, cpuThreads: 12 },
  laptop: { cpu: 'AMD Ryzen 7 6800H', cpuVendor: 'amd', cpuCores: 8, cpuThreads: 16, isLaptop: true },
};

test('X3D dual-die, Intel hybrid and laptops keep Windows Balanced and never touch core parking or CPU minimum', () => {
  for (const k of ['x3d', 'hybrid', 'ultra', 'laptop']) {
    const list = ops('win-plan-woof', PCS[k]);
    assert.strictEqual(list[0].t, 'powerScheme', k);
    assert.strictEqual(list[0].guid, BALANCED, `${k} should stay on Balanced`);
    assert.ok(!list[0].template, `${k}: no new plan created`);
    assert.ok(!touches(list, CORE_PARK_MIN) && !touches(list, PROC_MIN), `${k}: core parking / CPU minimum untouched`);
    assert.strictEqual(list.filter((o) => o.t === 'powerSetting').length, 3, `${k}: only USB/PCIe/disk sleep off`);
  }
});

test('other desktops keep the full Woof Gaming plan (unchanged behaviour)', () => {
  for (const k of ['x3dSingle', 'intelNoE']) {
    const list = ops('win-plan-woof', PCS[k]);
    assert.notStrictEqual(list[0].guid, BALANCED, k);
    assert.ok(list[0].template, `${k}: creates the Woof plan`);
    assert.ok(touches(list, CORE_PARK_MIN) && touches(list, PROC_MIN), k);
  }
});

test('core parking off is blocked on CPUs that rely on it; High/Ultimate plans are not recommended there', () => {
  const park = byId('win-core-parking-off');
  assert.match(park.guard(PCS.x3d), /core parking/);
  assert.match(park.guard(PCS.hybrid), /core parking/);
  assert.strictEqual(park.guard(PCS.intelNoE), null);
  for (const id of ['win-plan-high', 'win-plan-ultimate']) {
    assert.strictEqual(byId(id).recommend(PCS.hybrid), false, id);
    assert.match(byId(id).warn(PCS.x3d), /Balanced/, id);
  }
  assert.strictEqual(byId('win-plan-woof').recommend(PCS.laptop), true);
});

test('presets use the adaptive Woof Gaming plan on laptops too (never High performance)', () => {
  const presets = require('../src/presets');
  const list = Array.isArray(presets) ? presets : presets.PRESETS || presets.presets || Object.values(presets).find(Array.isArray);
  const fake = (id) => ({ id, exclusive: 'power-plan', category: 'fps', risk: 'safe' });
  for (const p of list.filter((x) => typeof x.pick === 'function')) {
    assert.strictEqual(p.pick(fake('win-plan-high'), PCS.laptop), false, `${p.id || p.name} picks High performance on a laptop`);
  }
});
