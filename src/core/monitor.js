'use strict';
// Live mini-monitor: CPU %, RAM %, GPU % and temperatures where the OS exposes them without admin,
// and ping. Anything we can't read honestly shows as "n/a" — never a made-up number.
const fs = require('fs');
const os = require('os');
const { run } = require('./exec');
const { tcpPing } = require('./benchmark');

let timer = null;
let prev = null;
let listeners = 0;
let slowTick = 0;
let last = { cpu: null, ram: null, gpu: null, gpuTemp: null, cpuTemp: null, ping: null, throttling: null };
let hasNvidiaSmi = null;

function cpuPercent() {
  const c = os.cpus();
  const t = c.reduce((a, x) => { const s = x.times; a.idle += s.idle; a.total += s.user + s.nice + s.sys + s.idle + s.irq; return a; }, { idle: 0, total: 0 });
  let pct = null;
  if (prev) { const di = t.idle - prev.idle; const dt = t.total - prev.total; pct = dt > 0 ? Math.round((1 - di / dt) * 100) : null; }
  prev = t;
  return pct;
}

async function ramPercent() {
  const total = os.totalmem();
  if (process.platform === 'linux') {
    try {
      const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/);
      if (m) return Math.round((1 - (Number(m[1]) * 1024) / total) * 100);
    } catch { /* fall through */ }
  }
  if (process.platform === 'darwin') {
    // os.freemem() on macOS ignores reclaimable memory; vm_stat gives the real picture.
    const r = await run('vm_stat', [], { timeout: 3000 });
    const page = Number((r.stdout.match(/page size of (\d+)/) || [])[1] || 16384);
    const get = (k) => Number((r.stdout.match(new RegExp(`${k}:\\s+(\\d+)`)) || [])[1] || 0);
    const avail = (get('Pages free') + get('Pages inactive') + get('Pages speculative') + get('Pages purgeable')) * page;
    if (avail) return Math.max(0, Math.min(100, Math.round((1 - avail / total) * 100)));
  }
  return Math.round((1 - os.freemem() / total) * 100);
}

async function gpuStats() {
  if (hasNvidiaSmi !== false) {
    const r = await run('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'], { timeout: 4000 });
    if (r.code === 0) {
      hasNvidiaSmi = true;
      const [u, t] = r.stdout.trim().split('\n')[0].split(',').map((x) => Number(x.trim()));
      return { gpu: Number.isFinite(u) ? u : null, gpuTemp: Number.isFinite(t) ? t : null };
    }
    hasNvidiaSmi = false;
  }
  if (process.platform === 'linux') {
    try {
      for (const card of fs.readdirSync('/sys/class/drm')) {
        const p = `/sys/class/drm/${card}/device/gpu_busy_percent`;
        if (fs.existsSync(p)) {
          const busy = Number(fs.readFileSync(p, 'utf8'));
          let temp = null;
          const hw = `/sys/class/drm/${card}/device/hwmon`;
          if (fs.existsSync(hw)) for (const h of fs.readdirSync(hw)) { try { temp = Math.round(Number(fs.readFileSync(`${hw}/${h}/temp1_input`, 'utf8')) / 1000); break; } catch { /* none */ } }
          return { gpu: busy, gpuTemp: temp };
        }
      }
    } catch { /* none */ }
  }
  return { gpu: null, gpuTemp: null };
}

function cpuTempLinux() {
  try {
    for (const h of fs.readdirSync('/sys/class/hwmon')) {
      const name = fs.readFileSync(`/sys/class/hwmon/${h}/name`, 'utf8').trim();
      if (['k10temp', 'coretemp', 'zenpower', 'cpu_thermal'].includes(name)) return Math.round(Number(fs.readFileSync(`/sys/class/hwmon/${h}/temp1_input`, 'utf8')) / 1000);
    }
  } catch { /* none */ }
  return null;
}

async function macThrottle() {
  const r = await run('pmset', ['-g', 'therm'], { timeout: 3000 });
  const m = r.stdout.match(/CPU_Speed_Limit\s*=\s*(\d+)/);
  return m ? Number(m[1]) < 100 : null;
}

async function tick(send) {
  const cpu = cpuPercent();
  const ram = await ramPercent();
  slowTick = (slowTick + 1) % 2;
  if (slowTick === 0) {
    Object.assign(last, await gpuStats());
    last.ping = await tcpPing('1.1.1.1', 443, 1500).then((ms) => (ms == null ? null : Math.round(ms)));
    if (process.platform === 'linux') last.cpuTemp = cpuTempLinux();
    if (process.platform === 'darwin') last.throttling = await macThrottle();
  }
  last = { ...last, cpu, ram, at: Date.now() };
  send(last);
}

function start(send, intervalMs = 1500) {
  listeners++;
  if (timer) return;
  prev = null;
  cpuPercent();
  timer = setInterval(() => { tick(send).catch(() => {}); }, intervalMs);
  tick(send).catch(() => {});
}
function stop(force = false) {
  listeners = force ? 0 : Math.max(0, listeners - 1);
  if (listeners === 0 && timer) { clearInterval(timer); timer = null; }
}
const snapshot = () => last;

module.exports = { start, stop, snapshot };
