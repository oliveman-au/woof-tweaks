'use strict';
// The tweak engine: status scan, preview (dry run), apply, revert, one-off actions.
// Plan gating happens HERE (main process), never only in the UI.
const fs = require('fs');
const path = require('path');
const backup = require('./backup');
const elevate = require('./elevate');
const posix = require('./posix');
const winops = require('./winops');
const { canUse, PLAN_NAMES } = require('./plans');

const IS_WIN = process.platform === 'win32';
let registry = null;      // { tweaks: Map, actions: Map }
let getPlan = () => 'free';
let getHardware = async () => ({});
let getSettings = () => ({});
let emit = () => {};
let busy = null;          // current operation name
let idleWaiters = [];
let lastScan = null;

// ---------- backend (per OS) ----------
let backend = IS_WIN ? {
  needsAdmin: winops.needsAdmin,
  matches: winops.matches,
  describe: winops.describe,
  async read(groups) {
    const r = await elevate.runWindows({ mode: 'read', groups: groups.map((g) => ({ id: g.id, ops: g.ops.map(winops.forRunner) })) }, { admin: false, timeout: 120_000 });
    if (!r.ok) throw new Error(r.error || 'Could not read your current settings');
    return groups.map((g, i) => ((r.groups[i] && r.groups[i].results) || []).map((x) => (x.error ? { unknown: true, why: x.error } : x.snap)));
  },
  async apply(groups, admin) {
    const job = { mode: 'apply', groups: groups.map((g) => ({ id: g.id, ops: g.ops.map(winops.forRunner), post: g.post || [] })) };
    const r = await elevate.runWindows(job, { admin });
    return groups.map((g, i) => {
      const x = r.groups && r.groups[i];
      if (!x) return { id: g.id, ok: false, cancelled: r.cancelled, error: r.error || 'Did not run', items: [] };
      return { id: g.id, ok: !!x.ok, error: x.error || null, items: (x.results || []).map((res, j) => ({ op: g.ops[j], snap: res.snap, na: !!res.na })) };
    });
  },
  async restore(groups, admin) {
    const job = { mode: 'restore', groups: groups.map((g) => ({ id: g.id, ops: g.items.map((it) => winops.forRunner(it.op)), snaps: g.items.map((it) => it.snap), post: g.post || [] })) };
    const r = await elevate.runWindows(job, { admin });
    return groups.map((g, i) => {
      const x = r.groups && r.groups[i];
      return x ? { id: g.id, ok: !!x.ok, error: x.error || null } : { id: g.id, ok: false, cancelled: r.cancelled, error: r.error || 'Did not run' };
    });
  },
} : {
  needsAdmin: posix.needsAdmin,
  matches: posix.matches,
  describe: (op, snap) => posixDescribe(op, snap),
  async read(groups) {
    const out = [];
    for (const g of groups) {
      const snaps = await Promise.all(g.ops.map((op) => posix.read(op).catch((e) => ({ unknown: true, why: e.message }))));
      out.push(snaps);
    }
    return out;
  },
  async apply(groups, admin) {
    const snaps = await this.read(groups);
    const sg = groups.map((g, i) => ({ id: g.id, post: g.post, items: g.ops.map((op, j) => ({ op, snap: snaps[i][j] })) }));
    // A tweak whose current value can't be read is never changed.
    const blocked = sg.map((g) => g.items.find((it) => it.snap && it.snap.unknown));
    const runnable = sg.filter((g, i) => !blocked[i]);
    let res = [];
    if (runnable.length) {
      const r = await elevate.runShell(posix.buildScript(runnable, 'apply'), { admin });
      res = r.cancelled || r.noAdmin
        ? runnable.map(() => ({ ok: false, cancelled: r.cancelled, error: r.cancelled ? 'Admin permission was declined, so nothing was changed.' : r.stderr }))
        : posix.parseScriptOutput(r.stdout, runnable.length);
    }
    let k = 0;
    return sg.map((g, i) => {
      if (blocked[i]) return { id: g.id, ok: false, error: blocked[i].snap.why || 'Could not read the current setting, so nothing was changed.', items: [] };
      const x = res[k++];
      return { id: g.id, ok: x.ok, cancelled: x.cancelled, error: x.error || null, items: g.items.map((it) => ({ ...it, na: !!(it.snap && it.snap.na) })) };
    });
  },
  async restore(groups, admin) {
    const r = await elevate.runShell(posix.buildScript(groups, 'restore'), { admin });
    if (r.cancelled || r.noAdmin) return groups.map((g) => ({ id: g.id, ok: false, cancelled: r.cancelled, error: r.cancelled ? 'Admin permission was declined.' : r.stderr }));
    const parsed = posix.parseScriptOutput(r.stdout, groups.length);
    return groups.map((g, i) => ({ id: g.id, ...parsed[i] }));
  },
};

function posixDescribe(op, snap) {
  const cur = snap && !snap.na && !snap.unknown;
  switch (op.t) {
    case 'defaults': return { target: `${op.domain} ${op.key}`, from: cur ? (snap.exists ? snap.value : '(not set)') : '?', to: op.value === null ? '(removed)' : String(op.value) };
    case 'sysctl': return { target: `sysctl ${op.key}`, from: cur ? snap.value : '?', to: String(op.value) };
    case 'sysfs': return { target: op.label || op.glob, from: cur ? [...new Set(snap.files.map((f) => f.value))].join(', ') : '?', to: String(op.value) };
    case 'gsettings': return { target: `${op.schema} ${op.key}`, from: cur ? snap.value : '?', to: String(op.value) };
    case 'systemd': return { target: `Service ${op.unit}`, from: cur ? `${snap.enabled}${snap.active ? ', running' : ''}` : '?', to: op.enabled ? 'enabled' : 'disabled + stopped' };
    case 'file': return { target: posix.expand(op.path), from: cur ? (snap.exists ? 'existing file (backed up)' : '(no file)') : '?', to: 'Woof Tweaks config' };
    case 'pmset': return { target: `Power setting ${op.key}`, from: cur ? snap.value : '?', to: String(op.value) };
    case 'mdutil': return { target: 'Spotlight indexing', from: cur ? (snap.enabled ? 'On' : 'Off') : '?', to: op.enabled ? 'On' : 'Off' };
    case 'macDns': return { target: 'DNS servers', from: cur ? snap.services.map((s) => `${s.service}: ${s.servers.join(', ') || 'automatic'}`).join('; ') : '?', to: op.servers.join(', ') };
    case 'nvidia': return { target: `NVIDIA ${op.label || op.attr}`, from: cur ? snap.value : '?', to: String(op.value) };
    case 'adb': return { target: `Android ${op.key}`, from: cur ? snap.value : '?', to: String(op.value) };
    case 'pkg': return { target: `Package ${op.names.apt || Object.values(op.names)[0]}`, from: cur ? (snap.installed ? 'installed' : 'not installed') : '?', to: op.install === false ? 'removed' : 'installed' };
    default: return { target: op.t, from: '?', to: '?' };
  }
}

// ---------- setup ----------
function init(opts) {
  registry = opts.registry;
  getPlan = opts.getPlan || getPlan;
  getHardware = opts.getHardware || getHardware;
  getSettings = opts.getSettings || getSettings;
  emit = opts.emit || emit;
  if (opts.backend) backend = opts.backend; // tests inject a fake system
  elevate.init(opts.dataDir);
  backup.init(opts.dataDir);
  recoverInterrupted();
}

/** If the app was killed mid-change, keep whatever the runner had already snapshotted so it can be reverted. */
function recoverInterrupted() {
  const j = backup.journal();
  if (!j) return;
  for (const rec of j.pending || []) {
    if (!backup.isApplied(rec.id) && rec.items && rec.items.length) backup.record(rec.id, { ...rec, interrupted: true });
  }
  backup.log({ action: 'interrupted', ids: j.ids || [], ok: false, note: 'Woof Tweaks closed unexpectedly during a change. Anything it started is listed under Backups and can be reverted.' });
  backup.endJournal();
}

// ---------- busy lock ----------
async function withLock(name, fn) {
  if (busy) throw Object.assign(new Error(`Busy: ${busy}`), { code: 'BUSY' });
  busy = name;
  emit('engine:busy', { busy: name });
  try { return await fn(); } finally {
    busy = null;
    emit('engine:busy', { busy: null });
    const w = idleWaiters; idleWaiters = [];
    w.forEach((r) => r());
  }
}
const isBusy = () => !!busy;
function waitIdle(timeoutMs = 120_000) {
  if (!busy) return Promise.resolve();
  return new Promise((resolve) => { idleWaiters.push(resolve); setTimeout(resolve, timeoutMs); });
}

// ---------- helpers ----------
const tweakOps = (t, ctx) => (typeof t.changes === 'function' ? t.changes(ctx) : t.changes) || [];
const adminOps = (ops) => ops.filter((op) => backend.needsAdmin(op));
const userOps = (ops) => ops.filter((op) => !backend.needsAdmin(op));

async function context() {
  const hw = await getHardware().catch(() => ({}));
  return { hw, settings: getSettings() };
}

/** Why can't this tweak run here? null = it can. Includes the plan check. */
function blocker(t, ctx, plan) {
  if (!t) return { code: 'unknown', reason: 'Unknown tweak' };
  if (!t.os.includes(registry.osId)) return { code: 'os', reason: `Not available on ${registry.osName}` };
  if (!canUse(plan, t.tier)) return { code: 'plan', reason: `Needs the ${PLAN_NAMES[t.tier]} plan`, requiredPlan: t.tier };
  const g = t.guard ? t.guard(ctx.hw || {}) : null;
  if (g) return { code: 'guard', reason: g };
  if (t.needsSetting) {
    const v = ctx.settings && ctx.settings[t.needsSetting];
    if (!v || (Array.isArray(v) && !v.length)) return { code: 'setting', reason: 'Set this up in Settings first' };
  }
  if (t.exclusive) {
    const other = [...registry.tweaks.values()].find((o) => o.id !== t.id && o.exclusive === t.exclusive && backup.isApplied(o.id));
    if (other) return { code: 'exclusive', reason: `Revert “${other.name}” first — only one can be on at a time` };
  }
  return null;
}

// ---------- scan ----------
async function scan() {
  const ctx = await context();
  const list = [...registry.tweaks.values()].filter((t) => t.os.includes(registry.osId));
  const groups = list.map((t) => ({ id: t.id, ops: tweakOps(t, ctx) })).filter((g) => g.ops.length);
  let snaps = [];
  try { snaps = await backend.read(groups); } catch (e) { emit('engine:log', { level: 'error', msg: `Scan failed: ${e.message}` }); snaps = groups.map((g) => g.ops.map(() => ({ unknown: true }))); }
  const result = {};
  groups.forEach((g, i) => {
    const t = registry.tweaks.get(g.id);
    const m = g.ops.map((op, j) => backend.matches(op, snaps[i][j]));
    const live = m.filter((x) => x !== null);
    const allNa = snaps[i].every((s) => s && s.na);
    let status;
    if (allNa) status = 'na';
    else if (!live.length) status = 'unknown';
    else if (live.every(Boolean)) status = 'optimised';
    else if (live.some(Boolean)) status = 'partial';
    else status = 'default';
    const rec = backup.get(g.id);
    let drift = null;
    if (rec && (status === 'default' || status === 'partial')) drift = t.volatile || rec.volatile ? 'reset' : 'changed';
    result[g.id] = {
      status, applied: !!rec, appliedAt: rec ? rec.at : null, drift,
      why: allNa ? (snaps[i].find((s) => s && s.why) || {}).why || 'Not available on this PC' : null,
    };
  });
  lastScan = { at: Date.now(), result };
  return result;
}
const cachedScan = () => (lastScan ? lastScan.result : null);

// ---------- preview (dry run) ----------
async function preview(ids) {
  const ctx = await context();
  const plan = getPlan();
  const out = [];
  const tweaks = ids.map((id) => registry.tweaks.get(id)).filter(Boolean);
  const groups = [];
  for (const t of tweaks) {
    const b = blocker(t, ctx, plan);
    if (b) { out.push({ id: t.id, name: t.name, blocked: b }); continue; }
    groups.push({ id: t.id, ops: tweakOps(t, ctx) });
  }
  let snaps = [];
  try { snaps = await backend.read(groups); } catch { snaps = groups.map((g) => g.ops.map(() => ({ unknown: true }))); }
  groups.forEach((g, i) => {
    const t = registry.tweaks.get(g.id);
    out.push({
      id: t.id, name: t.name, risk: t.risk, reboot: t.reboot, admin: adminOps(g.ops).length > 0,
      alreadyApplied: backup.isApplied(t.id),
      changes: g.ops.map((op, j) => ({ ...backend.describe(op, snaps[i][j]), na: !!(snaps[i][j] && snaps[i][j].na), same: backend.matches(op, snaps[i][j]) === true })),
    });
  });
  return out;
}

// ---------- apply ----------
async function apply(ids, opts = {}) {
  return withLock('apply', async () => {
    const ctx = await context();
    const plan = getPlan();
    const results = [];
    const todo = [];
    const takenExclusive = new Set();
    // Pull in prerequisites first (e.g. per-game QoS tags need "Allow game QoS tags").
    const expanded = [];
    for (const id of ids) {
      const t = registry.tweaks.get(id);
      for (const req of (t && t.requires) || []) if (!backup.isApplied(req) && !expanded.includes(req)) expanded.push(req);
      if (!expanded.includes(id)) expanded.push(id);
    }
    for (const id of expanded) {
      const t = registry.tweaks.get(id);
      if (t && t.exclusive && takenExclusive.has(t.exclusive)) { results.push({ id, name: t.name, ok: false, skipped: true, code: 'exclusive', reason: 'Another option in this group was chosen' }); continue; }
      const b = blocker(t, ctx, plan);
      if (b) { results.push({ id, name: t ? t.name : id, ok: false, skipped: true, ...b }); continue; }
      if (backup.isApplied(id)) { results.push({ id, name: t.name, ok: true, skipped: true, code: 'applied', reason: 'Already applied' }); continue; }
      const ops = tweakOps(t, ctx);
      if (!ops.length) { results.push({ id, name: t.name, ok: false, skipped: true, code: 'na', reason: 'Nothing to change on this PC' }); continue; }
      if (t.exclusive) takenExclusive.add(t.exclusive);
      todo.push({ t, ops });
    }
    if (!todo.length) return summarise('apply', results, opts);

    const step = (msg, pct) => emit('engine:progress', { op: 'apply', msg, pct });
    backup.startJournal({ action: 'apply', ids: todo.map((x) => x.t.id), pending: [] });
    const pending = new Map(); // id -> items applied so far (for crash recovery + rollback)

    // 1) Restore point (Windows) when the setting is on — once a day at most (Windows' own limit).
    const anyAdmin = todo.some((x) => adminOps(x.ops).length);
    const settings = getSettings();
    if (IS_WIN && settings.autoRestorePoint !== false && opts.restorePoint !== false && anyAdmin) {
      const last = settings.lastRestorePointAt ? Date.parse(settings.lastRestorePointAt) : 0;
      if (Date.now() - last > 24 * 3600_000) {
        step('Creating a Windows restore point…', 5);
        const rp = await createRestorePoint().catch((e) => ({ ok: false, error: e.message }));
        emit('engine:log', { level: rp.ok ? 'info' : 'warn', msg: rp.ok ? (rp.message || 'Restore point created') : `Restore point skipped: ${rp.error}` });
        if (rp.cancelled) {
          backup.endJournal();
          return summarise('apply', results.concat(todo.map((x) => ({ id: x.t.id, name: x.t.name, ok: false, cancelled: true, error: 'Admin permission was declined, so nothing was changed.' }))), opts);
        }
      }
    }

    // 2) Per-user changes first (never elevated), then one elevated batch for the rest.
    const userGroups = todo.map((x) => ({ id: x.t.id, ops: userOps(x.ops), post: x.t.post })).filter((g) => g.ops.length);
    const adminGroups = todo.map((x) => ({ id: x.t.id, ops: adminOps(x.ops), post: x.t.post })).filter((g) => g.ops.length);
    const failed = new Map();

    if (userGroups.length) {
      step('Applying your settings…', 20);
      const r = await backend.apply(userGroups, false);
      for (const g of r) {
        const items = g.items.filter((it) => it.snap && !it.na).map((it) => ({ op: it.op, snap: it.snap, admin: false }));
        if (g.ok) pending.set(g.id, items);
        else failed.set(g.id, g.error || 'Failed');
      }
      backup.updateJournal({ pending: [...pending].map(([id, items]) => ({ id, name: registry.tweaks.get(id).name, items })) });
    }

    const adminTodo = adminGroups.filter((g) => !failed.has(g.id));
    if (adminTodo.length) {
      step(`Applying system changes (admin)…`, 55);
      const r = await backend.apply(adminTodo, true);
      for (const g of r) {
        if (g.ok) {
          const items = g.items.filter((it) => it.snap && !it.na).map((it) => ({ op: it.op, snap: it.snap, admin: true }));
          pending.set(g.id, (pending.get(g.id) || []).concat(items));
        } else failed.set(g.id, { error: g.error || 'Failed', cancelled: g.cancelled });
      }
    }

    // 3) A tweak that failed its admin half gets its per-user half rolled back: no half-applied tweaks.
    const rollback = [...failed.keys()].filter((id) => pending.has(id)).map((id) => ({ id, items: pending.get(id).filter((it) => !it.admin), post: registry.tweaks.get(id).post }));
    if (rollback.length) {
      step('Undoing partial changes…', 85);
      await backend.restore(rollback.filter((g) => g.items.length), false);
      rollback.forEach((g) => pending.delete(g.id));
    }

    // 4) Record what stuck.
    for (const x of todo) {
      const id = x.t.id;
      const f = failed.get(id);
      if (f) {
        const err = typeof f === 'string' ? f : f.error;
        results.push({ id, name: x.t.name, ok: false, cancelled: typeof f === 'object' && !!f.cancelled, error: err });
        continue;
      }
      const items = pending.get(id) || [];
      if (!items.length) { results.push({ id, name: x.t.name, ok: false, skipped: true, code: 'na', reason: 'Not available on this PC' }); continue; }
      backup.record(id, { name: x.t.name, volatile: x.t.volatile, reboot: x.t.reboot, post: x.t.post, items });
      results.push({ id, name: x.t.name, ok: true, reboot: x.t.reboot || false });
    }
    backup.endJournal();
    step('Done', 100);
    return summarise('apply', results, opts);
  });
}

// ---------- revert ----------
async function revert(ids, opts = {}) {
  return withLock('revert', async () => {
    const results = [];
    const recs = [];
    for (const id of [...new Set(ids)]) {
      const rec = backup.get(id);
      const t = registry.tweaks.get(id);
      if (!rec) { results.push({ id, name: t ? t.name : id, ok: true, skipped: true, reason: 'Not applied by Woof Tweaks' }); continue; }
      recs.push({ id, rec });
    }
    // Newest first, so changes stacked on top of each other unwind in the right order.
    recs.sort((a, b) => String(b.rec.at).localeCompare(String(a.rec.at)));
    if (!recs.length) return summarise('revert', results, opts);
    emit('engine:progress', { op: 'revert', msg: 'Restoring your original settings…', pct: 20 });
    // Undo in the reverse order things were applied: admin half first, then per-user half.
    const adminG = recs.map(({ id, rec }) => ({ id, items: rec.items.filter((it) => it.admin), post: rec.post })).filter((g) => g.items.length);
    const userG = recs.map(({ id, rec }) => ({ id, items: rec.items.filter((it) => !it.admin), post: rec.post })).filter((g) => g.items.length);
    const failed = new Map();
    if (adminG.length) for (const r of await backend.restore(adminG, true)) if (!r.ok) failed.set(r.id, r);
    const userTodo = userG.filter((g) => !(failed.get(g.id) && failed.get(g.id).cancelled));
    if (userTodo.length) for (const r of await backend.restore(userTodo, false)) if (!r.ok) failed.set(r.id, r);
    for (const { id, rec } of recs) {
      const f = failed.get(id);
      if (f) results.push({ id, name: rec.name, ok: false, cancelled: !!f.cancelled, error: f.error || 'Could not restore' });
      else { backup.remove(id); results.push({ id, name: rec.name, ok: true, reboot: rec.reboot || false }); }
    }
    emit('engine:progress', { op: 'revert', msg: 'Done', pct: 100 });
    return summarise('revert', results, opts);
  });
}

const revertAll = (opts) => revert(Object.keys(backup.applied()), opts);

function summarise(action, results, opts = {}) {
  const ok = results.filter((r) => r.ok && !r.skipped);
  const failedR = results.filter((r) => !r.ok && !r.skipped);
  if (ok.length || failedR.length) {
    backup.log({ action, source: opts.source || 'manual', ids: ok.map((r) => r.id), names: ok.map((r) => r.name), failed: failedR.map((r) => ({ id: r.id, name: r.name, error: r.error })), ok: failedR.length === 0 });
  }
  lastScan = null;
  const reboot = results.some((r) => r.ok && r.reboot && r.reboot !== false) ? (results.some((r) => r.ok && r.reboot === 'restart') ? 'restart' : 'signout') : false;
  return { ok: failedR.length === 0, applied: ok.length, failed: failedR.length, cancelled: failedR.some((r) => r.cancelled), reboot, results };
}

// ---------- actions ----------
async function createRestorePoint() {
  if (!IS_WIN) return { ok: false, error: 'Restore points are a Windows feature. Woof Tweaks keeps its own backup of every change.' };
  const r = await elevate.runWindows({ mode: 'action', groups: [{ id: 'restorePoint', action: { kind: 'restorePoint', description: 'Woof Tweaks — before changes' } }] }, { admin: true, timeout: 10 * 60_000 });
  if (!r.ok) return { ok: false, cancelled: r.cancelled, error: r.error };
  const g = r.groups[0];
  if (!g || !g.ok) return { ok: false, error: (g && g.error) || 'Windows could not create a restore point (System Protection may be off).' };
  emit('settings:set', { key: 'lastRestorePointAt', value: new Date().toISOString() });
  backup.addSystemSnapshot({ kind: 'windows-restore-point', created: g.data && g.data.created !== false });
  return { ok: true, created: g.data && g.data.created !== false, message: g.data && g.data.message };
}

async function runAction(id, params = {}) {
  const a = registry.actions.get(id);
  if (!a) return { ok: false, error: 'Unknown action' };
  const ctx = await context();
  const plan = getPlan();
  if (!a.os.includes(registry.osId)) return { ok: false, error: `Not available on ${registry.osName}` };
  if (!canUse(plan, a.tier)) return { ok: false, code: 'plan', requiredPlan: a.tier, error: `Needs the ${PLAN_NAMES[a.tier]} plan` };
  return withLock(`action:${id}`, async () => {
    emit('engine:progress', { op: 'action', msg: a.progress || `${a.name}…`, pct: 30 });
    let res;
    try {
      if (a.kind === 'restorePoint') res = await createRestorePoint();
      else if (IS_WIN) {
        const spec = typeof a.win === 'function' ? a.win(ctx, params) : a.win;
        const r = await elevate.runWindows({ mode: 'action', groups: [{ id, action: spec }] }, { admin: !!a.admin, timeout: a.timeout || 30 * 60_000 });
        const g = r.ok && r.groups[0];
        res = g && g.ok ? { ok: true, data: g.data || {} } : { ok: false, cancelled: r.cancelled, error: (g && g.error) || r.error || 'Failed' };
      } else {
        const script = typeof a.sh === 'function' ? a.sh(ctx, params) : a.sh;
        const r = await elevate.runShell(script, { admin: !!a.admin, timeout: a.timeout || 30 * 60_000 });
        res = r.code === 0 ? { ok: true, data: parseActionOutput(r.stdout) } : { ok: false, cancelled: r.cancelled, error: r.cancelled ? 'Admin permission was declined.' : (r.stderr.trim().split('\n').pop() || 'Failed') };
      }
    } catch (e) { res = { ok: false, error: e.message }; }
    backup.log({ action: 'action', ids: [id], names: [a.name], ok: res.ok, failed: res.ok ? [] : [{ id, name: a.name, error: res.error }], data: res.data });
    emit('engine:progress', { op: 'action', msg: 'Done', pct: 100 });
    return res;
  });
}
function parseActionOutput(s) {
  const m = String(s).match(/WOOF_RESULT (\{.*\})/);
  if (m) { try { return JSON.parse(m[1]); } catch { /* ignore */ } }
  return {};
}

module.exports = { init, scan, cachedScan, preview, apply, revert, revertAll, runAction, createRestorePoint, isBusy, waitIdle, blocker, context, backendFor: () => backend };
