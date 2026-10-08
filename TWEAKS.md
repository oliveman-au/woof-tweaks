# Woof Tweaks — every tweak

Generated from the app's tweak registry (`node test/helpers/make-tweaks-md.js`). Plan tiers come from `src/config/tiers.js`.
Every tweak snapshots the exact original value before changing it, and Revert restores that value.

## Totals

| OS | Good | Plus | Pro | Ultra | Total |
|---|---|---|---|---|---|
| Windows | 30 | 36 | 23 | 7 | **96** |
| macOS | 11 | 9 | 4 | 0 | **24** |
| Linux | 6 | 21 | 12 | 0 | **39** |
| ChromeOS (Linux container) | 0 | 5 | 0 | 0 | **5** |

Plus per-game tweaks on Windows (fullscreen flag, GPU preference, High priority, QoS tag, Defender exclusion — generated for each detected game) and Windows startup-app toggles.

## Windows

| Tweak | Plan | Risk | Admin | Restart | What it changes |
|---|---|---|---|---|---|
| **High Performance power plan** <br><sub>`win-plan-high` · fps</sub> | Good | safe | yes | — | Creates a "High performance (Woof Tweaks)" power plan and switches to it. |
| **Ultimate Performance power plan** <br><sub>`win-plan-ultimate` · fps</sub> | Good | moderate | yes | — | Unlocks Microsoft's Ultimate Performance plan as "Ultimate Performance (Woof Tweaks)" and switches to it. |
| **Woof Gaming power plan** <br><sub>`win-plan-woof` · fps</sub> | Good | moderate | yes | — | Desktops: creates a "Woof Gaming" plan from High performance with, when plugged in: CPU minimum 100%, core parking off, USB selective suspend off, PCIe link power saving off and disks never sleep. Laptops and CPUs that pick their own best cores (AMD Ryzen 9 X3D, Intel 12th-gen+ hybrid): keeps Windows' Balanced plan — so games stay on the fastest cores and the CPU doesn't overheat — and only turns off USB, PCIe and disk sleep when plugged in. Battery settings stay at Windows defaults. |
| **Minimum CPU state 100%** <br><sub>`win-cpu-min-100` · fps</sub> | Plus | safe | yes | — | Sets "Minimum processor state" to 100% (plugged in) on your current power plan. |
| **Turn off CPU core parking** <br><sub>`win-core-parking-off` · fps</sub> | Plus | safe | yes | — | Sets "Processor performance core parking min cores" to 100% (plugged in) on your current plan. |
| **Disable CPU idle states (C-states)** <br><sub>`win-cpu-idle-off` · fps</sub> | Ultra | advanced | yes | — | Sets "Processor idle disable" on your current plan (plugged in). |
| **Windows Game Mode on** <br><sub>`win-game-mode` · fps</sub> | Good | safe | — | — | Turns on Game Mode (Settings → Gaming → Game Mode). |
| **Turn off Game DVR / background recording** <br><sub>`win-game-dvr-off` · fps</sub> | Good | safe | — | — | Turns off background recording (Captures) for games. |
| **Turn off Xbox Game Bar shortcuts** <br><sub>`win-game-bar-off` · fps</sub> | Good | safe | — | — | Turns off "Open Xbox Game Bar using the controller button" and the startup tips panel. |
| **Disable fullscreen optimisations (all games)** <br><sub>`win-fso-off` · fps</sub> | Good | safe | — | — | Sets the Game DVR "fullscreen exclusive behaviour" values so games that ask for exclusive fullscreen get it. |
| **Disable Multi-Plane Overlay (MPO)** <br><sub>`win-mpo-off` · stability</sub> | Plus | moderate | yes | restart | Sets the DWM OverlayTestMode value that NVIDIA and AMD recommend for MPO-related flicker. |
| **Optimisations for windowed games** <br><sub>`win-windowed-opt` · fps</sub> | Plus | safe | — | — | Turns on Settings → Display → Graphics → "Optimizations for windowed games" (only this flag; other graphics flags are kept). |
| **Variable refresh rate for all games** <br><sub>`win-vrr` · gpu</sub> | Plus | safe | — | — | Turns on Settings → Display → Graphics → "Variable refresh rate" (only this flag). |
| **Turn off power throttling** <br><sub>`win-power-throttling-off` · fps</sub> | Plus | safe | yes | restart | Sets PowerThrottlingOff = 1. |
| **Turn off USB selective suspend** <br><sub>`win-usb-suspend-off` · input</sub> | Plus | safe | yes | — | Sets USB selective suspend to Disabled (plugged in) on your current plan. |
| **Turn off PCIe link power saving** <br><sub>`win-pcie-aspm-off` · fps</sub> | Plus | safe | yes | — | Sets "Link State Power Management" to Off (plugged in) on your current plan. |
| **Never put disks to sleep (plugged in)** <br><sub>`win-disk-sleep-off` · fps</sub> | Plus | safe | yes | — | Sets "Turn off hard disk after" to Never (plugged in). |
| **Turn off hibernation** <br><sub>`win-hibernate-off` · cpu</sub> | Good | moderate | yes | — | Runs "powercfg /hibernate off". |
| **Turn off Fast Startup** <br><sub>`win-fast-startup-off` · stability</sub> | Good | safe | yes | — | Sets HiberbootEnabled = 0. |
| **Disable dynamic tick** <br><sub>`win-dynamic-tick-off` · input</sub> | Ultra | advanced | yes | restart | Runs "bcdedit /set disabledynamictick yes". |
| **Use the default system clock (no forced HPET)** <br><sub>`win-hpet-default` · input</sub> | Ultra | advanced | yes | restart | Removes the "useplatformclock" boot setting (Windows default). |
| **Enhanced TSC sync policy** <br><sub>`win-tsc-enhanced` · input</sub> | Ultra | advanced | yes | restart | Runs "bcdedit /set tscsyncpolicy enhanced". |
| **Disable Spectre/Meltdown protection** <br><sub>`win-spectre-off` · fps</sub> | Ultra | advanced | yes | restart | Sets FeatureSettingsOverride/Mask = 3 (Microsoft KB4072698) to turn off the Spectre v2 and Meltdown mitigations. |
| **Turn off Memory Integrity (HVCI) & VBS** <br><sub>`win-hvci-off` · fps</sub> | Ultra | advanced | yes | restart | Turns off Core Isolation → Memory Integrity and virtualization-based security. |
| **Lighter visual effects** <br><sub>`win-visual-fx` · cpu</sub> | Good | safe | — | sign out | Switches Visual Effects to Custom and turns off minimise/maximise animation, taskbar animations, translucent selection and icon-label shadows. |
| **Lighter File Explorer** <br><sub>`win-explorer-light` · cpu</sub> | Good | safe | — | sign out | Shows icons instead of thumbnails and turns off smooth scrolling. |
| **Turn off SysMain (Superfetch)** <br><sub>`win-sysmain-off` · cpu</sub> | Plus | moderate | yes | — | Sets the SysMain service to Disabled and stops it. |
| **Turn off Prefetch** <br><sub>`win-prefetch-off` · cpu</sub> | Plus | moderate | yes | restart | Sets EnablePrefetcher = 0. |
| **Stop Store apps running in the background** <br><sub>`win-background-apps-off` · cpu</sub> | Good | safe | — | — | Turns off "Let apps run in the background" for Store apps. |
| **Turn off Windows Search indexing** <br><sub>`win-search-index-off` · cpu</sub> | Plus | moderate | yes | — | Sets the Windows Search service (WSearch) to Disabled and stops it. |
| **Turn off memory compression** <br><sub>`win-memory-compression-off` · cpu</sub> | Pro | moderate | yes | restart | Disable-MMAgent -MemoryCompression. |
| **Fixed-size page file** <br><sub>`win-pagefile-fixed` · cpu</sub> | Pro | moderate | yes | restart | Sets a fixed page file on your Windows drive equal to your RAM (8–32 GB). |
| **Turn off Network Data Usage monitor** <br><sub>`win-ndu-off` · cpu</sub> | Pro | moderate | yes | restart | Sets the Ndu driver to Disabled. |
| **Turn off Fault Tolerant Heap** <br><sub>`win-fth-off` · stability</sub> | Plus | safe | yes | — | Sets FTH Enabled = 0. |
| **Turn off update sharing (Delivery Optimisation)** <br><sub>`win-delivery-opt-off` · network</sub> | Plus | safe | yes | — | Sets the Delivery Optimisation download mode policy to "HTTP only". |
| **No surprise update restarts** <br><sub>`win-update-no-restart` · stability</sub> | Plus | safe | yes | — | Sets the policy "No auto-restart with logged on users for scheduled automatic updates". |
| **Hardware-accelerated GPU scheduling on** <br><sub>`win-hags-on` · gpu</sub> | Pro | safe | yes | restart | Sets HwSchMode = 2 (Settings → Display → Graphics → Hardware-accelerated GPU scheduling). |
| **Run your display at its max refresh rate** <br><sub>`win-max-refresh` · gpu</sub> | Good | safe | — | — | Sets your main display to the highest refresh rate it supports at its current resolution. |
| **Longer GPU timeout (TdrDelay)** <br><sub>`win-tdr-delay` · stability</sub> | Plus | moderate | yes | restart | Sets TdrDelay = 8 seconds (Windows default is 2). |
| **Games get top GPU/CPU priority (MMCSS)** <br><sub>`win-gpu-priority` · gpu</sub> | Pro | safe | yes | — | Sets the Multimedia Class Scheduler "Games" task: GPU Priority 8, Priority 6, Scheduling Category High, SFIO Priority High. |
| **Less CPU reserved for background tasks** <br><sub>`win-system-responsiveness` · cpu</sub> | Pro | safe | yes | — | Sets SystemResponsiveness = 10 (the lowest Windows honours). |
| **Foreground app priority boost** <br><sub>`win-priority-separation` · cpu</sub> | Pro | moderate | yes | — | Sets Win32PrioritySeparation = 0x26 (short, variable quanta with the highest foreground boost). |
| **NVIDIA telemetry off** <br><sub>`win-nvidia-telemetry-off` · privacy</sub> | Plus | safe | yes | — | Sets NvTelemetryContainer to Disabled. |
| **Intel telemetry services off** <br><sub>`win-intel-telemetry-off` · privacy</sub> | Plus | safe | yes | — | Disables the Intel "SystemUsageReportSvc_QUEENCREEK" and "ESRV_SVC_QUEENCREEK" services. |
| **AMD user experience program off** <br><sub>`win-amd-telemetry-off` · privacy</sub> | Plus | safe | yes | — | Sets the AUEPLauncher service to Disabled. |
| **Disable Nagle's algorithm** <br><sub>`win-nagle-off` · network</sub> | Pro | safe | yes | — | Sets TcpAckFrequency = 1 and TCPNoDelay = 1 on your connected network adapters. |
| **Turn off network throttling** <br><sub>`win-network-throttling-off` · network</sub> | Pro | safe | yes | — | Sets NetworkThrottlingIndex = 0xFFFFFFFF. |
| **TCP receive auto-tuning: Normal** <br><sub>`win-tcp-autotuning` · network</sub> | Plus | safe | yes | — | "netsh int tcp set global autotuninglevel=normal". |
| **Receive-side scaling on** <br><sub>`win-rss-on` · network</sub> | Plus | safe | yes | — | "netsh int tcp set global rss=enabled". |
| **Receive segment coalescing off** <br><sub>`win-rsc-off` · network</sub> | Pro | safe | yes | — | "netsh int tcp set global rsc=disabled". |
| **TCP timestamps off** <br><sub>`win-tcp-timestamps-off` · network</sub> | Pro | safe | yes | — | "netsh int tcp set global timestamps=disabled". |
| **ECN on** <br><sub>`win-ecn-on` · network</sub> | Pro | safe | yes | — | "netsh int tcp set global ecncapability=enabled". |
| **Prefer IPv4 over IPv6** <br><sub>`win-prefer-ipv4` · network</sub> | Plus | safe | yes | restart | Sets DisabledComponents = 0x20 (Microsoft's recommended way to prefer IPv4). |
| **Turn off LLMNR** <br><sub>`win-llmnr-off` · network</sub> | Plus | safe | yes | — | Sets the policy EnableMulticast = 0. |
| **Turn off NetBIOS over TCP/IP** <br><sub>`win-netbios-off` · network</sub> | Pro | moderate | yes | — | Sets NetbiosOptions = 2 on your connected adapters. |
| **DNS: Cloudflare** <br><sub>`win-dns-cloudflare` · network</sub> | Plus | safe | yes | — | Sets 1.1.1.1 and 1.0.0.1 as DNS on your connected adapters. |
| **DNS: Google** <br><sub>`win-dns-google` · network</sub> | Plus | safe | yes | — | Sets 8.8.8.8 and 8.8.4.4 as DNS on your connected adapters. |
| **DNS: Quad9** <br><sub>`win-dns-quad9` · network</sub> | Plus | safe | yes | — | Sets 9.9.9.9 and 149.112.112.112 as DNS on your connected adapters. |
| **DNS: AdGuard** <br><sub>`win-dns-adguard` · network</sub> | Plus | safe | yes | — | Sets 94.140.14.14 and 94.140.15.15 as DNS on your connected adapters. |
| **DNS: custom servers** <br><sub>`win-dns-custom` · network</sub> | Pro | safe | yes | — | Sets the DNS servers you entered in Settings on your connected adapters. |
| **Turn off Energy-Efficient Ethernet** <br><sub>`win-nic-eee-off` · network</sub> | Pro | safe | yes | restart | Sets Energy-Efficient Ethernet / Green Ethernet / Advanced EEE / Gigabit Lite to off on adapters that have them. |
| **Interrupt moderation off** <br><sub>`win-nic-interrupt-mod-off` · network</sub> | Pro | moderate | yes | restart | Sets Interrupt Moderation to Disabled on adapters that support it. |
| **Large Send Offload off** <br><sub>`win-nic-lso-off` · network</sub> | Pro | safe | yes | restart | Sets Large Send Offload v2 (IPv4/IPv6) to Disabled. |
| **Flow control off** <br><sub>`win-nic-flow-control-off` · network</sub> | Pro | safe | yes | restart | Sets Flow Control to Disabled. |
| **Bigger network adapter buffers** <br><sub>`win-nic-buffers-max` · network</sub> | Pro | safe | yes | restart | Sets Receive and Transmit Buffers to the maximum your adapter allows. |
| **Wi-Fi power saving off (plugged in)** <br><sub>`win-wifi-max-perf` · network</sub> | Plus | safe | yes | — | Sets "Wireless Adapter Settings → Power Saving Mode" to Maximum Performance (plugged in). |
| **Wi-Fi roaming aggressiveness: lowest** <br><sub>`win-wifi-roam-low` · network</sub> | Pro | safe | yes | restart | Sets Roaming Aggressiveness to Lowest on adapters that support it. |
| **Prefer 5 GHz Wi-Fi** <br><sub>`win-wifi-prefer-5ghz` · network</sub> | Pro | safe | yes | restart | Sets Preferred Band to 5 GHz on adapters that support it. |
| **Disable mouse acceleration** <br><sub>`win-mouse-accel-off` · input</sub> | Good | safe | — | — | Sets MouseSpeed, MouseThreshold1 and MouseThreshold2 to 0 and applies it immediately. |
| **Pointer speed 6/11 (1:1)** <br><sub>`win-pointer-speed-6` · input</sub> | Good | safe | — | — | Sets pointer speed to the 6th notch (MouseSensitivity = 10). |
| **Fastest key repeat** <br><sub>`win-keyboard-fast` · input</sub> | Good | safe | — | — | Sets KeyboardDelay = 0 and KeyboardSpeed = 31 and applies it immediately. |
| **No Sticky/Filter/Toggle Keys pop-ups** <br><sub>`win-sticky-keys-off` · input</sub> | Good | safe | — | sign out | Turns off the keyboard shortcuts that open Sticky Keys, Filter Keys and Toggle Keys. |
| **Turn off Windows Ink Workspace** <br><sub>`win-ink-off` · input</sub> | Plus | safe | yes | — | Sets the policy AllowWindowsInkWorkspace = 0. |
| **Allow global timer resolution requests** <br><sub>`win-global-timer` · input</sub> | Ultra | advanced | yes | restart | Sets GlobalTimerResolutionRequests = 1. Pair it with "Hold 0.5 ms timer while gaming" (Game Mode Watcher). |
| **Turn off transparency effects** <br><sub>`win-transparency-off` · stability</sub> | Good | safe | — | — | Turns off Settings → Personalisation → Colours → Transparency effects. |
| **Turn off Windows Error Reporting** <br><sub>`win-error-reporting-off` · stability</sub> | Plus | safe | yes | — | Sets Windows Error Reporting Disabled = 1. |
| **Turn off Xbox services** <br><sub>`win-xbox-services-off` · stability</sub> | Plus | moderate | yes | — | Disables Xbox Live Auth Manager, Xbox Live Game Save and Xbox Live Networking Service. |
| **Stop Edge running in the background** <br><sub>`win-edge-background-off` · cpu</sub> | Plus | safe | yes | — | Sets Edge policies StartupBoostEnabled = 0 and BackgroundModeEnabled = 0. |
| **Turn off the Print Spooler** <br><sub>`win-print-spooler-off` · cpu</sub> | Plus | moderate | yes | — | Sets the Spooler service to Disabled and stops it. |
| **Turn off the Fax service** <br><sub>`win-fax-off` · cpu</sub> | Good | safe | yes | — | Sets the Fax service to Disabled. |
| **Turn off offline maps updates** <br><sub>`win-maps-broker-off` · cpu</sub> | Plus | safe | yes | — | Sets MapsBroker to Disabled. |
| **Turn off tips, ads and suggestions** <br><sub>`win-ads-off` · privacy</sub> | Good | safe | — | — | Turns off the Content Delivery Manager suggestions, silent app installs, lock-screen tips and the "finish setting up your device" screen. |
| **Minimum Windows telemetry** <br><sub>`win-telemetry-min` · privacy</sub> | Good | safe | yes | — | Sets the AllowTelemetry policy to the minimum and disables the DiagTrack and dmwappushservice services. |
| **Turn off compatibility telemetry tasks** <br><sub>`win-compat-telemetry-off` · privacy</sub> | Plus | safe | yes | — | Disables the Compatibility Appraiser, Program Data Updater and Customer Experience Improvement Program scheduled tasks. |
| **Turn off advertising ID** <br><sub>`win-advertising-id-off` · privacy</sub> | Good | safe | — | — | Sets AdvertisingInfo Enabled = 0. |
| **Turn off activity history** <br><sub>`win-activity-history-off` · privacy</sub> | Good | safe | yes | — | Sets PublishUserActivities and UploadUserActivities policies to 0. |
| **No feedback requests** <br><sub>`win-feedback-off` · privacy</sub> | Good | safe | — | — | Sets feedback frequency to Never and turns off tailored experiences. |
| **No web results in Start search** <br><sub>`win-web-search-off` · privacy</sub> | Good | safe | — | — | Sets DisableSearchBoxSuggestions = 1 and BingSearchEnabled = 0. |
| **Turn off Widgets / News and Interests** <br><sub>`win-widgets-off` · privacy</sub> | Good | safe | yes | — | Sets the AllowNewsAndInterests policy to 0 (Windows 11) and hides News and Interests (Windows 10). |
| **Turn off Copilot** <br><sub>`win-copilot-off` · privacy</sub> | Good | safe | — | — | Sets the TurnOffWindowsCopilot policy. |
| **Turn off Recall snapshots** <br><sub>`win-recall-off` · privacy</sub> | Good | safe | — | — | Sets the DisableAIDataAnalysis policy. |
| **Turn off Cortana** <br><sub>`win-cortana-off` · privacy</sub> | Good | safe | yes | — | Sets the AllowCortana policy to 0. |
| **Leave the Customer Experience Program** <br><sub>`win-ceip-off` · privacy</sub> | Good | safe | yes | — | Sets the CEIPEnable policy to 0. |
| **Auto HDR on** <br><sub>`win-auto-hdr` · picture</sub> | Pro | safe | — | — | Turns on Settings → Display → Graphics → Auto HDR (only this flag). |
| **Colour filters off** <br><sub>`win-color-filters-off` · picture</sub> | Plus | safe | — | — | Sets ColorFiltering Active = 0. |
| **Allow game QoS tags on home networks** <br><sub>`win-qos-no-nla` · network</sub> | Pro | safe | yes | restart | Sets Tcpip\QoS "Do not use NLA" = 1. |

**One-off actions:** Create a restore point (Good, admin) · Flush DNS cache (Good, admin) · Reset Winsock and TCP/IP (Good, admin) · Clear temporary files (Good) · Clear GPU shader caches (Good) · Clear crash dumps and old logs (Good) · Clear Windows Update download cache (Plus, admin) · Empty the Recycle Bin / Trash (Good) · Run SSD TRIM now (Good, admin) · Check & repair system files (SFC) (Plus, admin) · Repair the Windows image (DISM) (Plus, admin) · Remove preinstalled apps (Plus) · Clear standby memory (Pro, admin)

**Guides:** NVIDIA Control Panel: best 3D settings · AMD Software (Adrenalin): best settings · Intel graphics: best settings · G-Sync / FreeSync done right · Turn off in-game overlays · Windows Defender and games · BIOS settings worth checking · Monitor setup · Fix audio crackle and DPC latency · Visibility presets (Valorant / CS2) · HDR setup · Sharper text (ClearType) · Night light off while gaming · Keep drivers up to date · Pause Windows Update for a tournament · Cloud gaming (GeForce NOW / Xbox Cloud) · Wi-Fi for gaming

**Game profiles (31):** General (all games) (Good) · Apex Legends (Good) · Call of Duty (Black Ops / MW) (Good) · Counter-Strike 2 (Good) · Fortnite (Good) · League of Legends (Good) · Minecraft (Good) · Roblox (Good) · Valorant (Good) · Call of Duty: Warzone (Plus) · Dota 2 (Plus) · Fall Guys (Plus) · Genshin Impact (Plus) · GTA V / GTA Online (Plus) · Marvel Rivals (Plus) · Overwatch 2 (Plus) · PUBG: Battlegrounds (Plus) · Rainbow Six Siege X (Plus) · Rocket League (Plus) · Team Fortress 2 (Plus) · The Finals (Plus) · Cyberpunk 2077 (Ultra) · Deadlock (Ultra) · Delta Force (Ultra) · Destiny 2 (Ultra) · Elden Ring (Ultra) · Escape from Tarkov (Ultra) · Helldivers 2 (Ultra) · Lethal Company (Ultra) · Palworld (Ultra) · Rust (Ultra)

## macOS

| Tweak | Plan | Risk | Admin | Restart | What it changes |
|---|---|---|---|---|---|
| **Reduce motion** <br><sub>`mac-reduce-motion` · fps</sub> | Good | safe | — | — | Turns on Accessibility → Display → Reduce motion. |
| **Reduce transparency** <br><sub>`mac-reduce-transparency` · fps</sub> | Good | safe | — | — | Turns on Accessibility → Display → Reduce transparency. |
| **No window open/close animations** <br><sub>`mac-window-anim-off` · fps</sub> | Good | safe | — | — | Sets NSAutomaticWindowAnimationsEnabled = false. |
| **Faster Dock & Mission Control** <br><sub>`mac-dock-fast` · fps</sub> | Good | safe | — | — | Sets Dock auto-hide delay to 0, auto-hide animation to 0.15 s and Mission Control animation to 0.1 s. |
| **No Dock bouncing** <br><sub>`mac-dock-bounce-off` · fps</sub> | Good | safe | — | — | Sets no-bouncing = true and launchanim = false. |
| **Keep Spaces in order** <br><sub>`mac-spaces-fixed` · fps</sub> | Good | safe | — | — | Turns off "Automatically rearrange Spaces based on most recent use". |
| **Faster Finder** <br><sub>`mac-finder-anim-off` · cpu</sub> | Good | safe | — | — | Sets Finder DisableAllAnimations = true. |
| **Low Power Mode off** <br><sub>`mac-low-power-off` · fps</sub> | Good | safe | yes | — | Sets pmset lowpowermode 0 (always). |
| **High Power Mode (plugged in)** <br><sub>`mac-high-power` · gpu</sub> | Pro | moderate | yes | — | Sets pmset powermode 2 on charger, on Macs that support High Power Mode. |
| **Turn off App Nap** <br><sub>`mac-app-nap-off` · fps</sub> | Plus | safe | — | — | Sets NSAppSleepDisabled = true for all apps. |
| **Turn off pointer acceleration** <br><sub>`mac-mouse-accel-off` · input</sub> | Good | safe | — | sign out | Turns off System Settings → Mouse → Pointer acceleration (com.apple.mouse.linear). |
| **Fastest key repeat** <br><sub>`mac-key-repeat-fast` · input</sub> | Good | safe | — | sign out | Sets KeyRepeat = 2 and InitialKeyRepeat = 15. |
| **Hold keys to repeat (not accents)** <br><sub>`mac-press-hold-off` · input</sub> | Good | safe | — | — | Sets ApplePressAndHoldEnabled = false. |
| **Pause Spotlight indexing** <br><sub>`mac-spotlight-off` · cpu</sub> | Plus | moderate | yes | — | Runs "mdutil -i off /". |
| **Turn off Siri** <br><sub>`mac-siri-off` · privacy</sub> | Plus | safe | — | — | Turns off "Ask Siri" and hides it from the menu bar. |
| **Don't download macOS updates in the background** <br><sub>`mac-auto-update-download-off` · network</sub> | Plus | safe | yes | — | Turns off "Download new updates when available" (system setting). |
| **No crash pop-ups over your game** <br><sub>`mac-crash-dialog-off` · stability</sub> | Plus | safe | — | — | Sets CrashReporter DialogType = none. |
| **Stop AirDrop Wi-Fi ping spikes** <br><sub>`mac-awdl-off` · network</sub> | Pro | moderate | yes | — | Takes the awdl0 interface down until you restart (or Revert). |
| **TCP delayed ACK off** <br><sub>`mac-delayed-ack-off` · network</sub> | Pro | safe | yes | — | Sets net.inet.tcp.delayed_ack = 0 until you restart. |
| **DNS: Cloudflare** <br><sub>`mac-dns-cloudflare` · network</sub> | Plus | safe | yes | — | Sets 1.1.1.1 and 1.0.0.1 as DNS on your connected network services. |
| **DNS: Google** <br><sub>`mac-dns-google` · network</sub> | Plus | safe | yes | — | Sets 8.8.8.8 and 8.8.4.4 as DNS on your connected network services. |
| **DNS: Quad9** <br><sub>`mac-dns-quad9` · network</sub> | Plus | safe | yes | — | Sets 9.9.9.9 and 149.112.112.112 as DNS on your connected network services. |
| **DNS: AdGuard** <br><sub>`mac-dns-adguard` · network</sub> | Plus | safe | yes | — | Sets 94.140.14.14 and 94.140.15.15 as DNS on your connected network services. |
| **Metal performance HUD** <br><sub>`mac-metal-hud` · picture</sub> | Pro | safe | — | — | Sets MetalForceHudEnabled = true. |

**One-off actions:** Flush DNS cache (Good, admin) · Clear temporary files (Good) · Clear GPU shader caches (Good) · Clear crash dumps and old logs (Good) · Empty the Recycle Bin / Trash (Good) · Free cached memory (Plus, admin)

**Guides:** Turn off in-game overlays · Monitor setup · macOS Game Mode · Do Not Disturb while gaming · ProMotion / refresh rate · Startup items · Cloud gaming (GeForce NOW / Xbox Cloud) · Wi-Fi for gaming

**Game profiles (7):** General (all games) (Good) · League of Legends (Good) · Minecraft (Good) · Roblox (Good) · Dota 2 (Plus) · Cyberpunk 2077 (Ultra) · Palworld (Ultra)

## Linux

| Tweak | Plan | Risk | Admin | Restart | What it changes |
|---|---|---|---|---|---|
| **CPU governor: performance** <br><sub>`linux-governor-performance` · fps</sub> | Good | safe | yes | — | Sets every core's cpufreq governor to "performance" (until restart). |
| **CPU energy preference: performance** <br><sub>`linux-epp-performance` · fps</sub> | Plus | safe | yes | — | Sets energy_performance_preference to "performance" on every core (until restart). |
| **Make sure CPU boost is on** <br><sub>`linux-turbo-on` · fps</sub> | Good | safe | yes | — | Sets intel_pstate no_turbo = 0 or cpufreq boost = 1, whichever your CPU uses. |
| **Power profile: performance** <br><sub>`linux-power-profile` · fps</sub> | Good | safe | — | — | Runs "powerprofilesctl set performance". |
| **tuned profile: latency-performance** <br><sub>`linux-tuned-latency` · fps</sub> | Plus | safe | yes | — | Runs "tuned-adm profile latency-performance". |
| **Install Feral GameMode** <br><sub>`linux-gamemode` · fps</sub> | Plus | safe | yes | — | Installs the "gamemode" package from your distro. |
| **Install MangoHud** <br><sub>`linux-mangohud` · picture</sub> | Plus | safe | yes | — | Installs the "mangohud" package. |
| **MangoHud gaming preset** <br><sub>`linux-mangohud-config` · picture</sub> | Plus | safe | — | — | Writes ~/.config/MangoHud/MangoHud.conf (your old file is backed up). |
| **Lower swappiness** <br><sub>`linux-swappiness` · cpu</sub> | Plus | safe | yes | — | Sets vm.swappiness = 10 (default 60). |
| **Smoother disk writeback** <br><sub>`linux-dirty-writeback` · cpu</sub> | Plus | safe | yes | — | Sets vm.dirty_ratio = 10 and vm.dirty_background_ratio = 5. |
| **Keep file cache longer** <br><sub>`linux-vfs-cache` · cpu</sub> | Plus | safe | yes | — | Sets vm.vfs_cache_pressure = 50 (default 100). |
| **Raise vm.max_map_count (SteamOS value)** <br><sub>`linux-max-map-count` · stability</sub> | Plus | safe | yes | — | Sets vm.max_map_count = 2147483642, the value SteamOS and Fedora use. |
| **Turn off split-lock slowdown** <br><sub>`linux-split-lock-off` · stability</sub> | Plus | safe | yes | — | Sets kernel.split_lock_mitigate = 0 (as SteamOS does). |
| **Transparent huge pages: madvise** <br><sub>`linux-thp-madvise` · cpu</sub> | Pro | safe | yes | — | Sets /sys/kernel/mm/transparent_hugepage/enabled to "madvise" (until restart). |
| **Higher open-file limit (esync)** <br><sub>`linux-file-limits` · stability</sub> | Pro | safe | yes | restart | Adds a limits.d file and a systemd drop-in raising the open-files limit to 1,048,576. |
| **Turn off the NMI watchdog** <br><sub>`linux-nmi-watchdog-off` · input</sub> | Pro | moderate | yes | — | Sets kernel.nmi_watchdog = 0. |
| **Compressed RAM swap (zram)** <br><sub>`linux-zram` · cpu</sub> | Plus | safe | yes | restart | Installs zram-generator and configures half your RAM (max 8 GB) as zstd-compressed swap. |
| **NVMe I/O scheduler: none** <br><sub>`linux-io-nvme-none` · stability</sub> | Plus | safe | yes | — | Sets the I/O scheduler of NVMe drives to "none" (until restart). |
| **SATA SSD I/O scheduler: mq-deadline** <br><sub>`linux-io-ssd-deadline` · stability</sub> | Plus | safe | yes | — | Sets SATA SSDs (not hard drives) to "mq-deadline" (until restart). |
| **BBR congestion control + fq** <br><sub>`linux-bbr` · network</sub> | Pro | safe | yes | — | Sets net.ipv4.tcp_congestion_control = bbr and net.core.default_qdisc = fq. |
| **TCP Fast Open** <br><sub>`linux-tcp-fastopen` · network</sub> | Pro | safe | yes | — | Sets net.ipv4.tcp_fastopen = 3. |
| **Low-latency TCP settings** <br><sub>`linux-tcp-latency` · network</sub> | Pro | safe | yes | — | Sets tcp_slow_start_after_idle = 0 and tcp_mtu_probing = 1. |
| **Bigger socket buffers** <br><sub>`linux-net-buffers` · network</sub> | Pro | safe | yes | — | Sets net.core.rmem_max and wmem_max to 16 MB. |
| **DNS: Cloudflare** <br><sub>`linux-dns-cloudflare` · network</sub> | Plus | safe | yes | — | Adds a systemd-resolved drop-in using 1.1.1.1 and 1.0.0.1. |
| **DNS: Google** <br><sub>`linux-dns-google` · network</sub> | Plus | safe | yes | — | Adds a systemd-resolved drop-in using 8.8.8.8 and 8.8.4.4. |
| **DNS: Quad9** <br><sub>`linux-dns-quad9` · network</sub> | Plus | safe | yes | — | Adds a systemd-resolved drop-in using 9.9.9.9 and 149.112.112.112. |
| **DNS: AdGuard** <br><sub>`linux-dns-adguard` · network</sub> | Plus | safe | yes | — | Adds a systemd-resolved drop-in using 94.140.14.14 and 94.140.15.15. |
| **Encrypted DNS (DNS-over-TLS)** <br><sub>`linux-dns-dot` · network</sub> | Pro | safe | yes | — | Sets systemd-resolved DNSOverTLS = opportunistic. |
| **Bigger shader cache (Mesa)** <br><sub>`linux-mesa-cache-size` · gpu</sub> | Pro | safe | — | sign out | Sets MESA_SHADER_CACHE_MAX_SIZE=10G for your user session. |
| **NVIDIA: prefer maximum performance** <br><sub>`linux-nvidia-powermizer` · gpu</sub> | Pro | safe | — | — | Sets PowerMizer mode to "Prefer Maximum Performance" via nvidia-settings (X11 session). |
| **AMD GPU: high performance level** <br><sub>`linux-amd-high-perf` · gpu</sub> | Pro | moderate | yes | — | Sets power_dpm_force_performance_level = high (until restart). |
| **Flat mouse acceleration (GNOME)** <br><sub>`linux-mouse-flat` · input</sub> | Good | safe | — | — | Sets the GNOME mouse accel-profile to "flat" (libinput). |
| **Faster key repeat (GNOME)** <br><sub>`linux-key-repeat` · input</sub> | Good | safe | — | — | Sets keyboard delay 200 ms and repeat interval 25 ms. |
| **Low-latency audio (PipeWire)** <br><sub>`linux-pipewire-lowlatency` · input</sub> | Pro | safe | — | — | Adds a PipeWire drop-in with a minimum quantum of 256 samples (~5 ms). |
| **Turn off GNOME animations** <br><sub>`linux-gnome-animations-off` · fps</sub> | Good | safe | — | — | Sets org.gnome.desktop.interface enable-animations = false. |
| **Pause GNOME file indexing** <br><sub>`linux-tracker-off` · cpu</sub> | Plus | safe | — | — | Turns off Tracker file monitoring and crawling. |
| **Turn off the printing service** <br><sub>`linux-cups-off` · cpu</sub> | Plus | moderate | yes | — | Disables and stops cups.service. |
| **Turn off ModemManager** <br><sub>`linux-modemmanager-off` · cpu</sub> | Plus | safe | yes | — | Disables and stops ModemManager.service. |
| **Turn off Avahi (mDNS)** <br><sub>`linux-avahi-off` · network</sub> | Plus | moderate | yes | — | Disables avahi-daemon.service and its socket. |

**One-off actions:** Flush DNS cache (Good, admin) · Clear temporary files (Good) · Clear GPU shader caches (Good) · Empty the Recycle Bin / Trash (Good) · Run SSD TRIM now (Good, admin) · Free cached memory (Plus, admin)

**Guides:** Turn off in-game overlays · BIOS settings worth checking · Monitor setup · Keep drivers up to date · Steam launch options on Linux · Proton-GE (community Proton) · AMD GPU profiles with CoreCtrl · Compositor and fullscreen games · Cloud gaming (GeForce NOW / Xbox Cloud) · Wi-Fi for gaming

**Game profiles (15):** General (all games) (Good) · Counter-Strike 2 (Good) · Minecraft (Good) · Dota 2 (Plus) · Marvel Rivals (Plus) · Overwatch 2 (Plus) · Rocket League (Plus) · Team Fortress 2 (Plus) · The Finals (Plus) · Cyberpunk 2077 (Ultra) · Deadlock (Ultra) · Elden Ring (Ultra) · Helldivers 2 (Ultra) · Lethal Company (Ultra) · Palworld (Ultra)

## ChromeOS (Linux container)

| Tweak | Plan | Risk | Admin | Restart | What it changes |
|---|---|---|---|---|---|
| **Faster Android app animations** <br><sub>`cros-android-animations` · fps</sub> | Plus | safe | — | — | Sets Android window, transition and animator duration scale to 0.5x over adb. |
| **Android private DNS: Cloudflare** <br><sub>`cros-android-dns-cloudflare` · network</sub> | Plus | safe | — | — | Sets Android Private DNS to one.one.one.one over adb. |
| **Android private DNS: Google** <br><sub>`cros-android-dns-google` · network</sub> | Plus | safe | — | — | Sets Android Private DNS to dns.google over adb. |
| **Keep Android awake while charging** <br><sub>`cros-android-stay-awake` · stability</sub> | Plus | safe | — | — | Sets stay_on_while_plugged_in = 3 (AC and USB) over adb. |
| **MangoHud preset for Linux games** <br><sub>`cros-container-mangohud-config` · picture</sub> | Plus | safe | — | — | Writes ~/.config/MangoHud/MangoHud.conf in your Linux container. |

**One-off actions:** Clear temporary files (Good) · Clear Linux container cache (Good)

**Guides:** Memory Saver and tabs · Secure DNS for the whole Chromebook · Performance vs battery · Cloud gaming (GeForce NOW / Xbox Cloud) · Wi-Fi for gaming

**Game profiles (1):** General (all games) (Good)
