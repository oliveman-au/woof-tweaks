# 1.1.3 - 2026-10-09

- Updates now install automatically in the background, at a moment you're not using the app (never during a change or a watched game session). Woof Tweaks restarts itself and shows a short "Woof Tweaks was updated" message.
- macOS: Woof Tweaks now updates itself too (keep it in your Applications folder). Each download is checked against its SHA-512 before it's installed.
- After an update you get a small notification instead of a pop-up.

# 1.1.2 - 2026-10-09

- Fix FPS drops (and higher in-game ping) in busy fights on some PCs, reported in Fortnite.
- The Woof Gaming power plan now adapts to your PC. Laptops and CPUs that pick their own best cores (AMD Ryzen 9 X3D with two core dies, Intel 12th-gen+ hybrid and Core Ultra) keep Windows' Balanced plan, so games stay on the fastest cores and the CPU doesn't throttle; only USB, PCIe and disk sleep are turned off while plugged in. Other desktops keep the full Woof Gaming plan.
- Full optimise and every preset now use the adaptive Woof Gaming plan instead of High performance.
- "Turn off CPU core parking" is blocked on CPUs that rely on core parking; High/Ultimate plans are no longer recommended there.
- If your PC already has an older gaming plan where it can hurt, the Dashboard shows an "Update plan" button.

# 1.1.1 - 2026-10-05

- Count device installations independently of sign-in using the existing random device ID.
- Keep the same installation across restarts, updates and account changes.
- Retry offline check-ins without blocking app use.
- Test release for the existing updater. Windows/Linux update in-app; macOS uses the manual download flow.

# Changelog

## 1.1.0 — 4 October 2026 (launch)

### New
- **164 real tweaks** — 96 Windows, 24 macOS, 39 Linux, 5 ChromeOS — plus per-game tweaks and Windows startup-app toggles. Every tweak explains what it does, why, and the risk. See [TWEAKS.md](TWEAKS.md).
- **Exact backups and one-click revert.** Every setting's original value is saved before it changes; Revert restores exactly that value (survives app updates). Optional Windows restore point once a day before system changes.
- **All-or-nothing changes.** If any step of a tweak fails, its earlier steps are undone. Per-user settings never run elevated; system changes share one admin prompt. Crash-safe journal.
- **30 game profiles** (Fortnite, Valorant, CS2, Apex, CoD, Warzone, Roblox, Minecraft, LoL, Overwatch 2, R6, Rocket League, GTA V, PUBG, Dota 2, Marvel Rivals, Delta Force, The Finals, Tarkov, Rust, Destiny 2, Genshin, Elden Ring, Cyberpunk 2077, Helldivers 2, Palworld, Lethal Company, Fall Guys, TF2, Deadlock) + General. Installed-game detection (Steam, Epic, Riot, Battle.net, EA, Ubisoft, Rockstar, Minecraft, Roblox). Per-game launch options and in-game settings, shader-cache clear, best-region ping, Minecraft options.txt writer with backup, custom profiles. Profiles are plain JSON — adding a game needs no code.
- **New design**: Dashboard (optimisation score, system info, recommendations, live CPU/GPU/RAM/temperature/ping monitor), Games, All Tweaks (search with everyday words, filters, sort, multi-select), Presets, Benchmark, Cleanup, Guides, Status & History, Backups, Settings, Upgrade. Dark / AMOLED / light themes and accent colours.
- **Dry run**: see exactly what would change, read live from your system, before applying anything.
- **Fix my lag**: checks CPU, RAM, disk, network, heat, power, display and drivers, with one-click fixes.
- **Presets**: Safe, Balanced, Max FPS, Competitive esports, Low-latency streaming, Battery-saver laptop; save, import and share your own (Plus).
- **Benchmark**: CPU, memory, disk, desktop frame pacing, ping/jitter and a DNS speed ranking, with before/after comparison and a shareable result card.
- **Game Mode Watcher** (Pro): applies a game's profile when it starts and undoes it when it closes; session boost (priorities, keep Mac awake); 0.5 ms timer while gaming (Ultra, Windows).
- **Log in with a short code** — paid plans unlock as soon as they're granted. Plan checks happen in the app's main process against the server.
- Scheduled maintenance (Plus), performance overlay (Plus), cloud sync of presets/profiles (Plus), tweak requests (priority for Pro+), first-run wizard, What's new, localisation-ready UI.

### Fixed
- Clicking **X quits the app completely** on every platform (macOS used to keep running with no window); a second launch focuses the open window; nothing is left running in the background.
- Revert used to do nothing for 11 system tweaks — every tweak now restores its real original value.
- Desktop login never reached the app.
- The plan could be changed from the window; it's now only set by the server.
- Linux admin changes used macOS-only tooling; Windows admin changes broke on quoting.
- Removed tweaks that didn't really do anything (old NVIDIA registry values, a mislabelled "timer resolution" tweak).
- Auto-updates now work: the app version matches the release tag.

## 1.0.1 — 2 October 2026
- First preview build.
