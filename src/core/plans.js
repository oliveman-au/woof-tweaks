'use strict';
// Plan names and order. Lifetime has exactly the same entitlements as Ultra.
const PLAN_ORDER = ['free', 'plus', 'pro', 'ultra', 'lifetime'];
const PLAN_NAMES = { free: 'Good', plus: 'Plus', pro: 'Pro', ultra: 'Ultra', lifetime: 'Lifetime' };
const PLAN_PRICES = { free: 'Free', plus: '$5/mo', pro: '$15/mo', ultra: '$30/mo', lifetime: '$100 once' };
// Real feature bullets — kept identical to the website's pricing page (lib/catalog.ts TWEAK_PLANS).
const PLAN_FEATURES = {
  free: ['Per-game profiles for popular games', 'Core FPS, RAM & power tweaks', 'One-click full optimisation (Good set)', 'Revert any change anytime', 'Automatic restore point before changes'],
  plus: ['Everything in Good', 'Extra GPU & latency tweaks', 'More per-game profiles', 'Stutter & crash fixes'],
  pro: ['Everything in Plus', 'Advanced network / ping tuning', 'Deep GPU & CPU profiles', 'Picture-quality & input-lag suites', 'Priority tweak requests'],
  ultra: ['Everything in Pro', 'All tweaks unlocked', 'Every game profile', 'Earliest access to new tweaks'],
  lifetime: ['Everything in Ultra', 'All future features included', 'One-time payment, no subscription', 'Lifetime updates'],
};
const PLAN_TAGLINES = {
  free: 'Solid optimisation for everyday gamers — free forever.',
  plus: 'A few more tweaks for people who want extra.',
  pro: 'A bigger toolkit for serious players.',
  ultra: 'Every feature, every month.',
  lifetime: 'All features, forever — one payment.',
};

const rank = (plan) => {
  const r = PLAN_ORDER.indexOf(plan === 'lifetime' ? 'ultra' : plan);
  return r < 0 ? 0 : r;
};
const isPlan = (p) => PLAN_ORDER.includes(p);
/** Can an account on `plan` use something that needs `required`? */
const canUse = (plan, required) => rank(isPlan(plan) ? plan : 'free') >= rank(required);

module.exports = { PLAN_ORDER, PLAN_NAMES, PLAN_PRICES, PLAN_FEATURES, PLAN_TAGLINES, rank, canUse, isPlan };
