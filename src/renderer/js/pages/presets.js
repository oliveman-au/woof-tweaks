import { icon } from '../icons.js';
import { esc, plural } from '../util.js';
import { empty, PLAN_NAME } from '../components.js';
import { S, applyFlow, toast, modal, upgradeModal, feature, previewModal } from '../app.js';

const api = window.woof;
let list = null;

async function load() { const r = await api.presets(); list = Array.isArray(r) ? r : []; const m = document.getElementById('main'); if (m && S.page === 'presets') { m.innerHTML = render(); mount(m); } }

function counts(p) {
  const tw = p.ids.map((id) => S.tweakMap.get(id)).filter(Boolean);
  return { total: tw.length, locked: tw.filter((t) => t.locked).length, applied: tw.filter((t) => t.applied).length };
}

export function render() {
  if (!list) { load(); return '<div class="page"><div class="page-head"><div><h1>Presets</h1></div></div><div class="grid g3">' + '<div class="skel" style="height:190px"></div>'.repeat(6) + '</div></div>'; }
  const built = list.filter((p) => p.builtIn);
  const mine = list.filter((p) => !p.builtIn);
  const cp = feature('customPresets');
  const tile = (p) => {
    const c = counts(p);
    return `<div class="card preset" data-p="${esc(p.id)}">
      <div class="row"><span class="icon-wrap">${icon(p.icon || 'layers', 'lg')}</span><span class="spacer"></span>${p.builtIn ? '' : '<span class="badge neutral">Yours</span>'}</div>
      <div><h2>${esc(p.name)}</h2><p class="muted small" style="margin-top:4px">${esc(p.desc || 'Your saved set of tweaks.')}</p></div>
      <div class="row wrap small dim" style="gap:10px"><span>${plural(c.total, 'tweak')}</span>${c.applied ? `<span style="color:var(--green)">${c.applied} applied</span>` : ''}${c.locked ? `<span>${icon('lock', 'sm')} ${c.locked} need a higher plan</span>` : ''}</div>
      <div class="row wrap" style="gap:8px;margin-top:auto">
        <button class="btn primary sm" data-apply>${icon('bolt', 'sm')}Apply</button>
        <button class="btn sm" data-prev>${icon('eye', 'sm')}Preview</button>
        <button class="btn ghost sm" data-export data-tip="Export as a file to share">${icon('upload', 'sm')}</button>
        ${p.builtIn ? '' : `<button class="btn ghost sm" data-del data-tip="Delete">${icon('trash', 'sm')}</button>`}
      </div></div>`;
  };
  return `<div class="page">
    <div class="page-head"><div><h1>Presets</h1><p>Ready-made bundles of tweaks for different goals. Presets only include tweaks for this OS, and anything your plan doesn't include is skipped and shown.</p></div>
      <div class="actions"><button class="btn" id="import">${icon('download', 'sm')}Import</button><button class="btn primary" id="new">${icon('plus', 'sm')}Save my current tweaks</button></div></div>
    <div class="grid g3">${built.map(tile).join('')}</div>
    <div class="row" style="margin:26px 2px 12px"><h2 class="h2">Your presets</h2>${cp.allowed ? '' : `<span class="badge lock" style="margin-left:8px">${icon('lock')}${PLAN_NAME[cp.tier]}</span>`}</div>
    ${mine.length ? `<div class="grid g3">${mine.map(tile).join('')}</div>` : empty('layers', 'No saved presets yet', 'Turn on the tweaks you like, then "Save my current tweaks" — or import a preset a friend shared.')}
  </div>`;
}

export function mount(root) {
  if (!list) return;
  root.querySelectorAll('[data-p]').forEach((el) => {
    const p = list.find((x) => x.id === el.dataset.p);
    el.querySelector('[data-apply]').onclick = async () => { const r = await applyFlow(p.ids, { title: `${p.name} preset`, force: true }); if (r) load(); };
    el.querySelector('[data-prev]').onclick = () => previewModal(p.ids.filter((id) => S.tweakMap.get(id) && !S.tweakMap.get(id).locked));
    el.querySelector('[data-export]').onclick = async () => { const r = await api.exportPreset(p.id); if (r && r.ok) toast('success', 'Preset exported', r.path); };
    const d = el.querySelector('[data-del]');
    if (d) d.onclick = async () => { await api.deletePreset(p.id); toast('success', 'Preset deleted'); load(); };
  });
  root.querySelector('#import').onclick = async () => { const r = await api.importPreset(); if (r && r.ok) { toast('success', `Imported “${r.preset.name}”`, r.unknown ? `${r.unknown} tweaks aren't for this OS and were skipped.` : ''); load(); } else if (r && r.code === 'plan') upgradeModal(r.requiredPlan, r.error); else if (r && !r.canceled) toast('error', 'Import failed', r && r.error); };
  root.querySelector('#new').onclick = async () => {
    const fp = feature('customPresets');
    if (!fp.allowed) return upgradeModal(fp.tier, 'Saving your own presets is part of the Plus plan.');
    const ids = S.tweaks.filter((t) => t.applied).map((t) => t.id);
    if (!ids.length) return toast('info', 'Nothing applied yet', 'Turn on some tweaks first, then save them as a preset.');
    const v = await modal({ title: 'Save preset', icon: 'layers', body: `<p class="muted small" style="margin-bottom:10px">Saves the ${plural(ids.length, 'tweak')} you have applied right now.</p><input class="input" id="pname" maxlength="40" placeholder="e.g. Ranked night" style="width:100%">`, actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Save', kind: 'primary', value: 'save', run: (ov) => { const n = ov.querySelector('#pname').value.trim(); if (!n) return false; ov.dataset.n = n; window.__pn = n; return true; } }], onMount: (ov) => ov.querySelector('#pname').focus() });
    if (v !== 'save') return;
    const r = await api.savePreset({ name: window.__pn, ids });
    if (r && r.ok) { toast('success', 'Preset saved'); load(); } else toast('error', 'Couldn\'t save', r && r.error);
  };
}
export function unmount() { list = null; }
