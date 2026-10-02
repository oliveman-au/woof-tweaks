'use strict';
const { execSync } = require('child_process');
const sysctl = (key) => { try { return execSync(`sysctl -n ${key} 2>/dev/null`, { encoding: 'utf8' }).trim(); } catch { return null; } };

const P = 'linux';

module.exports = [
  // ---- FPS ----
  {
    id: 'linux-cpu-performance', name: 'CPU governor → performance', desc: 'Locks CPU to maximum frequency for consistent frame rates.',
    category: 'fps', platform: P, plan: 'free', elevated: true, optimal: 'performance',
    check: () => { try { return execSync('cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } },
    apply: () => {},
    elevatedCmd: () => 'for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo performance > "$f" 2>/dev/null; done',
    revert: () => {},
  },

  // ---- CPU & RAM ----
  {
    id: 'linux-swappiness', name: 'Reduce swappiness', desc: 'Keeps game data in RAM instead of swapping to disk.',
    category: 'cpu', platform: P, plan: 'free', elevated: true, optimal: '10',
    check: () => sysctl('vm.swappiness') || '60',
    apply: () => {},
    elevatedCmd: () => 'sysctl -w vm.swappiness=10',
    revert: () => {},
  },
  {
    id: 'linux-oom-less', name: 'Protect game from OOM killer', desc: 'Makes the kernel less likely to kill your game when memory is low.',
    category: 'cpu', platform: P, plan: 'plus', optimal: 'set',
    check: () => 'default',
    apply: () => {},
    elevatedCmd: () => 'sysctl -w vm.overcommit_memory=1',
    revert: () => {},
  },

  // ---- Network ----
  {
    id: 'linux-tcp-fastopen', name: 'TCP Fast Open', desc: 'Sends data in the SYN packet for faster connection setup.',
    category: 'network', platform: P, plan: 'pro', elevated: true, optimal: '3',
    check: () => sysctl('net.ipv4.tcp_fastopen') || '1',
    apply: () => {},
    elevatedCmd: () => 'sysctl -w net.ipv4.tcp_fastopen=3',
    revert: () => {},
  },
  {
    id: 'linux-tcp-buffers', name: 'Larger network buffers', desc: 'Increases TCP/UDP buffer sizes for smoother online play.',
    category: 'network', platform: P, plan: 'pro', elevated: true, optimal: 'tuned',
    check: () => sysctl('net.core.rmem_max') || '212992',
    apply: () => {},
    elevatedCmd: () => 'sysctl -w net.core.rmem_max=16777216 net.core.wmem_max=16777216 net.ipv4.tcp_rmem="4096 87380 16777216" net.ipv4.tcp_wmem="4096 65536 16777216"',
    revert: () => {},
  },

  // ---- Stability ----
  {
    id: 'linux-io-scheduler', name: 'I/O scheduler → none', desc: 'Lowest latency disk scheduling for NVMe and SSD drives.',
    category: 'stability', platform: P, plan: 'plus', elevated: true, optimal: 'none',
    check: () => { try { const o = execSync('cat /sys/block/nvme0n1/queue/scheduler 2>/dev/null || cat /sys/block/sda/queue/scheduler 2>/dev/null', { encoding: 'utf8' }); const m = o.match(/\[(\w+)\]/); return m ? m[1] : 'unknown'; } catch { return 'unknown'; } },
    apply: () => {},
    elevatedCmd: () => 'for d in /sys/block/*/queue/scheduler; do echo none > "$d" 2>/dev/null; done',
    revert: () => {},
  },
];
