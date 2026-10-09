'use strict';
// Main-process API for the window. Every call is validated here; the plan comes only from the server
// (via license.js) and every tweak/feature is checked against it here — never trusted from the UI.
const { app, shell, dialog, clipboard, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const log = require('./core/log');
const exec = require('./core/exec');
const engine = require('./core/engine');
const backup = require('./core/backup');
const hardware = require('./core/hardware');
const monitor = require('./core/monitor');
const watcher = require('./core/watcher');
const bench = require('./core/benchmark');
const { diagnose } = require('./core/diagnose');
const { osId, OS_NAMES } = require('./core/platform');
const { canUse, PLAN_NAMES, PLAN_PRICES, PLAN_FEATURES, PLAN_TAGLINES, PLAN_ORDER } = require('./core/plans');
const tiers = require('./config/tiers');
const { registry, build, CATEGORIES } = require('./tweaks');
const games = require('./games');
const presets = require('./presets');
const license = require('./license');
const updater = require('./updater');

let store = null;
let getWin = () => null;
let maintenanceTimer = null;
let overlayWin = null;
let hwReady = null;

const send = (ch, data) => { try { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); } catch { /* closing */ } if (overlayWin && !overlayWin.isDestroyed() && ch === 'monitor:tick') overlayWin.webContents.send(ch, data); };
const plan = () => license.cachedPlan();
const can = (feature) => canUse(plan(), tiers.featureTier(feature));
const needPlan = (feature) => ({ ok: false, code: 'plan', requiredPlan: tiers.featureTier(feature), error: `Needs the ${PLAN_NAMES[tiers.featureTier(feature)]} plan` });

// ---------- settings (whitelist + validation) ----------
const IP = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i;
const EXE = /^[\w .()+-]{1,80}\.exe$|^[\w .()+-]{1,80}$/i;
const SETTINGS = {
  theme: (v) => ['dark', 'light', 'amoled'].includes(v),
  accent: (v) => /^#[0-9a-f]{6}$/i.test(v),
  language: (v) => ['en'].includes(v),
  launchOnStartup: (v) => typeof v === 'boolean',
  autoUpdate: (v) => typeof v === 'boolean',
  autoRestorePoint: (v) => typeof v === 'boolean',
  customDns: (v) => Array.isArray(v) && v.length <= 4 && v.every((x) => typeof x === 'string' && IP.test(x)),
  watcherEnabled: (v) => typeof v === 'boolean',
  watcherGames: (v) => Array.isArray(v) && v.length <= 100 && v.every((x) => typeof x === 'string' && x.length < 60),
  sessionBoost: (v) => typeof v === 'boolean',
  timerResolution: (v) => typeof v === 'boolean',
  lowerPriorityApps: (v) => Array.isArray(v) && v.length <= 30 && v.every((x) => typeof x === 'string' && EXE.test(x)),
  maintenance: (v) => v && typeof v === 'object' && typeof v.enabled === 'boolean' && [1, 7, 14, 30].includes(v.days || 7),
  onboarded: (v) => typeof v === 'boolean',
  overlay: (v) => typeof v === 'boolean',
  reduceMotion: (v) => typeof v === 'boolean',
  lastSeenVersion: (v) => typeof v === 'string' && v.length < 20,
  dismissedTips: (v) => Array.isArray(v) && v.length < 200,
  monitorOnDashboard: (v) => typeof v === 'boolean',
};
const settingsSnapshot = () => Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, store.get(k)]).filter(([, v]) => v !== undefined));
const engineSettings = () => ({ ...settingsSnapshot(), lastRestorePointAt: store.get('lastRestorePointAt') });

function applyStartupSetting(on) {
  try {
    if (process.platform === 'linux') {
      const f = path.join(os.homedir(), '.config', 'autostart', 'woof-tweaks.desktop');
      if (on) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=Woof Tweaks\nExec="${process.env.APPIMAGE || process.execPath}"\nX-GNOME-Autostart-enabled=true\n`);
      } else if (fs.existsSync(f)) fs.unlinkSync(f);
    } else app.setLoginItemSettings({ openAtLogin: !!on });
  } catch (e) { log.warn('startup setting failed', { e: e.message }); }
}

// ---------- serialising for the UI ----------
let hwCache = {};
function tweakView(t, scan) {
  const ctx = { hw: hwCache, settings: engineSettings() };
  let ops = [];
  try { ops = typeof t.changes === 'function' ? t.changes(ctx) : t.changes; } catch { ops = []; }
  const be = engine.backendFor();
  const s = scan && scan[t.id];
  const blocked = engine.blocker(t, ctx, plan());
  let warn = null; let recommended = false;
  try { warn = t.warn ? t.warn(hwCache) : null; } catch { /* ignore */ }
  try { recommended = t.recommend ? !!t.recommend(hwCache) : false; } catch { /* ignore */ }
  return {
    id: t.id, name: t.name, desc: t.desc, long: t.long, category: t.category, os: t.os, risk: t.risk, reboot: t.reboot, tier: t.tier,
    locked: !canUse(plan(), t.tier), admin: ops.some((op) => be.needsAdmin(op)), changes: ops.length, exclusive: t.exclusive || null,
    games: t.games || null, tags: t.tags || [], volatile: !!t.volatile, security: !!t.security, warn, recommended,
    blocked: blocked && blocked.code !== 'plan' ? blocked : null, startupItem: t.startupItem || null, needsSetting: t.needsSetting || null,
    hidden: !!t.hiddenUnlessNeeded, status: s ? s.status : null, applied: s ? s.applied : backup.isApplied(t.id), drift: s ? s.drift : null, why: s ? s.why : null,
  };
}

function gameView(p) {
  const inst = games.installedMap().get(p.id);
  const os_ = osId();
  const extras = [...registry.tweaks.values()].filter((t) => t.games && t.games.includes(p.id)).map((t) => t.id);
  const fill = (x) => games.fill(x, hwCache);
  return {
    id: p.id, name: p.name, short: p.short, mono: p.mono, genre: p.genre, colors: p.colors, competitive: p.competitive, antiCheat: p.antiCheat, tier: p.tier,
    locked: !canUse(plan(), p.tier), supported: p.platforms.includes(os_), custom: !!p.custom,
    installed: inst ? { source: inst.source, dir: inst.dir || null, exe: inst.exePath || null, shaderCache: inst.shaderCache || null } : null,
    tweakIds: ((p.tweaks || {})[os_] || []).filter((id) => registry.tweaks.has(id)), extraIds: extras,
    settings: (p.settings || []).map((s) => ({ ...s, value: fill(s.value) })),
    launchOptions: Object.fromEntries(Object.entries(p.launchOptions || {}).map(([k, v]) => [k, fill(v)])),
    notes: p.notes || [], regions: p.regions || [], processes: (p.detect && p.detect.process) || [],
  };
}

function customProfiles() {
  return (store.get('customProfiles') || []).map((c) => ({ ...c, custom: true, tier: 'plus', platforms: [osId()], tweaks: { [osId()]: c.tweakIds || [] }, colors: c.colors || ['#8b7bff', '#2a2350'], genre: 'Custom profile', settings: [], detect: { process: c.process ? [c.process] : [] } }));
}
const allProfiles = () => [...games.load(), ...customProfiles()];
const profileById = (id) => allProfiles().find((p) => p.id === id);

// ---------- startup work ----------
async function loadHardware(force = false) {
  const hw = await hardware.detect(force);
  hwCache = hw;
  try { games.detect(hw); } catch (e) { log.warn('game detection failed', { e: e.message }); }
  build(hw);
  send('registry:changed', { at: Date.now() });
  return hw;
}

function startMaintenance() {
  const check = async () => {
    const m = store.get('maintenance');
    if (!m || !m.enabled || !can('maintenance') || engine.isBusy()) return;
    const last = store.get('maintenanceLastRun', 0);
    if (Date.now() - last < (m.days || 7) * 86400_000) return;
    store.set('maintenanceLastRun', Date.now());
    const ids = ['act-clear-temp', 'act-clear-crash-dumps', ...(process.platform === 'win32' ? ['act-flush-dns'] : [])].filter((id) => registry.actions.has(id) && !registry.actions.get(id).admin);
    let freed = 0;
    for (const id of ids) { const r = await engine.runAction(id).catch(() => null); if (r && r.ok && r.data && r.data.freed) freed += r.data.freed; }
    log.info('maintenance ran', { ids, freed });
    send('toast', { type: 'success', title: 'Weekly maintenance done', message: freed ? `Freed ${(freed / 1048576).toFixed(0)} MB.` : 'Temp files and caches tidied.' });
  };
  setTimeout(() => check().catch(() => {}), 60_000);
  maintenanceTimer = setInterval(() => check().catch(() => {}), 6 * 3600_000);
}

function startWatcherIfEnabled() {
  if (store.get('watcherEnabled') && can('watcher')) {
    watcher.start({
      getSettings: settingsSnapshot, emit: send, can, isBusy: engine.isBusy, isApplied: backup.isApplied,
      apply: (ids, o) => engine.apply(ids, o), revert: (ids, o) => engine.revert(ids, o),
      games: () => allProfiles().filter((p) => p.platforms.includes(osId()) && canUse(plan(), p.tier)),
      profileTweaks: (id) => { const p = profileById(id); const v = p ? gameView(p) : null; return v ? [...v.tweakIds, ...v.extraIds] : []; },
    });
  } else watcher.stop();
}

function toggleOverlay(on) {
  if (!on) { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close(); overlayWin = null; monitor.stop(); return; }
  if (overlayWin && !overlayWin.isDestroyed()) return;
  const { screen } = require('electron');
  const d = screen.getPrimaryDisplay().workArea;
  overlayWin = new BrowserWindow({
    width: 220, height: 118, x: d.x + d.width - 236, y: d.y + 16, frame: false, transparent: true, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setIgnoreMouseEvents(true);
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'renderer') : path.join(__dirname, 'renderer');
  overlayWin.loadFile(path.join(dir, 'overlay.html'));
  overlayWin.once('ready-to-show', () => overlayWin && overlayWin.showInactive());
  overlayWin.on('closed', () => { overlayWin = null; });
  monitor.start((d2) => send('monitor:tick', d2));
}

// ---------- registration ----------
function registerIPC(ipcMain, _store, winGetter) {
  store = _store;
  getWin = winGetter;
  const dataDir = app.getPath('userData');
  log.init(dataDir);
  log.info('start', { version: app.getVersion(), os: osId(), release: os.release() });

  build({});
  engine.init({
    registry, dataDir, getPlan: plan, getHardware: () => (hwReady || Promise.resolve(hwCache)), getSettings: engineSettings,
    emit: (ch, d) => {
      if (ch === 'settings:set' && d && d.key === 'lastRestorePointAt') { store.set('lastRestorePointAt', d.value); return; }
      if (ch === 'engine:log') log[d.level === 'error' ? 'error' : 'info'](d.msg);
      send(ch, d);
    },
  });
  license.init({ store, deviceId: getDeviceId, osId, version: app.getVersion(), emit: send, isPackaged: app.isPackaged });
  hwReady = loadHardware().catch((e) => { log.error('hardware detection failed', { e: e.message }); return {}; });
  license.refresh().then(() => { send('auth:state', { status: 'refreshed', ...license.session() }); startWatcherIfEnabled(); });
  startMaintenance();
  if (store.get('overlay') && can('overlay')) app.whenReady().then(() => setTimeout(() => toggleOverlay(true), 1500));

  const h = (ch, fn) => ipcMain.handle(ch, async (e, ...args) => {
    try { return await fn(...args); } catch (err) {
      if (err && err.code === 'BUSY') return { ok: false, busy: true, error: 'Another change is still running — try again in a moment.' };
      log.error(`${ch} failed`, { e: err && err.message });
      return { ok: false, error: (err && err.message) || 'Something went wrong' };
    }
  });
  const ids = (x) => (Array.isArray(x) ? x.filter((i) => typeof i === 'string' && i.length < 120).slice(0, 500) : []);

  // App
  ipcMain.on('app:info', (e) => { e.returnValue = { version: app.getVersion(), os: osId(), osName: OS_NAMES[osId()], platform: process.platform, arch: process.arch, packaged: app.isPackaged }; });
  h('app:state', async () => ({
    session: license.session(), settings: settingsSnapshot(), busy: engine.isBusy(),
    plans: PLAN_ORDER.map((id) => ({ id, name: PLAN_NAMES[id], price: PLAN_PRICES[id], features: PLAN_FEATURES[id], tagline: PLAN_TAGLINES[id] })),
    features: Object.fromEntries(Object.keys(tiers.FEATURES).map((f) => [f, { tier: tiers.featureTier(f), allowed: can(f) }])),
    categories: CATEGORIES, update: updater.getState(), watcher: watcher.status(), site: license.SITE,
  }));
  h('app:openLogs', async () => { if (log.dir()) shell.openPath(log.dir()); return { ok: true }; });
  h('app:openBackups', async () => { shell.openPath(backup.backupDir()); return { ok: true }; });
  h('app:openExternal', async (url) => { if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url); return { ok: true }; });
  h('app:reset', async () => {
    // Keeps backups (so you can still revert) and your login; resets everything else.
    const keep = { session: store.get('session'), plan: store.get('plan'), planCheckedAt: store.get('planCheckedAt') };
    store.clear();
    for (const [k, v] of Object.entries(keep)) if (v !== undefined) store.set(k, v);
    store.flush();
    app.relaunch(); app.exit(0);
    return { ok: true };
  });
  h('app:relaunch', async () => { app.relaunch(); app.quit(); return { ok: true }; });
  h('app:capture', async (rect) => {
    const w = getWin(); if (!w) return { ok: false };
    const r = rect && Number.isFinite(rect.x) ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : undefined;
    const img = await w.webContents.capturePage(r);
    clipboard.writeImage(img);
    const res = await dialog.showSaveDialog(w, { title: 'Save benchmark card', defaultPath: path.join(app.getPath('pictures'), `woof-tweaks-benchmark-${Date.now()}.png`), filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (!res.canceled && res.filePath) fs.writeFileSync(res.filePath, img.toPNG());
    return { ok: true, copied: true, saved: !res.canceled };
  });

  // Account
  h('auth:start', async () => ({ ok: true, ...(await license.startLogin((url) => shell.openExternal(url))) }));
  h('auth:cancel', async () => { license.cancelLogin(); return { ok: true }; });
  h('auth:logout', async () => { const s = await license.logout(); startWatcherIfEnabled(); return { ok: true, session: s }; });
  h('auth:refresh', async () => { const s = await license.refresh(); startWatcherIfEnabled(); return { ok: true, session: s }; });

  // System info
  h('hw:get', async (force) => { const hw = force ? await loadHardware(true) : await (hwReady || loadHardware()); return hardware.summary(hw); });

  // Tweaks
  h('tweaks:list', async () => {
    await hwReady;
    const scan = engine.cachedScan();
    return [...registry.tweaks.values()].map((t) => tweakView(t, scan));
  });
  h('tweaks:scan', async () => { await hwReady; return engine.scan(); });
  h('tweaks:preview', async (list) => { await hwReady; return engine.preview(ids(list)); });
  h('tweaks:apply', async (list, opts) => { await hwReady; const r = await engine.apply(ids(list), { source: 'manual', restorePoint: !(opts && opts.restorePoint === false) }); log.info('apply', { applied: r.applied, failed: r.failed }); return r; });
  h('tweaks:revert', async (list) => { const r = await engine.revert(ids(list)); log.info('revert', { reverted: r.applied, failed: r.failed }); return r; });
  h('tweaks:revertAll', async () => { const r = await engine.revertAll({ source: 'manual' }); log.info('revert-all', { reverted: r.applied, failed: r.failed }); return r; });
  h('tweaks:fullOptimise', async () => {
    await hwReady;
    // One-click optimise: your plan's set of recommended, non-advanced tweaks (never security trade-offs).
    const list = presets.list(registry.tweaks, hwCache).find((p) => p.id === 'balanced').ids.filter((id) => canUse(plan(), registry.tweaks.get(id).tier));
    return engine.apply(list, { source: 'full-optimise' });
  });

  // Actions & guides
  h('actions:list', async () => [...registry.actions.values()].map((a) => ({ id: a.id, name: a.name, desc: a.desc, long: a.long, category: a.category, tier: a.tier, locked: !canUse(plan(), a.tier), admin: !!a.admin, risk: a.risk, confirm: a.confirm || null, reboot: a.reboot || false, choices: a.choices || null, kind: a.kind })));
  h('actions:run', async (id, params) => {
    if (typeof id !== 'string') return { ok: false, error: 'Bad action' };
    const p = params && typeof params === 'object' ? { names: ids(params.names) } : {};
    const r = await engine.runAction(id, p);
    log.info('action', { id, ok: r.ok });
    return r;
  });
  h('actions:listBloat', async () => {
    if (process.platform !== 'win32') return [];
    const a = registry.actions.get('act-remove-bloat');
    const r = await require('./core/elevate').runWindows({ mode: 'action', groups: [{ id: 'list', action: { kind: 'listAppx', names: a.choices.map((c) => c.id) } }] }, { admin: false, timeout: 60_000 });
    const found = new Set((r.ok && r.groups[0] && r.groups[0].data && r.groups[0].data.found) || []);
    return a.choices.filter((c) => found.has(c.id));
  });
  h('guides:list', async () => registry.guides.map((g) => ({ ...g, relevant: !g.vendor || (hwCache.gpuVendors || []).includes(g.vendor) || !(hwCache.gpuVendors || []).length })));
  h('guides:open', async (target) => openTarget(target));

  // Games
  h('games:list', async () => { await hwReady; return allProfiles().filter((p) => p.platforms.includes(osId())).map(gameView); });
  h('games:redetect', async () => { await loadHardware(true); return allProfiles().filter((p) => p.platforms.includes(osId())).map(gameView); });
  h('games:optimise', async (id, only) => {
    await hwReady;
    const p = profileById(id);
    if (!p) return { ok: false, error: 'Unknown game' };
    if (!canUse(plan(), p.tier)) return { ok: false, code: 'plan', requiredPlan: p.tier, error: `${p.name} needs the ${PLAN_NAMES[p.tier]} plan` };
    const v = gameView(p);
    const want = Array.isArray(only) ? ids(only) : [...v.tweakIds, ...v.extraIds];
    return engine.apply(want, { source: `game:${id}` });
  });
  h('games:clearShaderCache', async (id) => {
    const inst = games.installedMap().get(id);
    if (!inst || !inst.shaderCache || !fs.existsSync(inst.shaderCache)) return { ok: false, error: 'No Steam shader cache found for this game.' };
    let freed = 0;
    for (const f of walk(inst.shaderCache)) { try { const s = fs.statSync(f); fs.unlinkSync(f); freed += s.size; } catch { /* in use */ } }
    log.info('game shader cache cleared', { id, freed });
    return { ok: true, freed };
  });
  h('games:writeMinecraftOptions', async () => {
    if (!can('customGameProfile') && !canUse(plan(), tiers.extraTier('configWrite'))) return needPlan('customGameProfile');
    const dir = games.minecraftDir();
    if (!dir) return { ok: false, error: 'Minecraft Java isn\'t installed (no .minecraft folder).' };
    return writeMinecraftOptions(dir);
  });
  h('games:restoreMinecraftOptions', async () => restoreMinecraftOptions());
  h('games:saveCustom', async (c) => {
    if (!can('customGameProfile')) return needPlan('customGameProfile');
    if (!c || typeof c.name !== 'string' || !c.name.trim()) return { ok: false, error: 'Give your profile a name.' };
    const list = store.get('customProfiles') || [];
    const id = c.id && /^custom-[a-z0-9]+$/.test(c.id) ? c.id : `custom-${crypto.randomBytes(4).toString('hex')}`;
    const rec = { id, name: c.name.trim().slice(0, 40), tweakIds: ids(c.tweakIds).filter((x) => registry.tweaks.has(x)), process: typeof c.process === 'string' && EXE.test(c.process) ? c.process : null };
    store.set('customProfiles', [...list.filter((x) => x.id !== id), rec].slice(-30));
    return { ok: true, id };
  });
  h('games:deleteCustom', async (id) => { store.set('customProfiles', (store.get('customProfiles') || []).filter((x) => x.id !== id)); return { ok: true }; });

  // Presets
  h('presets:list', async () => { await hwReady; return presets.list(registry.tweaks, hwCache, store.get('customPresets') || []); });
  h('presets:apply', async (id) => {
    await hwReady;
    const p = presets.list(registry.tweaks, hwCache, store.get('customPresets') || []).find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Unknown preset' };
    if (!p.builtIn && !can('customPresets')) return needPlan('customPresets');
    return engine.apply(p.ids, { source: `preset:${id}` });
  });
  h('presets:save', async (pr) => {
    if (!can('customPresets')) return needPlan('customPresets');
    if (!pr || typeof pr.name !== 'string' || !pr.name.trim()) return { ok: false, error: 'Give your preset a name.' };
    const list = store.get('customPresets') || [];
    const id = pr.id && /^custom-[a-z0-9]+$/.test(pr.id) ? pr.id : `custom-${crypto.randomBytes(4).toString('hex')}`;
    store.set('customPresets', [...list.filter((x) => x.id !== id), { id, name: pr.name.trim().slice(0, 40), ids: ids(pr.ids).filter((x) => registry.tweaks.has(x)) }].slice(-50));
    return { ok: true, id };
  });
  h('presets:delete', async (id) => { store.set('customPresets', (store.get('customPresets') || []).filter((x) => x.id !== id)); return { ok: true }; });
  h('presets:export', async (id) => {
    const p = presets.list(registry.tweaks, hwCache, store.get('customPresets') || []).find((x) => x.id === id);
    if (!p) return { ok: false, error: 'Unknown preset' };
    const res = await dialog.showSaveDialog(getWin(), { title: 'Export preset', defaultPath: `${p.name.replace(/[^\w -]/g, '')}.woofpreset.json`, filters: [{ name: 'Woof Tweaks preset', extensions: ['json'] }] });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, presets.exportJson(p));
    return { ok: true, path: res.filePath };
  });
  h('presets:import', async () => {
    if (!can('customPresets')) return needPlan('customPresets');
    const res = await dialog.showOpenDialog(getWin(), { title: 'Import preset', properties: ['openFile'], filters: [{ name: 'Woof Tweaks preset', extensions: ['json'] }] });
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true };
    const st = fs.statSync(res.filePaths[0]);
    if (st.size > 256_000) return { ok: false, error: 'That file is too big to be a preset.' };
    const r = presets.parseImport(fs.readFileSync(res.filePaths[0], 'utf8'), registry.tweaks);
    if (!r.ok) return r;
    store.set('customPresets', [...(store.get('customPresets') || []), r.preset].slice(-50));
    return { ok: true, preset: r.preset, unknown: r.unknown };
  });

  // History & backups
  h('history:get', async () => backup.history().slice(0, 300));
  h('backups:get', async () => Object.entries(backup.applied()).map(([id, r]) => ({ id, name: r.name, at: r.at, volatile: r.volatile, interrupted: r.interrupted, changes: r.items.length, admin: r.items.some((i) => i.admin), reboot: r.reboot })));
  h('backups:export', async () => {
    const res = await dialog.showSaveDialog(getWin(), { title: 'Export backup', defaultPath: `woof-tweaks-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, JSON.stringify(backup.exportAll(), null, 2));
    return { ok: true, path: res.filePath };
  });
  h('restorePoint:create', async () => engine.createRestorePoint());

  // Settings
  h('settings:get', async () => settingsSnapshot());
  h('settings:set', async (key, val) => {
    if (!Object.prototype.hasOwnProperty.call(SETTINGS, key) || !SETTINGS[key](val)) return { ok: false, error: 'Invalid setting' };
    if (key === 'watcherEnabled' && val && !can('watcher')) return needPlan('watcher');
    if (key === 'sessionBoost' && val && !can('sessionBoost')) return needPlan('sessionBoost');
    if (key === 'timerResolution' && val && !can('timerResolution')) return needPlan('timerResolution');
    if (key === 'overlay' && val && !can('overlay')) return needPlan('overlay');
    if (key === 'maintenance' && val.enabled && !can('maintenance')) return needPlan('maintenance');
    store.set(key, val);
    if (key === 'launchOnStartup') applyStartupSetting(val);
    if (key === 'autoUpdate') updater.check(store); // (kept for old settings files; updates are always automatic now)
    if (key === 'watcherEnabled' || key === 'watcherGames') startWatcherIfEnabled();
    if (key === 'overlay') toggleOverlay(val);
    return { ok: true };
  });

  // Benchmark, monitor, diagnosis
  h('bench:run', async () => {
    if (!can('benchmark')) return needPlan('benchmark');
    const r = await bench.runAll(dataDir, (stage, pct) => send('bench:progress', { stage, pct }));
    const hist = [r, ...(store.get('benchHistory') || [])].slice(0, 20);
    store.set('benchHistory', hist);
    return { ok: true, result: r, previous: hist[1] || null };
  });
  h('bench:history', async () => store.get('benchHistory') || []);
  h('bench:dns', async () => ({ ok: true, results: await bench.dnsTest() }));
  h('bench:regions', async (gameId) => {
    if (!canUse(plan(), tiers.extraTier('regionPing'))) return { ok: false, code: 'plan', requiredPlan: tiers.extraTier('regionPing'), error: `Needs the ${PLAN_NAMES[tiers.extraTier('regionPing')]} plan` };
    const p = gameId ? profileById(gameId) : null;
    return { ok: true, results: await bench.regions(p && p.regions) };
  });
  h('monitor:start', async () => { monitor.start((d) => send('monitor:tick', d)); return { ok: true }; });
  h('monitor:stop', async () => { monitor.stop(); return { ok: true }; });
  h('diagnose:run', async () => {
    await hwReady;
    const scan = await engine.scan().catch(() => ({}));
    return { ok: true, ...(await diagnose({ hw: { ...hwCache, ...hardware.summary(hwCache) }, monitor: monitor.snapshot(), scan, backupApplied: backup.applied() })) };
  });

  // Updates
  h('update:check', async () => updater.check(store));
  h('update:download', async () => { updater.download(); return { ok: true }; });
  h('update:install', async () => { updater.install(); return { ok: true }; });

  // Account-linked extras (website API)
  h('feedback:send', async (kind, text) => {
    if (typeof text !== 'string' || text.trim().length < 5) return { ok: false, error: 'Tell us a bit more (at least 5 characters).' };
    const body = await license.authedPost('/api/app/feedback', { kind: ['request', 'bug', 'idea'].includes(kind) ? kind : 'request', text: text.trim().slice(0, 2000), appVersion: app.getVersion(), os: osId() });
    return body && body.ok ? { ok: true, priority: !!body.priority } : { ok: false, error: (body && body.error) || 'Could not send' };
  });
  h('sync:push', async () => {
    if (!can('cloudSync')) return needPlan('cloudSync');
    const body = await license.authedPost('/api/app/profiles', { action: 'put', data: { customPresets: store.get('customPresets') || [], customProfiles: store.get('customProfiles') || [], watcherGames: store.get('watcherGames') || [] } });
    return body && body.ok ? { ok: true, at: body.updatedAt } : { ok: false, error: (body && body.error) || 'Could not sync' };
  });
  h('sync:pull', async () => {
    if (!can('cloudSync')) return needPlan('cloudSync');
    const body = await license.authedPost('/api/app/profiles', { action: 'get' });
    if (!body || !body.ok) return { ok: false, error: (body && body.error) || 'Could not sync' };
    const d = body.data || {};
    if (Array.isArray(d.customPresets)) store.set('customPresets', d.customPresets.slice(0, 50));
    if (Array.isArray(d.customProfiles)) store.set('customProfiles', d.customProfiles.slice(0, 30));
    if (Array.isArray(d.watcherGames) && SETTINGS.watcherGames(d.watcherGames)) store.set('watcherGames', d.watcherGames);
    return { ok: true, at: body.updatedAt || null };
  });
}

// ---------- helpers ----------
function* walk(dir, depth = 0) {
  if (depth > 6) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, depth + 1); else yield p;
  }
}

const OPENERS = {
  win32: {
    nvcpl: () => shell.openExternal('shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel'),
    mmsys: () => spawn('control', ['mmsys.cpl'], { detached: true, stdio: 'ignore' }).unref(),
    cttune: () => spawn('cttune.exe', [], { detached: true, stdio: 'ignore' }).unref(),
    display: () => shell.openExternal('ms-settings:display'),
    nightlight: () => shell.openExternal('ms-settings:nightlight'),
    windowsupdate: () => shell.openExternal('ms-settings:windowsupdate'),
    windowsdefender: () => shell.openExternal('windowsdefender:'),
  },
  darwin: {
    display: () => shell.openExternal('x-apple.systempreferences:com.apple.Displays-Settings.extension'),
    focus: () => shell.openExternal('x-apple.systempreferences:com.apple.Focus-Settings.extension'),
    loginitems: () => shell.openExternal('x-apple.systempreferences:com.apple.LoginItems-Settings.extension'),
  },
};
function openTarget(target) {
  const fn = (OPENERS[process.platform] || {})[target];
  if (!fn) return { ok: false, error: 'Can\'t open that here' };
  try { fn(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}

// Minecraft Java options.txt: write recommended values, keeping a backup we can restore.
function writeMinecraftOptions(dir) {
  const file = path.join(dir, 'options.txt');
  const bak = path.join(backup.backupDir(), 'minecraft-options.txt.bak');
  const hw = hwCache;
  const weak = (hw.ramGB || 8) < 8 || (hw.gpuVendors || []).every((v) => v === 'intel' || v === 'apple');
  const render = weak ? 8 : (hw.ramGB || 8) >= 16 ? 16 : 12;
  const want = { renderDistance: String(render), simulationDistance: String(Math.min(render, weak ? 6 : 10)), graphicsMode: '0', maxFps: '260', enableVsync: 'false', entityShadows: 'false', renderClouds: '"fast"' };
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return { ok: false, error: 'Run Minecraft once so it creates options.txt, then try again.' }; }
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, text);
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const out = lines.map((l) => { const k = l.split(':')[0]; if (want[k] != null) { seen.add(k); return `${k}:${want[k]}`; } return l; });
  for (const [k, v] of Object.entries(want)) if (!seen.has(k)) out.splice(out.length - 1, 0, `${k}:${v}`);
  fs.writeFileSync(file, out.join(text.includes('\r\n') ? '\r\n' : '\n'));
  return { ok: true, changed: Object.keys(want).length, backup: true };
}
function restoreMinecraftOptions() {
  const dir = games.minecraftDir();
  const bak = path.join(backup.backupDir(), 'minecraft-options.txt.bak');
  if (!dir || !fs.existsSync(bak)) return { ok: false, error: 'No Minecraft backup to restore.' };
  fs.writeFileSync(path.join(dir, 'options.txt'), fs.readFileSync(bak));
  fs.unlinkSync(bak);
  return { ok: true };
}

let deviceIdCache = null;
function getDeviceId() {
  if (deviceIdCache) return deviceIdCache;
  const p = path.join(app.getPath('userData'), '.device-id');
  try { deviceIdCache = fs.readFileSync(p, 'utf8').trim(); } catch { /* new */ }
  if (!deviceIdCache) { deviceIdCache = crypto.randomUUID(); try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, deviceIdCache); } catch { /* ignore */ } }
  return deviceIdCache;
}

// ---------- lifecycle hooks used by main.js ----------
const isBusy = () => engine.isBusy();
const waitIdle = (ms) => engine.waitIdle(ms);
function shutdown() {
  clearInterval(maintenanceTimer);
  monitor.stop(true);
  watcher.stop();
  license.stop();
  toggleOverlay(false);
}
/** Before quitting: undo anything the watcher applied for a game that's still running. */
async function beforeQuit() { try { await watcher.shutdown(); } catch { /* best effort */ } }

module.exports = { registerIPC, shutdown, beforeQuit, isBusy, waitIdle };
