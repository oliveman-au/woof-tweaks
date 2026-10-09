// In-app "What's new" (mirrors CHANGELOG.md).
import { icon } from './icons.js';
import { esc } from './util.js';
import { S, modal, setSetting } from './app.js';

export const CHANGELOG = [
  {
    version: '1.1.4', date: '2026-10-09', title: 'Woof Tweaks for Android',
    items: [
      'New Android app: Game Mode, reversible tweaks, your games with tips, and a ping test for game server regions',
      'Get it from woof-services.stream/tweaks (Android 8 and newer)',
    ],
  },
  {
    version: '1.1.3', date: '2026-10-09', title: 'Updates take care of themselves',
    items: [
      'New versions install automatically in the background when you\'re not using the app — never during a change or a game session',
      'You just get a small “Woof Tweaks was updated” message afterwards',
      'Macs update themselves too now (keep Woof Tweaks in your Applications folder)',
    ],
  },
  {
    version: '1.1.2', date: '2026-10-09', title: 'Smoother fights on more PCs',
    items: [
      'Fixes FPS drops (and higher in-game ping) in busy fights on some PCs, first reported in Fortnite',
      'The Woof Gaming power plan now adapts to your PC: laptops and CPUs that pick their own best cores (AMD Ryzen 9 X3D, Intel 12th-gen+ hybrid, Core Ultra) keep Windows’ Balanced plan',
      'Full optimise and every preset now use the adaptive plan instead of High performance',
      'Already have an older plan where it can hurt? Your Dashboard shows an "Update plan" button',
    ],
  },
  {
    version: '1.1.1', date: '2026-10-05', title: 'Installation counting and update test',
    items: [
      'Each app installation now checks in without needing to log in',
      'Your existing random device ID stays the same across updates and account changes',
      'Only device ID, platform and app version are reported; no hardware IDs, files or gaming activity',
      'A small release to test the existing Windows, macOS and Linux update flow',
    ],
  },
  {
    version: '1.1.0', date: '2026-10-04', title: 'The big one',
    items: [
      '160+ real tweaks for Windows, macOS, Linux and ChromeOS — each one explained (what / why / risk), backed up first and reversible',
      '30 game profiles with auto-detection of installed games, per-game launch options and recommended settings',
      'Brand-new design with Dashboard, live monitor, Presets, Benchmark, Cleanup, Guides, Status & History and Backups',
      'Dry run: see exactly what would change before applying anything',
      'Fix my lag: a quick diagnosis with one-click fixes',
      'Game Mode Watcher (Pro): applies a game\'s profile when it starts and undoes it when it closes',
      'Log in with a short code — paid plans unlock instantly',
      'Clicking X now fully quits the app on every platform',
    ],
  },
  { version: '1.0.1', date: '2026-10-02', title: 'First build', items: ['Initial preview release'] },
];

export async function whatsNew() {
  const body = CHANGELOG.slice(0, 2).map((c) => `<div style="margin-bottom:16px"><div class="row"><b>v${esc(c.version)} — ${esc(c.title)}</b><span class="spacer"></span><span class="dim small">${esc(c.date)}</span></div>
    <ul style="margin-top:8px;padding-left:4px;list-style:none;display:flex;flex-direction:column;gap:6px">${c.items.map((i) => `<li class="row" style="align-items:flex-start;gap:8px">${icon('check', 'sm')}<span class="small">${esc(i)}</span></li>`).join('')}</ul></div>`).join('');
  await modal({ title: `What's new in v${S.info.version}`, icon: 'sparkle', body, actions: [{ label: 'Let\'s go', kind: 'primary', value: 'ok' }] });
  setSetting('lastSeenVersion', S.info.version);
}
