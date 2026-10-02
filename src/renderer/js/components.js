// Reusable UI pieces (return HTML strings; events are handled by delegation in app.js).
import { icon, CATEGORY_ICONS } from './icons.js';
import { esc } from './util.js';
import { t } from './i18n.js';

export const PLAN_NAME = { free: 'Good', plus: 'Plus', pro: 'Pro', ultra: 'Ultra', lifetime: 'Lifetime' };
const OS_LABEL = { win32: 'Windows', darwin: 'macOS', linux: 'Linux', chromeos: 'ChromeOS' };

export const toggle = (attrs, checked, disabled, label) => `<label class="switch"${label ? ` aria-label="${esc(label)}"` : ''}><input type="checkbox" ${attrs} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span><span class="thumb"></span></label>`;

export function tierBadge(tier, locked) {
  if (locked) return `<span class="badge lock" data-tip="Needs the ${PLAN_NAME[tier]} plan">${icon('lock')}${PLAN_NAME[tier]}</span>`;
  return `<span class="badge tier ${tier}">${PLAN_NAME[tier]}</span>`;
}
export const riskBadge = (r) => `<span class="badge ${r}" data-tip="${r === 'safe' ? 'No known downsides' : r === 'moderate' ? 'Has a trade-off — read what it does' : 'Expert only — read the risks first'}">${t(`risk.${r}`)}</span>`;

export function stateLabel(tw) {
  if (tw.blocked && tw.blocked.code === 'guard') return `<span class="state na" data-tip="${esc(tw.blocked.reason)}">Not for this PC</span>`;
  if (tw.status === 'na') return `<span class="state na" data-tip="${esc(tw.why || 'Not available on this PC')}">${t('state.na')}</span>`;
  if (tw.drift) return `<span class="state drift" data-tip="${tw.drift === 'reset' ? 'This setting resets when you restart — apply again or turn it off.' : 'Something else changed this setting after Woof Tweaks applied it.'}">${t(`state.drift.${tw.drift}`)}</span>`;
  if (tw.status === 'optimised') return `<span class="state optimised">${t('state.optimised')}</span>`;
  if (tw.status === 'partial') return `<span class="state partial">${t('state.partial')}</span>`;
  if (tw.status === 'unknown') return '<span class="state" data-tip="Needs admin rights to read — shown after you apply it">Unknown</span>';
  if (tw.status === 'default') return `<span class="state">${t('state.default')}</span>`;
  return '<span class="state"><span class="skel" style="width:60px;height:10px;display:inline-block"></span></span>';
}

export function tweakCard(tw, { selectable = false, selected = false, open = false } = {}) {
  const on = tw.applied || tw.status === 'optimised';
  const disabled = tw.status === 'na' || (tw.blocked && tw.blocked.code === 'guard');
  const badges = [
    riskBadge(tw.risk), tierBadge(tw.tier, tw.locked),
    tw.admin ? `<span class="badge neutral" data-tip="Asks for admin permission once per batch">${icon('admin')}${t('badge.admin')}</span>` : '',
    tw.reboot === 'restart' ? `<span class="badge info" data-tip="Takes effect after a restart">${icon('restart')}${t('badge.reboot')}</span>` : '',
    tw.reboot === 'signout' ? `<span class="badge info" data-tip="Takes effect after you sign out and back in">${icon('logout')}${t('badge.signout')}</span>` : '',
    tw.volatile ? '<span class="badge neutral" data-tip="Resets when you restart your computer">Until restart</span>' : '',
    tw.recommended && !on ? `<span class="badge ok" data-tip="Recommended for your hardware">${icon('star')}For you</span>` : '',
    tw.security ? `<span class="badge advanced">${icon('alert')}Security</span>` : '',
    tw.exclusive ? '<span class="badge neutral" data-tip="Only one option in this group can be on">Pick one</span>' : '',
  ].join('');
  return `<article class="tweak ${on ? 'on' : ''} ${tw.locked ? 'locked' : ''} ${selected ? 'selected' : ''} ${open ? 'open' : ''}" data-id="${esc(tw.id)}">
    <div class="tweak-main">
      ${selectable ? `<input type="checkbox" class="tweak-check" data-sel="${esc(tw.id)}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="Select ${esc(tw.name)}">` : `<span class="cat-dot" style="width:0"></span>`}
      <div style="min-width:0">
        <div class="tweak-title">${esc(tw.name)}</div>
        <div class="tweak-desc">${esc(tw.desc)}</div>
        <div class="tweak-badges">${badges}</div>
      </div>
      <div class="tweak-right">
        ${stateLabel(tw)}
        <button class="more-btn" data-action="expand" aria-expanded="${open}" aria-label="What does this do?">${icon('chevron-down', 'sm')}</button>
        ${toggle(`data-toggle="${esc(tw.id)}"`, on, disabled, `Turn ${tw.name} ${on ? 'off' : 'on'}`)}
      </div>
    </div>
    <div class="tweak-more">
      <div class="explain">
        <div><h4>${icon('info', 'sm')}What it does</h4><p>${esc(tw.long && tw.long.what)}</p></div>
        <div><h4>${icon('sparkle', 'sm')}Why</h4><p>${esc(tw.long && tw.long.why)}</p></div>
        <div><h4>${icon('alert', 'sm')}Risk</h4><p>${esc(tw.long && tw.long.risk)}</p></div>
      </div>
      ${tw.warn ? `<div class="note warn">${icon('alert')}<div>${esc(tw.warn)}</div></div>` : ''}
      ${tw.blocked ? `<div class="note info">${icon('info')}<div>${esc(tw.blocked.reason)}</div></div>` : ''}
      ${tw.locked ? `<div class="note info">${icon('lock')}<div>This tweak is part of the <b>${PLAN_NAME[tw.tier]}</b> plan. <button class="btn sm primary" data-action="upgrade" data-plan="${tw.tier}" style="margin-left:6px">See plans</button></div></div>` : ''}
      <div class="row wrap" style="margin-top:10px;gap:8px">
        <button class="btn sm" data-action="preview-one">${icon('eye', 'sm')}${t('common.preview')}</button>
        <span class="dim tiny">${tw.changes} setting${tw.changes === 1 ? '' : 's'} · ${tw.os.map((o) => OS_LABEL[o]).join(', ')}${tw.appliedAt ? ` · applied ${esc(tw.appliedAt)}` : ''}</span>
      </div>
    </div>
  </article>`;
}

export function catHead(cat, count, extra = '') {
  return `<div class="cat-head"><span class="icon-wrap">${icon(CATEGORY_ICONS[cat.id] || 'sliders')}</span><h3>${esc(cat.name)}</h3><span class="dim small">${count}</span>${extra}</div>`;
}

export function gameArt(g, cls = '') {
  const [c1, c2] = g.colors || ['#8b7bff', '#2a2350'];
  const mono = g.mono || (g.short || g.name).replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 3) || g.name.slice(0, 2);
  return `<div class="game-art ${cls}" style="--c1:${esc(c1)};--c2:${esc(c2)}"><span class="game-mono">${esc(mono)}</span></div>`;
}

export function ring(pct, label, sub) {
  const r = 56; const c = 2 * Math.PI * r; const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<div class="ring" role="img" aria-label="${esc(label)} ${pct}%">
    <svg viewBox="0 0 132 132"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="#ff7ad9"/></linearGradient></defs>
      <circle class="bg" cx="66" cy="66" r="${r}" fill="none" stroke-width="11"/>
      <circle class="fg" cx="66" cy="66" r="${r}" fill="none" stroke-width="11" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
    <div class="val"><b>${pct}</b><span>${esc(sub)}</span></div></div>`;
}

export function sparkline(values, max = 100) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return '<svg class="spark"></svg>';
  const w = 120; const h = 26; const step = w / (values.length - 1);
  const pts = values.map((x, i) => `${(i * step).toFixed(1)},${(h - ((x == null ? 0 : x) / max) * (h - 2) - 1).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="M${pts.join(' L')}"/></svg>`;
}

export const empty = (ic, title, text, action = '') => `<div class="empty"><div class="icon-wrap">${icon(ic, 'lg')}</div><b>${esc(title)}</b><div>${esc(text)}</div>${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
export const skeletonList = (n = 6) => `<div class="tweak-list">${Array.from({ length: n }, () => '<div class="skel" style="height:74px"></div>').join('')}</div>`;
