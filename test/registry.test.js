'use strict';
// Every tweak on every OS has valid metadata, a plan tier, detect/apply/revert, and never fights another
// tweak over the same setting. Every game profile only references real tweaks.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const tiers = require('../src/config/tiers');

const dump = (os) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'helpers', 'registry-dump.js')], { env: { ...process.env, WOOF_FAKE_OS: os }, encoding: 'utf8' }));
const OSES = ['win32', 'darwin', 'linux', 'chromeos'];
const all = Object.fromEntries(OSES.map((o) => [o, dump(o)]));

for (const os of OSES) {
  const d = all[os];
  test(`${os}: every tweak validates and has detect/apply/revert`, () => {
    assert.ok(d.tweaks.length > 0, 'no tweaks');
    for (const t of d.tweaks) {
      assert.deepStrictEqual(t.problems, [], `${t.id}: ${t.problems.join(', ')}`);
      assert.ok(t.hasHelpers, `${t.id} missing helpers`);
      assert.ok(t.os.includes(os), `${t.id} not for ${os}`);
    }
  });
  test(`${os}: tweak ids are unique`, () => {
    const ids = d.tweaks.map((t) => t.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });
  test(`${os}: no two tweaks change the same setting (except options in one exclusive group)`, () => {
    const owner = new Map();
    for (const t of d.tweaks) for (const k of new Set(t.targets)) {
      const prev = owner.get(k);
      if (prev && !(prev.exclusive && prev.exclusive === t.exclusive)) assert.fail(`${t.id} and ${prev.id} both change ${k}`);
      owner.set(k, t);
    }
  });
  test(`${os}: security trade-offs and advanced tweaks are Ultra`, () => {
    for (const t of d.tweaks) if (t.security || t.risk === 'advanced') assert.ok(['ultra'].includes(t.tier), `${t.id} is ${t.risk} but tier ${t.tier}`);
  });
  test(`${os}: every action has a tier and an implementation`, () => {
    for (const a of d.actions) { assert.ok(a.tier, `${a.id} has no tier`); assert.ok(a.hasImpl, `${a.id} has no ${os} implementation`); }
  });
  test(`${os}: game profiles reference only real tweaks for this OS`, () => {
    for (const p of d.profiles) {
      assert.deepStrictEqual(p.problems.filter((x) => !x.startsWith('unknown tweak')), [], `${p.id}: ${p.problems.join(', ')}`);
      if (p.platforms.includes(os)) for (const id of p.osTweaks) assert.ok(d.tweaks.find((t) => t.id === id), `${p.id} → unknown ${os} tweak ${id}`);
    }
  });
}

test('every static tweak id in tiers.js exists on some OS, and every tweak has a tier', () => {
  const ids = new Set(OSES.flatMap((o) => all[o].tweaks.map((t) => t.id)));
  for (const id of Object.keys(tiers.TWEAKS)) assert.ok(ids.has(id), `tiers.js lists unknown tweak ${id}`);
  for (const os of OSES) for (const t of all[os].tweaks) if (!/^(game\.|startup\.|win-qos-no-nla)/.test(t.id)) assert.ok(tiers.TWEAKS[t.id], `${t.id} missing from tiers.js`);
});

test('at least 150 real system tweaks across all platforms', () => {
  const ids = new Set(OSES.flatMap((o) => all[o].tweaks.filter((t) => !/^(game\.|startup\.)/.test(t.id)).map((t) => t.id)));
  assert.ok(ids.size >= 150, `only ${ids.size}`);
});

test('30+ game profiles, each with a tier', () => {
  const p = all.win32.profiles;
  assert.ok(p.length >= 31, `only ${p.length}`);
  for (const x of p) assert.ok(['free', 'plus', 'pro', 'ultra'].includes(x.tier), `${x.id} tier ${x.tier}`);
});
