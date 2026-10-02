'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let scanData = {};
let selectedGame = null;

// ---- Navigation ----
$$('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.page').forEach((p) => p.classList.remove('active'));
    $(`#page-${btn.dataset.page}`).classList.add('active');
    if (btn.dataset.page === 'tweaks') loadTweaks();
    if (btn.dataset.page === 'status') loadStatus();
  });
});

// ---- Toast ----
function toast(msg, type = 'success') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ---- Games ----
async function loadGames() {
  const profiles = await woof.listProfiles();
  const grid = $('#games-grid');
  grid.innerHTML = '';
  for (const p of profiles) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.dataset.id = p.id;
    card.innerHTML = `<div class="game-icon">${p.icon}</div><div class="game-name">${p.name}</div><div class="game-count">${p.tweakIds.length} tweaks</div>`;
    card.addEventListener('click', () => {
      $$('.game-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedGame = p.id;
    });
    grid.appendChild(card);
  }
}

$('#btn-full-optimize').addEventListener('click', async () => {
  if (selectedGame) {
    const r = await woof.applyProfile(selectedGame);
    if (r.ok) toast(`${selectedGame} profile applied!`);
    else toast(`Some tweaks failed`, 'error');
  } else {
    const r = await woof.fullOptimize();
    if (r.ok) toast('Full optimization applied!');
    else toast('Some tweaks need a higher plan or elevation', 'error');
  }
  loadStatus();
});

$('#btn-revert-all').addEventListener('click', async () => {
  const r = await woof.revertAll();
  if (r.ok) toast('All tweaks reverted to defaults');
  else toast('Some tweaks could not be reverted', 'error');
  loadStatus();
});

// ---- All Tweaks ----
async function loadTweaks() {
  const tweaks = await woof.listTweaks();
  scanData = await woof.scan();
  const list = $('#tweaks-list');
  list.innerHTML = '';
  const cats = {};
  for (const t of tweaks) {
    if (!cats[t.category]) cats[t.category] = [];
    cats[t.category].push(t);
  }
  const catNames = { fps: 'More FPS', cpu: 'CPU & RAM', gpu: 'GPU Profiles', picture: 'Picture Quality', network: 'Internet & Ping', stability: 'Crash & Stutter Fixes' };
  for (const [cat, items] of Object.entries(cats)) {
    const h = document.createElement('div');
    h.className = 'cat-header';
    h.textContent = catNames[cat] || cat;
    list.appendChild(h);
    for (const t of items) {
      const applied = scanData[t.id]?.applied;
      const row = document.createElement('div');
      row.className = 'tweak-row';
      row.innerHTML = `
        <input type="checkbox" class="tweak-check" data-id="${t.id}" ${applied ? 'checked' : ''}>
        ${applied ? '<div class="tweak-applied" title="Applied"></div>' : ''}
        <div class="tweak-info"><div class="tweak-name">${t.name}</div><div class="tweak-desc">${t.desc}</div></div>
        ${t.plan !== 'free' ? `<span class="tweak-tag${t.elevated ? ' locked' : ''}">${t.plan}${t.elevated ? ' + admin' : ''}</span>` : ''}
      `;
      list.appendChild(row);
    }
  }
}

$('#btn-apply-selected').addEventListener('click', async () => {
  const ids = $$('.tweak-check:checked').map((c) => c.dataset.id);
  if (ids.length === 0) { toast('Select tweaks to apply', 'error'); return; }
  const r = await woof.apply(ids);
  const ok = r.results?.filter((x) => x.ok).length || 0;
  const fail = r.results?.filter((x) => !x.ok).length || 0;
  toast(`${ok} applied${fail ? `, ${fail} skipped` : ''}`);
  loadTweaks();
});

$('#btn-revert-selected').addEventListener('click', async () => {
  const ids = $$('.tweak-check:checked').map((c) => c.dataset.id);
  if (ids.length === 0) { toast('Select tweaks to revert', 'error'); return; }
  const r = await woof.revert(ids);
  toast(`Reverted ${r.results?.filter((x) => x.ok).length || 0} tweaks`);
  loadTweaks();
});

// ---- Status ----
async function loadStatus() {
  scanData = await woof.scan();
  const tweaks = await woof.listTweaks();
  const list = $('#status-list');
  list.innerHTML = '';
  const applied = [];
  const defaults = [];
  for (const t of tweaks) {
    const s = scanData[t.id];
    if (!s) continue;
    (s.applied ? applied : defaults).push({ ...t, ...s });
  }
  if (applied.length > 0) {
    const h = document.createElement('div');
    h.className = 'cat-header';
    h.textContent = `Optimised (${applied.length})`;
    list.appendChild(h);
    for (const t of applied) {
      const row = document.createElement('div');
      row.className = 'status-row';
      row.innerHTML = `<div class="status-dot on"></div><span class="status-label">${t.name}</span><span class="status-value">optimised</span>`;
      list.appendChild(row);
    }
  }
  if (defaults.length > 0) {
    const h = document.createElement('div');
    h.className = 'cat-header';
    h.textContent = `At default (${defaults.length})`;
    list.appendChild(h);
    for (const t of defaults) {
      const row = document.createElement('div');
      row.className = 'status-row';
      row.innerHTML = `<div class="status-dot off"></div><span class="status-label">${t.name}</span><span class="status-value">default</span>`;
      list.appendChild(row);
    }
  }
  $('#backup-info').textContent = `${applied.length} tweak${applied.length !== 1 ? 's' : ''} applied. Backup stored locally — click "Revert All" to undo everything.`;
}

// ---- Settings ----
$('#btn-settings').addEventListener('click', () => $('#settings-modal').classList.remove('hidden'));
$('#btn-close-settings').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
$('.modal-bg')?.addEventListener('click', () => $('#settings-modal').classList.add('hidden'));

$('#set-autoupdate').addEventListener('change', (e) => woof.setSetting('autoUpdate', e.target.checked));
$('#set-startup').addEventListener('change', (e) => woof.setSetting('launchOnStartup', e.target.checked));
$('#btn-logout').addEventListener('click', async () => {
  await woof.logout();
  updateSession();
  $('#settings-modal').classList.add('hidden');
});
$('#btn-upgrade').addEventListener('click', () => woof.openExternal('https://woof-services.stream/tweaks#plans'));

// ---- Login ----
$$('.login-btn').forEach((btn) => {
  btn.addEventListener('click', () => woof.login(btn.dataset.method));
});
$('#btn-skip-login').addEventListener('click', () => {
  woof.setSetting('skippedLogin', true);
  $('#login-overlay').classList.add('hidden');
});

// ---- Update ----
woof.onUpdateAvailable((info) => {
  $('#update-version').textContent = `v${info.version}`;
  $('#update-banner').classList.remove('hidden');
});
$('#btn-update')?.addEventListener('click', () => woof.installUpdate());
$('#btn-dismiss-update')?.addEventListener('click', () => $('#update-banner').classList.add('hidden'));

// ---- Init ----
async function updateSession() {
  const session = await woof.session();
  if (session) {
    $('#login-overlay').classList.add('hidden');
    $('#plan-badge').textContent = session.plan || 'Free';
    $('#set-plan').textContent = session.plan || 'Free';
  } else {
    const skipped = await woof.getSetting('skippedLogin');
    if (!skipped) $('#login-overlay').classList.remove('hidden');
  }
}

async function init() {
  $('#set-version').textContent = `v${woof.version}`;
  const au = await woof.getSetting('autoUpdate');
  if (au !== undefined) $('#set-autoupdate').checked = au;
  await updateSession();
  await loadGames();
  woof.plan().catch(() => {});
}

init();
