'use strict';
// Prints a JSON summary of the registry for the OS given in WOOF_FAKE_OS (used by registry.test.js).
const { build, validateTweak } = require('../../src/tweaks');
const games = require('../../src/games');
const winops = require('../../src/core/winops');
const posix = require('../../src/core/posix');
const os = process.env.WOOF_FAKE_OS;
const fakeHw = { netAdapters: [{ guid: '{11111111-2222-3333-4444-555555555555}', name: 'Ethernet' }], ramGB: 16, sataSsds: ['sda'], systemDrive: 'C:', startup: [{ hive: 'HKCU', approved: 'Run', name: 'Spotify', command: 'spotify.exe' }] };
const reg = build(fakeHw);
const ctx = { hw: fakeHw, settings: { customDns: ['9.9.9.9'] } };
const tk = os === 'win32' ? winops.targetKey : posix.targetKey;
const tweaks = [...reg.tweaks.values()].map((t) => {
  const ops = typeof t.changes === 'function' ? t.changes(ctx) : t.changes;
  return { id: t.id, tier: t.tier, os: t.os, exclusive: t.exclusive || null, risk: t.risk, category: t.category, problems: validateTweak(t, ctx), targets: ops.map(tk), admin: ops.some((op) => (os === 'win32' ? winops.needsAdmin(op) : posix.needsAdmin(op))), hasHelpers: typeof t.detect === 'function' && typeof t.apply === 'function' && typeof t.revert === 'function', security: !!t.security };
});
const profiles = games.load().map((p) => ({ id: p.id, tier: p.tier, platforms: p.platforms, problems: games.validate(p, new Set([...reg.tweaks.keys()])), osTweaks: p.tweaks[os] || [] }));
process.stdout.write(JSON.stringify({ os: reg.osId, tweaks, actions: [...reg.actions.values()].map((a) => ({ id: a.id, tier: a.tier, kind: a.kind, hasImpl: !!(a.kind === 'restorePoint' || (os === 'win32' ? a.win : a.sh)) })), guides: reg.guides.map((g) => g.id), profiles }));
