'use strict';
// ─────────────────────────────────────────────────────────────────────────────
//  WOOF TWEAKS — PLAN TIERS (the one place to change who gets what)
//
//  free = Good · plus = Plus ($5) · pro = Pro ($15) · ultra = Ultra ($30) / Lifetime
//  Lifetime always gets exactly what Ultra gets. Matches the pricing page:
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
  'win-plan-high': 'free', 'win-plan-ultimate': 'free', 'win-plan-woof': 'free',
  'win-game-mode': 'free', 'win-game-dvr-off': 'free', 'win-game-bar-off': 'free', 'win-fso-off': 'free',
  'win-hibernate-off': 'free', 'win-fast-startup-off': 'free',
  'win-cpu-min-100': 'plus', 'win-core-parking-off': 'plus', 'win-power-throttling-off': 'plus',
  'win-usb-suspend-off': 'plus', 'win-pcie-aspm-off': 'plus', 'win-disk-sleep-off': 'plus', 'win-windowed-opt': 'plus',
  'win-cpu-idle-off': 'ultra', 'win-dynamic-tick-off': 'ultra', 'win-hpet-default': 'ultra', 'win-tsc-enhanced': 'ultra',
  'win-spectre-off': 'ultra', 'win-hvci-off': 'ultra',
  // ── Windows · CPU & RAM
  'win-visual-fx': 'free', 'win-explorer-light': 'free', 'win-background-apps-off': 'free', 'win-fax-off': 'free',
  'win-sysmain-off': 'plus', 'win-prefetch-off': 'plus', 'win-search-index-off': 'plus', 'win-edge-background-off': 'plus',
  'win-print-spooler-off': 'plus', 'win-maps-broker-off': 'plus',
  'win-memory-compression-off': 'pro', 'win-pagefile-fixed': 'pro', 'win-ndu-off': 'pro', 'win-system-responsiveness': 'pro', 'win-priority-separation': 'pro',
  // ── Windows · GPU
  'win-max-refresh': 'free',
  'win-vrr': 'plus', 'win-mpo-off': 'plus', 'win-tdr-delay': 'plus',
  'win-nvidia-telemetry-off': 'plus', 'win-intel-telemetry-off': 'plus', 'win-amd-telemetry-off': 'plus',
  'win-hags-on': 'pro', 'win-gpu-priority': 'pro',
  // ── Windows · Internet & ping
  'win-tcp-autotuning': 'plus', 'win-rss-on': 'plus', 'win-prefer-ipv4': 'plus', 'win-llmnr-off': 'plus', 'win-delivery-opt-off': 'plus',
  'win-dns-cloudflare': 'plus', 'win-dns-google': 'plus', 'win-dns-quad9': 'plus', 'win-dns-adguard': 'plus', 'win-wifi-max-perf': 'plus',
  'win-dns-custom': 'pro', 'win-nagle-off': 'pro', 'win-network-throttling-off': 'pro', 'win-rsc-off': 'pro', 'win-tcp-timestamps-off': 'pro',
  'win-ecn-on': 'pro', 'win-netbios-off': 'pro', 'win-nic-eee-off': 'pro', 'win-nic-interrupt-mod-off': 'pro', 'win-nic-lso-off': 'pro',
  'win-nic-flow-control-off': 'pro', 'win-nic-buffers-max': 'pro', 'win-wifi-roam-low': 'pro', 'win-wifi-prefer-5ghz': 'pro',
  // ── Windows · Input lag & peripherals
  'win-mouse-accel-off': 'free', 'win-pointer-speed-6': 'free', 'win-keyboard-fast': 'free', 'win-sticky-keys-off': 'free',
  'win-ink-off': 'plus',
  'win-global-timer': 'ultra',
  // ── Windows · Stutter & crash fixes
  'win-transparency-off': 'free',
  'win-fth-off': 'plus', 'win-error-reporting-off': 'plus', 'win-xbox-services-off': 'plus', 'win-update-no-restart': 'plus',
  // ── Windows · Background & telemetry
  'win-ads-off': 'free', 'win-telemetry-min': 'free', 'win-advertising-id-off': 'free', 'win-activity-history-off': 'free', 'win-feedback-off': 'free',
  'win-web-search-off': 'free', 'win-widgets-off': 'free', 'win-copilot-off': 'free', 'win-recall-off': 'free', 'win-cortana-off': 'free', 'win-ceip-off': 'free',
  'win-compat-telemetry-off': 'plus',
  // ── Windows · Picture quality
  'win-color-filters-off': 'plus', 'win-auto-hdr': 'pro',

  // ── macOS
  'mac-reduce-motion': 'free', 'mac-reduce-transparency': 'free', 'mac-window-anim-off': 'free', 'mac-dock-fast': 'free', 'mac-dock-bounce-off': 'free',
  'mac-spaces-fixed': 'free', 'mac-finder-anim-off': 'free', 'mac-low-power-off': 'free', 'mac-mouse-accel-off': 'free', 'mac-key-repeat-fast': 'free', 'mac-press-hold-off': 'free',
  'mac-app-nap-off': 'plus', 'mac-spotlight-off': 'plus', 'mac-siri-off': 'plus', 'mac-auto-update-download-off': 'plus', 'mac-analytics-off': 'plus', 'mac-crash-dialog-off': 'plus',
  'mac-dns-cloudflare': 'plus', 'mac-dns-google': 'plus', 'mac-dns-quad9': 'plus', 'mac-dns-adguard': 'plus',
  'mac-awdl-off': 'pro', 'mac-delayed-ack-off': 'pro', 'mac-metal-hud': 'pro', 'mac-high-power': 'pro',

  // ── Linux
  'linux-governor-performance': 'free', 'linux-turbo-on': 'free', 'linux-power-profile': 'free', 'linux-mouse-flat': 'free', 'linux-key-repeat': 'free', 'linux-gnome-animations-off': 'free',
  'linux-epp-performance': 'plus', 'linux-tuned-latency': 'plus', 'linux-gamemode': 'plus', 'linux-mangohud': 'plus', 'linux-mangohud-config': 'plus',
  'linux-swappiness': 'plus', 'linux-dirty-writeback': 'plus', 'linux-vfs-cache': 'plus', 'linux-max-map-count': 'plus', 'linux-split-lock-off': 'plus',
  'linux-zram': 'plus', 'linux-io-nvme-none': 'plus', 'linux-io-ssd-deadline': 'plus', 'linux-tracker-off': 'plus',
  'linux-cups-off': 'plus', 'linux-modemmanager-off': 'plus', 'linux-avahi-off': 'plus',
  'linux-dns-cloudflare': 'plus', 'linux-dns-google': 'plus', 'linux-dns-quad9': 'plus', 'linux-dns-adguard': 'plus',
  'linux-thp-madvise': 'pro', 'linux-file-limits': 'pro', 'linux-nmi-watchdog-off': 'pro', 'linux-bbr': 'pro', 'linux-tcp-fastopen': 'pro', 'linux-tcp-latency': 'pro',
  'linux-net-buffers': 'pro', 'linux-dns-dot': 'pro', 'linux-mesa-cache-size': 'pro', 'linux-nvidia-powermizer': 'pro', 'linux-amd-high-perf': 'pro', 'linux-pipewire-lowlatency': 'pro',

  // ── ChromeOS
  'cros-android-animations': 'plus', 'cros-android-dns-cloudflare': 'plus', 'cros-android-dns-google': 'plus', 'cros-android-stay-awake': 'plus',
  'cros-container-mangohud-config': 'plus',
};

// One-off actions (cleanup / repair).
const ACTIONS = {
  'act-restore-point': 'free', 'act-flush-dns': 'free', 'act-network-reset': 'free', 'act-clear-temp': 'free', 'act-clear-shaders': 'free',
  'act-clear-crash-dumps': 'free', 'act-empty-bin': 'free', 'act-trim': 'free', 'act-cros-clear-cache': 'free',
  'act-clear-update-cache': 'plus', 'act-sfc': 'plus', 'act-dism': 'plus', 'act-remove-bloat': 'plus', 'act-purge-ram': 'plus',
  'act-standby-clear': 'pro',
};

// Game profiles. Anything not listed here (e.g. a new JSON profile) is Ultra.
const GAMES = {
  general: 'free', fortnite: 'free', valorant: 'free', cs2: 'free', roblox: 'free', minecraft: 'free', apex: 'free', cod: 'free', lol: 'free',
  overwatch2: 'plus', r6siege: 'plus', rocketleague: 'plus', gta5: 'plus', pubg: 'plus', dota2: 'plus', marvelrivals: 'plus', fallguys: 'plus', tf2: 'plus', genshin: 'plus', thefinals: 'plus', warzone: 'plus',
  // everything else → ultra
};

// What a game profile's per-game extras need (they still respect the tweak tiers above).
const GAME_EXTRAS = {
  fso: 'free',          // fullscreen-optimisation flag on the game's .exe
  gpuPreference: 'plus', // Windows Graphics setting: High performance GPU for the .exe
  priority: 'plus',      // launch the game at High CPU priority (Image File Execution Options)
  shaderCache: 'free',   // clear this game's shader cache
  launchOptions: 'free', // copy-ready launch options and settings
  configWrite: 'plus',   // write recommended settings into the game's config file (with backup)
  dscp: 'pro',           // QoS DSCP priority for the game's network traffic
  defender: 'pro',       // Microsoft Defender exclusion for the game folder
  regionPing: 'pro',     // best server region by ping
};

// App features (checked in the main process).
const FEATURES = {
  benchmark: 'free',
  monitor: 'free',
  fixMyLag: 'free',
  presets: 'free',          // built-in presets (they only include tweaks your plan allows)
  customPresets: 'plus',    // save / import / share your own presets
  customGameProfile: 'plus',
  maintenance: 'plus',      // scheduled weekly cleanup
  overlay: 'plus',          // small always-on-top performance overlay
  cloudSync: 'plus',        // sync presets & custom profiles to your account
  watcher: 'pro',           // Game Mode Watcher: auto-apply a game's profile when it starts, undo when it closes
  sessionBoost: 'pro',      // while a game runs: High priority, background apps lowered, services paused
  timerResolution: 'ultra', // hold a 0.5 ms timer while a game runs
  priorityRequests: 'pro',  // tweak requests marked priority
};

const tweakTier = (id) => TWEAKS[id];
const actionTier = (id) => ACTIONS[id];
const gameTier = (id) => GAMES[id] || 'ultra';
const featureTier = (id) => FEATURES[id] || 'ultra';
const extraTier = (id) => GAME_EXTRAS[id] || 'ultra';

module.exports = { TWEAKS, ACTIONS, GAMES, GAME_EXTRAS, FEATURES, tweakTier, actionTier, gameTier, featureTier, extraTier };
