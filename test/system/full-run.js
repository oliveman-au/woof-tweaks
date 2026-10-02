'use strict';
// REAL-SYSTEM test — only run on a throwaway machine (GitHub Actions runner). It:
//   1. reads every setting every tweak touches,
//   2. applies EVERY tweak for this OS through the real engine (admin via the runner's own rights),
//   3. scans, then Reverts everything,
//   4. reads every setting again and fails if anything differs from step 1.
// Writes a JSON report to $WOOF_REPORT (default ./full-run-report.json).
if (!process.env.CI && !process.env.WOOF_ALLOW_SYSTEM_TEST) {
  console.error('Refusing to run: this changes real system settings. Set WOOF_ALLOW_SYSTEM_TEST=1 on a throwaway machine.');
  process.exit(2);
}
const fs = require('fs');
const os = require('os');
const path = require('path');
const hardware = require('../../src/core/hardware');
const { build } = require('../../src/tweaks');
const engine = require('../../src/core/engine');
const backup = require('../../src/core/backup');

// Settings that legitimately change on their own between reads (not caused by us).
const VOLATILE = (op, a, b) => {
  if (op.t === 'service' && a && b && a.start === b.start) return true;           // running/stopped state can drift by itself
  if (op.t === 'display') return true;                                             // headless VM
  if (op.t === 'dns' && a && b) return JSON.stringify(a.adapters?.map((x) => [x.ifIndex, x.static])) === JSON.stringify(b.adapters?.map((x) => [x.ifIndex, x.static]));
  if (op.t === 'adapterProp' && a && b && a.na === b.na) return JSON.stringify(a.adapters?.map((x) => x.value)) === JSON.stringify(b.adapters?.map((x) => x.value));
  return false;
};

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'woof-fullrun-'));
  const hw = await hardware.detect();
  const registry = build(hw);
  const settings = { autoRestorePoint: false, customDns: ['9.9.9.9', '149.112.112.112'] };
  engine.init({ registry, dataDir, getPlan: () => 'ultra', getHardware: async () => hw, getSettings: () => settings });
  const be = engine.backendFor();
  const ctx = { hw, settings };
  const skip = new Set((process.env.WOOF_SKIP || '').split(',').filter(Boolean));
  const tweaks = [...registry.tweaks.values()].filter((t) => !skip.has(t.id));
  const groups = tweaks.map((t) => ({ id: t.id, ops: typeof t.changes === 'function' ? t.changes(ctx) : t.changes })).filter((g) => g.ops.length);
  console.log(`[full-run] ${registry.osName}: ${tweaks.length} tweaks, ${groups.reduce((n, g) => n + g.ops.length, 0)} settings`);

  const before = await be.read(groups);
  const t0 = Date.now();
  // Apply in exclusive-safe order: one option per exclusive group at a time.
  const byGroup = new Map();
  for (const t of tweaks) { const k = t.exclusive || `solo:${t.id}`; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(t.id); }
  const rounds = Math.max(...[...byGroup.values()].map((l) => l.length));
  const report = { os: registry.osName, hardware: hardware.summary(hw), applied: [], failed: [], skipped: [], mismatches: [], rounds: [] };
  for (let r = 0; r < rounds; r++) {
    const ids = [...byGroup.values()].map((l) => l[r]).filter(Boolean);
    let res;
    if (process.env.WOOF_ONE_BY_ONE) {
      // One tweak at a time with timings, to pinpoint anything slow or stuck.
      res = { results: [], applied: 0, failed: 0 };
      for (const id of ids) {
        const t1 = Date.now();
        console.log(`[full-run] applying ${id}…`);
        const one = await engine.apply([id], { restorePoint: false });
        console.log(`[full-run]   ${id}: ${one.applied ? 'applied' : one.failed ? 'FAILED' : 'skipped'} in ${Date.now() - t1} ms`);
        res.results.push(...one.results); res.applied += one.applied; res.failed += one.failed;
      }
    } else res = await engine.apply(ids, { restorePoint: false });
    for (const x of res.results) {
      if (x.ok && !x.skipped) report.applied.push(x.id);
      else if (x.skipped) report.skipped.push({ id: x.id, reason: x.reason || x.code });
      else report.failed.push({ id: x.id, error: x.error });
    }
    const scan = await engine.scan();
    const notOptimised = ids.filter((id) => backup.isApplied(id) && scan[id] && !['optimised', 'na', 'unknown'].includes(scan[id].status)).map((id) => ({ id, status: scan[id].status }));
    report.rounds.push({ round: r, applied: res.applied, failed: res.failed, notOptimisedAfterApply: notOptimised });
    const rv = await engine.revertAll();
    for (const x of rv.results) if (!x.ok) report.failed.push({ id: x.id, error: `REVERT: ${x.error}` });
  }
  const after = await be.read(groups);
  groups.forEach((g, i) => g.ops.forEach((op, j) => {
    const a = before[i][j]; const b = after[i][j];
    if (JSON.stringify(a) !== JSON.stringify(b) && !VOLATILE(op, a, b)) report.mismatches.push({ id: g.id, op, before: a, after: b });
  }));
  report.leftApplied = Object.keys(backup.applied());
  report.seconds = Math.round((Date.now() - t0) / 1000);
  const out = process.env.WOOF_REPORT || path.join(process.cwd(), 'full-run-report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`[full-run] applied ${report.applied.length}, failed ${report.failed.length}, skipped ${report.skipped.length}, mismatches after revert ${report.mismatches.length}, left applied ${report.leftApplied.length} (${report.seconds}s)`);
  for (const f of report.failed) console.log(`  FAILED ${f.id}: ${f.error}`);
  for (const m of report.mismatches) console.log(`  MISMATCH ${m.id} ${JSON.stringify(m.op).slice(0, 160)}\n    before ${JSON.stringify(m.before).slice(0, 200)}\n    after  ${JSON.stringify(m.after).slice(0, 200)}`);
  for (const r of report.rounds) for (const n of r.notOptimisedAfterApply) console.log(`  NOT-OPTIMISED-AFTER-APPLY ${n.id}: ${n.status}`);
  // The system must be exactly as it was: that's the hard requirement.
  process.exit(report.mismatches.length || report.leftApplied.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
