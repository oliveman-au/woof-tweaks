import { icon } from '../icons.js';
import { esc } from '../util.js';
import { S, plan, loginFlow } from '../app.js';

const api = window.woof;
const RANK = ['free', 'plus', 'pro', 'ultra', 'lifetime'];

export function render() {
  const plans = (S.app && S.app.plans) || [];
  const cur = plan();
  const n = (tier) => S.tweaks.filter((t) => !t.hidden && t.status !== 'na' && RANK.indexOf(t.tier) <= RANK.indexOf(tier === 'lifetime' ? 'ultra' : tier)).length;
  return `<div class="page">
    <div class="page-head"><div><h1>Plans</h1><p>Every plan includes backups, one-click Revert and the restore point. Paid plans unlock more tweaks and tools — the exact list is in All Tweaks (locked ones show their plan).</p></div></div>
    ${S.session.signedIn ? '' : `<div class="note info" style="margin-bottom:16px">${icon('user')}<div style="flex:1">Already bought a plan? Log in so the app can see it.</div><button class="btn sm primary" id="login">Log in</button></div>`}
    <div class="plans">${plans.map((p) => `<div class="card plan ${p.id === 'pro' ? 'featured' : ''} ${p.id === cur ? 'current' : ''}">
      ${p.id === 'pro' ? '<span class="badge tier ribbon">Most popular</span>' : p.id === 'lifetime' ? '<span class="badge ok ribbon">Best value</span>' : ''}
      <div><h3>${esc(p.name)}</h3><div class="muted small">${esc(p.tagline || '')}</div></div>
      <div class="price">${esc(p.price)}</div>
      <div class="dim small">${n(p.id)} tweaks on this PC</div>
      <ul>${p.features.map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>
      <div style="margin-top:auto">${p.id === cur ? `<span class="btn sm" style="width:100%;pointer-events:none">${icon('check', 'sm')}Your plan</span>` : p.id === 'free' ? '' : `<button class="btn sm ${p.id === 'pro' ? 'primary' : ''}" style="width:100%" data-buy="${p.id}">Get ${esc(p.name)}</button>`}</div>
    </div>`).join('')}</div>
    <div class="card pad" style="margin-top:16px"><div class="row wrap" style="gap:14px"><span class="icon-wrap" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(var(--accent-rgb),.14);color:var(--accent)">${icon('info')}</span><div style="flex:1;min-width:240px"><b>How buying works</b><div class="muted small">Choose a plan on woof-services.stream and it opens a ticket — pay by PayPal, Cash App, crypto, bank transfer or gift card. Once it's granted, click Refresh in Settings (or just restart the app). There's no DRM: the server tells the app what your account includes.</div></div></div></div>
  </div>`;
}
export function mount(root) {
  const l = root.querySelector('#login'); if (l) l.onclick = loginFlow;
  root.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => api.openExternal(`${(S.app && S.app.site) || 'https://woof-services.stream'}/order/tweaks?plan=${b.dataset.buy}`); });
}
