import { icon, CATEGORY_ICONS } from '../icons.js';
import { esc, bytes } from '../util.js';
import { tweakCard, PLAN_NAME, riskBadge } from '../components.js';
import { S, toast, modal, upgradeModal, feature, setSetting, render as rerenderApp } from '../app.js';

const api = window.woof;
const running = new Set();

export function render() {
  const groups = [['cleanup', 'Clean up'], ['repair', 'Repair'], ['network', 'Network']];
  const startup = S.tweaks.filter((t) => t.category === 'startup');
  const maint = S.settings.maintenance || { enabled: false, days: 7 };
  const mf = feature('maintenance');
  return `<div class="page">
    <div class="page-head"><div><h1>Cleanup & repair</h1><p>One-off jobs that free space and fix common problems. These aren't toggles — there's nothing to revert — so anything permanent asks first.</p></div></div>
    ${groups.map(([cat, title]) => {
      const list = S.actions.filter((a) => a.category === cat);
      if (!list.length) return '';
      return `<div class="cat-head"><span class="icon-wrap">${icon(CATEGORY_ICONS[cat] || 'wrench')}</span><h3>${title}</h3></div><div class="grid g2">${list.map((a) => `<div class="card pad col" style="gap:8px" data-a="${esc(a.id)}">
        <div class="row" style="align-items:flex-start"><div style="flex:1"><b>${esc(a.name)}</b><div class="muted small">${esc(a.desc)}</div></div></div>
        <div class="row wrap" style="gap:5px">${riskBadge(a.risk)}${a.locked ? `<span class="badge lock">${icon('lock')}${PLAN_NAME[a.tier]}</span>` : `<span class="badge tier ${a.tier}">${PLAN_NAME[a.tier]}</span>`}${a.admin ? `<span class="badge neutral">${icon('admin')}Admin</span>` : ''}${a.reboot ? '<span class="badge info">Restart</span>' : ''}</div>
        <details class="small muted"><summary style="cursor:pointer">What it does</summary><p style="margin-top:6px">${esc(a.long && a.long.what)} ${esc(a.long && a.long.risk)}</p></details>
        <div class="row" style="margin-top:auto"><span class="spacer"></span><button class="btn sm ${a.locked ? '' : 'primary'}" data-run ${running.has(a.id) ? 'disabled' : ''}>${running.has(a.id) ? '<span class="spin"></span>Working…' : a.locked ? `${icon('lock', 'sm')}Unlock` : `${icon('play', 'sm')}Run`}</button></div>
      </div>`).join('')}</div>`;
    }).join('')}
    ${startup.length ? `<div class="cat-head"><span class="icon-wrap">${icon('power')}</span><h3>Startup apps</h3><span class="dim small">${startup.length}</span></div>
      <p class="muted small" style="margin:-4px 2px 10px">Turn programs off so they don't start with Windows — exactly like Task Manager → Startup apps. Toggle back on any time.</p>
      <div class="tweak-list">${startup.map((t) => tweakCard(t)).join('')}</div>` : ''}
    <div class="cat-head"><span class="icon-wrap">${icon('clock')}</span><h3>Scheduled maintenance</h3>${mf.allowed ? '' : `<span class="badge lock">${icon('lock')}${PLAN_NAME[mf.tier]}</span>`}</div>
    <div class="card pad"><div class="set-row" style="padding:0;border:0"><div class="l"><b>Tidy up automatically</b><span>Clears temp files and crash dumps${S.info.platform === 'win32' ? ' and flushes DNS' : ''} on a schedule while Woof Tweaks is open. Never needs admin, never touches your files.</span></div>
      <select class="select" id="m-days" ${maint.enabled ? '' : 'disabled'}><option value="1">Daily</option><option value="7">Weekly</option><option value="14">Every 2 weeks</option><option value="30">Monthly</option></select>
      <label class="switch"><input type="checkbox" id="m-on" ${maint.enabled ? 'checked' : ''}><span class="track"></span><span class="thumb"></span></label></div></div>
  </div>`;
}

async function runAction(a) {
  if (a.locked) return upgradeModal(a.tier, `${a.name} is part of the ${PLAN_NAME[a.tier]} plan.`);
  let params = {};
  if (a.choices) {
    const found = await api.listBloat();
    if (!Array.isArray(found) || !found.length) return toast('info', 'Nothing to remove', 'None of the apps we offer to remove are installed.');
    const v = await modal({ title: a.name, icon: 'trash', wide: true, body: `<div class="note warn" style="margin-bottom:12px">${icon('alert')}<div>${esc(a.confirm)}</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${found.map((c) => `<label class="row small" style="gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:9px"><input type="checkbox" data-c="${esc(c.id)}">${esc(c.label)}</label>`).join('')}</div>`, actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Remove selected', kind: 'danger', value: 'go', run: (ov) => { window.__bloat = [...ov.querySelectorAll('[data-c]:checked')].map((x) => x.dataset.c); return window.__bloat.length > 0; } }] });
    if (v !== 'go') return;
    params = { names: window.__bloat };
  } else if (a.confirm || a.risk !== 'safe') {
    const v = await modal({ title: `${a.name}?`, icon: 'alert', body: `<p class="muted">${esc(a.confirm || (a.long && a.long.risk) || '')}</p>`, actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Run', kind: a.risk === 'safe' ? 'primary' : 'danger', value: 'go' }] });
    if (v !== 'go') return;
  }
  running.add(a.id); rerender();
  if (a.progress) toast('info', a.name, a.progress);
  const r = await api.runAction(a.id, params);
  running.delete(a.id); rerender();
  if (r && r.ok) {
    const d = r.data || {};
    toast('success', `${a.name} — done`, d.freed ? `Freed ${bytes(d.freed)}${d.skipped ? ` (${d.skipped} files in use were skipped)` : ''}.` : d.removed ? `Removed ${d.removed.length} apps.` : d.created === false ? d.message : d.reboot || a.reboot ? 'Restart your PC to finish.' : d.tail || '');
  } else if (r && r.code === 'plan') upgradeModal(r.requiredPlan, r.error);
  else toast(r && r.cancelled ? 'warn' : 'error', r && r.cancelled ? 'Cancelled' : `${a.name} failed`, r && r.error);
}
function rerender() { const m = document.getElementById('main'); if (m && S.page === 'cleanup') { m.innerHTML = render(); mount(m); } }

export function mount(root) {
  root.querySelectorAll('[data-a]').forEach((el) => { const a = S.actions.find((x) => x.id === el.dataset.a); el.querySelector('[data-run]').onclick = () => runAction(a); });
  const on = root.querySelector('#m-on'); const days = root.querySelector('#m-days');
  const maint = S.settings.maintenance || { enabled: false, days: 7 };
  if (days) days.value = String(maint.days || 7);
  if (on) on.onchange = async () => { const r = await setSetting('maintenance', { enabled: on.checked, days: Number(days.value) }); if (!r || !r.ok) on.checked = false; else toast('success', on.checked ? 'Scheduled maintenance on' : 'Scheduled maintenance off'); rerender(); };
  if (days) days.onchange = () => setSetting('maintenance', { enabled: on.checked, days: Number(days.value) });
}
