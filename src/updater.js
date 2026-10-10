'use strict';
// Updates are automatic and silent (owner's decision, 9 Oct 2026: fixes ship fast and every user should get them).
// The new version downloads in the background and installs when nobody is using the app: the window has been
// hidden, minimised or in the background for a few minutes (or the PC is idle) and no change or game session is
// running. The app restarts itself and then just says "Woof Tweaks was updated". It also installs on quit.
//
// Windows / Linux: electron-updater (download checked against the sha512 in latest.yml).
// macOS: electron-updater only installs paid-signed apps, so we fetch the universal zip ourselves, check its sha512
// from latest-mac.yml, unpack it next to the app, and swap the bundles after the app quits.
const { app, shell, Notification, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { parseLatestYml, cmpVersion } = require('./update-feed');

const IS_MAC = process.platform === 'darwin';
const REPO = 'https://github.com/oliveman-au/woof-tweaks/releases';
const AWAY_MS = 3 * 60_000; // window hidden / minimised / unfocused this long counts as "not using it"
const IDLE_SEC = 5 * 60; // or no keyboard/mouse input on the PC for this long

let timer = null;
let installTimer = null;
let updater = null;
let getWin = () => null;
let hooks = { isBusy: () => false, gameActive: () => false };
let awaySince = null;
let macStaged = null; // { app, work, version }
let storeRef = null;
let state = { status: 'idle', version: null, critical: false, progress: 0, error: null, manual: false };

const send = (ch, data) => { try { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); } catch { /* window closing */ } };
const setState = (patch) => { state = { ...state, ...patch }; send('update:state', state); };

function notesText(info) {
  const n = info && info.releaseNotes;
  if (!n) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map((x) => x.note || '').join('\n');
  return '';
}

/** After a restart into a new version: one small notification, nothing to click. */
function announceIfUpdated(store) {
  const now = app.getVersion();
  const last = store.get('lastRunVersion') || store.get('lastSeenVersion'); // lastSeenVersion: installs from before 1.1.3
  store.set('lastRunVersion', now);
  const restart = store.get('updateRestart');
  store.delete('updateRestart');
  if (!last || cmpVersion(now, last) <= 0) return;
  if (restart && restart.hidden) { const w = getWin(); try { if (w) w.once('ready-to-show', () => w.minimize()); } catch { /* ignore */ } }
  state = { ...state, justUpdated: now }; // the window shows its own small toast when it loads (see app.js boot)
  setTimeout(() => {
    try { if (Notification.isSupported()) new Notification({ title: 'Woof Tweaks was updated', body: `You're now on version ${now}.`, silent: true }).show(); } catch { /* notifications off */ }
  }, 2500);
}

function initUpdater(winGetter, store, opts = {}) {
  getWin = winGetter;
  storeRef = store;
  hooks = { ...hooks, ...opts };
  announceIfUpdated(store);
  if (!app.isPackaged) { setState({ status: 'dev' }); return; }
  if (!IS_MAC) {
    try { updater = require('electron-updater').autoUpdater; } catch (e) { setState({ status: 'error', error: 'Updater unavailable' }); return; }
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.logger = null;
    updater.on('checking-for-update', () => setState({ status: 'checking', error: null }));
    updater.on('update-not-available', () => setState({ status: 'latest' }));
    updater.on('update-available', (info) => setState({ status: 'downloading', version: info.version, critical: /\[critical\]/i.test(notesText(info)), progress: 0 }));
    updater.on('download-progress', (p) => setState({ progress: Math.round(p.percent || 0) }));
    updater.on('update-downloaded', (info) => { setState({ status: 'ready', version: info.version, progress: 100 }); scheduleInstall(store); });
    updater.on('error', (e) => setState({ status: 'error', error: String(e && e.message || e).slice(0, 200) }));
  }
  check(store);
  timer = setInterval(() => check(store), 3 * 3600_000);
}

function check(store) {
  if (IS_MAC) return macCheck(store).then(() => state).catch((e) => { setState({ status: 'error', error: String(e && e.message || e).slice(0, 200) }); return state; });
  if (!updater) return Promise.resolve(state);
  if (state.status === 'ready') return Promise.resolve(state);
  return updater.checkForUpdates().then(() => state).catch((e) => { setState({ status: 'error', error: String(e && e.message || e).slice(0, 200) }); return state; });
}

// ---------------------------------------------------------------- when to install

function notInUse() {
  const w = getWin();
  let away = true;
  try { away = !w || w.isDestroyed() || !w.isVisible() || w.isMinimized() || !w.isFocused(); } catch { /* treat as away */ }
  if (!away) awaySince = null;
  else if (!awaySince) awaySince = Date.now();
  let idle = 0;
  try { idle = powerMonitor.getSystemIdleTime(); } catch { /* unsupported */ }
  return { ok: (awaySince && Date.now() - awaySince >= AWAY_MS) || idle >= IDLE_SEC, hidden: away && !!w && !w.isDestroyed() && (w.isMinimized() || !w.isVisible()) };
}

function scheduleInstall(store) {
  clearInterval(installTimer);
  installTimer = setInterval(() => {
    if (state.status !== 'ready') return;
    if (hooks.isBusy() || hooks.gameActive()) return; // never mid-change, never during a watched game session
    const use = notInUse();
    if (!use.ok) return;
    clearInterval(installTimer);
    restartInto(store, use.hidden);
  }, 30_000);
}

function restartInto(store, hidden) {
  store.set('updateRestart', { from: app.getVersion(), hidden: !!hidden, at: Date.now() });
  if (IS_MAC) return macSwapAndQuit();
  if (updater) updater.quitAndInstall(true, true); // silent installer, start the app again afterwards
}

function download() {
  if (IS_MAC && !macSupported()) { shell.openExternal(`${REPO}/latest`); return; }
  if (state.status === 'ready') return;
  if (updater) updater.downloadUpdate().catch(() => {});
}

/** "Restart & update" in Settings: install right away. */
function install() { if (state.status === 'ready' && storeRef) restartInto(storeRef, false); }
function stopUpdater() { clearInterval(timer); clearInterval(installTimer); timer = null; installTimer = null; }
const getState = () => state;

// ---------------------------------------------------------------- macOS

function macBundle() {
  const b = path.resolve(app.getPath('exe'), '..', '..', '..');
  return b.endsWith('.app') ? b : null;
}
function macSupported() {
  const b = macBundle();
  if (!b || b.includes('/AppTranslocation/')) return false; // still running from the download: can't replace it
  try { fs.accessSync(path.dirname(b), fs.constants.W_OK); fs.accessSync(b, fs.constants.W_OK); return true; } catch { return false; }
}

async function fetchOk(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': `WoofTweaks/${app.getVersion()}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally { clearTimeout(t); }
}

const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 300_000 }, (e, out) => (e ? reject(e) : resolve(String(out)))));

async function macCheck(store) {
  if (state.status === 'ready' || state.status === 'downloading') return;
  setState({ status: 'checking', error: null, manual: !macSupported() });
  const yml = await (await fetchOk(`${REPO}/latest/download/latest-mac.yml`, 20_000)).text();
  const info = parseLatestYml(yml);
  if (!info) throw new Error('Update information unavailable');
  if (cmpVersion(info.version, app.getVersion()) <= 0) { setState({ status: 'latest' }); return; }
  let critical = /\[critical\]/i.test(info.notes);
  if (!macSupported()) {
    // Can't replace itself: tell the user (and insist when the release notes say [critical]).
    try { critical = /\[critical\]/i.test((await (await fetchOk('https://api.github.com/repos/oliveman-au/woof-tweaks/releases/latest', 15_000)).json()).body || ''); } catch { /* keep */ }
    setState({ status: 'available', version: info.version, critical, manual: true });
    return;
  }
  if (!/^[\w.-]+\.zip$/.test(info.url) || info.size <= 0 || info.size > 800 * 1048576) throw new Error('Update information invalid');
  setState({ status: 'downloading', version: info.version, critical, progress: 0, manual: false });
  const bundle = macBundle();
  const work = path.join(path.dirname(bundle), '.woof-tweaks-update');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work);
  try {
    const zip = path.join(work, 'update.zip');
    const r = await fetchOk(`${REPO}/download/v${info.version}/${info.url}`, 30 * 60_000);
    const hash = crypto.createHash('sha512');
    const out = fs.createWriteStream(zip);
    let got = 0;
    for await (const chunk of r.body) {
      got += chunk.length;
      if (got > info.size) throw new Error('Download larger than expected');
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((res) => out.once('drain', res));
      setState({ progress: Math.round((got / info.size) * 100) });
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    if (got !== info.size || hash.digest('base64') !== info.sha512) throw new Error("The download didn't match its checksum");
    const dest = path.join(work, 'new');
    await run('/usr/bin/ditto', ['-x', '-k', zip, dest]);
    fs.rmSync(zip, { force: true });
    const name = fs.readdirSync(dest).find((f) => f.endsWith('.app'));
    if (!name) throw new Error('The update was incomplete');
    const newApp = path.join(dest, name);
    const plistVersion = (await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(newApp, 'Contents', 'Info.plist')])).trim();
    if (plistVersion !== info.version) throw new Error('The update has the wrong version');
    await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', newApp]).catch(() => {});
    macStaged = { app: newApp, work, version: info.version };
    setState({ status: 'ready', progress: 100 });
    scheduleInstall(store);
  } catch (e) {
    fs.rmSync(work, { recursive: true, force: true });
    throw e;
  }
}

function macSwapAndQuit(relaunch = true) {
  if (!macStaged) return;
  const script = [
    'pid="$1"; old="$2"; new="$3"; work="$4"',
    'for i in $(seq 1 600); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done',
    'mv "$old" "$work/old.app" && mv "$new" "$old" || { [ -d "$work/old.app" ] && [ ! -d "$old" ] && mv "$work/old.app" "$old"; }',
    relaunch ? 'open "$old"' : ':',
    'sleep 5; rm -rf "$work"',
  ].join('\n');
  const child = spawn('/bin/sh', ['-c', script, 'woof-tweaks-update', String(process.pid), macBundle(), macStaged.app, macStaged.work], { detached: true, stdio: 'ignore' });
  child.unref();
  app.quit(); // the normal quit path: finishes any running change and undoes watcher changes first
}

/**
 * The hidden background updater (`--background-update`, started at login / every 6 h by background-task.js):
 * no window, check, install silently, exit. A notification says "Woof Tweaks was updated" on the next run.
 */
async function runHeadless(store) {
  storeRef = store;
  getWin = () => null;
  announceIfUpdated(store);
  let done = false;
  const finish = () => { if (done) return; done = true; stopUpdater(); setTimeout(() => app.exit(0), 300); };
  setTimeout(finish, 45 * 60_000).unref?.();
  if (!app.isPackaged) return finish();
  const mark = () => store.set('updateRestart', { from: app.getVersion(), hidden: true, background: true, at: Date.now() });
  if (IS_MAC) {
    try { await macCheck(store); } catch { return finish(); }
    stopUpdater();
    if (state.status === 'ready' && macStaged) { mark(); done = true; return macSwapAndQuit(false); }
    return finish();
  }
  try { updater = require('electron-updater').autoUpdater; } catch { return finish(); }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.logger = null;
  updater.on('update-not-available', finish);
  updater.on('error', finish);
  updater.on('update-downloaded', () => {
    mark();
    done = true;
    try { updater.quitAndInstall(true, false); } catch { app.exit(0); } // silent install, don't open the app
    setTimeout(() => app.exit(0), 120_000).unref?.();
  });
  updater.checkForUpdates().catch(finish);
}

module.exports = { initUpdater, stopUpdater, check, download, install, getState, parseLatestYml, cmpVersion, runHeadless };
