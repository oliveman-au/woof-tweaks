'use strict';
// "Fix my lag": a quick check of the usual causes (CPU, RAM, disk, network, heat, power, display,
// drivers) with plain-English findings and the specific tweaks/actions/guides that address each.
const os = require('os');
const { run } = require('./exec');
const { pingStats } = require('./benchmark');

async function topProcesses() {
  if (process.platform === 'win32') {
    const ps = 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 6 Name,@{n="mb";e={[int]($_.WorkingSet64/1MB)}} | ConvertTo-Json -Compress';
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 15000 });
    try { return JSON.parse(r.stdout).map((p) => ({ name: p.Name, mb: p.mb })); } catch { return []; }
  }
  const r = await run('ps', ['-Ao', 'pcpu=,rss=,comm='], { timeout: 8000 });
  return r.stdout.split('\n').map((l) => l.trim().split(/\s+/)).filter((x) => x.length >= 3)
    .map(([c, rss, ...name]) => ({ cpu: Number(c), mb: Math.round(Number(rss) / 1024), name: name.join(' ').split('/').pop() }))
    .sort((a, b) => b.cpu - a.cpu).slice(0, 6);
}

function sampleCpu(ms = 3000) {
  const read = () => os.cpus().reduce((a, x) => { const s = x.times; a.idle += s.idle; a.total += s.user + s.nice + s.sys + s.idle + s.irq; return a; }, { idle: 0, total: 0 });
  const a = read();
  return new Promise((r) => setTimeout(() => { const b = read(); r(Math.round((1 - (b.idle - a.idle) / (b.total - a.total)) * 100)); }, ms));
}

async function diagnose({ hw = {}, monitor, scan = {}, backupApplied = {} } = {}) {
  const findings = [];
  const add = (f) => findings.push(f);
  const [cpu, net, top] = await Promise.all([sampleCpu(), pingStats('1.1.1.1', 10), topProcesses()]);
  const ram = monitor && monitor.ram != null ? monitor.ram : Math.round((1 - os.freemem() / os.totalmem()) * 100);
  const W = process.platform === 'win32';

  if (cpu >= 80) add({ severity: 'high', area: 'CPU', title: `Your CPU is busy (${cpu}%) even before a game starts`, detail: `Top programs right now: ${top.slice(0, 4).map((p) => p.name).join(', ')}. Close what you don't need, and stop background apps.`, fixes: W ? ['win-background-apps-off', 'win-compat-telemetry-off', 'win-search-index-off', 'win-edge-background-off'] : ['mac-spotlight-off', 'linux-tracker-off'] });
  if (ram >= 85) add({ severity: 'high', area: 'RAM', title: `Memory is ${ram}% full`, detail: `You have ${hw.ramGB || '?'} GB. Games stutter when Windows has to swap to disk. Close browsers/launchers you aren't using.`, fixes: W ? ['act-standby-clear', 'win-sysmain-off', 'win-pagefile-fixed', 'win-widgets-off'] : ['act-purge-ram', 'linux-zram', 'linux-swappiness'] });
  else if (hw.ramGB && hw.ramGB < 12) add({ severity: 'medium', area: 'RAM', title: `Only ${hw.ramGB} GB of RAM`, detail: 'Modern games want 16 GB. Keep browsers closed while playing; "Clear standby memory" before big games helps.', fixes: W ? ['act-standby-clear', 'win-background-apps-off'] : ['act-purge-ram'] });
  if (hw.systemDisk === 'hdd') add({ severity: 'high', area: 'Disk', title: 'Windows is on a hard drive (HDD)', detail: 'This is the #1 cause of stutter and slow loading. An SSD is the best upgrade you can make. Until then, keep SysMain ON.', fixes: [] });
  if (hw.systemFreeGB != null && hw.systemFreeGB < 20) add({ severity: 'medium', area: 'Disk', title: `Only ${hw.systemFreeGB} GB free on your system drive`, detail: 'Low free space slows updates, shader caches and the page file.', fixes: ['act-clear-temp', 'act-clear-update-cache', 'act-clear-crash-dumps', 'act-empty-bin'] });
  if (net.avg == null) add({ severity: 'high', area: 'Network', title: 'No internet connection detected', detail: 'Couldn\'t reach 1.1.1.1. Check your connection; "Reset Winsock and TCP/IP" can fix a broken network stack.', fixes: W ? ['act-network-reset', 'act-flush-dns'] : ['act-flush-dns'] });
  else {
    if (net.loss > 0) add({ severity: 'high', area: 'Network', title: `${net.loss}% packet loss`, detail: 'Packet loss causes rubber-banding. On Wi-Fi, move closer or use Ethernet; check nobody is downloading.', fixes: W ? ['win-wifi-max-perf', 'win-wifi-roam-low', 'win-nic-buffers-max', 'guide-wifi'] : ['mac-awdl-off', 'guide-wifi'] });
    if (net.jitter > 10) add({ severity: 'medium', area: 'Network', title: `Unstable ping (jitter ${net.jitter} ms)`, detail: 'Ping that jumps around feels worse than a slightly higher steady ping. Usually Wi-Fi power saving or other devices downloading.', fixes: W ? ['win-wifi-max-perf', 'win-wifi-roam-low', 'win-nic-eee-off', 'win-delivery-opt-off', 'guide-wifi'] : ['mac-awdl-off', 'mac-auto-update-download-off', 'guide-wifi'] });
    if (net.avg > 60) add({ severity: 'low', area: 'Network', title: `Ping to the internet is ${net.avg} ms`, detail: 'That\'s just to the nearest internet hub. Use Benchmark → Regions to find your closest game servers.', fixes: ['guide-wifi'] });
  }
  if (hw.refreshHz && hw.maxRefreshHz && hw.maxRefreshHz > hw.refreshHz) add({ severity: 'high', area: 'Display', title: `Your monitor runs at ${hw.refreshHz} Hz but supports ${hw.maxRefreshHz} Hz`, detail: 'You\'re missing out on smoothness you already paid for.', fixes: ['win-max-refresh', 'guide-monitor'] });
  if (hw.driverAgeDays && hw.driverAgeDays > 180) add({ severity: 'medium', area: 'Drivers', title: `Your GPU driver is ${Math.round(hw.driverAgeDays / 30)} months old`, detail: 'New games are often optimised in new drivers. Get updates only from NVIDIA/AMD/Intel.', fixes: ['guide-drivers'] });
  if (monitor && monitor.throttling) add({ severity: 'high', area: 'Heat', title: 'Your CPU is being slowed down by heat', detail: 'Clean dust from vents/fans, keep laptops on a hard surface, and avoid gaming on battery.', fixes: [] });
  if (monitor && monitor.cpuTemp >= 90) add({ severity: 'high', area: 'Heat', title: `CPU temperature is ${monitor.cpuTemp}°C`, detail: 'Above ~90°C most CPUs throttle. Check cooling.', fixes: [] });
  if (monitor && monitor.gpuTemp >= 85) add({ severity: 'medium', area: 'Heat', title: `GPU temperature is ${monitor.gpuTemp}°C`, detail: 'High GPU temps can lower boost clocks. Improve airflow or set a frame cap.', fixes: ['guide-gsync'] });
  if (hw.isLaptop) add({ severity: 'low', area: 'Power', title: 'Gaming laptop tip', detail: 'Plug in while gaming — most laptops cut GPU power hard on battery.', fixes: ['guide-cros-power'] });
  const notApplied = (ids) => ids.filter((id) => scan[id] && scan[id].status === 'default' && !backupApplied[id]);
  const power = notApplied(W ? ['win-plan-high', 'win-plan-woof', 'win-game-mode'] : process.platform === 'darwin' ? ['mac-low-power-off'] : ['linux-governor-performance', 'linux-power-profile']);
  if (power.length) add({ severity: 'medium', area: 'Power', title: 'Power settings favour saving energy', detail: 'Your CPU drops its speed between bursts, which shows up as stutter.', fixes: power });
  if (W && scan['win-game-dvr-off'] && scan['win-game-dvr-off'].status === 'default') add({ severity: 'medium', area: 'Recording', title: 'Background game recording is on', detail: 'Game DVR records constantly and costs FPS.', fixes: ['win-game-dvr-off'] });

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { at: new Date().toISOString(), cpu, ram, network: net, top, findings, healthy: !findings.some((f) => f.severity !== 'low') };
}

module.exports = { diagnose };
