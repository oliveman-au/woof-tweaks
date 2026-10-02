'use strict';
// Built-in benchmark. Honest by design: these are system micro-benchmarks (CPU, memory, disk, network),
// not in-game FPS. Run once before and once after tweaking to compare. CPU/memory work runs in worker
// threads so the app stays responsive.
const { Worker } = require('worker_threads');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const dns = require('dns');
const crypto = require('crypto');

const WORKER = `
const { parentPort, workerData } = require('worker_threads');
const crypto = require('crypto');
if (workerData.kind === 'cpu') {
  const buf = crypto.randomBytes(1 << 20); let n = 0; const end = Date.now() + workerData.ms;
  while (Date.now() < end) { crypto.createHash('sha256').update(buf).digest(); n++; }
  parentPort.postMessage(n / (workerData.ms / 1000));
} else if (workerData.kind === 'mem') {
  const size = workerData.mb * 1024 * 1024 / 8; const a = new Float64Array(size); const b = new Float64Array(size);
  for (let i = 0; i < size; i += 4096) a[i] = i;
  let bytes = 0; const t0 = process.hrtime.bigint(); const end = Date.now() + workerData.ms;
  while (Date.now() < end) { b.set(a); bytes += a.byteLength; }
  const s = Number(process.hrtime.bigint() - t0) / 1e9;
  parentPort.postMessage(bytes / s / 1e9);
}`;

function inWorker(data) {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER, { eval: true, workerData: data });
    w.once('message', (m) => { resolve(m); w.terminate(); });
    w.once('error', reject);
  });
}

async function cpu() {
  const single = await inWorker({ kind: 'cpu', ms: 2000 });
  const n = Math.min(os.cpus().length, 16);
  const multi = (await Promise.all(Array.from({ length: n }, () => inWorker({ kind: 'cpu', ms: 2000 })))).reduce((a, b) => a + b, 0);
  return { singleMBs: Math.round(single), multiMBs: Math.round(multi), threads: n };
}

async function memory() {
  const mb = os.totalmem() / 1024 ** 3 < 10 ? 64 : 128;
  return { copyGBs: Math.round((await inWorker({ kind: 'mem', ms: 2000, mb })) * 10) / 10 };
}

async function disk(dir) {
  const file = path.join(dir, `woof-bench-${process.pid}.tmp`);
  const chunk = crypto.randomBytes(4 << 20);
  const total = 256 << 20;
  try {
    const t0 = process.hrtime.bigint();
    const fd = fs.openSync(file, 'w');
    for (let w = 0; w < total; w += chunk.length) fs.writeSync(fd, chunk);
    fs.fsyncSync(fd); fs.closeSync(fd);
    const writeS = Number(process.hrtime.bigint() - t0) / 1e9;
    // Random 4 KB reads (cached reads are part of real-world behaviour; we label it honestly).
    const rfd = fs.openSync(file, 'r'); const b = Buffer.alloc(4096); let reads = 0;
    const end = Date.now() + 1500;
    while (Date.now() < end) { fs.readSync(rfd, b, 0, 4096, Math.floor(Math.random() * (total / 4096)) * 4096); reads++; }
    fs.closeSync(rfd);
    return { writeMBs: Math.round(total / 1048576 / writeS), random4kIops: Math.round(reads / 1.5) };
  } finally { try { fs.unlinkSync(file); } catch { /* ignore */ } }
}

/** TCP connect time (works without admin, unlike ICMP ping). */
function tcpPing(host, port = 443, timeout = 2500) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const s = net.connect({ host, port, timeout });
    const done = (ms) => { s.destroy(); resolve(ms); };
    s.once('connect', () => done(Number(process.hrtime.bigint() - t0) / 1e6));
    s.once('timeout', () => done(null));
    s.once('error', () => done(null));
  });
}

async function pingStats(host, n = 10) {
  const out = [];
  for (let i = 0; i < n; i++) { out.push(await tcpPing(host)); await new Promise((r) => setTimeout(r, 120)); }
  const ok = out.filter((x) => x != null);
  if (!ok.length) return { host, avg: null, jitter: null, loss: 100 };
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  let jit = 0; for (let i = 1; i < ok.length; i++) jit += Math.abs(ok[i] - ok[i - 1]);
  return { host, avg: Math.round(avg * 10) / 10, min: Math.round(Math.min(...ok) * 10) / 10, jitter: Math.round((ok.length > 1 ? jit / (ok.length - 1) : 0) * 10) / 10, loss: Math.round((1 - ok.length / n) * 100) };
}

async function network() {
  const targets = ['1.1.1.1', '8.8.8.8', '9.9.9.9'];
  const res = [];
  for (const h of targets) res.push(await pingStats(h, 8));
  const best = res.filter((r) => r.avg != null).sort((a, b) => a.avg - b.avg)[0] || null;
  return { targets: res, ping: best ? best.avg : null, jitter: best ? best.jitter : null, loss: best ? best.loss : 100 };
}

const DNS_PROVIDERS = [
  { id: 'system', name: 'Your current DNS', servers: null },
  { id: 'cloudflare', name: 'Cloudflare', servers: ['1.1.1.1'] },
  { id: 'google', name: 'Google', servers: ['8.8.8.8'] },
  { id: 'quad9', name: 'Quad9', servers: ['9.9.9.9'] },
  { id: 'adguard', name: 'AdGuard', servers: ['94.140.14.14'] },
];
/** Rank DNS providers by median lookup time for uncached names. */
async function dnsTest() {
  const names = ['www.google.com', 'store.steampowered.com', 'www.epicgames.com', 'discord.com', 'www.roblox.com', 'www.riotgames.com'];
  const out = [];
  for (const p of DNS_PROVIDERS) {
    const r = new dns.promises.Resolver({ timeout: 2000, tries: 1 });
    if (p.servers) r.setServers(p.servers);
    const times = [];
    for (const n of names) {
      const host = `${crypto.randomBytes(4).toString('hex')}.${n}`; // random label = never cached
      const t0 = process.hrtime.bigint();
      try { await r.resolve4(host); } catch { /* NXDOMAIN still measures the round trip */ }
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    out.push({ id: p.id, name: p.name, ms: Math.round(times[Math.floor(times.length / 2)]) });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

// Cloud regions near most game servers (AWS endpoint TCP connect time). Honest label: an estimate.
const REGIONS = {
  'us-east-1': 'US East (Virginia)', 'us-east-2': 'US East (Ohio)', 'us-west-1': 'US West (California)', 'us-west-2': 'US West (Oregon)',
  'ca-central-1': 'Canada', 'sa-east-1': 'Brazil (São Paulo)', 'eu-west-1': 'Europe (Ireland)', 'eu-west-2': 'Europe (London)', 'eu-central-1': 'Europe (Frankfurt)',
  'eu-north-1': 'Europe (Stockholm)', 'me-south-1': 'Middle East (Bahrain)', 'af-south-1': 'Africa (Cape Town)', 'ap-south-1': 'Asia (Mumbai)',
  'ap-southeast-1': 'Asia (Singapore)', 'ap-southeast-2': 'Oceania (Sydney)', 'ap-northeast-1': 'Asia (Tokyo)', 'ap-northeast-2': 'Asia (Seoul)',
};
async function regions(list) {
  const ids = (list && list.length ? list : Object.keys(REGIONS)).filter((r) => REGIONS[r]);
  const out = await Promise.all(ids.map(async (r) => {
    const host = `ec2.${r}.amazonaws.com`;
    const tries = [];
    for (let i = 0; i < 3; i++) tries.push(await tcpPing(host, 443, 3000));
    const ok = tries.filter((x) => x != null);
    return { id: r, name: REGIONS[r], ms: ok.length ? Math.round(Math.min(...ok)) : null };
  }));
  return out.sort((a, b) => (a.ms ?? 1e9) - (b.ms ?? 1e9));
}

async function runAll(dataDir, progress = () => {}) {
  const res = { at: new Date().toISOString() };
  progress('CPU', 10); res.cpu = await cpu();
  progress('Memory', 45); res.memory = await memory();
  progress('Disk', 60); try { res.disk = await disk(dataDir); } catch (e) { res.disk = { error: e.message }; }
  progress('Network', 80); res.network = await network();
  progress('Done', 100);
  return res;
}

module.exports = { runAll, cpu, memory, disk, network, dnsTest, regions, tcpPing, pingStats, REGIONS };
