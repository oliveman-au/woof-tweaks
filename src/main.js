'use strict';
const { app, BrowserWindow, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');
const Store = require('./store');
const { registerIPC } = require('./ipc');
const { initUpdater } = require('./updater');

const store = new Store('woof-tweaks-config');
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    title: 'Woof Tweaks',
    backgroundColor: '#07080d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const rendererDir = app.isPackaged
    ? path.join(process.resourcesPath, 'renderer')
    : path.join(__dirname, 'renderer');
  win.loadFile(path.join(rendererDir, 'index.html'));

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  registerIPC(ipcMain, store);
  createWindow();
  initUpdater(win, store);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
