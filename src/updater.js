'use strict';
const { autoUpdater } = require('electron-updater');

function initUpdater(win, store) {
  if (!require('electron').app.isPackaged) return;

  const autoUpdate = store.get('autoUpdate', true);
  autoUpdater.autoDownload = autoUpdate;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('update-available', (info) => {
    win?.webContents.send('update:available', { version: info.version, date: info.releaseDate });
  });

  autoUpdater.on('update-downloaded', () => {
    win?.webContents.send('update:ready', true);
  });

  autoUpdater.on('error', () => {});

  autoUpdater.checkForUpdates().catch(() => {});

  setInterval(() => {
    if (store.get('autoUpdate', true)) autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 3600_000);
}

module.exports = { initUpdater };
