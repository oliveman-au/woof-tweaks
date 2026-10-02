'use strict';
const { shell, app } = require('electron');
const engine = require('./engine');
const license = require('./license');
const { TWEAKS } = require('./tweaks');
const { PROFILES } = require('./tweaks/profiles');

function registerIPC(ipcMain, store) {
  const SITE = 'https://woof-services.stream';

  // ---- Auth ----
  ipcMain.handle('auth:login', async (_, method) => {
    const deviceId = engine.deviceId();
    const url = `${SITE}/api/app/auth?method=${method}&device=${deviceId}&v=${app.getVersion()}`;
    shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('auth:logout', () => {
    store.delete('session');
    store.delete('plan');
    return { ok: true };
  });

  ipcMain.handle('auth:session', () => {
    const session = store.get('session');
    if (!session) return null;
    return { email: session.email, name: session.name, plan: store.get('plan', 'free') };
  });

  // ---- Tweaks ----
  ipcMain.handle('tweaks:list', () => {
    const platform = process.platform;
    return TWEAKS.filter((t) => t.platform === platform || t.platform === 'all')
      .map((t) => ({ id: t.id, name: t.name, desc: t.desc, category: t.category, plan: t.plan, elevated: !!t.elevated }));
  });

  ipcMain.handle('tweaks:profiles', () =>
    PROFILES.filter((p) => p.platforms.includes(process.platform))
      .map((p) => ({ id: p.id, name: p.name, icon: p.icon, tweakIds: p.tweaks[process.platform] || [] })));

  ipcMain.handle('tweaks:scan', async () => engine.scan());

  ipcMain.handle('tweaks:apply', async (_, ids) => {
    const plan = store.get('plan', 'free');
    return engine.apply(ids, plan);
  });

  ipcMain.handle('tweaks:revert', async (_, ids) => engine.revert(ids));
  ipcMain.handle('tweaks:revert-all', async () => engine.revertAll());

  ipcMain.handle('tweaks:apply-profile', async (_, gameId) => {
    const plan = store.get('plan', 'free');
    const profile = PROFILES.find((p) => p.id === gameId);
    if (!profile) return { ok: false, error: 'Unknown game' };
    const ids = profile.tweaks[process.platform] || [];
    return engine.apply(ids, plan);
  });

  ipcMain.handle('tweaks:full-optimize', async () => {
    const plan = store.get('plan', 'free');
    const platform = process.platform;
    const ids = TWEAKS.filter((t) => (t.platform === platform || t.platform === 'all')).map((t) => t.id);
    return engine.apply(ids, plan);
  });

  // ---- License ----
  ipcMain.handle('license:plan', async () => {
    const session = store.get('session');
    if (!session?.token) return 'free';
    const plan = await license.check(SITE, session.token, engine.deviceId(), app.getVersion());
    store.set('plan', plan);
    return plan;
  });

  // ---- Settings ----
  ipcMain.handle('settings:get', (_, key) => store.get(key));
  ipcMain.handle('settings:set', (_, key, val) => { store.set(key, val); });

  // ---- Shell ----
  ipcMain.handle('shell:open', (_, url) => shell.openExternal(url));
}

module.exports = { registerIPC };
