import { icon, CATEGORY_ICONS } from '../icons.js';
import { esc } from '../util.js';
import { S, toast } from '../app.js';

const api = window.woof;
let open = null;

export function render() {
  const list = [...S.guides].sort((a, b) => Number(b.relevant) - Number(a.relevant));
  return `<div class="page">
    <div class="page-head"><div><h1>Guides</h1><p>Some of the best settings can't be changed safely by any app — NVIDIA/AMD driver panels store them in their own database, BIOS settings live in firmware. These short guides show exactly what to set, with links only to official pages.</p></div></div>
    <div class="grid g2">${list.map((g) => `<div class="card pad col" style="gap:8px">
      <div class="row" style="align-items:flex-start"><span class="icon-wrap" style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(var(--accent-rgb),.13);color:var(--accent);flex:none">${icon(CATEGORY_ICONS[g.category] || 'book')}</span><div style="flex:1"><b>${esc(g.name)}</b><div class="muted small">${esc(g.desc)}</div></div>${g.relevant === false ? '<span class="badge neutral" data-tip="Not for the GPU in this PC">Other GPU</span>' : ''}</div>
      ${open === g.id ? `<ol style="padding-left:20px;display:flex;flex-direction:column;gap:6px" class="small">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      <div class="row wrap" style="gap:8px;margin-top:auto"><button class="btn sm" data-g="${esc(g.id)}">${open === g.id ? 'Hide steps' : `${icon('book', 'sm')}Show steps`}</button>
        ${g.open ? `<button class="btn sm" data-open="${esc(g.open)}">${icon('external', 'sm')}Open settings</button>` : ''}
        ${(g.links || []).map((l) => `<button class="btn ghost sm" data-link="${esc(l.url)}">${icon('external', 'sm')}${esc(l.label)}</button>`).join('')}</div>
    </div>`).join('')}</div>
  </div>`;
}
export function mount(root) {
  root.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { open = open === b.dataset.g ? null : b.dataset.g; root.innerHTML = render(); mount(root); }; });
  root.querySelectorAll('[data-open]').forEach((b) => { b.onclick = async () => { const r = await api.openGuide(b.dataset.open); if (!r || !r.ok) toast('error', 'Couldn\'t open that', r && r.error); }; });
  root.querySelectorAll('[data-link]').forEach((b) => { b.onclick = () => api.openExternal(b.dataset.link); });
}
