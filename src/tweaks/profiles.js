'use strict';

const PROFILES = [
  {
    id: 'fortnite', name: 'Fortnite', icon: '🎯', platforms: ['win32', 'darwin'],
    tweaks: {
      win32: ['win-power-high-perf', 'win-game-mode', 'win-game-dvr-off', 'win-fullscreen-opt-off', 'win-visual-effects', 'win-mouse-accel-off', 'win-nagle-off', 'win-network-throttle-off', 'win-nvidia-perf'],
      darwin: ['mac-reduce-motion', 'mac-reduce-transparency', 'mac-disable-animations', 'mac-app-nap-off', 'mac-network-buffers'],
    },
  },
  {
    id: 'valorant', name: 'Valorant', icon: '🎯', platforms: ['win32'],
    tweaks: {
      win32: ['win-power-high-perf', 'win-game-mode', 'win-game-dvr-off', 'win-fullscreen-opt-off', 'win-mouse-accel-off', 'win-visual-effects', 'win-nagle-off', 'win-network-throttle-off', 'win-nvidia-perf', 'win-gpu-scheduling', 'win-timer-resolution'],
    },
  },
  {
    id: 'cs2', name: 'Counter-Strike 2', icon: '🔫', platforms: ['win32', 'linux'],
    tweaks: {
      win32: ['win-power-high-perf', 'win-game-mode', 'win-game-dvr-off', 'win-fullscreen-opt-off', 'win-mouse-accel-off', 'win-visual-effects', 'win-nagle-off', 'win-network-throttle-off', 'win-nvidia-perf', 'win-timer-resolution'],
      linux: ['linux-cpu-performance', 'linux-swappiness', 'linux-tcp-fastopen', 'linux-tcp-buffers', 'linux-io-scheduler'],
    },
  },
  {
    id: 'roblox', name: 'Roblox', icon: '🧱', platforms: ['win32', 'darwin'],
    tweaks: {
      win32: ['win-power-high-perf', 'win-game-mode', 'win-game-dvr-off', 'win-visual-effects', 'win-superfetch-off', 'win-disable-transparency'],
      darwin: ['mac-reduce-motion', 'mac-reduce-transparency', 'mac-disable-animations', 'mac-app-nap-off'],
    },
  },
  {
    id: 'minecraft', name: 'Minecraft', icon: '⛏️', platforms: ['win32', 'darwin', 'linux'],
    tweaks: {
      win32: ['win-power-high-perf', 'win-game-mode', 'win-game-dvr-off', 'win-visual-effects', 'win-superfetch-off', 'win-prefetch-off'],
      darwin: ['mac-reduce-motion', 'mac-reduce-transparency', 'mac-app-nap-off', 'mac-spotlight-off'],
      linux: ['linux-cpu-performance', 'linux-swappiness', 'linux-oom-less'],
    },
  },
  {
    id: 'cod', name: 'Call of Duty', icon: '💥', platforms: ['win32'],
    tweaks: {
      win32: ['win-power-high-perf', 'win-game-mode', 'win-game-dvr-off', 'win-fullscreen-opt-off', 'win-visual-effects', 'win-nagle-off', 'win-network-throttle-off', 'win-tcp-autotuning', 'win-nvidia-perf', 'win-gpu-scheduling'],
    },
  },
  {
    id: 'apex', name: 'Apex Legends', icon: '🎮', platforms: ['win32'],
    tweaks: {
      win32: ['win-power-high-perf', 'win-game-mode', 'win-game-dvr-off', 'win-fullscreen-opt-off', 'win-visual-effects', 'win-mouse-accel-off', 'win-nagle-off', 'win-network-throttle-off', 'win-nvidia-perf', 'win-gpu-scheduling'],
    },
  },
  {
    id: 'general', name: 'General (all games)', icon: '🖥️', platforms: ['win32', 'darwin', 'linux'],
    tweaks: {
      win32: ['win-power-high-perf', 'win-game-mode', 'win-game-dvr-off', 'win-fullscreen-opt-off', 'win-visual-effects', 'win-mouse-accel-off', 'win-disable-transparency'],
      darwin: ['mac-reduce-motion', 'mac-reduce-transparency', 'mac-disable-animations', 'mac-app-nap-off', 'mac-disable-crash-reporter'],
      linux: ['linux-cpu-performance', 'linux-swappiness'],
    },
  },
];

module.exports = { PROFILES };
