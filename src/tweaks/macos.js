'use strict';
const { execSync } = require('child_process');
const defaults = (domain, key) => { try { return execSync(`defaults read ${domain} ${key} 2>/dev/null`, { encoding: 'utf8' }).trim(); } catch { return null; } };
const sysctl = (key) => { try { return execSync(`sysctl -n ${key} 2>/dev/null`, { encoding: 'utf8' }).trim(); } catch { return null; } };

const P = 'darwin';

module.exports = [
  // ---- FPS ----
  {
    id: 'mac-reduce-motion', name: 'Reduce motion', desc: 'Disables macOS animations for a snappier feel and fewer dropped frames.',
    category: 'fps', platform: P, plan: 'free', optimal: 'true',
    check: () => defaults('com.apple.universalaccess', 'reduceMotion') || 'false',
    apply: () => execSync('defaults write com.apple.universalaccess reduceMotion -bool true'),
    revert: (prev) => execSync(`defaults write com.apple.universalaccess reduceMotion -bool ${prev === 'true' ? 'true' : 'false'}`),
  },
  {
    id: 'mac-reduce-transparency', name: 'Reduce transparency', desc: 'Saves GPU work by removing window transparency effects.',
    category: 'fps', platform: P, plan: 'free', optimal: 'true',
    check: () => defaults('com.apple.universalaccess', 'reduceTransparency') || 'false',
    apply: () => execSync('defaults write com.apple.universalaccess reduceTransparency -bool true'),
    revert: (prev) => execSync(`defaults write com.apple.universalaccess reduceTransparency -bool ${prev === 'true' ? 'true' : 'false'}`),
  },
  {
    id: 'mac-disable-animations', name: 'Speed up Dock & windows', desc: 'Removes Dock bounce, window resize and Mission Control animations.',
    category: 'fps', platform: P, plan: 'free', optimal: '0',
    check: () => defaults('com.apple.dock', 'launchanim') || '1',
    apply: () => {
      execSync('defaults write com.apple.dock launchanim -bool false');
      execSync('defaults write com.apple.dock expose-animation-duration -float 0.1');
      execSync('defaults write -g NSAutomaticWindowAnimationsEnabled -bool false');
      execSync('killall Dock 2>/dev/null || true');
    },
    revert: (prev) => {
      execSync('defaults write com.apple.dock launchanim -bool true');
      execSync('defaults delete com.apple.dock expose-animation-duration 2>/dev/null || true');
      execSync('defaults write -g NSAutomaticWindowAnimationsEnabled -bool true');
      execSync('killall Dock 2>/dev/null || true');
    },
  },

  // ---- CPU & RAM ----
  {
    id: 'mac-spotlight-off', name: 'Pause Spotlight indexing', desc: 'Stops Spotlight from using CPU and disk while you game.',
    category: 'cpu', platform: P, plan: 'plus', elevated: true, optimal: 'off',
    check: () => { try { const o = execSync('mdutil -s / 2>/dev/null', { encoding: 'utf8' }); return o.includes('Indexing enabled') ? 'on' : 'off'; } catch { return 'unknown'; } },
    apply: () => {},
    elevatedCmd: () => 'mdutil -i off / -d',
    revert: () => {},
  },

  // ---- Network ----
  {
    id: 'mac-network-buffers', name: 'Larger network buffers', desc: 'Increases TCP/UDP buffer sizes for smoother online play.',
    category: 'network', platform: P, plan: 'pro', elevated: true, optimal: 'tuned',
    check: () => sysctl('net.inet.tcp.sendspace') || '131072',
    apply: () => {},
    elevatedCmd: () => 'sysctl -w net.inet.tcp.sendspace=262144 net.inet.tcp.recvspace=262144 net.inet.udp.recvspace=262144 net.inet.tcp.delayed_ack=0',
    revert: () => {},
  },
  {
    id: 'mac-tcp-no-delay', name: 'Disable TCP delayed ACK', desc: 'Acknowledges packets immediately for lower ping.',
    category: 'network', platform: P, plan: 'pro', elevated: true, optimal: '0',
    check: () => sysctl('net.inet.tcp.delayed_ack') || '3',
    apply: () => {},
    elevatedCmd: () => 'sysctl -w net.inet.tcp.delayed_ack=0',
    revert: () => {},
  },

  // ---- Stability ----
  {
    id: 'mac-app-nap-off', name: 'Disable App Nap', desc: 'Prevents macOS from throttling background games.',
    category: 'stability', platform: P, plan: 'free', optimal: 'false',
    check: () => defaults('-g', 'NSAppSleepDisabled') || '0',
    apply: () => execSync('defaults write -g NSAppSleepDisabled -bool true'),
    revert: () => execSync('defaults write -g NSAppSleepDisabled -bool false'),
  },
  {
    id: 'mac-disable-crash-reporter', name: 'Disable crash reporter dialog', desc: 'Stops the "unexpectedly quit" dialog from freezing your screen.',
    category: 'stability', platform: P, plan: 'free', optimal: 'server',
    check: () => defaults('com.apple.CrashReporter', 'DialogType') || 'crashreport',
    apply: () => execSync('defaults write com.apple.CrashReporter DialogType server'),
    revert: (prev) => execSync(`defaults write com.apple.CrashReporter DialogType ${prev || 'crashreport'}`),
  },
];
