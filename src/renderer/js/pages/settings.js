import { icon } from '../icons.js';
import { esc, when } from '../util.js';
import { PLAN_NAME } from '../components.js';
import { LANGUAGES } from '../i18n.js';
import { S, setSetting, applyTheme, toast, modal, loginFlow, reloadEverything, feature, upgradeModal, go } from '../app.js';
import { whatsNew } from '../changelog.js';

const api = window.woof;
const ACCENTS = ['#8b7bff', '#5b8cff', '#22c3e6', '#3ddc97', '#ffb547', '#ff6b81', '#ff7ad9', '#a3e635'];

const sw = (id, on, disabled = false) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span><span class="thumb"></span></label>`;
const lockBadge = (f) => (feature(f).allowed ? '' : ` <span class="badge lock">${icon('lock')}${PLAN_NAME[feature(f).tier]}</span>`);

export function render() {
  const s = S.settings; const se = S.session; const u = (S.app && S.app.update) || {};
  const win = S.info.platform === 'win32';
  const updText = { dev: 'Development build — updates are off', checking: 'Checking…', latest: 'You\'re up to date', available: `Version ${u.version} is available`, downloading: `Downloading ${u.version}… ${u.progress || 0}%`, ready: `Version ${u.version} is ready — it installs when you quit`, error: `Couldn't check: ${u.error || ''}`, idle: '' }[u.status] || '';
  return `<div class="page">
    <div class="page-head"><div><h1>Settings</h1><p>Woof Tweaks v${esc(S.info.version)} · ${esc(S.info.osName)}</p></div></div>
    <div class="grid g2" style="align-items:start">
      <div class="col" style="gap:14px">
        <div class="card set-group"><h2 style="padding-top:12px">Account & plan</h2>
          <div class="set-row"><div class="l"><b>${se.signedIn ? esc(se.name || 'Logged in') : 'Not logged in'}</b><span>${se.signedIn ? `Plan: <b>${PLAN_NAME[se.plan]}</b>${se.checkedAt ? ` · checked ${esc(when(new Date(se.checkedAt).toISOString()))}` : ''}` : 'The Good plan works without an account. Log in to use a paid plan.'}</span></div>
            ${se.signedIn ? `<button class="btn sm" id="refresh-plan">${icon('refresh', 'sm')}Refresh</button><button class="btn sm ghost" id="logout">${icon('logout', 'sm')}Log out</button>` : `<button class="btn sm primary" id="login">${icon('user', 'sm')}Log in</button>`}</div>
          <div class="set-row"><div class="l"><b>Manage plan</b><span>Upgrades are bought on the website (it opens a ticket).</span></div><button class="btn sm" data-go="upgrade">${icon('crown', 'sm')}Plans</button></div>
          <div class="set-row"><div class="l"><b>Cloud sync${lockBadge('cloudSync')}</b><span>Back up your presets and custom game profiles to your account.</span></div><button class="btn sm" id="push">${icon('upload', 'sm')}Upload</button><button class="btn sm" id="pull">${icon('download', 'sm')}Download</button></div>
        </div>
        <div class="card set-group"><h2 style="padding-top:12px">Appearance</h2>
          <div class="set-row"><div class="l"><b>Theme</b></div><div class="tabs">${[['dark', 'Dark'], ['amoled', 'AMOLED'], ['light', 'Light']].map(([v, l]) => `<button class="tab ${(s.theme || 'dark') === v ? 'on' : ''}" data-theme-set="${v}">${l}</button>`).join('')}</div></div>
          <div class="set-row"><div class="l"><b>Accent colour</b></div><div class="swatches">${ACCENTS.map((c) => `<button class="swatch ${(s.accent || '#8b7bff') === c ? 'on' : ''}" style="background:${c}" data-accent="${c}" aria-label="Accent ${c}"></button>`).join('')}</div></div>
          <div class="set-row"><div class="l"><b>Reduce animations</b><span>Turn off motion in the app.</span></div>${sw('s-motion', s.reduceMotion)}</div>
          <div class="set-row"><div class="l"><b>Language</b></div><select class="select" id="s-lang">${LANGUAGES.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></div>
        </div>
        <div class="card set-group"><h2 style="padding-top:12px">Safety</h2>
          ${win ? `<div class="set-row"><div class="l"><b>Restore point before changes</b><span>Creates a Windows restore point (once a day) before system changes.</span></div>${sw('s-rp', s.autoRestorePoint !== false)}</div>` : ''}
          <div class="set-row"><div class="l"><b>Custom DNS servers</b><span>Used by the "DNS: custom servers" tweak. Up to 4, comma-separated.</span></div><input class="input" id="s-dns" style="width:220px" value="${esc((s.customDns || []).join(', '))}" placeholder="e.g. 192.168.1.2, 1.1.1.1"></div>
        </div>
      </div>
      <div class="col" style="gap:14px">
        <div class="card set-group"><h2 style="padding-top:12px">Game sessions</h2>
          <div class="set-row"><div class="l"><b>Game Mode Watcher${lockBadge('watcher')}</b><span>Auto-applies a game's profile when it starts and undoes it when it closes. Choose games on each game's page.</span></div>${sw('s-watch', s.watcherEnabled)}</div>
          <div class="set-row"><div class="l"><b>Session boost${lockBadge('sessionBoost')}</b><span>While a game runs: High priority for the game, lower priority for the apps below${S.info.platform === 'darwin' ? ', and keep the Mac awake' : ''}.</span></div>${sw('s-boost', s.sessionBoost)}</div>
          <div class="set-row"><div class="l"><b>Lower priority while gaming</b><span>Program names, comma-separated (e.g. chrome.exe, OneDrive.exe).</span></div><input class="input" id="s-low" style="width:220px" value="${esc((s.lowerPriorityApps || []).join(', '))}"></div>
          ${win ? `<div class="set-row"><div class="l"><b>Hold a 0.5 ms timer while gaming${lockBadge('timerResolution')}</b><span>Smoother frame pacing in some games; uses a little more power. Pair with "Allow global timer resolution requests".</span></div>${sw('s-timer', s.timerResolution)}</div>` : ''}
          <div class="set-row"><div class="l"><b>Performance overlay${lockBadge('overlay')}</b><span>A small always-on-top CPU/GPU/RAM/ping box. Shows over borderless/windowed games (not exclusive fullscreen).</span></div>${sw('s-overlay', s.overlay)}</div>
        </div>
        <div class="card set-group"><h2 style="padding-top:12px">App</h2>
          <div class="set-row"><div class="l"><b>Start with ${S.info.platform === 'darwin' ? 'macOS' : S.info.platform === 'win32' ? 'Windows' : 'your desktop'}</b><span>Needed for the Game Mode Watcher to work without opening the app.</span></div>${sw('s-start', s.launchOnStartup)}</div>
          <div class="set-row"><div class="l"><b>Automatic updates</b><span>${esc(updText)}</span></div>${sw('s-auto', s.autoUpdate !== false)}<button class="btn sm" id="check">${icon('refresh', 'sm')}Check</button>${u.status === 'ready' ? `<button class="btn sm primary" id="install">Restart & update</button>` : ''}</div>
          <div class="set-row"><div class="l"><b>What's new</b><span>See the changes in this version.</span></div><button class="btn sm" id="news">${icon('sparkle', 'sm')}Open</button></div>
          <div class="set-row"><div class="l"><b>Logs</b><span>Helpful for support.</span></div><button class="btn sm" id="logs">${icon('folder', 'sm')}Open logs folder</button></div>
          <div class="set-row"><div class="l"><b>Reset the app</b><span>Resets settings. Keeps your backups so you can still revert.</span></div><button class="btn sm danger" id="reset">Reset</button></div>
        </div>
        <div class="card set-group"><h2 style="padding-top:12px">Help & feedback</h2>
          <div class="set-row"><div class="l"><b>Request a tweak or report a bug</b><span>${feature('priorityRequests').allowed ? 'Your requests are marked priority.' : 'Pro and above get priority tweak requests.'}</span></div><button class="btn sm" id="feedback">${icon('chat', 'sm')}Send</button></div>
          <div class="set-row"><div class="l"><b>Support & Discord</b><span>Get help from the Woof Services team.</span></div><button class="btn sm" id="support">${icon('external', 'sm')}Support</button></div>
        </div>
      </div>
    </div></div>`;
}

export function mount(root) {
  const on = (s, ev, fn) => { const el = root.querySelector(s); if (el) el[ev] = fn; };
  const rr = () => { root.innerHTML = render(); mount(root); };
  on('#login', 'onclick', loginFlow);
  on('#logout', 'onclick', async () => { await api.logout(); await reloadEverything(); toast('success', 'Logged out', 'You\'re on the Good plan.'); });
  on('#refresh-plan', 'onclick', async () => { const r = await api.refreshPlan(); await reloadEverything(); toast(r && r.session && r.session.offline ? 'warn' : 'success', r && r.session && r.session.offline ? 'Offline — using your saved plan' : `Plan: ${PLAN_NAME[S.session.plan]}`); });
  on('#push', 'onclick', async () => { const r = await api.syncPush(); if (r && r.ok) toast('success', 'Uploaded to your account'); else if (r && r.code === 'plan') upgradeModal(r.requiredPlan, r.error); else toast('error', 'Sync failed', r && r.error); });
  on('#pull', 'onclick', async () => { const r = await api.syncPull(); if (r && r.ok) { toast('success', 'Downloaded from your account'); await reloadEverything(); } else if (r && r.code === 'plan') upgradeModal(r.requiredPlan, r.error); else toast('error', 'Sync failed', r && r.error); });
  root.querySelectorAll('[data-theme-set]').forEach((b) => { b.onclick = async () => { await setSetting('theme', b.dataset.themeSet); applyTheme(); rr(); }; });
  root.querySelectorAll('[data-accent]').forEach((b) => { b.onclick = async () => { await setSetting('accent', b.dataset.accent); applyTheme(); rr(); }; });
  on('#s-motion', 'onchange', async (e) => { await setSetting('reduceMotion', e.target.checked); applyTheme(); });
  on('#s-lang', 'onchange', async (e) => { await setSetting('language', e.target.value); applyTheme(); });
  const bool = (id, key, after) => on(id, 'onchange', async (e) => { const r = await setSetting(key, e.target.checked); if (!r || !r.ok) e.target.checked = !e.target.checked; else if (after) after(e.target.checked); });
  bool('#s-rp', 'autoRestorePoint'); bool('#s-watch', 'watcherEnabled', (v) => toast('success', v ? 'Game Mode Watcher on' : 'Watcher off', v ? 'Pick games on each game\'s page.' : ''));
  bool('#s-boost', 'sessionBoost'); bool('#s-timer', 'timerResolution'); bool('#s-overlay', 'overlay'); bool('#s-start', 'launchOnStartup'); bool('#s-auto', 'autoUpdate');
  const list = (id, key, test) => on(id, 'onchange', async (e) => { const v = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); if (v.some((x) => !test(x))) return toast('error', 'Check that list', 'One of the entries doesn\'t look right.'); const r = await setSetting(key, v); if (r && r.ok) toast('success', 'Saved'); });
  list('#s-dns', 'customDns', (x) => /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i.test(x));
  list('#s-low', 'lowerPriorityApps', (x) => /^[\w .()+-]{1,80}$/.test(x));
  on('#check', 'onclick', async () => { await api.checkUpdate(); toast('info', 'Checking for updates…'); });
  on('#install', 'onclick', () => api.installUpdate());
  on('#news', 'onclick', whatsNew);
  on('#logs', 'onclick', () => api.openLogs());
  on('#support', 'onclick', () => api.openExternal(`${(S.app && S.app.site) || 'https://woof-services.stream'}/tickets`));
  on('#reset', 'onclick', async () => { const v = await modal({ title: 'Reset Woof Tweaks?', icon: 'alert', body: '<p class="muted">Your settings, presets and custom profiles are cleared and the app restarts. Your backups and login are kept, so you can still revert every change.</p>', actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Reset', kind: 'danger', value: 'go' }] }); if (v === 'go') api.resetApp(); });
  on('#feedback', 'onclick', async () => {
    if (!S.session.signedIn) { toast('info', 'Log in first', 'So we can reply to you.'); return loginFlow(); }
    const v = await modal({ title: 'Request a tweak or report a bug', icon: 'chat', body: `<div class="tabs" style="margin-bottom:10px"><button class="tab on" data-k="request">Tweak request</button><button class="tab" data-k="bug">Bug</button><button class="tab" data-k="idea">Idea</button></div><textarea class="input" id="fb" rows="6" maxlength="2000" style="width:100%" placeholder="What should Woof Tweaks do? Which game/PC?"></textarea>`,
      actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Send', kind: 'primary', value: 'send', run: (ov) => { window.__fb = { kind: (ov.querySelector('.tab.on') || {}).dataset?.k || 'request', text: ov.querySelector('#fb').value }; return window.__fb.text.trim().length >= 5; } }],
      onMount: (ov) => ov.querySelectorAll('[data-k]').forEach((t) => { t.onclick = () => { ov.querySelectorAll('[data-k]').forEach((x) => x.classList.remove('on')); t.classList.add('on'); }; }) });
    if (v !== 'send') return;
    const r = await api.sendFeedback(window.__fb.kind, window.__fb.text);
    if (r && r.ok) toast('success', 'Thanks — sent!', r.priority ? 'Marked as a priority request.' : ''); else toast('error', 'Couldn\'t send', r && r.error);
  });
  const lang = root.querySelector('#s-lang'); if (lang) lang.value = S.settings.language || 'en';
}
