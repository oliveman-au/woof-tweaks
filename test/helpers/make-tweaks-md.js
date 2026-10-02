'use strict';
// Generates TWEAKS.md from the real registry for every OS (run: node test/helpers/make-tweaks-md.js).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OSES = [['win32', 'Windows'], ['darwin', 'macOS'], ['linux', 'Linux'], ['chromeos', 'ChromeOS (Linux container)']];
const NAMES = { free: 'Good', plus: 'Plus', pro: 'Pro', ultra: 'Ultra' };
const dumpCode = `
const { build } = require('./src/tweaks');
const games = require('./src/games');
const reg = build({ netAdapters: [{ guid: '{GUID}', name: 'Ethernet' }], ramGB: 16, sataSsds: ['sda'], systemDrive: 'C:' });
const ctx = { hw: { netAdapters: [{ guid: '{GUID}' }], ramGB: 16, sataSsds: ['sda'] }, settings: { customDns: ['x'] } };
const be = reg.osId === 'win32' ? require('./src/core/winops') : require('./src/core/posix');
const desc = reg.osId === 'win32' ? (o) => be.describe(o, null).target : (o) => require('./src/core/engine').backendFor ? o.t + ' ' + (o.key || o.domain || o.glob || o.path || o.unit || o.schema || o.attr || o.name || '') : '';
process.stdout.write(JSON.stringify({
  tweaks: [...reg.tweaks.values()].filter((t) => !/^(game\\.|startup\\.)/.test(t.id)).map((t) => { const ops = typeof t.changes === 'function' ? t.changes(ctx) : t.changes; return { id: t.id, name: t.name, category: t.category, tier: t.tier, risk: t.risk, reboot: t.reboot, admin: ops.some((o) => be.needsAdmin(o)), what: t.long.what, changes: ops.map(desc) }; }),
  actions: [...reg.actions.values()].map((a) => ({ id: a.id, name: a.name, tier: a.tier, admin: !!a.admin, what: a.long.what })),
  guides: reg.guides.map((g) => g.name),
  games: games.load().filter((p) => p.platforms.includes(reg.osId)).map((p) => ({ name: p.name, tier: p.tier, n: (p.tweaks[reg.osId] || []).length })),
}));`;
const data = Object.fromEntries(OSES.map(([id]) => [id, JSON.parse(execFileSync(process.execPath, ['-e', dumpCode], { cwd: path.join(__dirname, '../..'), env: { ...process.env, WOOF_FAKE_OS: id }, encoding: 'utf8' }))]));
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = '# Woof Tweaks — every tweak\n\nGenerated from the app\'s tweak registry (`node test/helpers/make-tweaks-md.js`). Plan tiers come from `src/config/tiers.js`.\nEvery tweak snapshots the exact original value before changing it, and Revert restores that value.\n\n';
md += '## Totals\n\n| OS | Good | Plus | Pro | Ultra | Total |\n|---|---|---|---|---|---|\n';
for (const [id, name] of OSES) { const t = data[id].tweaks; const c = (x) => t.filter((y) => y.tier === x).length; md += `| ${name} | ${c('free')} | ${c('plus')} | ${c('pro')} | ${c('ultra')} | **${t.length}** |\n`; }
md += `\nPlus per-game tweaks on Windows (fullscreen flag, GPU preference, High priority, QoS tag, Defender exclusion — generated for each detected game) and Windows startup-app toggles.\n`;
for (const [id, name] of OSES) {
  const d = data[id];
  md += `\n## ${name}\n\n| Tweak | Plan | Risk | Admin | Restart | What it changes |\n|---|---|---|---|---|---|\n`;
  for (const t of d.tweaks) md += `| **${esc(t.name)}** <br><sub>\`${t.id}\` · ${t.category}</sub> | ${NAMES[t.tier]} | ${t.risk} | ${t.admin ? 'yes' : '—'} | ${t.reboot === 'restart' ? 'restart' : t.reboot === 'signout' ? 'sign out' : '—'} | ${esc(t.what)} |\n`;
  md += `\n**One-off actions:** ${d.actions.map((a) => `${a.name} (${NAMES[a.tier]}${a.admin ? ', admin' : ''})`).join(' · ') || '—'}\n\n**Guides:** ${d.guides.join(' · ') || '—'}\n\n**Game profiles (${d.games.length}):** ${d.games.map((g) => `${g.name} (${NAMES[g.tier]})`).join(' · ')}\n`;
}
fs.writeFileSync(path.join(__dirname, '../../TWEAKS.md'), md);
console.log('TWEAKS.md written:', OSES.map(([id, n]) => `${n} ${data[id].tweaks.length}`).join(', '));
