// Woof Tweaks — app shell: state, routing, layout, apply/revert flows, modals, toasts.
import { icon, PAW } from './icons.js';
import { esc, $, $$, hexToRgb, initials, plural, debounce } from './util.js';
import { t, setLanguage } from './i18n.js';
import { PLAN_NAME } from './components.js';
import * as dashboard from './pages/dashboard.js';
import * as games from './pages/games.js';
import * as tweaks from './pages/tweaks.js';
import * as presets from './pages/presets.js';
import * as benchmark from './pages/benchmark.js';
import * as cleanup from './pages/cleanup.js';
import * as guides from './pages/guides.js';
import * as status from './pages/status.js';
import * as backups from './pages/backups.js';
import * as settings from './pages/settings.js';
import * as upgrade from './pages/upgrade.js';
import { onboarding } from './onboarding.js';
import { whatsNew } from './changelog.js';

const api = window.woof;
const PAGES = { dashboard, games, tweaks, presets, benchmark, cleanup, guides, status, backups, settings, upgrade };
const NAV = [
  ['nav.main', [['dashboard', 'dashboard'], ['games', 'gamepad'], ['tweaks', 'sliders'], ['presets', 'layers']]],
  ['nav.tools', [['benchmark', 'bench'], ['cleanup', 'broom'], ['guides', 'book']]],
  ['nav.you', [['status', 'history'], ['backups', 'backup'], ['settings', 'settings']]],
];

export const S = {
  info: api.info, app: null, session: { signedIn: false, plan: 'free' }, settings: {}, hw: null,
  tweaks: [], tweakMap: new Map(), scan: null, games: [], actions: [], guides: [], presets: [],
  busy: false, page: 'dashboard', params: {}, query: '', monitor: [], lastMonitor: null, loading: true,
};
export const plan = () => (S.session && S.session.plan) || 'free';
export const feature = (f) => (S.app && S.app.features[f]) || { allowed: false, tier: 'ultra' };

// ---------- data ----------
export async function loadTweaks() {
  const list = await api.tweaks();
  if (Array.isArray(list)) { S.tweaks = list; S.tweakMap = new Map(list.map((x) => [x.id, x])); }
  return S.tweaks;
}
export async function refreshScan() {
  const scan = await api.scan();
  if (scan && !scan.error) {
    S.scan = scan;
    for (const tw of S.tweaks) { const s = scan[tw.id]; if (s) Object.assign(tw, { status: s.status, applied: s.applied, drift: s.drift, why: s.why, appliedAt: s.appliedAt ? new Date(s.appliedAt).toLocaleString() : null }); }
  }
  renderFooter();
  return S.scan;
}
async function loadAll() {
  const st = await api.state();
  S.app = st; S.session = st.session; S.settings = st.settings || {};
  applyTheme();
  renderShell();
  const [g, a, gu, h] = await Promise.all([api.games(), api.actions(), api.guides(), api.hardware()]);
  S.games = Array.isArray(g) ? g : []; S.actions = Array.isArray(a) ? a : []; S.guides = Array.isArray(gu) ? gu : []; S.hw = h && !h.error ? h : null;
  await loadTweaks();
  S.loading = false;
  render();
  refreshScan().then(() => render());
}
export async function reloadEverything() {
  const st = await api.state();
  S.app = st; S.session = st.session; S.settings = st.settings || {};
  const [g, a] = await Promise.all([api.games(), api.actions()]);
  S.games = Array.isArray(g) ? g : S.games; S.actions = Array.isArray(a) ? a : S.actions;
  await loadTweaks();
  await refreshScan();
  renderShell(); render();
}

// ---------- theme ----------
export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = S.settings.theme || 'dark';
  const accent = S.settings.accent || '#8b7bff';
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-rgb', hexToRgb(accent));
  root.dataset.motion = S.settings.reduceMotion ? 'reduce' : '';
  root.classList.toggle('mac', S.info.platform === 'darwin');
  setLanguage(S.settings.language || 'en');
}
export async function setSetting(key, val) {
  const r = await api.setSetting(key, val);
  if (r && r.ok) { S.settings[key] = val; return r; }
  if (r && r.code === 'plan') upgradeModal(r.requiredPlan, r.error);
  else toast('error', 'Couldn\'t save that setting', r && r.error);
  return r;
}

// ---------- layout ----------
function renderShell() {
  const s = S.session;
  document.getElementById('app').innerHTML = `
    <header class="titlebar">
      <div class="brand"><span class="brand-mark">${PAW}</span><b>Woof <span>Tweaks</span></b></div>
      <div class="search">${icon('search', 'sm')}<input id="search" type="search" placeholder="${esc(t('search.placeholder'))}" value="${esc(S.query)}" aria-label="Search tweaks" autocomplete="off"><kbd>${S.info.platform === 'darwin' ? '⌘' : 'Ctrl'} K</kbd></div>
      <div class="tb-right">
        <button class="plan-pill" data-go="upgrade" data-tip="Your plan" data-tip-pos="bottom">${icon('crown', 'sm')}${PLAN_NAME[plan()]}</button>
        ${s.signedIn
          ? `<button class="avatar-btn" data-go="settings" data-tip="Account & settings" data-tip-pos="bottom"><span class="avatar">${esc(initials(s.name))}</span><span class="small">${esc(s.name || 'Account')}</span></button>`
          : `<button class="btn sm primary" data-action="login">${icon('user', 'sm')}Log in</button>`}
      </div>
    </header>
    <nav class="sidebar" aria-label="Main">${NAV.map(([label, items]) => `<div class="nav-label">${t(label)}</div>${items.map(([id, ic]) => `<button class="nav ${S.page === id ? 'active' : ''}" data-go="${id}" aria-current="${S.page === id ? 'page' : 'false'}" data-tip-pos="bottom">${icon(ic)}<span>${t(`nav.${id}`)}</span>${navCount(id)}</button>`).join('')}`).join('')}
      ${plan() === 'ultra' || plan() === 'lifetime' ? '' : `<button class="nav upgrade" data-go="upgrade">${icon('crown')}<span>${t('nav.upgrade')}</span></button>`}
    </nav>
    <main class="main" id="main" tabindex="-1"></main>
    <footer class="footer" id="footer"></footer>`;
  renderFooter();
}
function navCount(id) {
  if (id === 'tweaks' && S.tweaks.length) return `<span class="count">${S.tweaks.filter((x) => !x.hidden && x.category !== 'startup').length}</span>`;
  if (id === 'games' && S.games.length) return `<span class="count">${S.games.filter((g) => g.installed).length || ''}</span>`;
  return '';
}
export function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  const applied = S.tweaks.filter((x) => x.applied).length;
  const optimised = S.tweaks.filter((x) => x.status === 'optimised').length;
  const drift = S.tweaks.filter((x) => x.drift).length;
  el.innerHTML = `<span class="dot ${S.busy ? 'busy' : ''}"></span><span>${S.busy ? t('footer.working') : t('footer.ready')}</span><span class="sep">·</span>
    <span data-tip="Tweaks Woof Tweaks applied and can revert">${plural(applied, 'tweak')} applied by Woof Tweaks</span><span class="sep">·</span>
    <span data-tip="Settings already at their optimised value (by us or by you)">${optimised} optimised</span>
    ${drift ? `<span class="sep">·</span><span style="color:var(--amber)" data-tip="Changed by something else or reset by a restart">${drift} need attention</span>` : ''}
    <span class="right"><span>${esc(S.info.osName)}${S.hw && S.hw.osName ? ` · ${esc(S.hw.osName)}` : ''}</span><span>v${esc(S.info.version)}</span></span>`;
}

export function go(page, params = {}) {
  if (!PAGES[page]) page = 'dashboard';
  const prev = PAGES[S.page];
  if (prev && prev.unmount) prev.unmount();
  S.page = page; S.params = params;
  $$('.nav').forEach((n) => { const on = n.dataset.go === page; n.classList.toggle('active', on); n.setAttribute('aria-current', on ? 'page' : 'false'); });
  render();
  const m = document.getElementById('main'); if (m) { m.scrollTop = 0; m.focus({ preventScroll: true }); }
}
export function render() {
  const main = document.getElementById('main');
  if (!main) return;
  const p = PAGES[S.page];
  main.innerHTML = p.render(S);
  if (p.mount) p.mount(main, S);
}

// ---------- toasts & modals ----------
export function toast(type, title, message = '', opts = {}) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="ti">${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'warn' ? 'alert' : 'info')}</span><div style="flex:1;min-width:0"><b>${esc(title)}</b>${message ? `<span>${esc(message)}</span>` : ''}</div>${opts.action ? `<button class="btn sm">${esc(opts.action.label)}</button>` : ''}<button class="btn ghost icon-only sm" aria-label="Dismiss">${icon('x', 'sm')}</button>`;
  const close = () => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; el.style.transition = 'all .2s'; setTimeout(() => el.remove(), 200); };
  el.querySelector('[aria-label="Dismiss"]').onclick = close;
  if (opts.action) el.querySelector('.btn.sm:not(.icon-only)').onclick = () => { close(); opts.action.run(); };
  box.appendChild(el);
  setTimeout(close, opts.ms || (opts.action ? 9000 : type === 'error' ? 8000 : 4500));
}

export function modal({ title, body, actions = [], wide = false, icon: ic, onMount, dismissable = true }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">${ic ? `<span class="icon-wrap" style="width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:rgba(var(--accent-rgb),.14);color:var(--accent)">${icon(ic)}</span>` : ''}<div><h2>${esc(title)}</h2></div>${dismissable ? `<button class="btn ghost icon-only x" data-close aria-label="Close">${icon('x')}</button>` : ''}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-i="${i}" ${a.disabled ? 'disabled' : ''}>${a.icon ? icon(a.icon, 'sm') : ''}${esc(a.label)}</button>`).join('')}</div></div>`;
    const done = (v) => { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) done(null); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (e) => {
      if (e.target === ov && dismissable) return done(null);
      if (e.target.closest('[data-close]')) return done(null);
      const b = e.target.closest('[data-i]');
      if (b) { const a = actions[Number(b.dataset.i)]; const v = a.value !== undefined ? a.value : a.label; if (a.run) { const r = a.run(ov); if (r === false) return; } done(v); }
    });
    document.body.appendChild(ov);
    if (onMount) onMount(ov, done);
    const first = ov.querySelector('.modal-foot .btn.primary') || ov.querySelector('.modal-foot .btn');
    if (first) first.focus();
  });
}

// ---------- apply / revert flows ----------
let drawer = null;
function openDrawer(title) {
  closeDrawer();
  drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'status');
  drawer.innerHTML = `<div class="row"><b id="dr-title">${esc(title)}</b><span class="spacer"></span><span class="dim tiny" id="dr-pct">0%</span></div><div class="progress" style="margin-top:10px"><i id="dr-bar" style="width:4%"></i></div><div class="log" id="dr-log"></div>`;
  document.body.appendChild(drawer);
}
function drawerLog(cls, text) { const l = drawer && drawer.querySelector('#dr-log'); if (l) { const d = document.createElement('div'); d.className = cls; d.textContent = text; l.appendChild(d); l.scrollTop = l.scrollHeight; } }
function closeDrawer(delay = 0) { const d = drawer; drawer = null; if (d) setTimeout(() => d.remove(), delay); }
api.onProgress((p) => {
  if (!drawer) return;
  drawer.querySelector('#dr-bar').style.width = `${Math.max(4, p.pct || 0)}%`;
  drawer.querySelector('#dr-pct').textContent = `${p.pct || 0}%`;
  if (p.msg) drawerLog('', `› ${p.msg}`);
});

const needsConfirm = (list) => list.some((x) => x.risk !== 'safe' || x.admin || x.reboot || x.security);

/** Apply tweaks with a confirmation (always for batches / risky ones), progress, toasts and Undo. */
export async function applyFlow(ids, { title = 'Apply tweaks', source = 'manual', force = false, runner } = {}) {
  const list = ids.map((id) => S.tweakMap.get(id)).filter(Boolean);
  const locked = list.filter((x) => x.locked);
  const usable = list.filter((x) => !x.locked && !x.applied && x.status !== 'na' && !(x.blocked && x.blocked.code === 'guard'));
  if (!usable.length && !runner) {
    if (locked.length) return upgradeModal(locked[0].tier, `${plural(locked.length, 'tweak')} here need${locked.length === 1 ? 's' : ''} a higher plan.`);
    return toast('info', 'Nothing to change', 'Everything here is already applied or doesn\'t apply to this PC.');
  }
  if (force || usable.length > 1 || needsConfirm(usable)) {
    const ok = await confirmApply(usable, locked, title);
    if (!ok) return null;
  }
  return runApply(usable.map((x) => x.id), title, runner);
}

async function confirmApply(list, locked, title) {
  const security = list.filter((x) => x.security);
  const admin = list.some((x) => x.admin);
  const reboot = list.some((x) => x.reboot === 'restart');
  const body = `
    <p class="muted" style="margin-bottom:12px">Woof Tweaks backs up every value first. You can undo all of this with one click (Revert All) at any time.</p>
    ${security.length ? `<div class="note danger" style="margin-bottom:12px">${icon('alert')}<div><b>Security trade-off:</b> ${security.map((x) => esc(x.name)).join(', ')} lower${security.length === 1 ? 's' : ''} your PC's protection. Only continue if you understand the risk.<label class="row" style="margin-top:8px;gap:8px"><input type="checkbox" id="sec-ok"> I understand and want to continue</label></div></div>` : ''}
    <div class="tweak-list" style="gap:6px;max-height:300px;overflow:auto">${list.map((x) => `<div class="row" style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface)"><span class="badge ${x.risk}">${t(`risk.${x.risk}`)}</span><span style="flex:1">${esc(x.name)}</span>${x.admin ? `<span class="badge neutral">${icon('admin')}Admin</span>` : ''}${x.reboot ? `<span class="badge info">${x.reboot === 'restart' ? 'Restart' : 'Sign out'}</span>` : ''}</div>`).join('')}</div>
    ${locked.length ? `<div class="note info" style="margin-top:12px">${icon('lock')}<div>${plural(locked.length, 'tweak')} need${locked.length === 1 ? 's' : ''} a higher plan and will be skipped.</div></div>` : ''}
    <div class="row wrap small muted" style="margin-top:12px;gap:14px">${admin ? `<span class="row" style="gap:6px">${icon('admin', 'sm')}${S.info.platform === 'darwin' ? 'macOS will ask for your password' : S.info.platform === 'win32' ? 'Windows will ask for admin permission' : 'You\'ll be asked for your password'} once.</span>` : ''}${reboot ? `<span class="row" style="gap:6px">${icon('restart', 'sm')}Some changes finish after a restart.</span>` : ''}</div>`;
  const v = await modal({
    title: `${title} — ${plural(list.length, 'change')}`, icon: 'bolt', wide: true, body,
    actions: [
      { label: 'Preview exact changes', icon: 'eye', value: 'preview', run: () => { previewModal(list.map((x) => x.id)); return false; } },
      { label: 'Cancel', kind: 'ghost', value: null },
      { label: `Apply ${list.length}`, kind: 'primary', icon: 'bolt', value: 'go', run: (ov) => { const c = ov.querySelector('#sec-ok'); if (c && !c.checked) { c.closest('.note').style.outline = '2px solid var(--red)'; return false; } return true; } },
    ],
  });
  return v === 'go';
}

async function runApply(ids, title, runner) {
  S.busy = true; renderFooter();
  openDrawer(title);
  let r;
  try { r = runner ? await runner() : await api.apply(ids); } finally { S.busy = false; }
  if (!r || r.ok === undefined) { closeDrawer(); toast('error', 'Something went wrong', r && r.error); renderFooter(); return r; }
  if (r.busy) { closeDrawer(); toast('warn', 'Please wait', r.error); return r; }
  for (const x of r.results || []) drawerLog(x.ok && !x.skipped ? 'ok' : x.skipped ? 'skip' : 'err', `${x.ok && !x.skipped ? '✓' : x.skipped ? '–' : '✗'} ${x.name || x.id}${x.skipped ? ` (${x.reason || x.code})` : x.error ? ` — ${x.error}` : ''}`);
  closeDrawer(2200);
  await refreshScan(); render();
  const appliedIds = (r.results || []).filter((x) => x.ok && !x.skipped).map((x) => x.id);
  if (r.cancelled && !appliedIds.length) toast('warn', 'Nothing changed', 'Admin permission was declined.');
  else if (r.failed) toast('warn', `${r.applied} applied, ${r.failed} failed`, (r.results.find((x) => !x.ok && !x.skipped) || {}).error || '', appliedIds.length ? { action: { label: 'Undo', run: () => revertFlow(appliedIds, { quiet: false }) } } : {});
  else if (r.applied) toast('success', `${plural(r.applied, 'tweak')} applied`, r.reboot === 'restart' ? 'Restart your PC to finish.' : r.reboot === 'signout' ? 'Sign out and back in to finish.' : 'Everything is backed up.', { action: { label: 'Undo', run: () => revertFlow(appliedIds) } });
  else toast('info', 'Nothing to change', 'Already applied, locked, or not for this PC.');
  return r;
}

export async function revertFlow(ids, { title = 'Reverting', confirm = false } = {}) {
  if (confirm) {
    const v = await modal({ title: `Revert ${plural(ids.length, 'tweak')}?`, icon: 'undo', body: '<p class="muted">Each setting goes back to exactly what it was before Woof Tweaks changed it.</p>', actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Revert', kind: 'primary', icon: 'undo', value: 'go' }] });
    if (v !== 'go') return null;
  }
  S.busy = true; renderFooter(); openDrawer(title);
  let r;
  try { r = ids === 'all' ? await api.revertAll() : await api.revert(ids); } finally { S.busy = false; }
  for (const x of (r && r.results) || []) drawerLog(x.ok ? 'ok' : 'err', `${x.ok ? '↺' : '✗'} ${x.name || x.id}${x.error ? ` — ${x.error}` : ''}`);
  closeDrawer(1800);
  await refreshScan(); render();
  if (r && r.busy) toast('warn', 'Please wait', r.error);
  else if (r && r.failed) toast('warn', `${r.applied} reverted, ${r.failed} failed`, (r.results.find((x) => !x.ok) || {}).error || '');
  else if (r && r.applied) toast('success', `${plural(r.applied, 'tweak')} reverted`, r.reboot === 'restart' ? 'Restart your PC to finish.' : 'Back to your original settings.');
  else toast('info', 'Nothing to revert');
  return r;
}

export async function previewModal(ids) {
  const body = '<div class="skel" style="height:160px"></div>';
  modal({
    title: 'Dry run — nothing will change', icon: 'eye', wide: true, body,
    actions: [{ label: 'Close', kind: 'primary', value: null }],
    onMount: async (ov) => {
      const rows = await api.preview(ids);
      const html = (Array.isArray(rows) ? rows : []).map((r) => r.blocked
        ? `<tr class="group"><td colspan="3">${esc(r.name)} <span class="badge lock" style="margin-left:6px">${esc(r.blocked.reason)}</span></td></tr>`
        : `<tr class="group"><td colspan="3">${esc(r.name)} ${r.admin ? `<span class="badge neutral">${icon('admin')}Admin</span>` : ''} ${r.alreadyApplied ? '<span class="badge ok">Already applied</span>' : ''}</td></tr>${r.changes.map((c) => `<tr class="${c.same ? 'same' : ''}"><td>${esc(c.target)}${c.na ? ' <span class="dim">(not on this PC)</span>' : ''}${c.same ? ' <span class="dim">(already set)</span>' : ''}</td><td class="from">${esc(c.from)}</td><td class="to">${esc(c.to)}</td></tr>`).join('')}`).join('');
      ov.querySelector('.modal-body').innerHTML = `<p class="muted small" style="margin-bottom:8px">Exactly what each tweak would change on this PC, read live from your system.</p><table class="diff"><tr><th>Setting</th><th>Now</th><th>After</th></tr>${html}</table>`;
    },
  });
}

export async function upgradeModal(required = 'plus', reason = '') {
  const plans = (S.app && S.app.plans) || [];
  const rank = (p) => ['free', 'plus', 'pro', 'ultra', 'lifetime'].indexOf(p);
  const body = `${reason ? `<div class="note info" style="margin-bottom:14px">${icon('lock')}<div>${esc(reason)}</div></div>` : ''}
    <div class="grid g3">${plans.filter((p) => rank(p.id) >= rank(required)).slice(0, 3).map((p) => `<div class="card pad plan ${p.id === 'pro' ? 'featured' : ''}"><h3>${esc(p.name)}</h3><div class="price">${esc(p.price)}</div><ul>${p.features.map((f) => `<li>${icon('check')}${esc(f)}</li>`).join('')}</ul></div>`).join('')}</div>
    <p class="muted small" style="margin-top:14px">Buying is done on the Woof Services website (it opens a ticket — PayPal, Cash App, crypto, bank transfer or gift card). Your plan unlocks in the app as soon as it's granted — just stay logged in.</p>`;
  const v = await modal({ title: `Unlock with ${PLAN_NAME[required]}`, icon: 'crown', wide: true, body, actions: [{ label: 'Compare all plans', kind: 'ghost', value: 'compare' }, { label: 'Get it on the website', kind: 'primary', icon: 'external', value: 'buy' }] });
  if (v === 'buy') api.openExternal(`${(S.app && S.app.site) || 'https://woof-services.stream'}/tweaks#plans`);
  if (v === 'compare') go('upgrade');
}

// ---------- login ----------
export async function loginFlow() {
  let off = null;
  const result = await modal({
    title: 'Log in to Woof Tweaks', icon: 'user', body: '<div class="center" style="padding:10px 0"><div class="skel" style="height:64px;max-width:320px;margin:0 auto"></div><p class="muted" style="margin-top:12px">Getting a login code…</p></div>',
    actions: [{ label: 'Cancel', kind: 'ghost', value: null }],
    onMount: async (ov, done) => {
      off = api.onAuth((s) => {
        if (s.status === 'approved') { toast('success', `Logged in${s.name ? ` as ${s.name}` : ''}`, `Your plan: ${PLAN_NAME[s.plan] || 'Good'}`); done('ok'); }
        else if (s.status === 'denied') { ov.querySelector('.modal-body').innerHTML = `<div class="note warn">${icon('alert')}<div>The login was denied on the website.</div></div>`; }
        else if (s.status === 'expired') { ov.querySelector('.modal-body').innerHTML = `<div class="note warn">${icon('alert')}<div>The code expired. Close this and click Log in again.</div></div>`; }
      });
      const r = await api.login();
      if (!r || !r.ok) { ov.querySelector('.modal-body').innerHTML = `<div class="note danger">${icon('alert')}<div>${esc((r && r.error) || 'Couldn\'t reach woof-services.stream. Check your internet connection.')}</div></div>`; return; }
      ov.querySelector('.modal-body').innerHTML = `<div class="center"><p class="muted">Your browser opened <b>woof-services.stream</b>. Sign in there and approve this code:</p>
        <div class="mono" style="font-size:34px;font-weight:800;letter-spacing:.18em;margin:16px auto;padding:14px;border-radius:14px;border:1px dashed rgba(var(--accent-rgb),.5);background:rgba(var(--accent-rgb),.08);max-width:340px">${esc(r.code)}</div>
        <div class="row" style="justify-content:center;gap:8px"><span class="btn ghost sm"><span class="spin"></span>Waiting for approval…</span><button class="btn sm" id="reopen">${icon('external', 'sm')}Open the page again</button></div>
        <p class="dim tiny" style="margin-top:12px">The code works for 10 minutes. Only approve it if it matches what you see here.</p></div>`;
      ov.querySelector('#reopen').onclick = () => api.openExternal(r.url);
    },
  });
  if (off) off();
  if (result !== 'ok') api.cancelLogin();
  await reloadEverything();
}

// ---------- events ----------
function bindGlobal() {
  document.addEventListener('click', async (e) => {
    const goEl = e.target.closest('[data-go]');
    if (goEl) { go(goEl.dataset.go, goEl.dataset.param ? { id: goEl.dataset.param } : {}); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const card = a.closest('.tweak');
    const id = card && card.dataset.id;
    switch (a.dataset.action) {
      case 'login': return loginFlow();
      case 'upgrade': return upgradeModal(a.dataset.plan || 'plus');
      case 'expand': { card.classList.toggle('open'); a.setAttribute('aria-expanded', card.classList.contains('open')); return; }
      case 'preview-one': return previewModal([id]);
      default:
    }
  });
  document.addEventListener('change', async (e) => {
    const tg = e.target.closest('[data-toggle]');
    if (!tg) return;
    const id = tg.dataset.toggle;
    const tw = S.tweakMap.get(id);
    tg.checked = !tg.checked; // the flow re-renders with the real state
    if (!tw) return;
    if (tw.locked) return upgradeModal(tw.tier, `“${tw.name}” is part of the ${PLAN_NAME[tw.tier]} plan.`);
    if (tw.applied) return revertFlow([id], { title: `Reverting ${tw.name}` });
    if (tw.status === 'optimised' && !tw.applied) return toast('info', 'Already set', 'This setting already has the optimised value — nothing to do.');
    return applyFlow([id], { title: tw.name });
  });
  const search = () => $('#search');
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const s = search(); if (s) { s.focus(); s.select(); } }
    if (e.altKey && /^[1-9]$/.test(e.key)) { const ids = NAV.flatMap(([, items]) => items.map(([i]) => i)); const p = ids[Number(e.key) - 1]; if (p) { e.preventDefault(); go(p); } }
  });
  document.addEventListener('input', debounce((e) => {
    if (e.target.id !== 'search') return;
    S.query = e.target.value;
    if (S.page !== 'tweaks') go('tweaks'); else render();
    const s = search(); if (s) { s.focus(); const v = s.value; s.value = ''; s.value = v; }
  }, 120));
  api.onBusy((b) => { S.busy = !!b.busy; renderFooter(); });
  api.onRegistry(async () => { await loadTweaks(); const g = await api.games(); if (Array.isArray(g)) S.games = g; await refreshScan(); render(); });
  api.onToast((tt) => toast(tt.type || 'info', tt.title, tt.message));
  api.onAuth(async (s) => { if (s.status === 'refreshed' || s.status === 'signed-out') { S.session = { ...S.session, ...s }; const st = await api.state(); S.app = st; S.session = st.session; renderShell(); render(); if (s.reason) toast('warn', 'Logged out', s.reason); } });
  api.onUpdate((u) => { if (S.app) S.app.update = u; if (u.status === 'ready') toast('success', `Update ${u.version} is ready`, u.critical ? 'This update is required — it installs when you restart.' : 'It installs the next time you quit.', { action: { label: 'Restart now', run: () => api.installUpdate() }, ms: 20000 }); if (u.status === 'available') toast('info', `Update ${u.version} available`, 'Auto-update is off.', { action: { label: 'Download', run: () => api.downloadUpdate() }, ms: 20000 }); if (S.page === 'settings') render(); });
  api.onWatcher((w) => { if (w.type === 'start') toast('info', `${w.name || 'Game'} started`, 'Game Mode Watcher applied its profile.'); if (w.type === 'stop') toast('info', 'Game closed', 'Watcher reverted what it applied.'); });
  api.onFinishing(() => {
    const f = document.createElement('div');
    f.className = 'finishing';
    f.innerHTML = `<div class="brand-mark" style="width:56px;height:56px;border-radius:16px;margin:0 auto">${PAW}</div><h2>Finishing safely…</h2><p class="muted">Woof Tweaks is completing the current change so nothing is left half-done. It will close in a moment.</p><div class="progress indeterminate" style="width:260px;margin:0 auto"><i></i></div>`;
    document.body.appendChild(f);
  });
}

// Critical update gate: a release marked [critical] must be installed before continuing.
function criticalGate() {
  const u = S.app && S.app.update;
  if (!u || !u.critical || !['downloading', 'ready'].includes(u.status)) return;
  modal({ title: 'Important update required', icon: 'download', dismissable: false, body: `<p>Version ${esc(u.version)} fixes a critical problem. It ${u.status === 'ready' ? 'is ready to install' : 'is downloading'} — the app will restart once.</p>`, actions: [{ label: u.status === 'ready' ? 'Restart and update' : 'Downloading…', kind: 'primary', disabled: u.status !== 'ready', run: () => api.installUpdate() }] });
}

// ---------- boot ----------
(async function boot() {
  bindGlobal();
  document.getElementById('app').innerHTML = `<div class="finishing" style="background:var(--bg)"><div class="brand-mark" style="width:56px;height:56px;border-radius:16px;margin:0 auto">${PAW}</div><p class="muted">Loading Woof Tweaks…</p></div>`;
  await loadAll();
  criticalGate();
  if (!S.settings.onboarded) onboarding();
  else if (S.settings.lastSeenVersion !== S.info.version) whatsNew();
})();
