import { icon } from '../icons.js';
import { esc, plural, copy } from '../util.js';
import { gameArt, tweakCard, empty, PLAN_NAME } from '../components.js';
import { S, applyFlow, revertFlow, go, toast, modal, upgradeModal, feature, render as renderApp, setSetting, reloadEverything } from '../app.js';

const api = window.woof;
let filter = 'all';

const PLATFORM_LABEL = { steam: 'Steam launch options', linux: 'Steam launch options (Linux)', minecraft: 'Minecraft JVM arguments' };

function grid() {
  let list = S.games.filter((g) => g.id !== 'general');
  if (filter === 'installed') list = list.filter((g) => g.installed);
  if (filter === 'unlocked') list = list.filter((g) => !g.locked);
  if (filter === 'custom') list = list.filter((g) => g.custom);
  list.sort((a, b) => Number(!!b.installed) - Number(!!a.installed) || Number(a.locked) - Number(b.locked));
  const general = S.games.find((g) => g.id === 'general');
  const installedN = S.games.filter((g) => g.installed).length;
  return `<div class="page">
    <div class="page-head"><div><h1>Games</h1><p>Pick a game and Woof Tweaks tunes your whole PC for it in one click. ${installedN ? `We found <b>${installedN}</b> installed.` : 'Installed games are detected automatically (Steam, Epic, Riot, Battle.net, EA, Ubisoft, Xbox, Minecraft, Roblox).'}</p></div>
      <div class="actions"><button class="btn" id="redetect">${icon('refresh', 'sm')}Re-scan games</button><button class="btn" id="custom-new">${icon('plus', 'sm')}Custom profile</button></div></div>
    <div class="row wrap" style="gap:8px;margin-bottom:14px"><div class="chips">
      ${[['all', 'All games'], ['installed', `Installed (${installedN})`], ['unlocked', 'Unlocked on my plan'], ['custom', 'My profiles']].map(([v, l]) => `<button class="chip ${filter === v ? 'on' : ''}" data-gf="${v}">${l}</button>`).join('')}</div></div>
    ${general && filter === 'all' ? `<button class="game" style="min-height:0;flex-direction:row;margin-bottom:14px" data-open="general">${gameArt(general, '').replace('class="game-art ', 'style="width:150px;height:auto" class="game-art ')}<div class="game-body" style="justify-content:center"><div class="game-name">General — all games</div><div class="game-meta">A safe set that helps every game · ${general.tweakIds.length} tweaks</div></div><div style="align-self:center;padding-right:14px"><span class="btn primary sm" data-optimise="general">${icon('bolt', 'sm')}Optimise</span></div></button>` : ''}
    ${list.length ? `<div class="games-grid">${list.map(card).join('')}</div>` : empty('gamepad', filter === 'installed' ? 'No installed games found' : 'Nothing here yet', filter === 'installed' ? 'Install a game, then click Re-scan games. You can still use any profile below.' : 'Create a custom profile for any game.', filter === 'custom' ? `<button class="btn primary" id="custom-new2">${icon('plus', 'sm')}Create one</button>` : '')}
  </div>`;
}

function card(g) {
  const n = g.tweakIds.length + g.extraIds.length;
  return `<button class="game ${g.locked ? 'locked' : ''} ${g.supported === false ? 'dim' : ''}" data-open="${esc(g.id)}" aria-label="${esc(g.name)}">
    ${gameArt(g)}
    <div class="corner">${g.installed ? `<span class="badge installed">${icon('check')}Installed</span>` : ''}${g.locked ? `<span class="badge lock">${icon('lock')}${PLAN_NAME[g.tier]}</span>` : ''}</div>
    <div class="game-body">
      <div class="game-name">${esc(g.name)}</div>
      <div class="game-meta"><span>${esc(g.genre || '')}</span><span>·</span><span>${plural(n, 'tweak')}</span>${g.installed ? `<span>·</span><span>${esc(g.installed.source)}</span>` : ''}</div>
      <span class="btn sm ${g.locked ? '' : 'primary'} optimise" data-optimise="${esc(g.id)}">${g.locked ? `${icon('lock', 'sm')}Unlock` : `${icon('bolt', 'sm')}Optimise`}</span>
    </div></button>`;
}

function detail(g) {
  const tweaks = [...g.tweakIds, ...g.extraIds].map((id) => S.tweakMap.get(id)).filter(Boolean);
  const applied = tweaks.filter((t) => t.applied).length;
  const lockedN = tweaks.filter((t) => t.locked).length;
  const opts = Object.entries(g.launchOptions || {});
  const watcherOn = (S.settings.watcherGames || []).includes(g.id);
  return `<div class="page">
    <button class="btn ghost sm" id="back" style="margin-bottom:10px">${icon('chevron-left', 'sm')}All games</button>
    <div class="detail-hero">${gameArt(g)}<div class="inner">
      <div style="flex:1;min-width:240px"><h1>${esc(g.name)}</h1><div class="sub">${esc(g.genre || '')}${g.antiCheat ? ` · Anti-cheat: ${esc(g.antiCheat)}` : ''}${g.installed ? ` · Installed via ${esc(g.installed.source)}` : ' · Not detected on this PC'}</div></div>
      <div class="row wrap" style="gap:8px">
        ${g.locked ? `<button class="btn primary lg" data-action="upgrade" data-plan="${g.tier}">${icon('lock', 'sm')}Unlock with ${PLAN_NAME[g.tier]}</button>`
          : `<button class="btn primary lg" id="opt">${icon('bolt')}Optimise for ${esc(g.short || g.name)}</button>${applied ? `<button class="btn lg" id="undo">${icon('undo')}Undo (${applied})</button>` : ''}`}
      </div></div></div>
    ${g.supported === false ? `<div class="note warn" style="margin-bottom:14px">${icon('alert')}<div>${esc(g.name)} isn't available for ${esc(S.info.osName)} (often because its anti-cheat blocks it). The profile is shown for reference.</div></div>` : ''}
    <div class="grid g2" style="align-items:start">
      <div class="col">
        <div class="card pad">
          <div class="row" style="margin-bottom:8px"><h2>What this profile changes</h2><span class="spacer"></span><span class="dim small">${applied}/${tweaks.length} applied${lockedN ? ` · ${lockedN} locked` : ''}</span></div>
          <p class="muted small" style="margin-bottom:10px">Each one is a normal Woof Tweaks tweak — toggle any of them on or off yourself.</p>
          <div class="tweak-list">${tweaks.map((t) => tweakCard(t)).join('') || '<p class="dim">No tweaks for this OS.</p>'}</div>
        </div>
      </div>
      <div class="col">
        ${(g.settings || []).length ? `<div class="card pad"><h2>Recommended in-game settings</h2><p class="muted small" style="margin:4px 0 10px">Set these inside the game. They're the biggest FPS/latency wins for ${esc(g.short || g.name)}.</p>
          <table class="settings">${g.settings.map((s) => `<tr><td>${esc(s.setting)}</td><td>${esc(s.value)}</td><td class="muted">${esc(s.why || '')}</td></tr>`).join('')}</table>
          ${g.id === 'minecraft' ? `<div class="row wrap" style="gap:8px;margin-top:12px"><button class="btn sm" id="mc-write">${icon('file', 'sm')}Write these to options.txt</button><button class="btn sm ghost" id="mc-restore">${icon('undo', 'sm')}Restore my original options.txt</button></div><p class="dim tiny" style="margin-top:6px">Close Minecraft first. Your original file is backed up.</p>` : ''}</div>` : ''}
        ${opts.length ? `<div class="card pad"><h2>Launch options</h2>${opts.map(([k, v]) => `<div style="margin-top:10px"><div class="dim tiny strong" style="margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em">${esc(PLATFORM_LABEL[k] || k)}</div><div class="copybox"><code>${esc(v)}</code><button class="btn sm" data-copy="${esc(v)}">${icon('copy', 'sm')}Copy</button></div></div>`).join('')}</div>` : ''}
        <div class="card pad col" style="gap:8px">
          <h2>Tools</h2>
          ${g.installed && g.installed.shaderCache ? `<div class="row"><div style="flex:1"><b>Clear this game's Steam shader cache</b><div class="dim small">Fixes stutter after driver updates. Close the game first.</div></div><button class="btn sm" id="shader">${icon('trash', 'sm')}Clear</button></div>` : ''}
          <div class="row"><div style="flex:1"><b>Best server region</b><div class="dim small">Ping to the cloud regions near ${esc(g.short || g.name)}'s servers (an estimate).</div></div><button class="btn sm" id="regions">${feature('watcher').allowed || S.session.plan !== 'free' ? '' : ''}${icon('pin', 'sm')}Test</button></div>
          <div id="region-out"></div>
          <div class="row"><div style="flex:1"><b>Auto-apply when ${esc(g.short || g.name)} starts</b><div class="dim small">Game Mode Watcher applies this profile when the game launches and undoes it when it closes.${feature('watcher').allowed ? '' : ` <span class="badge lock">${icon('lock')}${PLAN_NAME[feature('watcher').tier]}</span>`}</div></div><label class="switch"><input type="checkbox" id="watch" ${watcherOn ? 'checked' : ''}><span class="track"></span><span class="thumb"></span></label></div>
          ${g.custom ? `<div class="row"><div style="flex:1"><b>Custom profile</b></div><button class="btn sm" id="c-edit">Edit</button><button class="btn sm danger" id="c-del">Delete</button></div>` : ''}
        </div>
        ${(g.notes || []).length ? `<div class="card pad"><h2>Good to know</h2>${g.notes.map((n) => `<div class="note info" style="margin-top:8px">${icon('info')}<div>${esc(n)}</div></div>`).join('')}</div>` : ''}
      </div>
    </div></div>`;
}

export function render() {
  const g = S.params.id && S.games.find((x) => x.id === S.params.id);
  if (S.params.id && !g) return grid();
  return g ? detail(g) : grid();
}

async function optimise(g) {
  if (g.locked) return upgradeModal(g.tier, `${g.name} is part of the ${PLAN_NAME[g.tier]} plan.`);
  const ids = [...g.tweakIds, ...g.extraIds];
  return applyFlow(ids, { title: `Optimise for ${g.name}`, force: true });
}

async function customEditor(existing) {
  if (!feature('customGameProfile').allowed) return upgradeModal(feature('customGameProfile').tier, 'Custom game profiles are part of the Plus plan.');
  const pool = S.tweaks.filter((t) => !t.locked && !t.hidden && t.status !== 'na' && !t.game && t.category !== 'startup');
  const chosen = new Set(existing ? [...existing.tweakIds] : []);
  const v = await modal({
    title: existing ? `Edit ${existing.name}` : 'New custom game profile', icon: 'gamepad', wide: true,
    body: `<div class="grid g2" style="margin-bottom:12px"><label class="col" style="gap:4px"><span class="small strong">Profile name</span><input class="input" id="c-name" maxlength="40" value="${esc(existing ? existing.name : '')}" placeholder="e.g. My MMO"></label>
      <label class="col" style="gap:4px"><span class="small strong">Game process (optional, for auto-apply)</span><input class="input" id="c-proc" maxlength="80" value="${esc(existing && existing.processes ? existing.processes[0] || '' : '')}" placeholder="e.g. Game.exe"></label></div>
      <p class="small muted" style="margin-bottom:8px">Pick the tweaks this profile should apply:</p>
      <div style="max-height:340px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:6px">${pool.map((t) => `<label class="row small" style="gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px"><input type="checkbox" data-c="${esc(t.id)}" ${chosen.has(t.id) ? 'checked' : ''}><span class="ellipsis">${esc(t.name)}</span></label>`).join('')}</div>`,
    actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Save profile', kind: 'primary', value: 'save', run: (ov) => { const n = ov.querySelector('#c-name').value.trim(); if (!n) { ov.querySelector('#c-name').focus(); return false; } ov.dataset.out = JSON.stringify({ id: existing && existing.id, name: n, process: ov.querySelector('#c-proc').value.trim() || null, tweakIds: [...ov.querySelectorAll('[data-c]:checked')].map((x) => x.dataset.c) }); return true; } }],
    onMount: (ov) => { ov.addEventListener('click', () => {}); window.__lastCustom = ov; },
  });
  if (v !== 'save') return;
  const data = JSON.parse(window.__lastCustom.dataset.out || '{}');
  const r = await api.saveCustomGame(data);
  if (r && r.ok) { toast('success', 'Profile saved'); await reloadEverything(); go('games', { id: r.id }); } else toast('error', 'Couldn\'t save', r && r.error);
}

export function mount(root) {
  root.querySelectorAll('[data-gf]').forEach((b) => { b.onclick = () => { filter = b.dataset.gf; renderApp(); }; });
  root.querySelectorAll('[data-open]').forEach((b) => { b.onclick = (e) => { if (e.target.closest('[data-optimise]')) return; go('games', { id: b.dataset.open }); }; });
  root.querySelectorAll('[data-optimise]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const g = S.games.find((x) => x.id === b.dataset.optimise); if (g) optimise(g); }; });
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  on('#redetect', async () => { toast('info', 'Looking for installed games…'); const g = await api.redetectGames(); if (Array.isArray(g)) S.games = g; await reloadEverything(); toast('success', `${S.games.filter((x) => x.installed).length} games found`); });
  on('#custom-new', () => customEditor()); on('#custom-new2', () => customEditor());
  const g = S.params.id && S.games.find((x) => x.id === S.params.id);
  if (!g) return;
  on('#back', () => go('games'));
  on('#opt', () => optimise(g));
  on('#undo', () => revertFlow([...g.tweakIds, ...g.extraIds].filter((id) => S.tweakMap.get(id) && S.tweakMap.get(id).applied), { title: `Undoing ${g.name}`, confirm: true }));
  root.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = async () => { if (await copy(b.dataset.copy)) { b.innerHTML = `${icon('check', 'sm')}Copied`; setTimeout(() => { b.innerHTML = `${icon('copy', 'sm')}Copy`; }, 1500); } }; });
  on('#shader', async () => { const v = await modal({ title: `Clear ${g.name}'s shader cache?`, icon: 'trash', body: '<p class="muted">Close the game first. It rebuilds its shaders next launch (a little stutter for a few minutes).</p>', actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Clear', kind: 'primary', value: 'go' }] }); if (v !== 'go') return; const r = await api.clearGameShaders(g.id); if (r && r.ok) toast('success', 'Shader cache cleared', `Freed ${(r.freed / 1048576).toFixed(0)} MB`); else toast('error', 'Couldn\'t clear it', r && r.error); });
  on('#regions', async () => {
    const out = root.querySelector('#region-out');
    out.innerHTML = '<div class="progress indeterminate"><i></i></div>';
    const r = await api.regionPing(g.id);
    if (!r || !r.ok) { out.innerHTML = ''; if (r && r.code === 'plan') return upgradeModal(r.requiredPlan, r.error); return toast('error', 'Region test failed', r && r.error); }
    const max = Math.max(...r.results.filter((x) => x.ms).map((x) => x.ms), 1);
    out.innerHTML = `<div class="col" style="gap:2px">${r.results.slice(0, 6).map((x, i) => `<div class="rank"><b>${i + 1}</b><div><div class="small strong">${esc(x.name)}</div><div class="bar2" style="width:${x.ms ? Math.max(4, (x.ms / max) * 100) : 0}%"></div></div><span class="mono small">${x.ms != null ? `${x.ms} ms` : 'timeout'}</span></div>`).join('')}</div><p class="dim tiny" style="margin-top:6px">Pick the closest region in ${esc(g.short || g.name)}'s matchmaking settings where it lets you.</p>`;
  });
  const w = root.querySelector('#watch');
  if (w) w.onchange = async () => {
    if (!feature('watcher').allowed) { w.checked = false; return upgradeModal(feature('watcher').tier, 'Game Mode Watcher is part of the Pro plan.'); }
    const list = new Set(S.settings.watcherGames || []);
    if (w.checked) list.add(g.id); else list.delete(g.id);
    await setSetting('watcherGames', [...list]);
    if (w.checked && !S.settings.watcherEnabled) await setSetting('watcherEnabled', true);
    toast('success', w.checked ? `Watching for ${g.name}` : 'Auto-apply off');
  };
  on('#mc-write', async () => { const r = await api.writeMinecraftOptions(); if (r && r.ok) toast('success', 'options.txt updated', 'Your original is backed up.'); else if (r && r.code === 'plan') upgradeModal(r.requiredPlan, r.error); else toast('error', 'Couldn\'t write options.txt', r && r.error); });
  on('#mc-restore', async () => { const r = await api.restoreMinecraftOptions(); if (r && r.ok) toast('success', 'Original options.txt restored'); else toast('error', 'Nothing to restore', r && r.error); });
  on('#c-edit', () => customEditor({ id: g.id, name: g.name, tweakIds: g.tweakIds, processes: g.processes }));
  on('#c-del', async () => { await api.deleteCustomGame(g.id); await reloadEverything(); go('games'); toast('success', 'Profile deleted'); });
}
