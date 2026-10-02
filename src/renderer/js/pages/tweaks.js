import { icon } from '../icons.js';
import { esc, plural, searchScore } from '../util.js';
import { tweakCard, catHead, empty, skeletonList, PLAN_NAME } from '../components.js';
import { S, applyFlow, revertFlow, previewModal, render as renderApp, toast } from '../app.js';

const F = { cat: 'all', tier: 'all', risk: 'all', state: 'all', sort: 'category', hideNa: true };
const sel = new Set();
const opened = new Set();

function filtered() {
  const q = S.query.trim();
  let list = S.tweaks.filter((t) => !t.hidden || t.applied);
  if (F.cat !== 'all') list = list.filter((t) => t.category === F.cat);
  if (F.tier !== 'all') list = list.filter((t) => t.tier === F.tier);
  if (F.risk !== 'all') list = list.filter((t) => t.risk === F.risk);
  if (F.state === 'applied') list = list.filter((t) => t.applied);
  if (F.state === 'default') list = list.filter((t) => !t.applied && t.status === 'default');
  if (F.state === 'unlocked') list = list.filter((t) => !t.locked);
  if (F.state === 'recommended') list = list.filter((t) => t.recommended);
  if (F.state === 'attention') list = list.filter((t) => t.drift);
  if (F.hideNa) list = list.filter((t) => t.status !== 'na' || t.applied);
  if (q) list = list.map((t) => [t, searchScore(t, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  else if (F.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else if (F.sort === 'tier') list = [...list].sort((a, b) => ['free', 'plus', 'pro', 'ultra'].indexOf(a.tier) - ['free', 'plus', 'pro', 'ultra'].indexOf(b.tier));
  else if (F.sort === 'risk') list = [...list].sort((a, b) => ['safe', 'moderate', 'advanced'].indexOf(a.risk) - ['safe', 'moderate', 'advanced'].indexOf(b.risk));
  return list;
}

const chip = (key, val, label, n) => `<button class="chip ${F[key] === val ? 'on' : ''}" data-f="${key}" data-v="${val}">${label}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;

export function render() {
  if (S.loading) return `<div class="page"><div class="page-head"><div><h1>All tweaks</h1></div></div>${skeletonList(8)}</div>`;
  const cats = (S.app && S.app.categories) || [];
  const list = filtered();
  const q = S.query.trim();
  const counts = Object.fromEntries(cats.map((c) => [c.id, S.tweaks.filter((t) => t.category === c.id && (!F.hideNa || t.status !== 'na')).length]));
  let body;
  if (!list.length) body = empty('search', q ? `No tweaks match “${q}”` : 'No tweaks match these filters', q ? 'Try different words, like "ping", "stutter" or "mouse".' : 'Clear a filter to see more.', '<button class="btn" id="clear-f">Clear filters</button>');
  else if (q || F.sort !== 'category') body = `<div class="tweak-list">${list.map((t) => tweakCard(t, { selectable: true, selected: sel.has(t.id), open: opened.has(t.id) })).join('')}</div>`;
  else body = cats.filter((c) => list.some((t) => t.category === c.id)).map((c) => {
    const items = list.filter((t) => t.category === c.id);
    return `${catHead(c, `${items.length}`, `<span class="spacer"></span><button class="btn ghost sm" data-selcat="${c.id}">Select unlocked</button>`)}<div class="tweak-list">${items.map((t) => tweakCard(t, { selectable: true, selected: sel.has(t.id), open: opened.has(t.id) })).join('')}</div>`;
  }).join('');
  const selList = [...sel].map((id) => S.tweakMap.get(id)).filter(Boolean);
  return `<div class="page">
    <div class="page-head"><div><h1>All tweaks</h1><p>${q ? `Results for “${esc(q)}”` : `${S.tweaks.filter((t) => !t.hidden && t.category !== 'startup').length} tweaks for ${esc(S.info.osName)}. Toggle one on, or select several and apply them together.`}</p></div>
      <div class="actions"><button class="btn" id="preview-all" ${selList.length ? '' : 'disabled'}>${icon('eye', 'sm')}Dry run</button></div></div>
    <div class="toolbar">
      <div class="chips">${chip('cat', 'all', 'All')}${cats.filter((c) => counts[c.id]).map((c) => chip('cat', c.id, esc(c.name), counts[c.id])).join('')}</div>
    </div>
    <div class="row wrap" style="gap:8px;margin:-4px 0 6px">
      <select class="select" id="f-state" aria-label="Show"><option value="all">Show: everything</option><option value="recommended">Recommended for my PC</option><option value="applied">Applied by Woof Tweaks</option><option value="default">Not applied</option><option value="unlocked">Unlocked on my plan</option><option value="attention">Needs attention</option></select>
      <select class="select" id="f-tier" aria-label="Plan"><option value="all">Any plan</option>${['free', 'plus', 'pro', 'ultra'].map((p) => `<option value="${p}">${PLAN_NAME[p]}</option>`).join('')}</select>
      <select class="select" id="f-risk" aria-label="Risk"><option value="all">Any risk</option><option value="safe">Safe</option><option value="moderate">Moderate</option><option value="advanced">Advanced</option></select>
      <select class="select" id="f-sort" aria-label="Sort"><option value="category">Sort: category</option><option value="name">Sort: A–Z</option><option value="tier">Sort: plan</option><option value="risk">Sort: risk</option></select>
      <label class="row small muted" style="gap:6px;margin-left:4px"><input type="checkbox" id="f-na" ${F.hideNa ? 'checked' : ''}> Hide ones that don't apply to this PC</label>
    </div>
    ${body}
    ${selList.length ? `<div class="selbar"><b>${plural(selList.length, 'tweak')} selected</b><span class="dim small">${selList.filter((t) => t.locked).length ? `${selList.filter((t) => t.locked).length} locked` : ''}</span><span class="spacer"></span>
      <button class="btn ghost sm" id="sel-clear">Clear</button><button class="btn sm" id="sel-preview">${icon('eye', 'sm')}Preview</button><button class="btn sm" id="sel-revert">${icon('undo', 'sm')}Revert selected</button><button class="btn sm primary" id="sel-apply">${icon('bolt', 'sm')}Apply selected</button></div>` : ''}
  </div>`;
}

export function mount(root) {
  root.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { F[b.dataset.f] = b.dataset.v; renderApp(); }; });
  const bindSel = (id, key) => { const el = root.querySelector(id); if (el) { el.value = F[key]; el.onchange = () => { F[key] = el.value; renderApp(); }; } };
  bindSel('#f-state', 'state'); bindSel('#f-tier', 'tier'); bindSel('#f-risk', 'risk'); bindSel('#f-sort', 'sort');
  const na = root.querySelector('#f-na'); if (na) na.onchange = () => { F.hideNa = na.checked; renderApp(); };
  const cl = root.querySelector('#clear-f'); if (cl) cl.onclick = () => { Object.assign(F, { cat: 'all', tier: 'all', risk: 'all', state: 'all' }); S.query = ''; const s = document.getElementById('search'); if (s) s.value = ''; renderApp(); };
  root.addEventListener('change', (e) => { const c = e.target.closest('[data-sel]'); if (c) { if (c.checked) sel.add(c.dataset.sel); else sel.delete(c.dataset.sel); renderApp(); } });
  root.querySelectorAll('[data-action="expand"]').forEach((b) => b.addEventListener('click', () => { const id = b.closest('.tweak').dataset.id; if (opened.has(id)) opened.delete(id); else opened.add(id); }));
  root.querySelectorAll('[data-selcat]').forEach((b) => { b.onclick = () => { for (const t of filtered()) if (t.category === b.dataset.selcat && !t.locked && !t.applied && t.status !== 'na' && !t.blocked && !t.exclusive) sel.add(t.id); renderApp(); }; });
  const on = (id, fn) => { const el = root.querySelector(id); if (el) el.onclick = fn; };
  on('#sel-clear', () => { sel.clear(); renderApp(); });
  on('#sel-preview', () => previewModal([...sel]));
  on('#preview-all', () => previewModal([...sel]));
  on('#sel-apply', async () => { const ids = [...sel]; const r = await applyFlow(ids, { title: 'Apply selected', force: true }); if (r) { sel.clear(); renderApp(); } });
  on('#sel-revert', async () => { const ids = [...sel].filter((id) => S.tweakMap.get(id) && S.tweakMap.get(id).applied); if (!ids.length) return toast('info', 'None of the selected tweaks are applied'); await revertFlow(ids, { confirm: true }); sel.clear(); renderApp(); });
}
