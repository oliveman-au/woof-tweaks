'use strict';
// Presets: named bundles of tweaks. Built-ins are rules over tweak metadata, so they stay correct as
// tweaks are added. They only ever include tweaks for this OS; the engine still enforces the plan.
// Power plan: every preset uses the adaptive Woof Gaming plan (1.1.2). It keeps Windows' Balanced plan on laptops and on
// CPUs that pick their own best cores (AMD Ryzen 9 X3D, Intel hybrid), where High performance could cause FPS drops.
const BUILT_IN = [
  { id: 'safe', name: 'Safe', icon: 'shield', desc: 'Only zero-risk tweaks: no power-plan changes, no services, nothing that needs a restart.',
    pick: (t) => t.risk === 'safe' && !t.reboot && ['fps', 'cpu', 'privacy', 'stability', 'input', 'gpu'].includes(t.category) && !t.exclusive && !/nic|adapter/.test(t.id) },
  { id: 'balanced', name: 'Balanced', icon: 'scale', desc: 'Safe + moderate tweaks that help most PCs. A great default.',
    pick: (t, hw) => t.risk !== 'advanced' && !t.security && t.category !== 'network' && (!t.exclusive || t.id === 'win-plan-woof') && !(hw.isLaptop && /power|cpu-min|core-parking|pcie|usb-suspend/.test(t.id)) },
  { id: 'maxfps', name: 'Max FPS', icon: 'gauge', desc: 'Everything for frame rate and smoothness. Uses more power.',
    pick: (t, hw) => t.risk !== 'advanced' && !t.security && ['fps', 'cpu', 'gpu', 'stability', 'privacy'].includes(t.category) && (!t.exclusive || t.id === 'win-plan-woof') },
  { id: 'competitive', name: 'Competitive esports', icon: 'target', desc: 'Max FPS plus input-lag and network/ping tuning.',
    pick: (t, hw) => t.risk !== 'advanced' && !t.security && ['fps', 'cpu', 'gpu', 'stability', 'privacy', 'input', 'network'].includes(t.category) && (!t.exclusive || t.id === 'win-plan-woof' || /dns-cloudflare$/.test(t.id)) },
  { id: 'streaming', name: 'Low-latency streaming', icon: 'radio', desc: 'Low latency without breaking capture: keeps Game Bar/recording and doesn\'t starve your encoder.',
    pick: (t) => t.risk !== 'advanced' && !t.security && ['fps', 'gpu', 'stability', 'privacy', 'network', 'input'].includes(t.category) && !/game-dvr|game-bar|priority-separation|interrupt-mod|cpu-idle|awdl/.test(t.id) && (!t.exclusive || t.id === 'win-plan-woof' || /dns-cloudflare$/.test(t.id)) },
  { id: 'battery', name: 'Battery-saver gaming laptop', icon: 'battery', desc: 'Smoother gaming on battery without draining it: no performance power plans.',
    pick: (t) => t.risk === 'safe' && !t.exclusive && ['cpu', 'privacy', 'stability', 'picture', 'input'].includes(t.category) && !/power|cpu-min|core-parking|usb-suspend|pcie|disk-sleep|high-power|low-power|governor|turbo|epp|amd-high|powermizer/.test(t.id) || /game-mode|game-dvr-off|transparency|visual-fx|reduce-/.test(t.id) },
];

function list(tweaks, hw = {}, custom = []) {
  const all = [...tweaks.values()].filter((t) => !t.game && t.category !== 'startup');
  const builtIn = BUILT_IN.map((p) => {
    const ids = all.filter((t) => { try { return !t.guard || !t.guard(hw) ? p.pick(t, hw) : false; } catch { return false; } }).map((t) => t.id);
    return { id: p.id, name: p.name, icon: p.icon, desc: p.desc, builtIn: true, ids };
  });
  const mine = (custom || []).map((c) => ({ ...c, builtIn: false, ids: (c.ids || []).filter((id) => tweaks.has(id)) }));
  return [...builtIn, ...mine];
}

/** Validate an imported/shared preset file. Returns { ok, preset | error }. */
function parseImport(text, tweaks) {
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, error: 'That file isn\'t valid JSON.' }; }
  if (!j || j.type !== 'woof-tweaks-preset' || !Array.isArray(j.tweaks)) return { ok: false, error: 'That isn\'t a Woof Tweaks preset file.' };
  const name = String(j.name || 'Imported preset').slice(0, 40);
  const ids = j.tweaks.filter((id) => typeof id === 'string' && tweaks.has(id));
  const unknown = j.tweaks.length - ids.length;
  return { ok: true, preset: { id: `custom-${Date.now().toString(36)}`, name, ids }, unknown };
}

const exportJson = (p) => JSON.stringify({ type: 'woof-tweaks-preset', version: 1, name: p.name, tweaks: p.ids }, null, 2);

module.exports = { list, parseImport, exportJson, BUILT_IN };
