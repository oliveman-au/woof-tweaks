'use strict';
const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const Store = require('./store');
const exec = require('./core/exec');
const { registerIPC, shutdown, isBusy, waitIdle } = require('./ipc');
const { initUpdater, stopUpdater } = require('./updater');

// One copy of the app at a time: a second launch just focuses the window we already have.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  const store = new Store('woof-tweaks-config');
  let win = null;
  let quitting = false; // set once we've decided to quit, so close/before-quit don't loop
  let finishing = false; // a change was running when the user quit; we're waiting for it

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  function createWindow() {
    const bounds = store.get('windowBounds', {});
    win = new BrowserWindow({
      width: bounds.width || 1180,
      height: bounds.height || 760,
      x: bounds.x, y: bounds.y,
      minWidth: 820,
      minHeight: 560,
      title: 'Woof Tweaks',
      backgroundColor: '#07080d',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    win.removeMenu();

    const rendererDir = app.isPackaged ? path.join(process.resourcesPath, 'renderer') : path.join(__dirname, 'renderer');
    win.loadFile(path.join(rendererDir, 'index.html'));
    win.once('ready-to-show', () => win.show());

    // Links open in the real browser; the app window never navigates away.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e) => e.preventDefault());

    win.on('close', (e) => {
      try { if (!win.isMinimized() && !win.isMaximized()) store.set('windowBounds', win.getBounds()); } catch { /* ignore */ }
      // Clicking X quits the whole app on every platform. If a change is mid-way, finish it first.
      if (isBusy() && !quitting) {
        e.preventDefault();
        finishSafelyThenQuit();
      }
    });
    win.on('closed', () => { win = null; });
  }

  function finishSafelyThenQuit() {
    if (finishing) return;
    finishing = true;
    try { win && win.webContents.send('app:finishing'); } catch { /* window may be gone */ }
    waitIdle(120_000).finally(() => { quitting = true; app.quit(); });
  }

  app.whenReady().then(() => {
    nativeTheme.themeSource = store.get('theme') === 'light' ? 'light' : 'dark';
    registerIPC(ipcMain, store, () => win);
    createWindow();
    initUpdater(() => win, store);
  });

  // Closing the last window quits — on macOS too (no "stay alive in the Dock with no windows").
  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', (e) => {
    if (isBusy() && !quitting) {
      e.preventDefault();
      finishSafelyThenQuit();
      return;
    }
    quitting = true;
  });

  app.on('will-quit', () => {
    // Stop timers, watchers and every helper process we started, and flush settings to disk.
    try { shutdown(); } catch { /* best effort */ }
    try { stopUpdater(); } catch { /* best effort */ }
    exec.killAll();
    store.flush();
  });
}
