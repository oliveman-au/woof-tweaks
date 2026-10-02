// UI preview only: when the page is opened in a normal browser (no Electron preload), fake the app API
// with generated data so every screen can be clicked through. Never used inside the real app.
(function () {
  if (window.woof) return;
  const s = document.createElement('script');
  s.src = 'dev/mock-data.js';
  document.currentScript.after(s);
  const ready = new Promise((r) => { s.onload = r; });
  const listeners = {};
  const emit = (ch, d) => (listeners[ch] || []).forEach((fn) => fn(d));
  const on = (ch) => (fn) => { (listeners[ch] = listeners[ch] || []).push(fn); return () => { listeners[ch] = listeners[ch].filter((x) => x !== fn); }; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = { plan: new URLSearchParams(location.search).get('plan') || 'free', signedIn: false, applied: {}, settings: { onboarded: new URLSearchParams(location.search).has('onboard') ? false : true, lastSeenVersion: '1.1.0' }, history: [], bench: [] };
  const RANK = ['free', 'plus', 'pro', 'ultra', 'lifetime'];
  const can = (tier) => RANK.indexOf(st.plan === 'lifetime' ? 'ultra' : st.plan) >= RANK.indexOf(tier);
  const D = () => window.__WOOF_MOCK;
  const statusOf = (t) => (st.applied[t.id] ? 'optimised' : (t.blocked ? 'default' : (t.id.length % 7 === 0 ? 'optimised' : t.id.length % 11 === 0 ? 'na' : 'default')));
  const view = (t) => ({ ...t, locked: !can(t.tier), status: statusOf(t), applied: !!st.applied[t.id] });
  const res = (ids, op) => {
    const results = ids.map((id) => {
      const t = D().tweaks.find((x) => x.id === id);
      if (!t) return { id, ok: false, error: 'Unknown' };
      if (op === 'apply' && !can(t.tier)) return { id, name: t.name, ok: false, skipped: true, code: 'plan', reason: 'Needs a higher plan' };
      if (op === 'apply') st.applied[id] = new Date().toISOString(); else delete st.applied[id];
      return { id, name: t.name, ok: true, reboot: t.reboot };
    });
    const ok = results.filter((r) => r.ok && !r.skipped);
    st.history.unshift({ at: new Date().toISOString(), action: op, ids: ok.map((r) => r.id), names: ok.map((r) => r.name), failed: [], ok: true });
    return { ok: true, applied: ok.length, failed: 0, results, reboot: ok.some((r) => r.reboot === 'restart') ? 'restart' : false };
  };
  const progress = async (op) => { for (const [msg, pct] of [['Applying your settings…', 25], ['Applying system changes (admin)…', 60], ['Done', 100]]) { emit('engine:progress', { op, msg, pct }); await wait(250); } };
  let monTimer = null;
  window.woof = {
    info: { version: '1.1.0', os: 'win32', osName: 'Windows', platform: 'win32', arch: 'x64', packaged: false },
    state: async () => { await ready; return { session: { signedIn: st.signedIn, name: st.signedIn ? 'Oliver' : null, plan: st.plan }, settings: st.settings, plans: D().plans, features: Object.fromEntries(Object.entries(D().features).map(([k, v]) => [k, { tier: v, allowed: can(v) }])), categories: D().categories, update: { status: 'latest' }, site: 'https://woof-services.stream' }; },
    hardware: async () => { await ready; return D().hw; },
    tweaks: async () => { await ready; return D().tweaks.map(view); },
    scan: async () => { await ready; await wait(300); return Object.fromEntries(D().tweaks.map((t) => [t.id, { status: statusOf(t), applied: !!st.applied[t.id], appliedAt: st.applied[t.id] || null, drift: t.id === 'win-max-refresh' && st.applied[t.id] ? 'changed' : null }])); },
    preview: async (ids) => { await ready; await wait(400); return ids.map((id) => { const t = D().tweaks.find((x) => x.id === id); return can(t.tier) ? { id, name: t.name, risk: t.risk, admin: t.admin, reboot: t.reboot, changes: t.previewOps.map((c) => ({ ...c, from: c.from === '?' ? '(not set)' : c.from })) } : { id, name: t.name, blocked: { reason: 'Needs a higher plan' } }; }); },
    apply: async (ids) => { await progress('apply'); return res(ids, 'apply'); },
    revert: async (ids) => { await progress('revert'); return res(ids, 'revert'); },
    revertAll: async () => { await progress('revert'); return res(Object.keys(st.applied), 'revert'); },
    fullOptimise: async () => ({ ok: true, applied: 0, failed: 0, results: [] }),
    actions: async () => { await ready; return D().actions.map((a) => ({ ...a, locked: !can(a.tier) })); },
    runAction: async (id) => { await wait(900); return { ok: true, data: { freed: 734003200 } }; },
    listBloat: async () => [{ id: 'Microsoft.BingNews', label: 'News' }, { id: 'Clipchamp.Clipchamp', label: 'Clipchamp' }, { id: 'Microsoft.GetHelp', label: 'Get Help' }],
    guides: async () => { await ready; return D().guides; },
    openGuide: async () => ({ ok: true }),
    games: async () => { await ready; return D().games.map((g) => ({ ...g, locked: !can(g.tier) })); },
    redetectGames: async () => { await ready; return D().games.map((g) => ({ ...g, locked: !can(g.tier) })); },
    optimiseGame: async () => ({ ok: true }), clearGameShaders: async () => ({ ok: true, freed: 52428800 }),
    writeMinecraftOptions: async () => ({ ok: true }), restoreMinecraftOptions: async () => ({ ok: true }),
    saveCustomGame: async () => ({ ok: true, id: 'custom-x' }), deleteCustomGame: async () => ({ ok: true }),
    presets: async () => { await ready; return D().presets; }, applyPreset: async () => ({ ok: true }), savePreset: async () => ({ ok: true }), deletePreset: async () => ({ ok: true }),
    exportPreset: async () => ({ ok: true, path: 'C:\\Users\\me\\preset.json' }), importPreset: async () => ({ ok: false, canceled: true }),
    history: async () => st.history, backups: async () => Object.entries(st.applied).map(([id, at]) => ({ id, name: D().tweaks.find((t) => t.id === id).name, at, changes: 2, admin: false })),
    exportBackup: async () => ({ ok: true, path: 'C:\\backup.json' }), createRestorePoint: async () => { await wait(800); return { ok: true, created: true }; },
    settings: async () => st.settings, setSetting: async (k, v) => { st.settings[k] = v; return { ok: true }; },
    benchmark: async () => { for (const [stage, pct] of [['CPU', 20], ['Memory', 50], ['Disk', 70], ['Network', 90], ['Done', 100]]) { emit('bench:progress', { stage, pct }); await wait(400); } const r = { at: new Date().toISOString(), cpu: { singleMBs: 1820, multiMBs: 13650 }, memory: { copyGBs: 21.4 }, disk: { writeMBs: 2890, random4kIops: 61000 }, network: { ping: 12.4, jitter: 1.1, loss: 0 } }; const prev = st.bench[0] || null; st.bench.unshift(r); return { ok: true, result: r, previous: prev }; },
    benchHistory: async () => st.bench,
    dnsTest: async () => { await wait(900); return { ok: true, results: [{ id: 'cloudflare', name: 'Cloudflare', ms: 9 }, { id: 'google', name: 'Google', ms: 14 }, { id: 'quad9', name: 'Quad9', ms: 19 }, { id: 'system', name: 'Your current DNS', ms: 41 }, { id: 'adguard', name: 'AdGuard', ms: 52 }] }; },
    regionPing: async () => { await wait(700); return can('pro') ? { ok: true, results: [{ name: 'Oceania (Sydney)', ms: 14 }, { name: 'Asia (Singapore)', ms: 92 }, { name: 'Asia (Tokyo)', ms: 118 }, { name: 'US West (California)', ms: 152 }] } : { ok: false, code: 'plan', requiredPlan: 'pro', error: 'Needs the Pro plan' }; },
    monitorStart: async () => { clearInterval(monTimer); monTimer = setInterval(() => emit('monitor:tick', { cpu: Math.round(8 + Math.random() * 20), ram: 41 + Math.round(Math.random() * 3), gpu: Math.round(Math.random() * 10), gpuTemp: 44 + Math.round(Math.random() * 3), cpuTemp: null, ping: 11 + Math.round(Math.random() * 4) }), 1500); return { ok: true }; },
    monitorStop: async () => { clearInterval(monTimer); return { ok: true }; },
    diagnose: async () => { await wait(1500); return { ok: true, cpu: 14, ram: 43, network: { avg: 12.3, jitter: 1.2, loss: 0 }, top: [], findings: [{ severity: 'high', area: 'Display', title: 'Your monitor runs at 60 Hz but supports 165 Hz', detail: 'You\'re missing out on smoothness you already paid for.', fixes: ['win-max-refresh', 'guide-monitor'] }, { severity: 'medium', area: 'Drivers', title: 'Your GPU driver is 7 months old', detail: 'New games are often optimised in new drivers.', fixes: ['guide-drivers'] }, { severity: 'medium', area: 'Power', title: 'Power settings favour saving energy', detail: 'Your CPU drops its speed between bursts.', fixes: ['win-plan-high', 'win-game-mode'] }] }; },
    checkUpdate: async () => ({}), downloadUpdate: async () => ({}), installUpdate: async () => ({}),
    login: async () => { setTimeout(() => { st.signedIn = true; st.plan = 'pro'; emit('auth:state', { status: 'approved', name: 'Oliver', plan: 'pro', signedIn: true }); }, 2500); return { ok: true, code: 'K7QX-2MPD', url: 'https://woof-services.stream/app/link?code=K7QX-2MPD' }; },
    cancelLogin: async () => ({}), logout: async () => { st.signedIn = false; st.plan = 'free'; return { ok: true }; }, refreshPlan: async () => ({ ok: true, session: {} }),
    openExternal: async (u) => { console.log('[mock] open', u); return { ok: true }; }, openLogs: async () => ({}), openBackups: async () => ({}), resetApp: async () => ({}), relaunch: async () => ({}),
    capture: async () => ({ ok: true, copied: true, saved: false }),
    sendFeedback: async () => ({ ok: true, priority: can('pro') }), syncPush: async () => ({ ok: true }), syncPull: async () => ({ ok: true }),
    onProgress: on('engine:progress'), onBusy: on('engine:busy'), onAuth: on('auth:state'), onRegistry: on('registry:changed'), onMonitor: on('monitor:tick'), onBench: on('bench:progress'), onUpdate: on('update:state'), onFinishing: on('app:finishing'), onToast: on('toast'), onWatcher: on('watcher:event'),
  };
})();
