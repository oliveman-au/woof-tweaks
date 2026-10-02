'use strict';
// Windows tweaks. Every one is a list of exact changes (registry values, services, power settings…);
// the engine snapshots each value first and Revert puts back exactly what was there.
// Plan tiers live in src/config/tiers.js (one place to change them).

const W = ['win32'];
const HKCU = 'HKCU\\';
const HKLM = 'HKLM\\';
const dw = (key, name, value) => ({ t: 'reg', key, name, type: 'dword', value });
const sz = (key, name, value) => ({ t: 'reg', key, name, type: 'sz', value });
const svc = (name, start = 'Disabled', stop = true) => ({ t: 'service', name, start, stop });
const task = (path, name) => ({ t: 'task', path, name, enabled: false });
const pset = (sub, setting, ac, label, scheme) => ({ t: 'powerSetting', sub, setting, ac, label, ...(scheme ? { scheme } : {}) });
const netsh = (setting, value) => ({ t: 'netsh', setting, value });
const nic = (keyword, value, label) => ({ t: 'adapterProp', keyword, value, label });

// Power setting GUIDs (powercfg aliases aren't available for all of them).
const SUB_PROCESSOR = '54533251-82be-4824-96c1-47b60b740d00';
const SUB_USB = '2a737441-1930-4402-8d77-b2bebba308a3';
const SUB_PCIE = 'ee12f906-d277-404b-b6da-e5fa1a576df5';
const SUB_DISK = '0012ee47-9041-4b5d-9b77-535fba8b1442';
const SUB_WIFI = '19cbb8fa-5279-450e-9fac-8a3d5fedd0c1';
const PROC_MIN = '893dee8e-2bef-41e0-89c6-b55d0929964c';
const CORE_PARK_MIN = '0cc5b647-c1df-4637-891a-dec35c318583';
const IDLE_DISABLE = '5d76a2ca-e8c0-402f-a133-2158492d58ad';
const USB_SUSPEND = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226';
const PCIE_ASPM = '501a4d13-42af-4429-9fd1-a8218c268e20';
const DISK_IDLE = '6738e2c4-e8a5-4a42-b16a-e040e769756e';
const WIFI_POWER = '12bbebe6-58d6-4636-95bb-3217ef867c1a';
// Our own power plans (fixed GUIDs so we can recognise and remove them on Revert).
const PLAN_HIGH = 'a5b0d0f6-3c51-4b5e-9a0e-57f0f0c1a001';
const PLAN_ULTIMATE = 'a5b0d0f6-3c51-4b5e-9a0e-57f0f0c1a002';
const PLAN_WOOF = 'a5b0d0f6-3c51-4b5e-9a0e-57f0f0c1a003';
const TPL_HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const TPL_ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';

const MM = `${HKLM}SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile`;
const GAMES_TASK = `${MM}\\Tasks\\Games`;
const DX_USER = `${HKCU}Software\\Microsoft\\DirectX\\UserGpuPreferences`;
const CDM = `${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager`;
const ADV = `${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced`;
const TCPIP_IF = `${HKLM}SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces`;

const laptopWarn = (hw) => (hw.isLaptop ? 'You\'re on a laptop: this uses more battery and runs warmer. Best used while plugged in.' : null);
const hddWarn = (hw) => (hw.systemDisk === 'hdd' ? 'Your Windows drive is a hard drive (HDD). This helps on hard drives, so we recommend leaving it on.' : null);
const win11 = (hw) => (hw.osBuild && hw.osBuild < 22000 ? 'Needs Windows 11.' : null);
const adapters = (ctx) => (ctx.hw && ctx.hw.netAdapters) || [];

const T = (o) => ({ os: W, risk: 'safe', reboot: false, ...o });

module.exports = [
  // ======================= FPS & power =======================
  T({
    id: 'win-plan-high', name: 'High Performance power plan', category: 'fps', exclusive: 'power-plan',
    desc: 'Keeps your CPU at full speed instead of saving power.',
    long: { what: 'Creates a "High performance (Woof Tweaks)" power plan and switches to it.', why: 'The Balanced plan lowers CPU clocks between bursts, which can cause small frame-time spikes.', risk: 'Higher power use and heat. Revert switches back to your old plan and deletes ours.' },
    changes: [{ t: 'powerScheme', guid: PLAN_HIGH, template: TPL_HIGH, label: 'High performance (Woof Tweaks)', description: 'Created by Woof Tweaks' }],
    warn: laptopWarn, recommend: (hw) => !hw.isLaptop, tags: ['fps', 'power', 'cpu'],
  }),
  T({
    id: 'win-plan-ultimate', name: 'Ultimate Performance power plan', category: 'fps', exclusive: 'power-plan', risk: 'moderate',
    desc: 'Windows\' hidden top-performance plan: no power-saving delays at all.',
    long: { what: 'Unlocks Microsoft\'s Ultimate Performance plan as "Ultimate Performance (Woof Tweaks)" and switches to it.', why: 'Removes the small delays Windows uses to save power, for the most consistent clocks.', risk: 'Noticeably more power and heat; not worth it on battery. Revert switches back and deletes it.' },
    changes: [{ t: 'powerScheme', guid: PLAN_ULTIMATE, template: TPL_ULTIMATE, label: 'Ultimate Performance (Woof Tweaks)', description: 'Created by Woof Tweaks' }],
    warn: laptopWarn, recommend: (hw) => !hw.isLaptop && hw.cpuCores >= 6, tags: ['fps', 'power'],
  }),
  T({
    id: 'win-plan-woof', name: 'Woof Gaming power plan', category: 'fps', exclusive: 'power-plan', risk: 'moderate',
    desc: 'High Performance tuned for games: no core parking, no USB/PCIe/disk sleep when plugged in.',
    long: { what: 'Creates a "Woof Gaming" plan from High performance with, when plugged in: CPU minimum 100%, core parking off, USB selective suspend off, PCIe link power saving off and disks never sleep. Battery settings stay at Windows defaults.', why: 'Each of those power savers can add wake-up delay or stutter during play.', risk: 'More power and heat while plugged in. Revert switches back to your old plan and deletes it.' },
    changes: [
      { t: 'powerScheme', guid: PLAN_WOOF, template: TPL_HIGH, label: 'Woof Gaming', description: 'Created by Woof Tweaks for gaming' },
      pset(SUB_PROCESSOR, PROC_MIN, 100, 'Minimum processor state', PLAN_WOOF),
      pset(SUB_PROCESSOR, CORE_PARK_MIN, 100, 'Core parking (min cores)', PLAN_WOOF),
      pset(SUB_USB, USB_SUSPEND, 0, 'USB selective suspend', PLAN_WOOF),
      pset(SUB_PCIE, PCIE_ASPM, 0, 'PCIe link state power management', PLAN_WOOF),
      pset(SUB_DISK, DISK_IDLE, 0, 'Turn off hard disk after', PLAN_WOOF),
    ],
    warn: laptopWarn, recommend: (hw) => !hw.isLaptop, tags: ['fps', 'power', 'stutter'],
  }),
  T({
    id: 'win-cpu-min-100', name: 'Minimum CPU state 100%', category: 'fps',
    desc: 'Stops Windows dropping CPU speed when plugged in.',
    long: { what: 'Sets "Minimum processor state" to 100% (plugged in) on your current power plan.', why: 'Avoids the ramp-up delay when a game suddenly needs more CPU.', risk: 'More idle power and heat. Battery setting is untouched.' },
    changes: [pset(SUB_PROCESSOR, PROC_MIN, 100, 'Minimum processor state')], warn: laptopWarn, tags: ['fps', 'cpu', 'stutter'],
  }),
  T({
    id: 'win-core-parking-off', name: 'Turn off CPU core parking', category: 'fps',
    desc: 'Keeps all CPU cores awake so games don\'t wait for one to wake up.',
    long: { what: 'Sets "Processor performance core parking min cores" to 100% (plugged in) on your current plan.', why: 'Parked cores take time to wake, which can cause hitches in CPU-heavy games.', risk: 'Slightly higher idle power. Modern CPUs often manage this well already.' },
    changes: [pset(SUB_PROCESSOR, CORE_PARK_MIN, 100, 'Core parking (min cores)')], warn: laptopWarn, tags: ['fps', 'cpu', 'stutter'],
  }),
  T({
    id: 'win-cpu-idle-off', name: 'Disable CPU idle states (C-states)', category: 'fps', risk: 'advanced',
    desc: 'CPU never idles while plugged in. Lowest latency, much more heat.',
    long: { what: 'Sets "Processor idle disable" on your current plan (plugged in).', why: 'Removes the tiny delay of waking from idle. Only competitive players chasing every microsecond benefit.', risk: 'Your CPU runs at 100% power all the time: much more heat, fan noise and electricity. Not for laptops. Revert restores it.' },
    changes: [pset(SUB_PROCESSOR, IDLE_DISABLE, 1, 'Processor idle disable')],
    guard: (hw) => (hw.isLaptop ? 'Not allowed on laptops — it would overheat and drain the battery.' : null), tags: ['latency', 'cpu'],
  }),
  T({
    id: 'win-game-mode', name: 'Windows Game Mode on', category: 'fps',
    desc: 'Tells Windows to prioritise the game and pause background updates.',
    long: { what: 'Turns on Game Mode (Settings → Gaming → Game Mode).', why: 'Windows gives the game more CPU/GPU priority and holds back Windows Update installs and restart notifications while you play.', risk: 'Safe. On by default on most PCs; this makes sure it\'s on.' },
    changes: [dw(`${HKCU}Software\\Microsoft\\GameBar`, 'AutoGameModeEnabled', 1), dw(`${HKCU}Software\\Microsoft\\GameBar`, 'AllowAutoGameMode', 1)], tags: ['fps'],
  }),
  T({
    id: 'win-game-dvr-off', name: 'Turn off Game DVR / background recording', category: 'fps',
    desc: 'Stops Xbox Game Bar recording the last few minutes in the background.',
    long: { what: 'Turns off background recording (Captures) for games.', why: 'Background recording constantly encodes video, costing FPS and adding stutter on weaker PCs.', risk: 'You can\'t use Win+Alt+G to save clips. Turn it back on with Revert.' },
    changes: [dw(`${HKCU}System\\GameConfigStore`, 'GameDVR_Enabled', 0), dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR`, 'AppCaptureEnabled', 0)], tags: ['fps', 'stutter', 'recording'],
  }),
  T({
    id: 'win-game-bar-off', name: 'Turn off Xbox Game Bar shortcuts', category: 'fps',
    desc: 'Stops Game Bar popping up from the Xbox button or on game start.',
    long: { what: 'Turns off "Open Xbox Game Bar using the controller button" and the startup tips panel.', why: 'Prevents the overlay opening by accident mid-game.', risk: 'Safe. Game Bar still works from Win+G.' },
    changes: [dw(`${HKCU}Software\\Microsoft\\GameBar`, 'UseNexusForGameBarEnabled', 0), dw(`${HKCU}Software\\Microsoft\\GameBar`, 'ShowStartupPanel', 0)], tags: ['overlay'],
  }),
  T({
    id: 'win-fso-off', name: 'Disable fullscreen optimisations (all games)', category: 'fps',
    desc: 'Lets fullscreen games run in true exclusive fullscreen.',
    long: { what: 'Sets the Game DVR "fullscreen exclusive behaviour" values so games that ask for exclusive fullscreen get it.', why: 'Some DirectX 9/11 games have lower input lag and fewer frame-pacing issues in true exclusive fullscreen.', risk: 'Alt-Tab can be slower. On Windows 11 with "Optimizations for windowed games" this matters less.' },
    changes: [
      dw(`${HKCU}System\\GameConfigStore`, 'GameDVR_FSEBehaviorMode', 2),
      dw(`${HKCU}System\\GameConfigStore`, 'GameDVR_FSEBehavior', 2),
      dw(`${HKCU}System\\GameConfigStore`, 'GameDVR_HonorUserFSEBehaviorMode', 1),
      dw(`${HKCU}System\\GameConfigStore`, 'GameDVR_DXGIHonorFSEWindowsCompatible', 1),
    ], tags: ['fps', 'latency', 'fullscreen'],
  }),
  T({
    id: 'win-mpo-off', name: 'Disable Multi-Plane Overlay (MPO)', category: 'stability', risk: 'moderate', reboot: 'restart',
    desc: 'Fixes flicker and stutter in borderless games on some NVIDIA/AMD setups.',
    long: { what: 'Sets the DWM OverlayTestMode value that NVIDIA and AMD recommend for MPO-related flicker.', why: 'MPO bugs cause black flicker, stutter in borderless windowed games and browser video stutter on some driver/monitor combinations.', risk: 'Only use if you have flicker or borderless stutter. Some Windows 11 24H2+ builds ignore it. Needs a restart.' },
    changes: [dw(`${HKLM}SOFTWARE\\Microsoft\\Windows\\Dwm`, 'OverlayTestMode', 5)], tags: ['stutter', 'flicker'],
  }),
  T({
    id: 'win-windowed-opt', name: 'Optimisations for windowed games', category: 'fps',
    desc: 'Windows 11: lower latency and VRR support for borderless/windowed games.',
    long: { what: 'Turns on Settings → Display → Graphics → "Optimizations for windowed games" (only this flag; other graphics flags are kept).', why: 'Uses the modern flip presentation model for DX10/11 windowed games: lower latency, VRR and Auto HDR work.', risk: 'Safe. A few old games may not like it — Revert turns it off.' },
    changes: [{ t: 'regFlags', key: DX_USER, name: 'DirectXUserGlobalSettings', flags: { SwapEffectUpgradeEnable: '1' } }], guard: win11, tags: ['fps', 'latency', 'windowed'],
  }),
  T({
    id: 'win-vrr', name: 'Variable refresh rate for all games', category: 'gpu',
    desc: 'Lets G-Sync/FreeSync work in DX11 games that don\'t support it natively.',
    long: { what: 'Turns on Settings → Display → Graphics → "Variable refresh rate" (only this flag).', why: 'Smoother motion and no tearing on G-Sync/FreeSync monitors in more games.', risk: 'Only does something if your monitor and GPU support VRR.' },
    changes: [{ t: 'regFlags', key: DX_USER, name: 'DirectXUserGlobalSettings', flags: { VRROptimizeEnable: '1' } }], tags: ['gpu', 'vrr', 'gsync', 'freesync', 'tearing'],
  }),
  T({
    id: 'win-power-throttling-off', name: 'Turn off power throttling', category: 'fps', reboot: 'restart',
    desc: 'Stops Windows slowing down apps it thinks are in the background.',
    long: { what: 'Sets PowerThrottlingOff = 1.', why: 'Windows can throttle processes it considers background (e.g. a game while you alt-tab, or game launchers/voice chat).', risk: 'Slightly higher battery use on laptops. Needs a restart.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling`, 'PowerThrottlingOff', 1)], warn: laptopWarn, tags: ['fps', 'cpu', 'background'],
  }),
  T({
    id: 'win-usb-suspend-off', name: 'Turn off USB selective suspend', category: 'input',
    desc: 'Stops Windows putting your mouse, keyboard or headset to sleep.',
    long: { what: 'Sets USB selective suspend to Disabled (plugged in) on your current plan.', why: 'Fixes peripherals that disconnect, lag on first input, or crackle (USB audio).', risk: 'Slightly higher power use when plugged in. Battery setting untouched.' },
    changes: [pset(SUB_USB, USB_SUSPEND, 0, 'USB selective suspend')], tags: ['input', 'usb', 'mouse', 'audio', 'disconnect'],
  }),
  T({
    id: 'win-pcie-aspm-off', name: 'Turn off PCIe link power saving', category: 'fps',
    desc: 'Stops your GPU and NVMe drive link dropping into low-power mode.',
    long: { what: 'Sets "Link State Power Management" to Off (plugged in) on your current plan.', why: 'Waking the PCIe link adds tiny delays that can show up as micro-stutter.', risk: 'Slightly higher idle power when plugged in.' },
    changes: [pset(SUB_PCIE, PCIE_ASPM, 0, 'PCIe link state power management')], tags: ['stutter', 'gpu'],
  }),
  T({
    id: 'win-disk-sleep-off', name: 'Never put disks to sleep (plugged in)', category: 'fps',
    desc: 'Prevents a pause while a sleeping drive spins up mid-game.',
    long: { what: 'Sets "Turn off hard disk after" to Never (plugged in).', why: 'Avoids stalls when a game loads from a drive that went to sleep — mostly matters for hard drives.', risk: 'Hard drives keep spinning when idle (more noise/power).' },
    changes: [pset(SUB_DISK, DISK_IDLE, 0, 'Turn off hard disk after')], tags: ['stutter', 'disk', 'loading'],
  }),
  T({
    id: 'win-hibernate-off', name: 'Turn off hibernation', category: 'cpu', risk: 'moderate',
    desc: 'Frees several GB of disk (hiberfil.sys) and disables Fast Startup.',
    long: { what: 'Runs "powercfg /hibernate off".', why: 'Deletes the hibernation file (often the size of your RAM) and turns off Fast Startup, which can leave drivers in a bad state between boots.', risk: 'You lose Hibernate (laptops use it when the battery runs low). Revert turns it back on.' },
    changes: [{ t: 'hibernate', enabled: false }],
    warn: (hw) => (hw.isLaptop ? 'Laptops use hibernation to save your work when the battery runs out. Only turn it off if you understand that.' : null),
    recommend: (hw) => !hw.isLaptop, tags: ['disk', 'space', 'stutter'],
  }),
  T({
    id: 'win-fast-startup-off', name: 'Turn off Fast Startup', category: 'stability',
    desc: 'Gives you a truly fresh start each time you shut down.',
    long: { what: 'Sets HiberbootEnabled = 0.', why: 'Fast Startup saves the kernel and drivers to disk on shutdown, so driver glitches can survive a "shut down". Fixes odd GPU/USB/network issues for many people.', risk: 'Cold boot is a few seconds slower.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power`, 'HiberbootEnabled', 0)], tags: ['stability', 'drivers', 'boot'],
  }),
  T({
    id: 'win-dynamic-tick-off', name: 'Disable dynamic tick', category: 'input', risk: 'advanced', reboot: 'restart',
    desc: 'Keeps the system timer ticking steadily (boot setting).',
    long: { what: 'Runs "bcdedit /set disabledynamictick yes".', why: 'Dynamic tick saves power by skipping timer ticks when idle; some players report steadier frame pacing with it off.', risk: 'Small extra power use. Changes a boot setting — blocked automatically if BitLocker is on. Revert removes it. Needs a restart.' },
    changes: [{ t: 'bcd', name: 'disabledynamictick', value: 'yes' }],
    guard: (hw) => (hw.bitlocker === true ? 'BitLocker is on — changing boot settings could ask for your recovery key.' : null), tags: ['latency', 'timer', 'frame pacing'],
  }),
  T({
    id: 'win-hpet-default', name: 'Use the default system clock (no forced HPET)', category: 'input', risk: 'advanced', reboot: 'restart',
    desc: 'Removes a forced HPET boot setting if an old tweak tool added one.',
    long: { what: 'Removes the "useplatformclock" boot setting (Windows default).', why: 'Forcing HPET makes timing calls much slower on modern CPUs and can lower FPS. If it isn\'t set, nothing changes.', risk: 'Changes a boot setting — blocked if BitLocker is on. Needs a restart.' },
    changes: [{ t: 'bcd', name: 'useplatformclock', value: null }],
    guard: (hw) => (hw.bitlocker === true ? 'BitLocker is on — changing boot settings could ask for your recovery key.' : null), tags: ['timer', 'hpet', 'fps'],
  }),
  T({
    id: 'win-tsc-enhanced', name: 'Enhanced TSC sync policy', category: 'input', risk: 'advanced', reboot: 'restart',
    desc: 'Asks Windows to keep CPU time-stamp counters tightly in sync.',
    long: { what: 'Runs "bcdedit /set tscsyncpolicy enhanced".', why: 'Can help timing consistency on some multi-core CPUs. Most PCs won\'t see a measurable change.', risk: 'Boot setting — blocked if BitLocker is on. Needs a restart.' },
    changes: [{ t: 'bcd', name: 'tscsyncpolicy', value: 'enhanced' }],
    guard: (hw) => (hw.bitlocker === true ? 'BitLocker is on — changing boot settings could ask for your recovery key.' : null), tags: ['timer'],
  }),
  T({
    id: 'win-spectre-off', name: 'Disable Spectre/Meltdown protection', category: 'fps', risk: 'advanced', reboot: 'restart', security: true,
    desc: 'SECURITY RISK: removes CPU attack protections for a little CPU performance.',
    long: { what: 'Sets FeatureSettingsOverride/Mask = 3 (Microsoft KB4072698) to turn off the Spectre v2 and Meltdown mitigations.', why: 'On older Intel CPUs (pre-2019) these protections cost some CPU performance. On newer CPUs the gain is usually tiny.', risk: 'Makes your PC vulnerable to CPU side-channel attacks (e.g. malicious websites or programs reading memory). Never use on a PC with sensitive data. Revert turns protection back on after a restart.' },
    changes: [
      dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management`, 'FeatureSettingsOverride', 3),
      dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management`, 'FeatureSettingsOverrideMask', 3),
    ], tags: ['security', 'cpu'],
  }),
  T({
    id: 'win-hvci-off', name: 'Turn off Memory Integrity (HVCI) & VBS', category: 'fps', risk: 'advanced', reboot: 'restart', security: true,
    desc: 'SECURITY TRADE-OFF: can give 5–10% FPS in some games on some CPUs.',
    long: { what: 'Turns off Core Isolation → Memory Integrity and virtualization-based security.', why: 'Microsoft confirmed these can reduce gaming performance on some systems.', risk: 'Lowers protection against kernel-level malware. Some anti-cheats (e.g. FACEIT, some Vanguard setups) may ask you to turn it back on. If your PC enforces it with a UEFI lock this won\'t work. Revert after a restart restores it.' },
    changes: [
      dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity`, 'Enabled', 0),
      dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\DeviceGuard`, 'EnableVirtualizationBasedSecurity', 0),
    ], tags: ['security', 'fps', 'vbs', 'hvci', 'core isolation'],
  }),

  // ======================= CPU & RAM =======================
  T({
    id: 'win-visual-fx', name: 'Lighter visual effects', category: 'cpu', reboot: 'signout',
    desc: 'Turns off window animations, list shadows and fades. Text stays smooth.',
    long: { what: 'Switches Visual Effects to Custom and turns off minimise/maximise animation, taskbar animations, translucent selection and icon-label shadows.', why: 'Frees a little CPU/GPU and makes the desktop feel snappier on weaker PCs.', risk: 'Cosmetic only. Font smoothing is kept on. Takes effect after you sign out.' },
    changes: [
      dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects`, 'VisualFXSetting', 3),
      sz(`${HKCU}Control Panel\\Desktop\\WindowMetrics`, 'MinAnimate', '0'),
      dw(ADV, 'TaskbarAnimations', 0),
      dw(ADV, 'ListviewAlphaSelect', 0),
      dw(ADV, 'ListviewShadow', 0),
    ], tags: ['cpu', 'animations', 'visual effects', 'low end'],
  }),
  T({
    id: 'win-explorer-light', name: 'Lighter File Explorer', category: 'cpu', reboot: 'signout',
    desc: 'No thumbnails or smooth scrolling in folders.',
    long: { what: 'Shows icons instead of thumbnails and turns off smooth scrolling.', why: 'Big folders of videos/images open faster and use less disk on slow PCs. Not an FPS tweak.', risk: 'You won\'t see picture previews in Explorer.' },
    changes: [dw(ADV, 'IconsOnly', 1), dw(`${HKCU}Control Panel\\Desktop`, 'SmoothScroll', 0)], tags: ['explorer', 'low end'],
  }),
  T({
    id: 'win-sysmain-off', name: 'Turn off SysMain (Superfetch)', category: 'cpu', risk: 'moderate',
    desc: 'Stops Windows pre-loading apps into RAM in the background.',
    long: { what: 'Sets the SysMain service to Disabled and stops it.', why: 'On PCs with an SSD, SysMain\'s background disk/RAM activity can cause stutter while gaming and gives little benefit.', risk: 'On a hard drive (HDD) it genuinely speeds up app launches — keep it on there.' },
    changes: [svc('SysMain')], warn: hddWarn, recommend: (hw) => hw.systemDisk === 'ssd', tags: ['ram', 'disk', 'stutter', 'superfetch'],
  }),
  T({
    id: 'win-prefetch-off', name: 'Turn off Prefetch', category: 'cpu', risk: 'moderate', reboot: 'restart',
    desc: 'Stops Windows prefetching app files at startup.',
    long: { what: 'Sets EnablePrefetcher = 0.', why: 'Small benefit on fast SSDs (less background disk activity).', risk: 'On a hard drive, apps and boot get slower — keep it on there. Needs a restart.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters`, 'EnablePrefetcher', 0)],
    warn: hddWarn, recommend: () => false, tags: ['disk'],
  }),
  T({
    id: 'win-background-apps-off', name: 'Stop Store apps running in the background', category: 'cpu',
    desc: 'Microsoft Store apps can\'t run in the background unless open.',
    long: { what: 'Turns off "Let apps run in the background" for Store apps.', why: 'Saves RAM and CPU wakeups from apps you aren\'t using.', risk: 'Store apps (e.g. Mail, Phone Link) won\'t notify you until opened. Windows 11 may still allow some.' },
    changes: [dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications`, 'GlobalUserDisabled', 1), dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\Search`, 'BackgroundAppGlobalToggle', 0)],
    tags: ['ram', 'background', 'cpu'],
  }),
  T({
    id: 'win-search-index-off', name: 'Turn off Windows Search indexing', category: 'cpu', risk: 'moderate',
    desc: 'Stops the indexer scanning your drives (and game folders) in the background.',
    long: { what: 'Sets the Windows Search service (WSearch) to Disabled and stops it.', why: 'The indexer can cause disk and CPU spikes, especially after big game installs or updates.', risk: 'Start menu and Explorer file search still work but are slower for files. Apps search is unaffected.' },
    changes: [svc('WSearch')], tags: ['disk', 'cpu', 'stutter', 'indexing'],
  }),
  T({
    id: 'win-memory-compression-off', name: 'Turn off memory compression', category: 'cpu', risk: 'moderate', reboot: 'restart',
    desc: 'With 16 GB+ RAM, skip the CPU cost of compressing memory.',
    long: { what: 'Disable-MMAgent -MemoryCompression.', why: 'Compressing memory costs CPU time; with plenty of RAM it isn\'t needed.', risk: 'With less than 16 GB RAM this can make things WORSE (more disk paging). Needs a restart.' },
    changes: [{ t: 'mmagent', feature: 'MemoryCompression', enabled: false }],
    guard: (hw) => (hw.ramGB && hw.ramGB < 12 ? `You have ${hw.ramGB} GB RAM — memory compression helps you, so this is blocked.` : null),
    warn: (hw) => (hw.ramGB && hw.ramGB < 16 ? `You have ${hw.ramGB} GB RAM. This tweak is meant for 16 GB or more.` : null),
    recommend: (hw) => hw.ramGB >= 16, tags: ['ram', 'cpu'],
  }),
  T({
    id: 'win-pagefile-fixed', name: 'Fixed-size page file', category: 'cpu', risk: 'moderate', reboot: 'restart',
    desc: 'Stops the page file growing and shrinking mid-game.',
    long: { what: 'Sets a fixed page file on your Windows drive equal to your RAM (8–32 GB).', why: 'A system-managed page file resizes on demand, which can cause a hitch the moment it grows.', risk: 'Uses that much disk space permanently. Too small a page file can crash games that need lots of memory — we never go below 8 GB. Needs a restart.' },
    changes: (ctx) => {
      const gb = Math.min(32, Math.max(8, Math.round((ctx.hw && ctx.hw.ramGB) || 16)));
      const mb = gb * 1024;
      return [{ t: 'reg', key: `${HKLM}SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management`, name: 'PagingFiles', type: 'multisz', value: [`${(ctx.hw && ctx.hw.systemDrive) || 'C:'}\\pagefile.sys ${mb} ${mb}`] }];
    },
    guard: (hw) => (hw.systemFreeGB != null && hw.systemFreeGB < 40 ? 'Your Windows drive has less than 40 GB free.' : null), tags: ['ram', 'stutter', 'pagefile'],
  }),
  T({
    id: 'win-ndu-off', name: 'Turn off Network Data Usage monitor', category: 'cpu', risk: 'moderate', reboot: 'restart',
    desc: 'Stops a driver that tracks per-app data use (known to leak memory).',
    long: { what: 'Sets the Ndu driver to Disabled.', why: 'Ndu has known memory-leak bugs on some systems (non-paged pool growing over long sessions).', risk: 'Settings → Network → Data usage stops counting. Needs a restart.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Services\\Ndu`, 'Start', 4)], tags: ['ram', 'leak'],
  }),
  T({
    id: 'win-fth-off', name: 'Turn off Fault Tolerant Heap', category: 'stability',
    desc: 'Stops Windows slowing down a game after it crashed a few times.',
    long: { what: 'Sets FTH Enabled = 0.', why: 'After repeated crashes Windows silently applies "fault tolerant" memory mitigations to that program, which can make it slower forever.', risk: 'Safe. Programs that really depend on it may crash a bit more.' },
    changes: [dw(`${HKLM}SOFTWARE\\Microsoft\\FTH`, 'Enabled', 0)], tags: ['crash', 'stability'],
  }),
  T({
    id: 'win-delivery-opt-off', name: 'Turn off update sharing (Delivery Optimisation)', category: 'network',
    desc: 'Stops your PC uploading Windows updates to other PCs.',
    long: { what: 'Sets the Delivery Optimisation download mode policy to "HTTP only".', why: 'Peer-to-peer update sharing can use your upload bandwidth in the background, adding lag.', risk: 'Safe. Updates still download normally from Microsoft.' },
    changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization`, 'DODownloadMode', 0)], tags: ['network', 'ping', 'upload', 'updates'],
  }),
  T({
    id: 'win-update-no-restart', name: 'No surprise update restarts', category: 'stability',
    desc: 'Windows Update won\'t restart your PC while you\'re signed in.',
    long: { what: 'Sets the policy "No auto-restart with logged on users for scheduled automatic updates".', why: 'Stops Windows restarting mid-session to finish an update.', risk: 'Updates still install — you just restart when you choose. Remember to restart now and then.' },
    changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU`, 'NoAutoRebootWithLoggedOnUsers', 1)], tags: ['updates', 'restart'],
  }),

  // ======================= GPU =======================
  T({
    id: 'win-hags-on', name: 'Hardware-accelerated GPU scheduling on', category: 'gpu', reboot: 'restart',
    desc: 'Lets the GPU manage its own memory: needed for DLSS Frame Generation.',
    long: { what: 'Sets HwSchMode = 2 (Settings → Display → Graphics → Hardware-accelerated GPU scheduling).', why: 'Can reduce latency slightly and is required for NVIDIA DLSS 3 Frame Generation.', risk: 'Needs a supported GPU and driver (NVIDIA 10-series+, AMD RX 5000+). A few older games stutter with it — Revert turns it off. Needs a restart.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers`, 'HwSchMode', 2)], tags: ['gpu', 'latency', 'dlss', 'frame generation'],
  }),
  T({
    id: 'win-max-refresh', name: 'Run your display at its max refresh rate', category: 'gpu',
    desc: 'Many 144/165/240 Hz monitors are left at 60 Hz by mistake.',
    long: { what: 'Sets your main display to the highest refresh rate it supports at its current resolution.', why: 'A 144 Hz monitor running at 60 Hz throws away most of its smoothness. This is the most common setup mistake.', risk: 'Safe — Windows only offers modes your monitor reports. Revert sets the old rate back.' },
    changes: [{ t: 'display', mode: 'max' }],
    recommend: (hw) => hw.refreshHz && hw.maxRefreshHz && hw.maxRefreshHz > hw.refreshHz, tags: ['monitor', 'hz', 'refresh rate', 'smooth'],
  }),
  T({
    id: 'win-tdr-delay', name: 'Longer GPU timeout (TdrDelay)', category: 'stability', risk: 'moderate', reboot: 'restart',
    desc: 'Fixes "display driver stopped responding" crashes under heavy load.',
    long: { what: 'Sets TdrDelay = 8 seconds (Windows default is 2).', why: 'If the GPU takes more than 2 s on a heavy frame (shader compile, big scene), Windows resets the driver and the game crashes. Microsoft documents this value.', risk: 'A genuinely hung GPU takes a few seconds longer to recover. Needs a restart.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers`, 'TdrDelay', 8)], tags: ['crash', 'gpu', 'tdr', 'driver'],
  }),
  T({
    id: 'win-gpu-priority', name: 'Games get top GPU/CPU priority (MMCSS)', category: 'gpu',
    desc: 'Raises the "Games" multimedia profile priority.',
    long: { what: 'Sets the Multimedia Class Scheduler "Games" task: GPU Priority 8, Priority 6, Scheduling Category High, SFIO Priority High.', why: 'Games and audio engines that register with MMCSS get scheduled ahead of other work.', risk: 'Only affects programs that use MMCSS (many audio engines and some games). Safe.' },
    changes: [dw(GAMES_TASK, 'GPU Priority', 8), dw(GAMES_TASK, 'Priority', 6), sz(GAMES_TASK, 'Scheduling Category', 'High'), sz(GAMES_TASK, 'SFIO Priority', 'High')], tags: ['gpu', 'cpu', 'priority'],
  }),
  T({
    id: 'win-system-responsiveness', name: 'Less CPU reserved for background tasks', category: 'cpu',
    desc: 'Multimedia scheduler reserves 10% instead of 20% for background work.',
    long: { what: 'Sets SystemResponsiveness = 10 (the lowest Windows honours).', why: 'Gives MMCSS-registered games/audio more of the CPU.', risk: 'Safe.' },
    changes: [dw(MM, 'SystemResponsiveness', 10)], tags: ['cpu', 'priority'],
  }),
  T({
    id: 'win-priority-separation', name: 'Foreground app priority boost', category: 'cpu', risk: 'moderate',
    desc: 'Gives the window you\'re using (your game) longer CPU time slices.',
    long: { what: 'Sets Win32PrioritySeparation = 0x26 (short, variable quanta with the highest foreground boost).', why: 'The focused game gets more CPU time relative to background programs.', risk: 'Background tasks (e.g. streaming encoders) get a little less CPU while you play.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\PriorityControl`, 'Win32PrioritySeparation', 0x26)], tags: ['cpu', 'priority', 'latency'],
  }),
  T({
    id: 'win-nvidia-telemetry-off', name: 'NVIDIA telemetry off', category: 'privacy',
    desc: 'Disables the NVIDIA telemetry container service (older drivers).',
    long: { what: 'Sets NvTelemetryContainer to Disabled.', why: 'One fewer background service. Newer drivers don\'t have it — then this shows as not available.', risk: 'Safe.' },
    changes: [svc('NvTelemetryContainer')], guard: (hw) => (hw.gpuVendors && hw.gpuVendors.length && !hw.gpuVendors.includes('nvidia') ? 'No NVIDIA GPU found.' : null), tags: ['nvidia', 'telemetry'],
  }),
  T({
    id: 'win-intel-telemetry-off', name: 'Intel telemetry services off', category: 'privacy',
    desc: 'Disables Intel\'s system usage report services, if installed.',
    long: { what: 'Disables the Intel "SystemUsageReportSvc_QUEENCREEK" and "ESRV_SVC_QUEENCREEK" services.', why: 'Background usage-reporting services you don\'t need.', risk: 'Safe. Shows as not available if they aren\'t installed.' },
    changes: [svc('SystemUsageReportSvc_QUEENCREEK'), svc('ESRV_SVC_QUEENCREEK')], tags: ['intel', 'telemetry'],
  }),
  T({
    id: 'win-amd-telemetry-off', name: 'AMD user experience program off', category: 'privacy',
    desc: 'Disables AMD\'s user-experience launcher service, if installed.',
    long: { what: 'Sets the AUEPLauncher service to Disabled.', why: 'One fewer background service.', risk: 'Safe. Shows as not available if it isn\'t installed.' },
    changes: [svc('AUEPLauncher')], tags: ['amd', 'telemetry'],
  }),

  // ======================= Internet & ping =======================
  T({
    id: 'win-nagle-off', name: 'Disable Nagle\'s algorithm', category: 'network',
    desc: 'TCP packets are sent immediately instead of being batched.',
    long: { what: 'Sets TcpAckFrequency = 1 and TCPNoDelay = 1 on your connected network adapters.', why: 'Lowers latency for games that use TCP (e.g. some MMOs, Minecraft Java servers). Honest note: most shooters use UDP, which this doesn\'t affect.', risk: 'Safe; slightly more small packets on the network.' },
    changes: (ctx) => adapters(ctx).flatMap((a) => [dw(`${TCPIP_IF}\\${a.guid}`, 'TcpAckFrequency', 1), dw(`${TCPIP_IF}\\${a.guid}`, 'TCPNoDelay', 1)]),
    tags: ['ping', 'latency', 'tcp', 'network'],
  }),
  T({
    id: 'win-network-throttling-off', name: 'Turn off network throttling', category: 'network',
    desc: 'Removes the packet limit Windows applies while media is playing.',
    long: { what: 'Sets NetworkThrottlingIndex = 0xFFFFFFFF.', why: 'Windows limits non-multimedia network packets while audio/video plays (e.g. Discord + game).', risk: 'Safe.' },
    changes: [dw(MM, 'NetworkThrottlingIndex', 0xffffffff)], tags: ['ping', 'network', 'discord'],
  }),
  T({ id: 'win-tcp-autotuning', name: 'TCP receive auto-tuning: Normal', category: 'network', desc: 'Makes sure downloads can use your full connection speed.', long: { what: '"netsh int tcp set global autotuninglevel=normal".', why: 'Some old "tweaks" set this to disabled, which caps download speed (game updates).', risk: 'Safe — this is the Windows default.' }, changes: [netsh('autotuninglevel', 'normal')], tags: ['download', 'network'] }),
  T({ id: 'win-rss-on', name: 'Receive-side scaling on', category: 'network', desc: 'Spreads network processing across CPU cores.', long: { what: '"netsh int tcp set global rss=enabled".', why: 'Stops one CPU core becoming a bottleneck for network traffic.', risk: 'Safe — Windows default on most PCs.' }, changes: [netsh('rss', 'enabled')], tags: ['network', 'cpu'] }),
  T({ id: 'win-rsc-off', name: 'Receive segment coalescing off', category: 'network', desc: 'Packets are handed to games straight away instead of being merged.', long: { what: '"netsh int tcp set global rsc=disabled".', why: 'Coalescing saves CPU but can add tiny delays.', risk: 'Slightly more CPU use on very fast downloads.' }, changes: [netsh('rsc', 'disabled')], tags: ['latency', 'network'] }),
  T({ id: 'win-tcp-timestamps-off', name: 'TCP timestamps off', category: 'network', desc: 'Removes 12 bytes of overhead from every TCP packet.', long: { what: '"netsh int tcp set global timestamps=disabled".', why: 'Marginally smaller packets. Tiny effect.', risk: 'Safe.' }, changes: [netsh('timestamps', 'disabled')], tags: ['network'] }),
  T({ id: 'win-ecn-on', name: 'ECN on', category: 'network', desc: 'Lets routers signal congestion instead of dropping packets.', long: { what: '"netsh int tcp set global ecncapability=enabled".', why: 'Can reduce packet loss/retransmits on congested connections.', risk: 'A few very old routers mishandle ECN — Revert if pages or games stop connecting.' }, changes: [netsh('ecncapability', 'enabled')], tags: ['network', 'packet loss'] }),
  T({
    id: 'win-prefer-ipv4', name: 'Prefer IPv4 over IPv6', category: 'network', reboot: 'restart',
    desc: 'Uses IPv4 first without disabling IPv6.',
    long: { what: 'Sets DisabledComponents = 0x20 (Microsoft\'s recommended way to prefer IPv4).', why: 'Fixes slow connections where an ISP\'s IPv6 route is worse than IPv4.', risk: 'Safe — IPv6 still works. Needs a restart.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters`, 'DisabledComponents', 0x20)], tags: ['ipv6', 'network', 'ping'],
  }),
  T({
    id: 'win-llmnr-off', name: 'Turn off LLMNR', category: 'network',
    desc: 'Stops a legacy name lookup that broadcasts on your network.',
    long: { what: 'Sets the policy EnableMulticast = 0.', why: 'Less broadcast chatter, and it closes a common local-network attack path.', risk: 'Very old LAN devices found by name only may not be found.' },
    changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient`, 'EnableMulticast', 0)], tags: ['network', 'security'],
  }),
  T({
    id: 'win-netbios-off', name: 'Turn off NetBIOS over TCP/IP', category: 'network', risk: 'moderate',
    desc: 'Disables an old Windows networking protocol on your adapters.',
    long: { what: 'Sets NetbiosOptions = 2 on your connected adapters.', why: 'Removes legacy broadcast traffic.', risk: 'Old file shares accessed by computer name (\\\\PC-NAME) may stop working.' },
    changes: (ctx) => adapters(ctx).map((a) => dw(`${HKLM}SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_${a.guid}`, 'NetbiosOptions', 2)),
    tags: ['network', 'lan'],
  }),
  ...[
    ['cloudflare', 'Cloudflare', ['1.1.1.1', '1.0.0.1', '2606:4700:4700::1111', '2606:4700:4700::1001'], 'Usually the fastest public DNS.'],
    ['google', 'Google', ['8.8.8.8', '8.8.4.4', '2001:4860:4860::8888', '2001:4860:4860::8844'], 'Reliable everywhere.'],
    ['quad9', 'Quad9', ['9.9.9.9', '149.112.112.112', '2620:fe::fe', '2620:fe::9'], 'Blocks known malicious domains.'],
    ['adguard', 'AdGuard', ['94.140.14.14', '94.140.15.15', '2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff'], 'Blocks ads and trackers.'],
  ].map(([k, label, servers, note]) => T({
    id: `win-dns-${k}`, name: `DNS: ${label}`, category: 'network', exclusive: 'dns',
    desc: `${note} Faster lookups when your ISP's DNS is slow.`,
    long: { what: `Sets ${servers.slice(0, 2).join(' and ')} as DNS on your connected adapters.`, why: 'DNS only affects how fast games/launchers find servers (logins, matchmaking, downloads) — not in-game ping. Use the DNS speed test to pick the fastest for you.', risk: 'Safe. Revert goes back to automatic (or your old servers).' },
    changes: [{ t: 'dns', servers }], tags: ['dns', 'network', label.toLowerCase()],
  })),
  T({
    id: 'win-dns-custom', name: 'DNS: custom servers', category: 'network', exclusive: 'dns',
    desc: 'Use your own DNS servers (set them in Settings → Network).',
    long: { what: 'Sets the DNS servers you entered in Settings on your connected adapters.', why: 'For people with a preferred or local DNS (e.g. Pi-hole).', risk: 'Wrong addresses break internet access — Revert fixes it.' },
    changes: (ctx) => [{ t: 'dns', servers: (ctx.settings && ctx.settings.customDns) || [] }],
    guard: () => null, needsSetting: 'customDns', tags: ['dns', 'custom'],
  }),
  T({ id: 'win-nic-eee-off', name: 'Turn off Energy-Efficient Ethernet', category: 'network', reboot: 'restart', desc: 'Stops your Ethernet port dropping into low-power mode.', long: { what: 'Sets Energy-Efficient Ethernet / Green Ethernet / Advanced EEE / Gigabit Lite to off on adapters that have them.', why: 'Power-saving Ethernet can add latency spikes and occasional link drops.', risk: 'Safe. Applies after the adapter restarts (we don\'t disconnect you now).' }, changes: [nic('*EEE', '0', 'Energy-Efficient Ethernet'), nic('EnableGreenEthernet', '0', 'Green Ethernet'), nic('AdvancedEEE', '0', 'Advanced EEE'), nic('GigaLite', '0', 'Gigabit Lite'), nic('PowerSavingMode', '0', 'Power Saving Mode')], tags: ['ethernet', 'ping', 'latency', 'disconnect'] }),
  T({ id: 'win-nic-interrupt-mod-off', name: 'Interrupt moderation off', category: 'network', risk: 'moderate', reboot: 'restart', desc: 'Network adapter interrupts the CPU for every packet instead of batching.', long: { what: 'Sets Interrupt Moderation to Disabled on adapters that support it.', why: 'Batching saves CPU but can add up to a few hundred microseconds of latency.', risk: 'More CPU usage under heavy network load. Applies after the adapter restarts.' }, changes: [nic('*InterruptModeration', '0', 'Interrupt Moderation')], tags: ['latency', 'ping', 'ethernet'] }),
  T({ id: 'win-nic-lso-off', name: 'Large Send Offload off', category: 'network', reboot: 'restart', desc: 'Fixes upload stutter some network drivers cause.', long: { what: 'Sets Large Send Offload v2 (IPv4/IPv6) to Disabled.', why: 'Some drivers\' LSO causes upload lag spikes (bad for streaming and voice).', risk: 'Slightly more CPU for big uploads. Applies after the adapter restarts.' }, changes: [nic('*LsoV2IPv4', '0', 'Large Send Offload v2 (IPv4)'), nic('*LsoV2IPv6', '0', 'Large Send Offload v2 (IPv6)')], tags: ['upload', 'streaming', 'network'] }),
  T({ id: 'win-nic-flow-control-off', name: 'Flow control off', category: 'network', reboot: 'restart', desc: 'Stops pause frames from your router slowing the link.', long: { what: 'Sets Flow Control to Disabled.', why: 'Pause frames can briefly stall traffic on busy home networks.', risk: 'Safe on home networks. Applies after the adapter restarts.' }, changes: [nic('*FlowControl', '0', 'Flow Control')], tags: ['ethernet', 'network'] }),
  T({ id: 'win-nic-buffers-max', name: 'Bigger network adapter buffers', category: 'network', reboot: 'restart', desc: 'Fewer dropped packets during bursts.', long: { what: 'Sets Receive and Transmit Buffers to the maximum your adapter allows.', why: 'Small buffers drop packets during traffic bursts, causing rubber-banding.', risk: 'Uses a few MB more RAM. Applies after the adapter restarts.' }, changes: [nic('*ReceiveBuffers', 'max', 'Receive Buffers'), nic('*TransmitBuffers', 'max', 'Transmit Buffers')], tags: ['packet loss', 'ethernet', 'network'] }),
  T({
    id: 'win-wifi-max-perf', name: 'Wi-Fi power saving off (plugged in)', category: 'network',
    desc: 'Stops Wi-Fi napping between packets — fewer ping spikes.',
    long: { what: 'Sets "Wireless Adapter Settings → Power Saving Mode" to Maximum Performance (plugged in).', why: 'Wi-Fi power saving is a common cause of random ping spikes.', risk: 'Slightly more power when plugged in. Battery setting untouched.' },
    changes: [pset(SUB_WIFI, WIFI_POWER, 0, 'Wireless power saving')], guard: (hw) => (hw.hasWifi === false ? 'No Wi-Fi adapter found.' : null), tags: ['wifi', 'ping', 'lag spikes'],
  }),
  T({ id: 'win-wifi-roam-low', name: 'Wi-Fi roaming aggressiveness: lowest', category: 'network', reboot: 'restart', desc: 'Stops Wi-Fi scanning for other access points mid-game (Intel adapters).', long: { what: 'Sets Roaming Aggressiveness to Lowest on adapters that support it.', why: 'Background scans for a "better" access point cause regular ping spikes.', risk: 'If you move around a big house with mesh Wi-Fi, switching access points is slower.' }, changes: [nic('RoamAggressiveness', '0', 'Roaming Aggressiveness')], tags: ['wifi', 'ping', 'lag spikes'] }),
  T({ id: 'win-wifi-prefer-5ghz', name: 'Prefer 5 GHz Wi-Fi', category: 'network', reboot: 'restart', desc: 'Faster, less crowded band when your router offers both (Intel adapters).', long: { what: 'Sets Preferred Band to 5 GHz on adapters that support it.', why: '2.4 GHz is slower and more congested.', risk: '5 GHz has shorter range through walls.' }, changes: [nic('RoamingPreferredBandType', '2', 'Preferred Band')], tags: ['wifi', '5ghz'] }),

  // ======================= Input =======================
  T({
    id: 'win-mouse-accel-off', name: 'Disable mouse acceleration', category: 'input',
    desc: 'Turns off "Enhance pointer precision" for consistent aim.',
    long: { what: 'Sets MouseSpeed, MouseThreshold1 and MouseThreshold2 to 0 and applies it immediately.', why: 'With acceleration, the same hand movement moves the cursor different distances depending on speed — bad for muscle memory.', risk: 'Safe. Desktop pointer may feel slower; most games use raw input anyway.' },
    changes: [sz(`${HKCU}Control Panel\\Mouse`, 'MouseSpeed', '0'), sz(`${HKCU}Control Panel\\Mouse`, 'MouseThreshold1', '0'), sz(`${HKCU}Control Panel\\Mouse`, 'MouseThreshold2', '0')],
    post: ['mouse'], tags: ['mouse', 'aim', 'acceleration', 'input'],
  }),
  T({
    id: 'win-pointer-speed-6', name: 'Pointer speed 6/11 (1:1)', category: 'input',
    desc: 'The Windows pointer speed where one mouse count = one pixel.',
    long: { what: 'Sets pointer speed to the 6th notch (MouseSensitivity = 10).', why: 'Any other notch scales or skips pixels. Set sensitivity in your mouse software/game instead.', risk: 'Desktop pointer speed changes.' },
    changes: [sz(`${HKCU}Control Panel\\Mouse`, 'MouseSensitivity', '10')], post: ['mouse'], tags: ['mouse', 'sensitivity', 'input'],
  }),
  T({
    id: 'win-keyboard-fast', name: 'Fastest key repeat', category: 'input',
    desc: 'Shortest repeat delay and fastest repeat rate.',
    long: { what: 'Sets KeyboardDelay = 0 and KeyboardSpeed = 31 and applies it immediately.', why: 'Held keys repeat sooner — useful in some games and everywhere else.', risk: 'Safe.' },
    changes: [sz(`${HKCU}Control Panel\\Keyboard`, 'KeyboardDelay', '0'), sz(`${HKCU}Control Panel\\Keyboard`, 'KeyboardSpeed', '31')], post: ['keyboard'], tags: ['keyboard', 'input'],
  }),
  T({
    id: 'win-sticky-keys-off', name: 'No Sticky/Filter/Toggle Keys pop-ups', category: 'input', reboot: 'signout',
    desc: 'Pressing Shift five times won\'t throw you out of your game.',
    long: { what: 'Turns off the keyboard shortcuts that open Sticky Keys, Filter Keys and Toggle Keys.', why: 'Mashing Shift or holding it in-game triggers the pop-up and minimises the game.', risk: 'Safe. The accessibility features still work from Settings. Takes effect after you sign out.' },
    changes: [sz(`${HKCU}Control Panel\\Accessibility\\StickyKeys`, 'Flags', '506'), sz(`${HKCU}Control Panel\\Accessibility\\ToggleKeys`, 'Flags', '58'), sz(`${HKCU}Control Panel\\Accessibility\\Keyboard Response`, 'Flags', '122')],
    tags: ['keyboard', 'sticky keys', 'shift'],
  }),
  T({
    id: 'win-ink-off', name: 'Turn off Windows Ink Workspace', category: 'input',
    desc: 'Desktop PCs without a pen don\'t need it.',
    long: { what: 'Sets the policy AllowWindowsInkWorkspace = 0.', why: 'Stops pen-workspace shortcuts triggering on desktops.', risk: 'Pen/tablet users lose the Ink Workspace.' },
    changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\WindowsInkWorkspace`, 'AllowWindowsInkWorkspace', 0)], guard: (hw) => (hw.hasTouch ? 'This PC has a touch screen or pen.' : null), tags: ['pen', 'ink', 'input'],
  }),
  T({
    id: 'win-global-timer', name: 'Allow global timer resolution requests', category: 'input', risk: 'advanced', reboot: 'restart',
    desc: 'Windows 11: lets one app\'s high timer resolution apply system-wide again.',
    long: { what: 'Sets GlobalTimerResolutionRequests = 1. Pair it with "Hold 0.5 ms timer while gaming" (Game Mode Watcher).', why: 'Since Windows 10 2004 timer resolution is per-process; this restores the old global behaviour so games benefit from a 0.5 ms timer.', risk: 'Higher power use while a timer request is active. Needs a restart.' },
    changes: [dw(`${HKLM}SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel`, 'GlobalTimerResolutionRequests', 1)], guard: win11, tags: ['timer', 'latency', 'frame pacing'],
  }),

  // ======================= Stutter & crash fixes =======================
  T({ id: 'win-transparency-off', name: 'Turn off transparency effects', category: 'stability', desc: 'Saves GPU work on the taskbar, Start and windows.', long: { what: 'Turns off Settings → Personalisation → Colours → Transparency effects.', why: 'Blur/acrylic effects use GPU time, which matters on integrated graphics.', risk: 'Cosmetic only.' }, changes: [dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize`, 'EnableTransparency', 0)], tags: ['gpu', 'transparency', 'low end'] }),
  T({ id: 'win-error-reporting-off', name: 'Turn off Windows Error Reporting', category: 'stability', desc: 'No crash-report collection or upload after a game crashes.', long: { what: 'Sets Windows Error Reporting Disabled = 1.', why: 'After a crash WER collects dumps in the background, which can make relaunching slow.', risk: 'Microsoft won\'t get crash reports from you (driver fixes rely partly on them).' }, changes: [dw(`${HKLM}SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting`, 'Disabled', 1)], tags: ['crash', 'reporting'] }),
  T({ id: 'win-xbox-services-off', name: 'Turn off Xbox services', category: 'stability', risk: 'moderate', desc: 'Only if you don\'t use the Xbox app or Game Pass.', long: { what: 'Disables Xbox Live Auth Manager, Xbox Live Game Save and Xbox Live Networking Service.', why: 'Fewer background services if you never use Xbox features.', risk: 'Breaks Game Pass/Xbox app sign-in and cloud saves for Xbox games. Xbox controllers keep working.' }, changes: [svc('XblAuthManager'), svc('XblGameSave'), svc('XboxNetApiSvc')], tags: ['xbox', 'services', 'background'] }),
  T({ id: 'win-edge-background-off', name: 'Stop Edge running in the background', category: 'cpu', desc: 'Edge closes fully when you close it.', long: { what: 'Sets Edge policies StartupBoostEnabled = 0 and BackgroundModeEnabled = 0.', why: 'Startup Boost keeps Edge processes in memory all the time.', risk: 'Edge opens a moment slower.' }, changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Edge`, 'StartupBoostEnabled', 0), dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Edge`, 'BackgroundModeEnabled', 0)], tags: ['edge', 'ram', 'background'] }),
  T({ id: 'win-print-spooler-off', name: 'Turn off the Print Spooler', category: 'cpu', risk: 'moderate', desc: 'Only if you never print.', long: { what: 'Sets the Spooler service to Disabled and stops it.', why: 'One fewer background service (and it closes the PrintNightmare attack surface).', risk: 'You can\'t print until you Revert.' }, changes: [svc('Spooler')], tags: ['printer', 'services'] }),
  T({ id: 'win-fax-off', name: 'Turn off the Fax service', category: 'cpu', desc: 'Nobody games by fax.', long: { what: 'Sets the Fax service to Disabled.', why: 'Unused background service.', risk: 'Safe.' }, changes: [svc('Fax')], tags: ['services'] }),
  T({ id: 'win-maps-broker-off', name: 'Turn off offline maps updates', category: 'cpu', desc: 'Stops the Downloaded Maps Manager service.', long: { what: 'Sets MapsBroker to Disabled.', why: 'Unused background service for most people.', risk: 'The Maps app won\'t update offline maps.' }, changes: [svc('MapsBroker')], tags: ['services'] }),

  // ======================= Background & telemetry =======================
  T({ id: 'win-ads-off', name: 'Turn off tips, ads and suggestions', category: 'privacy', desc: 'No suggested apps, tips, lock-screen ads or "finish setting up" nags.', long: { what: 'Turns off the Content Delivery Manager suggestions, silent app installs, lock-screen tips and the "finish setting up your device" screen.', why: 'Stops background downloads of promoted apps and pop-ups that can steal focus from your game.', risk: 'Safe.' }, changes: [dw(CDM, 'SubscribedContent-338388Enabled', 0), dw(CDM, 'SubscribedContent-338389Enabled', 0), dw(CDM, 'SubscribedContent-353694Enabled', 0), dw(CDM, 'SubscribedContent-353696Enabled', 0), dw(CDM, 'SystemPaneSuggestionsEnabled', 0), dw(CDM, 'SilentInstalledAppsEnabled', 0), dw(CDM, 'SoftLandingEnabled', 0), dw(CDM, 'RotatingLockScreenOverlayEnabled', 0), dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement`, 'ScoobeSystemSettingEnabled', 0)], tags: ['ads', 'tips', 'popups', 'bloat'] }),
  T({ id: 'win-telemetry-min', name: 'Minimum Windows telemetry', category: 'privacy', desc: 'Stops the Connected User Experiences (DiagTrack) service.', long: { what: 'Sets the AllowTelemetry policy to the minimum and disables the DiagTrack and dmwappushservice services.', why: 'DiagTrack uploads diagnostic data in the background. Honest note: Home/Pro editions still send "required" data — only Enterprise can turn it off completely.', risk: 'Safe. Windows Update is not affected.' }, changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection`, 'AllowTelemetry', 0), svc('DiagTrack'), svc('dmwappushservice')], tags: ['telemetry', 'privacy', 'background'] }),
  T({ id: 'win-compat-telemetry-off', name: 'Turn off compatibility telemetry tasks', category: 'privacy', desc: 'Stops "Microsoft Compatibility Telemetry" CPU spikes.', long: { what: 'Disables the Compatibility Appraiser, Program Data Updater and Customer Experience Improvement Program scheduled tasks.', why: 'CompatTelRunner.exe is a well-known cause of random high CPU/disk usage.', risk: 'Safe. Windows feature-update compatibility checks run when you install the update instead.' }, changes: [task('\\Microsoft\\Windows\\Application Experience\\', 'Microsoft Compatibility Appraiser'), task('\\Microsoft\\Windows\\Application Experience\\', 'ProgramDataUpdater'), task('\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'Consolidator'), task('\\Microsoft\\Windows\\Customer Experience Improvement Program\\', 'UsbCeip')], tags: ['cpu spikes', 'telemetry', 'compattelrunner'] }),
  T({ id: 'win-advertising-id-off', name: 'Turn off advertising ID', category: 'privacy', desc: 'Apps can\'t use your ad ID for personalised ads.', long: { what: 'Sets AdvertisingInfo Enabled = 0.', why: 'Privacy.', risk: 'Safe.' }, changes: [dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo`, 'Enabled', 0)], tags: ['privacy', 'ads'] }),
  T({ id: 'win-activity-history-off', name: 'Turn off activity history', category: 'privacy', desc: 'Windows stops recording what you open.', long: { what: 'Sets PublishUserActivities and UploadUserActivities policies to 0.', why: 'Privacy and a little less background work.', risk: 'Timeline/"recent activity" features stop working.' }, changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Windows\\System`, 'PublishUserActivities', 0), dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Windows\\System`, 'UploadUserActivities', 0)], tags: ['privacy'] }),
  T({ id: 'win-feedback-off', name: 'No feedback requests', category: 'privacy', desc: 'Windows stops asking for feedback.', long: { what: 'Sets feedback frequency to Never and turns off tailored experiences.', why: 'No surprise pop-ups.', risk: 'Safe.' }, changes: [dw(`${HKCU}Software\\Microsoft\\Siuf\\Rules`, 'NumberOfSIUFInPeriod', 0), dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\Privacy`, 'TailoredExperiencesWithDiagnosticDataEnabled', 0)], tags: ['popups', 'privacy'] }),
  T({ id: 'win-web-search-off', name: 'No web results in Start search', category: 'privacy', desc: 'Start menu searches your PC only — faster and offline.', long: { what: 'Sets DisableSearchBoxSuggestions = 1 and BingSearchEnabled = 0.', why: 'Every Start search otherwise also queries Bing.', risk: 'You can\'t search the web from Start.' }, changes: [dw(`${HKCU}Software\\Policies\\Microsoft\\Windows\\Explorer`, 'DisableSearchBoxSuggestions', 1), dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\Search`, 'BingSearchEnabled', 0)], tags: ['search', 'bing', 'start'] }),
  T({ id: 'win-widgets-off', name: 'Turn off Widgets / News and Interests', category: 'privacy', desc: 'Stops the widgets board and its background process.', long: { what: 'Sets the AllowNewsAndInterests policy to 0 (Windows 11) and hides News and Interests (Windows 10).', why: 'The widgets process (msedgewebview2) uses RAM and network in the background.', risk: 'Safe.' }, changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Dsh`, 'AllowNewsAndInterests', 0), dw(`${HKCU}Software\\Microsoft\\Windows\\CurrentVersion\\Feeds`, 'ShellFeedsTaskbarViewMode', 2)], tags: ['widgets', 'news', 'ram', 'background'] }),
  T({ id: 'win-copilot-off', name: 'Turn off Copilot', category: 'privacy', desc: 'Removes the Windows Copilot sidebar.', long: { what: 'Sets the TurnOffWindowsCopilot policy.', why: 'One less background component.', risk: 'Safe. Newer Windows builds ship Copilot as a normal app — uninstall it from Settings if it remains.' }, changes: [dw(`${HKCU}Software\\Policies\\Microsoft\\Windows\\WindowsCopilot`, 'TurnOffWindowsCopilot', 1)], tags: ['copilot', 'ai'] }),
  T({ id: 'win-recall-off', name: 'Turn off Recall snapshots', category: 'privacy', desc: 'Copilot+ PCs: stops Windows saving screenshots of your activity.', long: { what: 'Sets the DisableAIDataAnalysis policy.', why: 'Recall continuously captures your screen, using disk and CPU.', risk: 'Safe. Has no effect on PCs without Recall.' }, changes: [dw(`${HKCU}Software\\Policies\\Microsoft\\Windows\\WindowsAI`, 'DisableAIDataAnalysis', 1)], tags: ['recall', 'ai', 'privacy'] }),
  T({ id: 'win-cortana-off', name: 'Turn off Cortana', category: 'privacy', desc: 'Stops Cortana on Windows 10.', long: { what: 'Sets the AllowCortana policy to 0.', why: 'Background assistant you probably don\'t use.', risk: 'Safe.' }, changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search`, 'AllowCortana', 0)], tags: ['cortana'] }),
  T({ id: 'win-ceip-off', name: 'Leave the Customer Experience Program', category: 'privacy', desc: 'Stops CEIP data collection.', long: { what: 'Sets the CEIPEnable policy to 0.', why: 'Privacy.', risk: 'Safe.' }, changes: [dw(`${HKLM}SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows`, 'CEIPEnable', 0)], tags: ['telemetry', 'privacy'] }),

  // ======================= Picture quality =======================
  T({ id: 'win-auto-hdr', name: 'Auto HDR on', category: 'picture', desc: 'Windows 11 adds HDR to DirectX 11/12 games that don\'t have it.', long: { what: 'Turns on Settings → Display → Graphics → Auto HDR (only this flag).', why: 'Brighter highlights and richer colour in older games on an HDR monitor.', risk: 'Only works with HDR turned on in Display settings. Some games look washed out — Revert turns it off.' }, changes: [{ t: 'regFlags', key: DX_USER, name: 'DirectXUserGlobalSettings', flags: { AutoHDREnable: '1' } }], guard: win11, tags: ['hdr', 'picture', 'colour'] }),
  T({ id: 'win-color-filters-off', name: 'Colour filters off', category: 'picture', desc: 'Makes sure no greyscale/colour-blind filter is active.', long: { what: 'Sets ColorFiltering Active = 0.', why: 'A filter turned on by accident (Win+Ctrl+C) washes colour out of games.', risk: 'Turn it back on in Settings if you rely on a colour filter.' }, changes: [dw(`${HKCU}Software\\Microsoft\\ColorFiltering`, 'Active', 0)], tags: ['colour', 'greyscale', 'picture'] }),
];

module.exports.PLAN_IDS = { PLAN_HIGH, PLAN_ULTIMATE, PLAN_WOOF };
