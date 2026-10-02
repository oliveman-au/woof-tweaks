// First-run wizard: detect hardware → choose a game → Safe / Balanced / Max → preview → apply.
import { icon, PAW } from './icons.js';
import { esc, plural } from './util.js';
import { gameArt, PLAN_NAME } from './components.js';
import { S, setSetting, applyFlow, previewModal, loginFlow, go } from './app.js';

const api = window.woof;

export function onboarding() {
  const st = { step: 0, game: 'general', level: 'balanced', presets: null };
  const el = document.createElement('div');
  el.className = 'onb';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.appendChild(el);
  api.presets().then((p) => { st.presets = Array.isArray(p) ? p : []; });

  const finish = async (skip) => { await setSetting('onboarded', true); await setSetting('lastSeenVersion', S.info.version); el.remove(); if (!skip) go('dashboard'); };

  const ids = () => {
    const presetId = { safe: 'safe', balanced: 'balanced', max: 'maxfps' }[st.level];
    const p = (st.presets || []).find((x) => x.id === presetId);
    const g = S.games.find((x) => x.id === st.game);
    const set = new Set([...(p ? p.ids : []), ...(g && !g.locked ? [...g.tweakIds, ...(st.level === 'safe' ? [] : g.extraIds)] : [])]);
    // Safe never includes anything risky, even if the game profile would.
    return [...set].filter((id) => { const t = S.tweakMap.get(id); return t && !t.locked && !t.applied && t.status !== 'na' && !t.blocked && (st.level !== 'safe' || t.risk === 'safe'); });
  };

  const draw = () => {
    const hw = S.hw || {};
    const steps = `<div class="steps">${[0, 1, 2, 3].map((i) => `<i class="${i <= st.step ? 'on' : ''}"></i>`).join('')}</div>`;
    let body = '';
    if (st.step === 0) body = `<div class="center col" style="align-items:center;gap:14px">
        <div class="brand-mark" style="width:64px;height:64px;border-radius:18px">${PAW}</div>
        <h1 style="font-size:30px;letter-spacing:-.02em">Welcome to Woof Tweaks</h1>
        <p class="muted" style="max-width:520px">We'll tune your PC for the games you play. Everything is shown before it changes, backed up first, and can be undone with one click.</p>
        <div class="card pad" style="width:100%;max-width:560px;text-align:left"><div class="row" style="margin-bottom:8px">${icon('cpu')}<b>We detected</b></div>
          ${S.hw ? `<div class="sysinfo"><div class="si"><div class="k">CPU</div><div class="v">${esc(hw.cpu || '—')}</div></div><div class="si"><div class="k">GPU</div><div class="v">${esc(hw.gpu || '—')}</div></div><div class="si"><div class="k">RAM · Disk</div><div class="v">${hw.ramGB || '?'} GB · ${hw.systemDisk === 'hdd' ? 'HDD' : hw.systemDisk === 'ssd' ? 'SSD' : '—'}</div></div></div>${hw.isLaptop ? `<div class="note info" style="margin-top:10px">${icon('battery')}<div>You're on a laptop — we'll avoid tweaks that drain your battery unless you choose Max.</div></div>` : ''}` : '<div class="skel" style="height:64px"></div>'}
        </div></div>`;
    if (st.step === 1) {
      const list = [S.games.find((g) => g.id === 'general'), ...S.games.filter((g) => g.id !== 'general').sort((a, b) => Number(!!b.installed) - Number(!!a.installed) || Number(a.locked) - Number(b.locked))].filter(Boolean);
      body = `<h1 class="center" style="font-size:26px">What do you play most?</h1><p class="muted center" style="margin:6px 0 16px">Installed games are first. You can optimise others later.</p>
        <div class="mini-games">${list.map((g) => `<button class="mini-game ${st.game === g.id ? 'on' : ''}" data-g="${esc(g.id)}" ${g.locked ? 'data-tip="Needs ' + PLAN_NAME[g.tier] + '"' : ''}>${gameArt(g)}<span>${esc(g.id === 'general' ? 'Everything' : g.name)}${g.installed ? ' ✓' : ''}${g.locked ? ' 🔒' : ''}</span></button>`).join('')}</div>`;
    }
    if (st.step === 2) body = `<h1 class="center" style="font-size:26px">How far should we go?</h1><p class="muted center" style="margin:6px 0 16px">You can change any single tweak afterwards.</p>
      <div class="grid g3">${[['safe', 'shield', 'Safe', 'Only zero-risk tweaks. Nothing that needs a restart.'], ['balanced', 'scale', 'Balanced', 'Recommended. Safe + moderate tweaks that help most PCs.'], ['max', 'rocket', 'Max', 'Everything for FPS and latency your plan includes. Uses more power.']].map(([v, ic, t, d]) => `<button class="choice ${st.level === v ? 'on' : ''}" data-l="${v}">${icon(ic, 'lg')}<b>${t}${v === 'balanced' ? ' <span class="badge ok">Recommended</span>' : ''}</b><span class="muted small">${d}</span></button>`).join('')}</div>
      ${S.session.signedIn ? '' : `<p class="center dim small" style="margin-top:14px">Have a paid plan? <button class="btn ghost sm" id="onb-login">Log in</button> to include its tweaks.</p>`}`;
    if (st.step === 3) {
      const list = ids();
      body = `<h1 class="center" style="font-size:26px">Ready to apply ${plural(list.length, 'tweak')}</h1><p class="muted center" style="margin:6px 0 16px">Here's everything that will change. Nothing happens until you click Apply.</p>
        <div class="card pad" style="max-height:300px;overflow:auto">${list.length ? list.map((id) => { const t = S.tweakMap.get(id); return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="badge ${t.risk}">${t.risk}</span><span style="flex:1">${esc(t.name)}</span>${t.admin ? `<span class="badge neutral">${icon('admin')}Admin</span>` : ''}${t.reboot ? `<span class="badge info">${t.reboot === 'signout' ? 'Sign out' : 'Restart'}</span>` : ''}</div>`; }).join('') : '<p class="muted">Everything here is already optimised — nice.</p>'}</div>`;
    }
    el.innerHTML = `<div class="onb-box">${steps}${body}
      <div class="row" style="margin-top:22px;gap:10px">${st.step ? `<button class="btn ghost" id="back">${icon('chevron-left', 'sm')}Back</button>` : `<button class="btn ghost" id="skip">Skip setup</button>`}<span class="spacer"></span>
        ${st.step === 3 ? `<button class="btn" id="prev">${icon('eye', 'sm')}Preview exact changes</button><button class="btn primary lg" id="apply">${icon('bolt')}Apply</button>` : `<button class="btn primary lg" id="next">Continue${icon('chevron-right', 'sm')}</button>`}</div></div>`;
    const on = (s, fn) => { const b = el.querySelector(s); if (b) b.onclick = fn; };
    on('#skip', () => finish(true));
    on('#back', () => { st.step--; draw(); });
    on('#next', () => { st.step++; draw(); });
    on('#onb-login', async () => { await loginFlow(); draw(); });
    on('#prev', () => previewModal(ids()));
    on('#apply', async () => { const list = ids(); await finish(false); if (list.length) applyFlow(list, { title: 'First optimisation', force: true }); });
    el.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { st.game = b.dataset.g; draw(); }; });
    el.querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => { st.level = b.dataset.l; draw(); }; });
    const primary = el.querySelector('.btn.primary'); if (primary) primary.focus();
  };
  draw();
}
