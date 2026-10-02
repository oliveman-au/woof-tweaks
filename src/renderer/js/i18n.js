// Localisation. English first; add a language by adding a dictionary with the same keys.
// Tweak descriptions come from the tweak definitions (English) — the UI chrome is translated here.
const en = {
  'nav.main': 'Optimise', 'nav.tools': 'Tools', 'nav.you': 'You',
  'nav.dashboard': 'Dashboard', 'nav.games': 'Games', 'nav.tweaks': 'All Tweaks', 'nav.presets': 'Presets', 'nav.benchmark': 'Benchmark',
  'nav.cleanup': 'Cleanup', 'nav.guides': 'Guides', 'nav.status': 'Status & History', 'nav.backups': 'Backups', 'nav.settings': 'Settings', 'nav.upgrade': 'Upgrade',
  'search.placeholder': 'Search tweaks — try "fix mouse lag" or "lower ping"',
  'footer.applied': '{n} tweaks applied', 'footer.ready': 'Ready', 'footer.working': 'Working…',
  'common.apply': 'Apply', 'common.revert': 'Revert', 'common.cancel': 'Cancel', 'common.close': 'Close', 'common.preview': 'Preview changes',
  'common.locked': 'Locked', 'common.upgrade': 'Upgrade', 'common.copy': 'Copy', 'common.copied': 'Copied!',
  'state.optimised': 'Applied', 'state.default': 'Default', 'state.partial': 'Partly applied', 'state.drift.changed': 'Changed externally',
  'state.drift.reset': 'Reset by restart', 'state.na': 'Not available', 'state.unknown': 'Unknown',
  'risk.safe': 'Safe', 'risk.moderate': 'Moderate', 'risk.advanced': 'Advanced',
  'badge.admin': 'Admin', 'badge.reboot': 'Restart', 'badge.signout': 'Sign out',
};
const dicts = { en };
let lang = 'en';
export const setLanguage = (l) => { if (dicts[l]) lang = l; };
export const LANGUAGES = [{ id: 'en', name: 'English' }];
export function t(key, vars = {}) {
  const s = (dicts[lang] && dicts[lang][key]) || en[key] || key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}
