'use strict';
// ─────────────────────────────────────────────────────────────────────────────
//  WOOF TWEAKS — PLAN TIERS (the one place to change who gets what)
//
//  good = Good ($5 once), plus = Plus ($10), pro = Pro ($15), ultra = Ultra ($30), lifetime = Max ($100)
//  Max includes the complete catalogue. Every paid tier is permanent. Matches the pricing page:
//   Good  — core FPS, RAM & power tweaks · popular game profiles · cleanup · revert · restore point
//   Plus  — extra GPU & latency tweaks · stutter & crash fixes · more game profiles
//   Pro   — advanced network/ping · deep GPU & CPU · picture-quality & input-lag suites
//   Ultra — all tweaks (incl. expert/security trade-offs) · every game profile · earliest access
//
//  Change a value below and rebuild — the main process enforces it (the UI just shows it).
//  A tweak missing from this file fails the test suite on purpose, so nothing ships untiered.
//  A game profile missing from GAMES defaults to 'ultra' (so new JSON profiles can ship without code).
// ─────────────────────────────────────────────────────────────────────────────

const TWEAKS = {
  // ── Windows · FPS & power
  'win-plan-high': 'plus', 'win-plan-ultimate': 'plus', 'win-plan-woof': 'good',
  'win-game-mode': 'good', 'win-game-dvr-off': 'good', 'win-game-bar-off': 'plus', 'win-fso-off': 'plus',
  'win-hibernate-off': 'plus', 'win-fast-startup-off': 'plus',
  'win-cpu-min-100': 'plus', 'win-core-parking-off': 'plus', 'win-power-throttling-off': 'plus',
  'win-usb-suspend-off': 'plus', 'win-pcie-aspm-off': 'plus', 'win-disk-sleep-off': 'plus', 'win-windowed-opt': 'plus',
  'win-cpu-idle-off': 'lifetime', 'win-dynamic-tick-off': 'lifetime', 'win-hpet-default': 'lifetime', 'win-tsc-enhanced': 'lifetime',
  'win-spectre-off': 'lifetime', 'win-hvci-off': 'lifetime',
  // ── Windows · CPU & RAM
  'win-visual-fx': 'good', 'win-explorer-light': 'plus', 'win-background-apps-off': 'plus', 'win-fax-off': 'plus',
  'win-sysmain-off': 'plus', 'win-prefetch-off': 'plus', 'win-search-index-off': 'plus', 'win-edge-background-off': 'plus',
  'win-print-spooler-off': 'plus', 'win-maps-broker-off': 'plus',
  'win-memory-compression-off': 'pro', 'win-pagefile-fixed': 'pro', 'win-ndu-off': 'pro', 'win-system-responsiveness': 'pro', 'win-priority-separation': 'pro',
  // ── Windows · GPU
  'win-max-refresh': 'plus',
  'win-vrr': 'plus', 'win-mpo-off': 'plus', 'win-tdr-delay': 'plus',
  'win-nvidia-telemetry-off': 'plus', 'win-intel-telemetry-off': 'plus', 'win-amd-telemetry-off': 'plus',
  'win-hags-on': 'pro', 'win-gpu-priority': 'pro',
  // ── Windows · Internet & ping
  'win-tcp-autotuning': 'plus', 'win-rss-on': 'plus', 'win-prefer-ipv4': 'plus', 'win-llmnr-off': 'plus', 'win-delivery-opt-off': 'plus',
  'win-dns-cloudflare': 'plus', 'win-dns-google': 'plus', 'win-dns-quad9': 'plus', 'win-dns-adguard': 'plus', 'win-wifi-max-perf': 'plus',
  'win-dns-custom': 'pro', 'win-nagle-off': 'ultra', 'win-network-throttling-off': 'pro', 'win-rsc-off': 'ultra', 'win-tcp-timestamps-off': 'pro',
  'win-ecn-on': 'pro', 'win-netbios-off': 'pro', 'win-nic-eee-off': 'pro', 'win-nic-interrupt-mod-off': 'ultra', 'win-nic-lso-off': 'pro',
  'win-nic-flow-control-off': 'pro', 'win-nic-buffers-max': 'ultra', 'win-wifi-roam-low': 'pro', 'win-wifi-prefer-5ghz': 'pro',
  // ── Windows · Input lag & peripherals
  'win-mouse-accel-off': 'good', 'win-pointer-speed-6': 'plus', 'win-keyboard-fast': 'good', 'win-sticky-keys-off': 'good',
  'win-ink-off': 'plus',
  'win-global-timer': 'lifetime',
  // ── Windows · Stutter & crash fixes
  'win-transparency-off': 'good',
  'win-fth-off': 'plus', 'win-error-reporting-off': 'plus', 'win-xbox-services-off': 'plus', 'win-update-no-restart': 'plus',
  // ── Windows · Background & telemetry
  'win-ads-off': 'plus', 'win-telemetry-min': 'plus', 'win-advertising-id-off': 'plus', 'win-activity-history-off': 'plus', 'win-feedback-off': 'plus',
  'win-web-search-off': 'plus', 'win-widgets-off': 'plus', 'win-copilot-off': 'plus', 'win-recall-off': 'plus', 'win-cortana-off': 'plus', 'win-ceip-off': 'plus',
  'win-compat-telemetry-off': 'plus',
  // ── Windows · Picture quality
  'win-color-filters-off': 'plus', 'win-auto-hdr': 'pro',

  // ── macOS
  'mac-reduce-motion': 'good', 'mac-reduce-transparency': 'good', 'mac-window-anim-off': 'plus', 'mac-dock-fast': 'good', 'mac-dock-bounce-off': 'plus',
  'mac-spaces-fixed': 'plus', 'mac-finder-anim-off': 'plus', 'mac-low-power-off': 'plus', 'mac-mouse-accel-off': 'plus', 'mac-key-repeat-fast': 'good', 'mac-press-hold-off': 'plus',
  'mac-app-nap-off': 'plus', 'mac-spotlight-off': 'plus', 'mac-siri-off': 'plus', 'mac-auto-update-download-off': 'plus', 'mac-crash-dialog-off': 'plus',
  'mac-dns-cloudflare': 'plus', 'mac-dns-google': 'plus', 'mac-dns-quad9': 'plus', 'mac-dns-adguard': 'plus',
  'mac-awdl-off': 'pro', 'mac-delayed-ack-off': 'pro', 'mac-metal-hud': 'ultra', 'mac-high-power': 'ultra',

  // ── Linux
  'linux-governor-performance': 'good', 'linux-turbo-on': 'plus', 'linux-power-profile': 'plus', 'linux-mouse-flat': 'good', 'linux-key-repeat': 'good', 'linux-gnome-animations-off': 'plus',
  'linux-epp-performance': 'plus', 'linux-tuned-latency': 'plus', 'linux-gamemode': 'plus', 'linux-mangohud': 'plus', 'linux-mangohud-config': 'plus',
  'linux-swappiness': 'plus', 'linux-dirty-writeback': 'plus', 'linux-vfs-cache': 'plus', 'linux-max-map-count': 'plus', 'linux-split-lock-off': 'plus',
  'linux-zram': 'plus', 'linux-io-nvme-none': 'plus', 'linux-io-ssd-deadline': 'plus', 'linux-tracker-off': 'plus',
  'linux-cups-off': 'plus', 'linux-modemmanager-off': 'plus', 'linux-avahi-off': 'plus',
  'linux-dns-cloudflare': 'plus', 'linux-dns-google': 'plus', 'linux-dns-quad9': 'plus', 'linux-dns-adguard': 'plus',
  'linux-thp-madvise': 'pro', 'linux-file-limits': 'pro', 'linux-nmi-watchdog-off': 'ultra', 'linux-bbr': 'pro', 'linux-tcp-fastopen': 'pro', 'linux-tcp-latency': 'pro',
  'linux-net-buffers': 'ultra', 'linux-dns-dot': 'pro', 'linux-mesa-cache-size': 'pro', 'linux-nvidia-powermizer': 'pro', 'linux-amd-high-perf': 'pro', 'linux-pipewire-lowlatency': 'ultra',

  // ── ChromeOS
  'cros-android-animations': 'plus', 'cros-android-dns-cloudflare': 'plus', 'cros-android-dns-google': 'plus', 'cros-android-stay-awake': 'plus',
  'cros-container-mangohud-config': 'plus',
};

// One-off actions (cleanup / repair).
const ACTIONS = {
  'act-restore-point': 'good', 'act-flush-dns': 'good', 'act-network-reset': 'good', 'act-clear-temp': 'good', 'act-clear-shaders': 'good',
  'act-clear-crash-dumps': 'good', 'act-empty-bin': 'good', 'act-trim': 'good', 'act-cros-clear-cache': 'good',
  'act-clear-update-cache': 'plus', 'act-sfc': 'plus', 'act-dism': 'plus', 'act-remove-bloat': 'plus', 'act-purge-ram': 'plus',
  'act-standby-clear': 'pro',
};

// Game profiles. Anything not listed here (e.g. a new JSON profile) is Ultra.
const GAMES = {
  general: 'good', fortnite: 'good', valorant: 'good', cs2: 'good', roblox: 'good', minecraft: 'good', apex: 'good', cod: 'good', lol: 'good',
  overwatch2: 'plus', r6siege: 'plus', rocketleague: 'plus', gta5: 'plus', pubg: 'plus', dota2: 'plus', marvelrivals: 'plus', fallguys: 'plus', tf2: 'plus', genshin: 'plus', thefinals: 'plus', warzone: 'plus',
  // everything else → ultra
};

// What a game profile's per-game extras need (they still respect the tweak tiers above).
const GAME_EXTRAS = {
  fso: 'good',          // fullscreen-optimisation flag on the game's .exe
  gpuPreference: 'plus', // Windows Graphics setting: High performance GPU for the .exe
  priority: 'plus',      // launch the game at High CPU priority (Image File Execution Options)
  shaderCache: 'good',   // clear this game's shader cache
  launchOptions: 'good', // copy-ready launch options and settings
  configWrite: 'plus',   // write recommended settings into the game's config file (with backup)
  dscp: 'pro',           // QoS DSCP priority for the game's network traffic
  defender: 'pro',       // Microsoft Defender exclusion for the game folder
  regionPing: 'pro',     // best server region by ping
};

// App features (checked in the main process).
const FEATURES = {
  benchmark: 'good',
  monitor: 'good',
  fixMyLag: 'good',
  presets: 'good',          // built-in presets (they only include tweaks your plan allows)
  customPresets: 'plus',    // save / import / share your own presets
  customGameProfile: 'plus',
  maintenance: 'plus',      // scheduled weekly cleanup
  overlay: 'plus',          // small always-on-top performance overlay
  cloudSync: 'plus',        // sync presets & custom profiles to your account
  watcher: 'pro',           // Game Mode Watcher: auto-apply a game's profile when it starts, undo when it closes
  sessionBoost: 'pro',      // while a game runs: High priority, background apps lowered, services paused
  timerResolution: 'lifetime', // hold a 0.5 ms timer while a game runs
  priorityRequests: 'pro',  // tweak requests marked priority
};

const tweakTier = (id) => TWEAKS[id];
const actionTier = (id) => ACTIONS[id];
const gameTier = (id) => GAMES[id] || 'ultra';
const featureTier = (id) => FEATURES[id] || 'ultra';
const extraTier = (id) => GAME_EXTRAS[id] || 'ultra';

module.exports = { TWEAKS, ACTIONS, GAMES, GAME_EXTRAS, FEATURES, tweakTier, actionTier, gameTier, featureTier, extraTier };
