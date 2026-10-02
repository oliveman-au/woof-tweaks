'use strict';
// Updates come from GitHub Releases (free). Auto-update is on by default but never overrides a user who
// turned it off: they still see "update available" and choose. Critical releases (release notes contain
// "[critical]") show a visible "required to continue" gate instead of updating silently.
const { app } = require('electron');

let timer = null;
let updater = null;
let getWin = () => null;
let state = { status: 'idle', version: null, critical: false, progress: 0, error: null };

const send = (ch, data) => { try { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); } catch { /* window closing */ } };
const setState = (patch) => { state = { ...state, ...patch }; send('update:state', state); };

function notesText(info) {
  const n = info && info.releaseNotes;
  if (!n) return '';
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map((x) => x.note || '').join('\n');
  return '';
}

function initUpdater(winGetter, store) {
  getWin = winGetter;
  if (!app.isPackaged) { setState({ status: 'dev' }); return; }
  try { updater = require('electron-updater').autoUpdater; } catch (e) { setState({ status: 'error', error: 'Updater unavailable' }); return; }

  const auto = () => store.get('autoUpdate', true) !== false;
  updater.autoDownload = auto();
  updater.autoInstallOnAppQuit = auto();
  updater.allowPrerelease = false;
  updater.logger = null;

  updater.on('checking-for-update', () => setState({ status: 'checking', error: null }));
  updater.on('update-not-available', () => setState({ status: 'latest' }));
  updater.on('update-available', (info) => {
    const critical = /\[critical\]/i.test(notesText(info));
    setState({ status: auto() || critical ? 'downloading' : 'available', version: info.version, critical });
    if (critical && !auto()) updater.downloadUpdate().catch(() => {});
  });
  updater.on('download-progress', (p) => setState({ progress: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', (info) => setState({ status: 'ready', version: info.version, progress: 100 }));
  updater.on('error', (e) => setState({ status: 'error', error: String(e && e.message || e).slice(0, 200) }));

  check(store);
  timer = setInterval(() => check(store), 4 * 3600_000);
}

function check(store) {
  if (!updater) return Promise.resolve(state);
  updater.autoDownload = store.get('autoUpdate', true) !== false;
  updater.autoInstallOnAppQuit = updater.autoDownload;
  return updater.checkForUpdates().then(() => state).catch((e) => { setState({ status: 'error', error: String(e && e.message || e).slice(0, 200) }); return state; });
}

function download() { if (updater) updater.downloadUpdate().catch(() => {}); setState({ status: 'downloading' }); }
function install() { if (updater && state.status === 'ready') updater.quitAndInstall(false, true); }
function stopUpdater() { clearInterval(timer); timer = null; }
const getState = () => state;

module.exports = { initUpdater, stopUpdater, check, download, install, getState };
