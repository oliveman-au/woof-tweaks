'use strict';
// The only bridge between the window and the system. The window can ask; the main process decides.
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('app:info');
const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (fn) => { const l = (_, d) => fn(d); ipcRenderer.on(ch, l); return () => ipcRenderer.removeListener(ch, l); };

contextBridge.exposeInMainWorld('woof', {
  info,
  state: call('app:state'),
  openLogs: call('app:openLogs'), openBackups: call('app:openBackups'), openExternal: call('app:openExternal'),
  resetApp: call('app:reset'), relaunch: call('app:relaunch'), capture: call('app:capture'),
  // account
  login: call('auth:start'), cancelLogin: call('auth:cancel'), logout: call('auth:logout'), refreshPlan: call('auth:refresh'),
  // system
  hardware: call('hw:get'),
  // tweaks
  tweaks: call('tweaks:list'), scan: call('tweaks:scan'), preview: call('tweaks:preview'),
  apply: call('tweaks:apply'), revert: call('tweaks:revert'), revertAll: call('tweaks:revertAll'), fullOptimise: call('tweaks:fullOptimise'),
  actions: call('actions:list'), runAction: call('actions:run'), listBloat: call('actions:listBloat'),
  guides: call('guides:list'), openGuide: call('guides:open'),
  // games & presets
  games: call('games:list'), redetectGames: call('games:redetect'), optimiseGame: call('games:optimise'), clearGameShaders: call('games:clearShaderCache'),
  writeMinecraftOptions: call('games:writeMinecraftOptions'), restoreMinecraftOptions: call('games:restoreMinecraftOptions'),
  saveCustomGame: call('games:saveCustom'), deleteCustomGame: call('games:deleteCustom'),
  presets: call('presets:list'), applyPreset: call('presets:apply'), savePreset: call('presets:save'), deletePreset: call('presets:delete'),
  exportPreset: call('presets:export'), importPreset: call('presets:import'),
  // history & backups
  history: call('history:get'), backups: call('backups:get'), exportBackup: call('backups:export'), createRestorePoint: call('restorePoint:create'),
  // settings
  settings: call('settings:get'), setSetting: call('settings:set'),
  // benchmark / monitor / diagnosis
  benchmark: call('bench:run'), benchHistory: call('bench:history'), dnsTest: call('bench:dns'), regionPing: call('bench:regions'),
  monitorStart: call('monitor:start'), monitorStop: call('monitor:stop'), diagnose: call('diagnose:run'),
  // updates
  checkUpdate: call('update:check'), downloadUpdate: call('update:download'), installUpdate: call('update:install'),
  // website extras
  sendFeedback: call('feedback:send'), syncPush: call('sync:push'), syncPull: call('sync:pull'),
  // events
  onProgress: on('engine:progress'), onBusy: on('engine:busy'), onAuth: on('auth:state'), onRegistry: on('registry:changed'),
  onMonitor: on('monitor:tick'), onBench: on('bench:progress'), onUpdate: on('update:state'), onFinishing: on('app:finishing'),
  onToast: on('toast'), onWatcher: on('watcher:event'),
});
