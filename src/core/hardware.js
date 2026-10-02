'use strict';
// What's in this PC: CPU, GPU(s) + driver age, RAM, Windows/boot drive type, laptop or desktop,
// display refresh, network adapters, plus installed programs and startup items (for game detection
// and the startup manager). Read-only, no admin. Cached; refreshed on demand.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('./exec');
const { osId } = require('./platform');

let cache = null;
let pending = null;

const WIN_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$o = @{}
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$o.cpu = @{ name = "$($cpu.Name)".Trim(); cores = [int]$cpu.NumberOfCores; threads = [int]$cpu.NumberOfLogicalProcessors; mhz = [int]$cpu.MaxClockSpeed; vendor = "$($cpu.Manufacturer)" }
$o.gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = "$($_.Name)"; vendor = "$($_.AdapterCompatibility)"; driver = "$($_.DriverVersion)"; driverDate = $(if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }); hz = [int]$_.CurrentRefreshRate; maxHz = [int]$_.MaxRefreshRate; pnp = "$($_.PNPDeviceID)" } })
$cs = Get-CimInstance Win32_ComputerSystem
$o.ram = [int64]$cs.TotalPhysicalMemory
$o.model = "$($cs.Manufacturer) $($cs.Model)".Trim()
$o.pcSystemType = [int]$cs.PCSystemType
$o.battery = (@(Get-CimInstance Win32_Battery).Count -gt 0)
$os = Get-CimInstance Win32_OperatingSystem
$o.os = @{ caption = "$($os.Caption)"; build = [int]$os.BuildNumber; version = "$($os.Version)" }
$sd = $env:SystemDrive
$o.systemDrive = $sd
try {
  $part = Get-Partition -DriveLetter $sd.TrimEnd(':') -ErrorAction Stop
  $pd = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq "$($part.DiskNumber)" } | Select-Object -First 1
  $o.systemDisk = @{ media = "$($pd.MediaType)"; bus = "$($pd.BusType)"; name = "$($pd.FriendlyName)" }
} catch { $o.systemDisk = @{ media = 'Unspecified' } }
$v = Get-Volume -DriveLetter $sd.TrimEnd(':')
$o.systemFree = [int64]$v.SizeRemaining
$o.disks = @(Get-PhysicalDisk | ForEach-Object { @{ name = "$($_.FriendlyName)"; media = "$($_.MediaType)"; bus = "$($_.BusType)"; size = [int64]$_.Size; health = "$($_.HealthStatus)" } })
$o.net = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { @{ name = $_.Name; guid = "$($_.InterfaceGuid)"; ifIndex = [int]$_.ifIndex; desc = "$($_.InterfaceDescription)"; wifi = ($_.PhysicalMediaType -match '802\.11' -or $_.NdisPhysicalMedium -eq 9); speed = "$($_.LinkSpeed)" } })
$o.hasWifi = (@(Get-NetAdapter -Physical | Where-Object { $_.PhysicalMediaType -match '802\.11' -or $_.NdisPhysicalMedium -eq 9 }).Count -gt 0)
$o.touch = (@(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='HIDClass'" | Where-Object { $_.Name -match 'touch screen|pen' }).Count -gt 0)
try { $bl = Get-CimInstance -Namespace 'root\cimv2\Security\MicrosoftVolumeEncryption' -ClassName Win32_EncryptableVolume -Filter "DriveLetter='$sd'" -ErrorAction Stop; $o.bitlocker = ($bl.ProtectionStatus -eq 1) } catch { $o.bitlocker = $null }
$apps = @()
foreach ($p in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
  Get-ItemProperty $p | Where-Object { $_.DisplayName } | ForEach-Object { $apps += , @{ name = "$($_.DisplayName)"; dir = "$($_.InstallLocation)"; icon = "$($_.DisplayIcon)" } }
}
$o.apps = $apps
$o.appx = @(Get-AppxPackage | Where-Object { $_.Name -match 'Minecraft|Xbox|Forza|Halo|Roblox|ROBLOX|FortniteGame|GenshinImpact|SeaOfThieves' } | ForEach-Object { @{ name = $_.Name; dir = "$($_.InstallLocation)" } })
$startup = @()
$runKeys = @(
  @{ hive = 'HKCU'; key = 'Software\Microsoft\Windows\CurrentVersion\Run'; approved = 'Run' },
  @{ hive = 'HKLM'; key = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; approved = 'Run' },
  @{ hive = 'HKLM'; key = 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; approved = 'Run32' }
)
foreach ($r in $runKeys) {
  $props = Get-ItemProperty -LiteralPath "Registry::$(if ($r.hive -eq 'HKCU') { 'HKEY_CURRENT_USER' } else { 'HKEY_LOCAL_MACHINE' })\$($r.key)"
  if (-not $props) { continue }
  foreach ($n in $props.PSObject.Properties.Name) { if ($n -notlike 'PS*') { $startup += , @{ hive = $r.hive; approved = $r.approved; name = $n; command = "$($props.$n)" } } }
}
foreach ($f in @(@{ hive = 'HKCU'; dir = [Environment]::GetFolderPath('Startup') }, @{ hive = 'HKLM'; dir = [Environment]::GetFolderPath('CommonStartup') })) {
  Get-ChildItem -LiteralPath $f.dir -File | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { $startup += , @{ hive = $f.hive; approved = 'StartupFolder'; name = $_.Name; command = $_.FullName } }
}
$o.startup = $startup
$riot = @()
Get-ChildItem 'C:\ProgramData\Riot Games\Metadata' -Recurse -Filter '*.product_settings.yaml' | ForEach-Object {
  $m = Select-String -LiteralPath $_.FullName -Pattern 'product_install_full_path:\s*"?([^"]+)"?' | Select-Object -First 1
  if ($m) { $riot += , @{ product = $_.BaseName; dir = $m.Matches[0].Groups[1].Value.Trim() } }
}
$o.riot = $riot
$steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath
$o.steamPath = "$steam"
ConvertTo-Json -InputObject $o -Depth 6 -Compress
`;

const vendorOf = (s) => {
  const v = String(s || '').toLowerCase();
  if (/nvidia|geforce|rtx|gtx/.test(v)) return 'nvidia';
  if (/amd|radeon|advanced micro/.test(v)) return 'amd';
  if (/intel|arc|iris|uhd/.test(v)) return 'intel';
  if (/apple/.test(v)) return 'apple';
  return 'other';
};

async function windows() {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const r = await run(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(WIN_SCRIPT, 'utf16le').toString('base64')], { timeout: 60_000 });
  let o = {};
  try { o = JSON.parse(r.stdout.trim().split('\n').filter(Boolean).pop()); } catch { /* partial info */ }
  const gpus = (o.gpus || []).filter((g) => !/basic display|remote|virtual|parsec|meta/i.test(g.name || ''));
  const media = String((o.systemDisk && o.systemDisk.media) || '').toLowerCase();
  const bus = String((o.systemDisk && o.systemDisk.bus) || '').toLowerCase();
  const primary = gpus.find((g) => g.hz) || gpus[0] || {};
  return {
    os: 'win32', osName: (o.os && o.os.caption) || 'Windows', osBuild: (o.os && o.os.build) || 0,
    cpu: (o.cpu && o.cpu.name) || os.cpus()[0]?.model || 'CPU', cpuCores: (o.cpu && o.cpu.cores) || os.cpus().length, cpuThreads: (o.cpu && o.cpu.threads) || os.cpus().length,
    cpuVendor: vendorOf(o.cpu && (o.cpu.vendor + o.cpu.name)),
    gpus: gpus.map((g) => ({ name: g.name, vendor: vendorOf(g.vendor + g.name), driver: g.driver, driverDate: g.driverDate })),
    gpuVendors: [...new Set(gpus.map((g) => vendorOf(g.vendor + g.name)))],
    ramGB: Math.round(((o.ram || os.totalmem()) / 1024 ** 3)),
    systemDrive: o.systemDrive || 'C:', systemFreeGB: o.systemFree ? Math.round(o.systemFree / 1024 ** 3) : null,
    systemDisk: media === 'hdd' ? 'hdd' : (media === 'ssd' || bus === 'nvme') ? 'ssd' : 'unknown', systemDiskBus: bus,
    disks: o.disks || [],
    isLaptop: !!o.battery || [2, 8, 9, 10, 14].includes(o.pcSystemType),
    model: o.model || '',
    refreshHz: primary.hz || null, maxRefreshHz: primary.maxHz || null,
    netAdapters: (o.net || []).filter((a) => a.guid), hasWifi: o.hasWifi !== false, hasTouch: !!o.touch,
    bitlocker: o.bitlocker === true ? true : o.bitlocker === false ? false : null,
    apps: o.apps || [], appx: o.appx || [], startup: o.startup || [], riot: o.riot || [], steamPath: o.steamPath || null,
  };
}

async function mac() {
  const sh = async (cmd, args, t = 10_000) => { const r = await run(cmd, args, { timeout: t }); return r.code === 0 ? r.stdout.trim() : ''; };
  const [brand, model, batt, disp, ver, ssd] = await Promise.all([
    sh('sysctl', ['-n', 'machdep.cpu.brand_string']), sh('sysctl', ['-n', 'hw.model']), sh('pmset', ['-g', 'batt']),
    sh('system_profiler', ['SPDisplaysDataType', '-json'], 20_000), sh('sw_vers', ['-productVersion']), sh('diskutil', ['info', '/']),
  ]);
  let gpus = [], hz = null;
  try {
    const d = JSON.parse(disp).SPDisplaysDataType || [];
    gpus = d.map((g) => ({ name: g.sppci_model || g._name, vendor: vendorOf(g.sppci_vendor || g.sppci_model), driver: '', driverDate: null }));
    for (const g of d) for (const s of g.spdisplays_ndrvs || []) {
      const m = String(s._spdisplays_resolution || '').match(/@\s*([\d.]+)\s*Hz/);
      if (m && !hz) hz = Math.round(Number(m[1]));
    }
  } catch { /* none */ }
  return {
    os: 'darwin', osName: `macOS ${ver}`, macosMajor: Number(String(ver).split('.')[0]) || 0,
    cpu: brand || os.cpus()[0]?.model || 'Apple Silicon', cpuCores: os.cpus().length, cpuThreads: os.cpus().length, cpuVendor: /apple/i.test(brand) || process.arch === 'arm64' ? 'apple' : 'intel',
    gpus, gpuVendors: [...new Set(gpus.map((g) => g.vendor))], ramGB: Math.round(os.totalmem() / 1024 ** 3),
    systemDisk: /Solid State:\s*Yes/i.test(ssd) ? 'ssd' : /Solid State:\s*No/i.test(ssd) ? 'hdd' : 'ssd',
    isLaptop: /InternalBattery/i.test(batt) || /MacBook/i.test(model), model, refreshHz: hz, maxRefreshHz: hz, hasWifi: true,
    appleSilicon: process.arch === 'arm64' || /apple/i.test(brand),
    apps: listMacApps(),
  };
}

function listMacApps() {
  const out = [];
  for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
    try { for (const n of fs.readdirSync(dir)) if (n.endsWith('.app')) out.push({ name: n.replace(/\.app$/, ''), dir: path.join(dir, n) }); } catch { /* none */ }
  }
  return out;
}

async function linux() {
  const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
  const cpuinfo = read('/proc/cpuinfo');
  const cpu = (cpuinfo.match(/model name\s*:\s*(.+)/) || [])[1] || os.cpus()[0]?.model || 'CPU';
  const gpus = [];
  try {
    for (const card of fs.readdirSync('/sys/class/drm')) {
      if (!/^card\d+$/.test(card)) continue;
      const vendorId = read(`/sys/class/drm/${card}/device/vendor`).trim();
      const vendor = { '0x10de': 'nvidia', '0x1002': 'amd', '0x8086': 'intel' }[vendorId] || 'other';
      const driver = (read(`/sys/class/drm/${card}/device/uevent`).match(/DRIVER=(\S+)/) || [])[1] || '';
      gpus.push({ name: `${vendor.toUpperCase()} GPU (${driver || card})`, vendor, driver, driverDate: null });
    }
  } catch { /* no drm */ }
  const rootSrc = (await run('findmnt', ['-no', 'SOURCE', '/'], { timeout: 5000 })).stdout.trim();
  const rootDev = (rootSrc.match(/\/dev\/(nvme\d+n\d+|[a-z]+?)(p?\d+)?$/) || [])[1];
  const rotational = rootDev ? read(`/sys/block/${rootDev}/queue/rotational`).trim() : '';
  const sataSsds = [];
  try { for (const d of fs.readdirSync('/sys/block')) if (/^sd[a-z]+$/.test(d) && read(`/sys/block/${d}/queue/rotational`).trim() === '0') sataSsds.push(d); } catch { /* none */ }
  let hz = null;
  const xr = await run('xrandr', ['--current'], { timeout: 5000 });
  const m = xr.stdout.match(/(\d+\.\d+)\*/);
  if (m) hz = Math.round(Number(m[1]));
  const cong = read('/proc/sys/net/ipv4/tcp_available_congestion_control');
  const bbrMod = fs.existsSync(`/lib/modules/${os.release()}/kernel/net/ipv4/tcp_bbr.ko`) || fs.existsSync(`/lib/modules/${os.release()}/kernel/net/ipv4/tcp_bbr.ko.zst`) || fs.existsSync(`/lib/modules/${os.release()}/kernel/net/ipv4/tcp_bbr.ko.xz`);
  const resolved = (await run('systemctl', ['is-active', 'systemd-resolved'], { timeout: 5000 })).stdout.trim() === 'active';
  let osName = 'Linux';
  const rel = read('/etc/os-release');
  const pn = rel.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
  if (pn) osName = pn[1];
  return {
    os: osId(), osName: osId() === 'chromeos' ? 'ChromeOS (Linux)' : osName,
    cpu, cpuCores: os.cpus().length, cpuThreads: os.cpus().length, cpuVendor: vendorOf(cpu),
    gpus, gpuVendors: [...new Set(gpus.map((g) => g.vendor))], ramGB: Math.round(os.totalmem() / 1024 ** 3),
    systemDisk: rotational === '1' ? 'hdd' : rotational === '0' ? 'ssd' : 'unknown', sataSsds,
    isLaptop: (() => { try { return fs.readdirSync('/sys/class/power_supply').some((n) => /^BAT/.test(n)); } catch { return false; } })(),
    refreshHz: hz, maxRefreshHz: hz, hasWifi: (() => { try { return fs.readdirSync('/sys/class/net').some((n) => fs.existsSync(`/sys/class/net/${n}/wireless`)); } catch { return false; } })(),
    bbrAvailable: /bbr/.test(cong) || bbrMod, resolved, apps: [],
  };
}

async function detect(force = false) {
  if (cache && !force) return cache;
  if (pending) return pending;
  pending = (async () => {
    let hw;
    try {
      hw = process.platform === 'win32' ? await windows() : process.platform === 'darwin' ? await mac() : await linux();
    } catch (e) {
      hw = { os: osId(), osName: osId(), cpu: os.cpus()[0]?.model || 'CPU', cpuCores: os.cpus().length, ramGB: Math.round(os.totalmem() / 1024 ** 3), gpus: [], gpuVendors: [], apps: [], error: e.message };
    }
    hw.detectedAt = new Date().toISOString();
    cache = hw;
    pending = null;
    return hw;
  })();
  return pending;
}

/** Public, display-friendly summary (no installed-program lists). */
function summary(hw) {
  if (!hw) return null;
  const { apps, appx, startup, riot, ...rest } = hw;
  const gpu = (hw.gpus || [])[0];
  const driverAgeDays = gpu && gpu.driverDate ? Math.round((Date.now() - Date.parse(gpu.driverDate)) / 86400_000) : null;
  return { ...rest, gpu: gpu ? gpu.name : null, driverAgeDays };
}

const cached = () => cache;
module.exports = { detect, summary, cached, vendorOf };
