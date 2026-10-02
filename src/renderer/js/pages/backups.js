import { icon } from '../icons.js';
import { esc, ago, plural } from '../util.js';
import { empty } from '../components.js';
import { S, revertFlow, toast } from '../app.js';

const api = window.woof;
let list = null;

export function render() {
  if (!list) api.backups().then((b) => { list = Array.isArray(b) ? b : []; const m = document.getElementById('main'); if (m && S.page === 'backups') { m.innerHTML = render(); mount(m); } });
  const win = S.info.platform === 'win32';
  return `<div class="page">
    <div class="page-head"><div><h1>Backups</h1><p>Before changing anything, Woof Tweaks saves the exact original value of every setting. Reverting puts back precisely what was there — not a guessed default.</p></div>
      <div class="actions"><button class="btn" id="folder">${icon('folder', 'sm')}Open backup folder</button><button class="btn" id="export">${icon('upload', 'sm')}Export</button>${win ? `<button class="btn" id="rp">${icon('backup', 'sm')}Create restore point</button>` : ''}<button class="btn danger" id="all" ${list && list.length ? '' : 'disabled'}>${icon('undo', 'sm')}Revert everything</button></div></div>
    <div class="grid g3" style="margin-bottom:16px">
      <div class="card pad"><div class="row">${icon('shield')}<b>Per-setting snapshots</b></div><p class="muted small" style="margin-top:6px">Every registry value, service, power setting and file we change is recorded with its original value.</p></div>
      <div class="card pad"><div class="row">${icon('backup')}<b>${win ? 'Windows restore point' : 'Your OS, untouched'}</b></div><p class="muted small" style="margin-top:6px">${win ? 'Created automatically once a day before system changes (turn off in Settings).' : 'Woof Tweaks only changes the settings listed below — revert any of them at any time.'}</p></div>
      <div class="card pad"><div class="row">${icon('refresh')}<b>Crash-safe</b></div><p class="muted small" style="margin-top:6px">If the app is closed mid-change, the next launch recovers what was started so it can still be reverted.</p></div>
    </div>
    <div class="card pad"><div class="row" style="margin-bottom:6px"><h2>Current backups</h2><span class="spacer"></span><span class="dim small">${list ? plural(list.length, 'tweak') : ''}</span></div>
      ${list === null ? '<div class="skel" style="height:160px"></div>' : list.length ? `<div class="timeline">${list.map((b) => `<div class="tl"><span class="dot2 ${b.interrupted ? 'fail' : 'apply'}">${icon(b.interrupted ? 'alert' : 'backup', 'sm')}</span><div><div class="t">${esc(b.name || b.id)}${b.interrupted ? ' <span class="badge moderate">Interrupted</span>' : ''}${b.volatile ? ' <span class="badge neutral">Until restart</span>' : ''}</div><div class="d">${plural(b.changes, 'setting')} saved · applied ${esc(ago(b.at))}${b.admin ? ' · system' : ''}</div></div><button class="btn sm" data-rv="${esc(b.id)}">${icon('undo', 'sm')}Revert</button></div>`).join('')}</div>` : empty('backup', 'No backups needed', 'Woof Tweaks hasn\'t changed anything on this PC right now.')}
    </div></div>`;
}
export function mount(root) {
  const on = (s, fn) => { const el = root.querySelector(s); if (el) el.onclick = fn; };
  on('#folder', () => api.openBackups());
  on('#export', async () => { const r = await api.exportBackup(); if (r && r.ok) toast('success', 'Backup exported', r.path); });
  on('#rp', async () => { toast('info', 'Creating a restore point…', 'Windows will ask for admin permission.'); const r = await api.createRestorePoint(); if (r && r.ok) toast('success', r.created === false ? 'Restore point skipped' : 'Restore point created', r.message || ''); else toast('error', 'Couldn\'t create a restore point', r && r.error); });
  on('#all', async () => { await revertFlow('all', { title: 'Reverting everything', confirm: true }); list = null; });
  root.querySelectorAll('[data-rv]').forEach((b) => { b.onclick = async () => { await revertFlow([b.dataset.rv]); list = null; const m = document.getElementById('main'); if (m) { m.innerHTML = render(); mount(m); } }; });
}
export function unmount() { list = null; }
