import { icon } from '../icons.js';
import { esc, ago, when, plural } from '../util.js';
import { tweakCard, empty } from '../components.js';
import { S, applyFlow, revertFlow, refreshScan, render as rerender } from '../app.js';

const api = window.woof;
let hist = null;

export function render() {
  if (!hist) { api.history().then((h) => { hist = Array.isArray(h) ? h : []; const m = document.getElementById('main'); if (m && S.page === 'status') { m.innerHTML = render(); mount(m); } }); }
  const real = S.tweaks.filter((t) => !t.hidden && t.status && t.status !== 'na');
  const n = (s) => real.filter((t) => t.status === s).length;
  const drift = S.tweaks.filter((t) => t.drift);
  const applied = S.tweaks.filter((t) => t.applied);
  return `<div class="page">
    <div class="page-head"><div><h1>Status & history</h1><p>Live state of every setting, read from your system — plus a timeline of everything Woof Tweaks applied or reverted.</p></div>
      <div class="actions"><button class="btn" id="rescan">${icon('refresh', 'sm')}Check again</button></div></div>
    <div class="statbox">
      <div class="s"><b style="color:var(--green)">${n('optimised')}</b><span>Optimised</span></div>
      <div class="s"><b>${n('default')}</b><span>At default</span></div>
      <div class="s"><b style="color:var(--amber)">${n('partial')}</b><span>Partly applied</span></div>
      <div class="s"><b style="color:${drift.length ? 'var(--amber)' : 'inherit'}">${drift.length}</b><span>Changed externally / reset</span></div>
    </div>
    ${drift.length ? `<div class="cat-head"><span class="icon-wrap" style="background:rgba(255,181,71,.14);color:var(--amber)">${icon('alert')}</span><h3>Needs attention</h3><span class="spacer"></span><button class="btn sm" id="reapply">${icon('bolt', 'sm')}Re-apply all</button></div>
      <p class="muted small" style="margin:-4px 2px 10px">Woof Tweaks applied these, but the setting is no longer at that value — Windows Update, another app, or a restart (for "until restart" tweaks) changed it. Re-apply, or revert to restore your original.</p>
      <div class="tweak-list">${drift.map((t) => tweakCard(t)).join('')}</div>` : ''}
    <div class="grid g2" style="margin-top:18px;align-items:start">
      <div class="card pad"><div class="row" style="margin-bottom:6px"><h2>Applied by Woof Tweaks</h2><span class="spacer"></span><span class="dim small">${applied.length}</span></div>
        ${applied.length ? `<div class="timeline">${applied.map((t) => `<div class="tl"><span class="dot2 apply">${icon('check', 'sm')}</span><div><div class="t">${esc(t.name)}</div><div class="d">${t.appliedAt ? esc(t.appliedAt) : ''}</div></div><button class="btn ghost sm" data-rv="${esc(t.id)}">${icon('undo', 'sm')}</button></div>`).join('')}</div>` : empty('check', 'Nothing applied yet', 'Your PC is exactly as it was.')}
      </div>
      <div class="card pad"><h2>Timeline</h2>
        ${hist === null ? '<div class="skel" style="height:200px;margin-top:10px"></div>' : hist.length ? `<div class="timeline">${hist.slice(0, 60).map((h) => {
          const fail = h.failed && h.failed.length;
          const what = h.action === 'apply' ? 'Applied' : h.action === 'revert' ? 'Reverted' : h.action === 'action' ? 'Ran' : h.action === 'interrupted' ? 'Interrupted' : h.action;
          const names = (h.names || h.ids || []);
          return `<div class="tl"><span class="dot2 ${fail || h.action === 'interrupted' ? 'fail' : h.action === 'revert' ? 'revert' : 'apply'}">${icon(h.action === 'revert' ? 'undo' : h.action === 'action' ? 'wrench' : fail ? 'alert' : 'check', 'sm')}</span>
            <div><div class="t">${what} ${names.length ? esc(names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ')) : ''}</div><div class="d">${esc(ago(h.at))}${h.source && h.source !== 'manual' ? ` · ${esc(h.source.replace(':', ' '))}` : ''}${fail ? ` · <span style="color:var(--red)">${plural(h.failed.length, 'failure')}: ${esc(h.failed[0].error || '')}</span>` : ''}${h.note ? ` · ${esc(h.note)}` : ''}</div></div><span class="dim tiny nowrap" title="${esc(when(h.at))}">${esc(new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></div>`;
        }).join('')}</div>` : '<p class="dim small" style="margin-top:8px">Nothing has happened yet.</p>'}
      </div>
    </div></div>`;
}
export function mount(root) {
  const on = (s, fn) => { const el = root.querySelector(s); if (el) el.onclick = fn; };
  on('#rescan', async () => { await refreshScan(); hist = null; rerender(); });
  on('#reapply', async () => {
    // Re-apply = revert (restores the original snapshot) then apply again, so the backup stays the true original.
    const ids = S.tweaks.filter((t) => t.drift).map((t) => t.id);
    await revertFlow(ids, { title: 'Resetting changed tweaks' });
    await applyFlow(ids, { title: 'Re-applying', force: true });
    hist = null;
  });
  root.querySelectorAll('[data-rv]').forEach((b) => { b.onclick = async () => { await revertFlow([b.dataset.rv]); hist = null; }; });
}
export function unmount() { hist = null; }
