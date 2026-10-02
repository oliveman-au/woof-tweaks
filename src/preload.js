'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('woof', {
  platform: process.platform,
  version: require('../package.json').version,

  // Auth
  login: (method) => ipcRenderer.invoke('auth:login', method),
  logout: () => ipcRenderer.invoke('auth:logout'),
  session: () => ipcRenderer.invoke('auth:session'),

  // Tweaks
  listTweaks: () => ipcRenderer.invoke('tweaks:list'),
  listProfiles: () => ipcRenderer.invoke('tweaks:profiles'),
  scan: () => ipcRenderer.invoke('tweaks:scan'),
  apply: (ids) => ipcRenderer.invoke('tweaks:apply', ids),
  revert: (ids) => ipcRenderer.invoke('tweaks:revert', ids),
  revertAll: () => ipcRenderer.invoke('tweaks:revert-all'),
  applyProfile: (gameId) => ipcRenderer.invoke('tweaks:apply-profile', gameId),
  fullOptimize: () => ipcRenderer.invoke('tweaks:full-optimize'),

  // License
  plan: () => ipcRenderer.invoke('license:plan'),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, val) => ipcRenderer.invoke('settings:set', key, val),

  // Updates
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (fn) => ipcRenderer.on('update:available', (_, info) => fn(info)),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
});
