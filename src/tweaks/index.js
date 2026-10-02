'use strict';
// The tweak registry: every tweak, action and guide for this OS, with its plan tier attached from
// src/config/tiers.js, validated on load. Per-game and startup-item tweaks are added once we know
// what's installed. Each tweak also gets detect()/apply()/revert() helpers that go through the engine.
const crypto = require('crypto');
const tiers = require('../config/tiers');
const games = require('../games');
const { osId, OS_NAMES } = require('../core/platform');
const { PLAN_ORDER } = require('../core/plans');

const CATEGORIES = [
  { id: 'fps', name: 'FPS & power', icon: 'gauge' },
  { id: 'cpu', name: 'CPU & RAM', icon: 'cpu' },
  { id: 'gpu', name: 'GPU', icon: 'gpu' },
  { id: 'network', name: 'Internet & ping', icon: 'wifi' },
  { id: 'input', name: 'Input lag & peripherals', icon: 'mouse' },
  { id: 'stability', name: 'Stutter & crash fixes', icon: 'shield' },
  { id: 'picture', name: 'Picture quality', icon: 'image' },
  { id: 'privacy', name: 'Background & telemetry', icon: 'eye-off' },
  { id: 'game', name: 'Per-game', icon: 'gamepad' },
  { id: 'startup', name: 'Startup apps', icon: 'power' },
  { id: 'cleanup', name: 'Cleanup', icon: 'trash' },
  { id: 'repair', name: 'Repair', icon: 'wrench' },
];
const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));
const RISKS = ['safe', 'moderate', 'advanced'];
const OSES = ['win32', 'darwin', 'linux', 'chromeos'];
const OP_TYPES = new Set(['reg', 'regFlags', 'service', 'powerScheme', 'powerSetting', 'bcd', 'netsh', 'adapterProp', 'dns', 'task', 'mmagent', 'hibernate', 'defenderExclusion', 'display',
  'defaults', 'sysctl', 'sysfs', 'gsettings', 'systemd', 'file', 'pmset', 'mdutil', 'macDns', 'nvidia', 'adb', 'pkg', 'iface', 'ppd', 'tuned']);

/** Returns a list of problems with a tweak definition (empty = valid). Used at load and by tests. */
function validateTweak(t, sampleCtx = { hw: {}, settings: {} }) {
  const e = [];
  if (!/^[a-z0-9][a-z0-9.-]{2,80}$/.test(t.id || '')) e.push('bad id');
  if (!t.name || t.name.length > 80) e.push('name missing/too long');
  if (!t.desc) e.push('desc missing');
  if (!t.long || !t.long.what || !t.long.why || !t.long.risk) e.push('long.what/why/risk missing');
  if (!CAT_IDS.has(t.category)) e.push(`unknown category ${t.category}`);
  if (!Array.isArray(t.os) || !t.os.length || t.os.some((o) => !OSES.includes(o))) e.push('bad os list');
  if (!RISKS.includes(t.risk)) e.push('bad risk');
  if (![false, 'signout', 'restart'].includes(t.reboot)) e.push('bad reboot');
  if (!PLAN_ORDER.includes(t.tier) || t.tier === 'lifetime') e.push(`bad tier ${t.tier}`);
  let ops;
  try { ops = typeof t.changes === 'function' ? t.changes(sampleCtx) : t.changes; } catch (err) { e.push(`changes() threw: ${err.message}`); ops = []; }
  if (!Array.isArray(ops)) e.push('changes must be a list');
  else for (const op of ops) if (!OP_TYPES.has(op.t)) e.push(`unknown op ${op.t}`);
  if (typeof t.changes !== 'function' && Array.isArray(ops) && !ops.length) e.push('no changes');
  return e;
}

const registry = { osId: osId(), osName: OS_NAMES[osId()], tweaks: new Map(), actions: new Map(), guides: [], categories: CATEGORIES };

function sources(id) {
  return {
    win32: () => require('./windows'),
    darwin: () => require('./macos'),
    linux: () => require('./linux'),
    chromeos: () => require('./chromeos'),
  }[id];
}

function withHelpers(t) {
  const engine = () => require('../core/engine');
  return Object.assign(t, {
    requiresAdmin: undefined, // filled by describe()
    detect: async () => (await engine().scan())[t.id],
    apply: () => engine().apply([t.id]),
    revert: () => engine().revert([t.id]),
  });
}

/** Build (or rebuild) the registry for this OS. hw is optional; per-game/startup tweaks need it. */
function build(hw = {}) {
  const id = registry.osId;
  const list = [];
  const src = sources(id);
  if (src) for (const t of src()) list.push({ ...t, tier: tiers.tweakTier(t.id) });
  if (id === 'win32') {
    list.push({ ...games.QOS_PREREQ });
    for (const g of games.gameTweaks(id)) list.push(g);
    for (const s of startupTweaks(hw)) list.push(s);
  }
  const map = new Map();
  for (const t of list) {
    const problems = validateTweak(t, { hw, settings: {} });
    if (problems.length) { console.error(`[tweaks] ${t.id}: ${problems.join(', ')}`); continue; }
    map.set(t.id, withHelpers(t));
  }
  registry.tweaks = map;
  registry.actions = new Map(require('./actions').filter((a) => a.os.includes(id)).map((a) => [a.id, { ...a, tier: tiers.actionTier(a.id) || 'ultra' }]));
  registry.guides = require('./guides').filter((g) => g.os.includes(id));
  return registry;
}

// Windows startup items → reversible toggles, using the same "StartupApproved" switch Task Manager uses.
const DISABLED_BLOB = Buffer.from([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64');
function startupTweaks(hw) {
  return (hw.startup || []).filter((s) => s.name && !/woof tweaks/i.test(s.name)).map((s) => {
    const h = crypto.createHash('sha1').update(`${s.hive}|${s.approved}|${s.name}`).digest('hex').slice(0, 10);
    const key = `${s.hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\${s.approved}`;
    return {
      id: `startup.${h}`, name: `Don't start “${s.name.replace(/\.lnk$/i, '')}” with Windows`, category: 'startup', os: ['win32'], risk: 'safe', reboot: false, tier: 'free',
      desc: s.command ? s.command.slice(0, 140) : 'Startup item', startupItem: { name: s.name, command: s.command, hive: s.hive },
      long: { what: 'Turns this item off in Task Manager → Startup apps (it stays installed).', why: 'Fewer programs starting with Windows means more free RAM and a faster boot.', risk: 'The program won\'t start automatically — open it yourself when needed. Revert turns it back on.' },
      changes: [{ t: 'reg', key, name: s.name, type: 'binary', value: DISABLED_BLOB, startupApproved: true }],
      tags: ['startup', 'boot', 'ram'],
    };
  });
}

module.exports = { registry, build, validateTweak, CATEGORIES, OP_TYPES };
