'use strict';
const { execSync } = require('child_process');
const reg = (path, name) => { try { const o = execSync(`reg query "${path}" /v "${name}" 2>nul`, { encoding: 'utf8' }); const m = o.match(/REG_\w+\s+(.+)/); return m ? m[1].trim() : null; } catch { return null; } };
const regSet = (path, name, type, val) => execSync(`reg add "${path}" /v "${name}" /t ${type} /d "${val}" /f`, { encoding: 'utf8' });
const regDel = (path, name) => { try { execSync(`reg delete "${path}" /v "${name}" /f 2>nul`); } catch {} };
const ps = (cmd) => execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

const P = 'win32';

module.exports = [
  // ---- FPS ----
  {
    id: 'win-power-high-perf', name: 'High Performance power plan', desc: 'Maximum CPU clock speeds — no throttling.',
    category: 'fps', platform: P, plan: 'free', optimal: 'high',
    check: () => { const o = ps('(powercfg /getactivescheme) -replace ".*:\\\\s*",""'); return o.includes('8c5e7fda') ? 'high' : 'balanced'; },
    apply: () => execSync('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'),
    revert: (prev) => execSync(prev === 'balanced' ? 'powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e' : 'powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e'),
  },
  {
    id: 'win-game-mode', name: 'Windows Game Mode', desc: 'Tells Windows to prioritise your game.',
    category: 'fps', platform: P, plan: 'free', optimal: '1',
    check: () => reg('HKCU\\SOFTWARE\\Microsoft\\GameBar', 'AutoGameModeEnabled') || '1',
    apply: () => regSet('HKCU\\SOFTWARE\\Microsoft\\GameBar', 'AutoGameModeEnabled', 'REG_DWORD', '1'),
    revert: (prev) => regSet('HKCU\\SOFTWARE\\Microsoft\\GameBar', 'AutoGameModeEnabled', 'REG_DWORD', prev || '1'),
  },
  {
    id: 'win-game-dvr-off', name: 'Disable Game DVR', desc: 'Stops background recording that steals FPS.',
    category: 'fps', platform: P, plan: 'free', optimal: '0',
    check: () => reg('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled') || '1',
    apply: () => {
      regSet('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', '0');
      regSet('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', '0');
    },
    revert: (prev) => {
      regSet('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', prev || '1');
      regSet('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', prev || '1');
    },
  },
  {
    id: 'win-fullscreen-opt-off', name: 'Disable fullscreen optimizations', desc: 'Prevents Windows from overriding exclusive fullscreen.',
    category: 'fps', platform: P, plan: 'free', optimal: 'DISABLEDXMAXIMIZEDWINDOWEDMODE',
    check: () => reg('HKCU\\System\\GameConfigStore', 'GameDVR_DXGIHonorFSEWindowsCompatible') || '0',
    apply: () => regSet('HKCU\\System\\GameConfigStore', 'GameDVR_DXGIHonorFSEWindowsCompatible', 'REG_DWORD', '1'),
    revert: (prev) => regSet('HKCU\\System\\GameConfigStore', 'GameDVR_DXGIHonorFSEWindowsCompatible', 'REG_DWORD', prev || '0'),
  },

  // ---- CPU & RAM ----
  {
    id: 'win-visual-effects', name: 'Visual effects → Performance', desc: 'Disables Windows animations and shadows to free up resources.',
    category: 'cpu', platform: P, plan: 'free', optimal: '2',
    check: () => reg('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting') || '0',
    apply: () => regSet('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 'REG_DWORD', '2'),
    revert: (prev) => regSet('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 'REG_DWORD', prev || '0'),
  },
  {
    id: 'win-superfetch-off', name: 'Disable Superfetch / SysMain', desc: 'Stops background preloading that uses RAM and disk.',
    category: 'cpu', platform: P, plan: 'plus', elevated: true, optimal: '4',
    check: () => { try { return ps('(Get-Service SysMain).StartType') === 'Disabled' ? '4' : '2'; } catch { return '2'; } },
    apply: () => {},
    elevatedCmd: () => 'sc config SysMain start= disabled & net stop SysMain',
    revert: () => {},
  },
  {
    id: 'win-prefetch-off', name: 'Disable Prefetch', desc: 'Stops Windows prefetching files into memory.',
    category: 'cpu', platform: P, plan: 'plus', elevated: true, optimal: '0',
    check: () => reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters', 'EnablePrefetcher') || '3',
    apply: () => {},
    elevatedCmd: () => 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters" /v EnablePrefetcher /t REG_DWORD /d 0 /f',
    revert: () => {},
  },

  // ---- GPU ----
  {
    id: 'win-gpu-scheduling', name: 'Hardware GPU scheduling', desc: 'Lets your GPU manage its own memory scheduling for lower latency.',
    category: 'gpu', platform: P, plan: 'pro', elevated: true, optimal: '2',
    check: () => reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode') || '1',
    apply: () => {},
    elevatedCmd: () => 'reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f',
    revert: () => {},
  },
  {
    id: 'win-nvidia-perf', name: 'NVIDIA → max performance', desc: 'Sets NVIDIA power management to prefer maximum performance.',
    category: 'gpu', platform: P, plan: 'pro', optimal: 'max',
    check: () => {
      const v = reg('HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak', 'Gestalt');
      return v ? 'max' : 'default';
    },
    apply: () => regSet('HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak', 'Gestalt', 'REG_DWORD', '1'),
    revert: (prev) => { if (prev === 'default') regDel('HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak', 'Gestalt'); },
  },

  // ---- Network ----
  {
    id: 'win-nagle-off', name: 'Disable Nagle\'s algorithm', desc: 'Sends packets immediately instead of batching — lower ping.',
    category: 'network', platform: P, plan: 'pro', elevated: true, optimal: '1',
    check: () => {
      try {
        const ifaces = ps('Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | Select-Object -ExpandProperty InterfaceGuid');
        return ifaces ? 'checked' : 'unknown';
      } catch { return 'unknown'; }
    },
    apply: () => {},
    elevatedCmd: () => {
      return 'powershell -NoProfile -Command "Get-NetAdapter | Where-Object {$_.Status -eq \'Up\'} | ForEach-Object { $g = $_.InterfaceGuid; $p = \'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\' + $g; Set-ItemProperty -Path $p -Name TcpAckFrequency -Value 1 -Type DWord -Force; Set-ItemProperty -Path $p -Name TCPNoDelay -Value 1 -Type DWord -Force }"';
    },
    revert: () => {},
  },
  {
    id: 'win-network-throttle-off', name: 'Disable network throttling', desc: 'Removes the Windows network throttling limit.',
    category: 'network', platform: P, plan: 'pro', elevated: true, optimal: 'off',
    check: () => reg('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'NetworkThrottlingIndex') || '10',
    apply: () => {},
    elevatedCmd: () => 'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f',
    revert: () => {},
  },
  {
    id: 'win-tcp-autotuning', name: 'TCP auto-tuning → normal', desc: 'Ensures TCP window scaling works properly for fast connections.',
    category: 'network', platform: P, plan: 'plus', elevated: true, optimal: 'normal',
    check: () => { try { return ps('(netsh int tcp show global | Select-String "Receive Window Auto-Tuning Level").ToString().Trim().Split(":")[-1].Trim()'); } catch { return 'unknown'; } },
    apply: () => {},
    elevatedCmd: () => 'netsh int tcp set global autotuninglevel=normal',
    revert: () => {},
  },

  // ---- Stability ----
  {
    id: 'win-mouse-accel-off', name: 'Disable mouse acceleration', desc: 'Raw input for precise aiming — no Windows curve applied.',
    category: 'stability', platform: P, plan: 'free', optimal: '0',
    check: () => reg('HKCU\\Control Panel\\Mouse', 'MouseSpeed') || '1',
    apply: () => {
      regSet('HKCU\\Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
      regSet('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
      regSet('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
    },
    revert: (prev) => {
      regSet('HKCU\\Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', prev || '1');
      regSet('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '6');
      regSet('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '10');
    },
  },
  {
    id: 'win-disable-transparency', name: 'Disable transparency effects', desc: 'Saves GPU cycles by turning off window transparency.',
    category: 'stability', platform: P, plan: 'free', optimal: '0',
    check: () => reg('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency') || '1',
    apply: () => regSet('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', 'REG_DWORD', '0'),
    revert: (prev) => regSet('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', 'REG_DWORD', prev || '1'),
  },
  {
    id: 'win-timer-resolution', name: 'High timer resolution', desc: 'Sets the system timer to 0.5ms for smoother frame pacing.',
    category: 'stability', platform: P, plan: 'ultra', elevated: true, optimal: '0.5ms',
    check: () => 'default',
    apply: () => {},
    elevatedCmd: () => 'bcdedit /set useplatformtick yes & bcdedit /set disabledynamictick yes',
    revert: () => {},
  },

  // ---- Picture quality ----
  {
    id: 'win-gpu-sharpening', name: 'Image sharpening hint', desc: 'Enables driver-level sharpening for cleaner visuals.',
    category: 'picture', platform: P, plan: 'pro', optimal: 'enabled',
    check: () => 'default',
    apply: () => regSet('HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\FTS', 'EnableGR535', 'REG_DWORD', '0'),
    revert: () => regDel('HKCU\\SOFTWARE\\NVIDIA Corporation\\Global\\FTS', 'EnableGR535'),
  },
];
