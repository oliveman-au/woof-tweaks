import { icon, PAW } from '../icons.js';
import { esc, when } from '../util.js';
import { S, toast, upgradeModal, setSetting } from '../app.js';
import { PLAN_NAME } from '../components.js';

const api = window.woof;
let state = { running: false, stage: '', pct: 0, result: null, previous: null, frames: null, dns: null, dnsRunning: false, regions: null };
let off = null;

/** Desktop frame pacing: measures how evenly this window's frames arrive (not in-game FPS). */
function framePacing(ms = 4000) {
  return new Promise((resolve) => {
    const times = []; let last = performance.now(); const end = last + ms;
    const loop = (now) => { times.push(now - last); last = now; if (now < end) requestAnimationFrame(loop); else done(); };
    const done = () => {
      const ft = times.slice(5).sort((a, b) => a - b);
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      const p99 = ft[Math.floor(ft.length * 0.99)] || avg;
      const sd = Math.sqrt(ft.reduce((a, b) => a + (b - avg) ** 2, 0) / ft.length);
      resolve({ fps: Math.round(1000 / avg), low1: Math.round(1000 / p99), jitterMs: Math.round(sd * 100) / 100 });
    };
    requestAnimationFrame(loop);
  });
}

const delta = (now, before, higherIsBetter = true) => {
  if (now == null || before == null || !before) return '';
  const d = ((now - before) / before) * 100;
  if (Math.abs(d) < 2) return '<span class="delta dim">≈ same</span>';
  const good = higherIsBetter ? d > 0 : d < 0;
  return `<span class="delta ${good ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d.toFixed(0)}%</span>`;
};
const metric = (k, v, unit, d = '') => `<div class="metric"><div class="k">${k}</div><div class="v">${v == null ? '—' : v}<small> ${unit}</small></div>${d}</div>`;

function card(r, prev) {
  const p = prev || {};
  return `<div class="card bench-card" id="bench-card">
    <div class="row" style="margin-bottom:14px"><span class="brand-mark" style="width:34px;height:34px">${PAW}</span><div><b>Woof Tweaks benchmark</b><div class="dim tiny">${esc(when(r.at))} · ${esc((S.hw && S.hw.cpu) || '')}${S.hw && S.hw.gpu ? ` · ${esc(S.hw.gpu)}` : ''}</div></div><span class="spacer"></span>${prev ? `<span class="badge neutral">vs ${esc(when(prev.at))}</span>` : ''}</div>
    <div class="grid g4">
      ${metric('CPU single-core', r.cpu && r.cpu.singleMBs, 'MB/s', delta(r.cpu && r.cpu.singleMBs, p.cpu && p.cpu.singleMBs))}
      ${metric('CPU all cores', r.cpu && r.cpu.multiMBs, 'MB/s', delta(r.cpu && r.cpu.multiMBs, p.cpu && p.cpu.multiMBs))}
      ${metric('Memory copy', r.memory && r.memory.copyGBs, 'GB/s', delta(r.memory && r.memory.copyGBs, p.memory && p.memory.copyGBs))}
      ${metric('Disk write', r.disk && r.disk.writeMBs, 'MB/s', delta(r.disk && r.disk.writeMBs, p.disk && p.disk.writeMBs))}
      ${metric('Disk random 4K', r.disk && r.disk.random4kIops, 'IOPS', delta(r.disk && r.disk.random4kIops, p.disk && p.disk.random4kIops))}
      ${metric('Ping', r.network && r.network.ping, 'ms', delta(r.network && r.network.ping, p.network && p.network.ping, false))}
      ${metric('Jitter', r.network && r.network.jitter, 'ms', delta(r.network && r.network.jitter, p.network && p.network.jitter, false))}
      ${metric('Frame pacing', r.frames ? r.frames.jitterMs : null, 'ms jitter', delta(r.frames && r.frames.jitterMs, p.frames && p.frames.jitterMs, false))}
    </div>
    <p class="dim tiny" style="margin-top:12px">These are system micro-benchmarks, not in-game FPS. Run once before tweaking and once after (restart first if a tweak asked you to) to compare fairly.</p>
  </div>`;
}

export function render() {
  const hist = S.benchHist || [];
  return `<div class="page">
    <div class="page-head"><div><h1>Benchmark</h1><p>A quick, honest before/after test: CPU, memory, disk, desktop frame pacing and network. About 20 seconds.</p></div>
      <div class="actions">${state.result ? `<button class="btn" id="share">${icon('camera', 'sm')}Save / copy result card</button>` : ''}<button class="btn primary" id="run" ${state.running ? 'disabled' : ''}>${state.running ? '<span class="spin"></span>Running…' : `${icon('play', 'sm')}Run benchmark`}</button></div></div>
    ${state.running ? `<div class="card pad" style="margin-bottom:14px"><div class="row"><b>${esc(state.stage || 'Starting')}</b><span class="spacer"></span><span class="dim small">${state.pct}%</span></div><div class="progress" style="margin-top:10px"><i style="width:${state.pct}%"></i></div><p class="dim tiny" style="margin-top:8px">Close games and big downloads for accurate results.</p></div>` : ''}
    ${state.result ? card(state.result, state.previous) : `<div class="card pad"><div class="row"><span class="icon-wrap" style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(var(--accent-rgb),.14);color:var(--accent)">${icon('bench', 'lg')}</span><div><b>No result yet</b><div class="muted small">${hist.length ? `Last run ${esc(when(hist[0].at))}.` : 'Run it now, then again after tweaking to see the difference.'}</div></div></div></div>`}
    <div class="grid g2" style="margin-top:14px;align-items:start">
      <div class="card pad"><div class="row"><h2>DNS speed test</h2><span class="spacer"></span><button class="btn sm" id="dns" ${state.dnsRunning ? 'disabled' : ''}>${state.dnsRunning ? '<span class="spin"></span>Testing…' : `${icon('globe', 'sm')}Test`}</button></div>
        <p class="muted small" style="margin:4px 0 10px">Ranks DNS providers by how fast they answer from your connection. Faster DNS = quicker logins, matchmaking and downloads (not in-game ping).</p>
        ${state.dns ? `<div class="col" style="gap:2px">${state.dns.map((d, i) => `<div class="rank"><b>${i + 1}</b><div><div class="small strong">${esc(d.name)}${i === 0 ? ' <span class="badge ok">Fastest</span>' : ''}</div><div class="bar2" style="width:${Math.max(4, (d.ms / Math.max(...state.dns.map((x) => x.ms))) * 100)}%"></div></div><span class="mono small">${d.ms} ms</span></div>`).join('')}</div>
          ${state.dns[0] && state.dns[0].id !== 'system' ? `<div class="row" style="margin-top:10px"><span class="small muted" style="flex:1">Switch to ${esc(state.dns[0].name)}?</span><button class="btn sm primary" data-go="tweaks" id="dns-go">See DNS tweaks</button></div>` : ''}` : ''}
      </div>
      <div class="card pad"><h2>History</h2>
        ${hist.length ? `<div class="timeline">${hist.slice(0, 8).map((h) => `<div class="tl"><span class="dot2">${icon('bench', 'sm')}</span><div><div class="t">${esc(when(h.at))}</div><div class="d">CPU ${h.cpu ? h.cpu.multiMBs : '—'} MB/s · Disk ${h.disk && h.disk.writeMBs ? h.disk.writeMBs : '—'} MB/s · Ping ${h.network && h.network.ping != null ? `${h.network.ping} ms` : '—'}</div></div></div>`).join('')}</div>` : '<p class="dim small" style="margin-top:8px">Your runs will show up here.</p>'}
      </div>
    </div>
  </div>`;
}

export function mount(root) {
  if (!S.benchHist) api.benchHistory().then((h) => { S.benchHist = Array.isArray(h) ? h : []; if (!state.result && S.benchHist[0]) { state.result = S.benchHist[0]; state.previous = S.benchHist[1] || null; } rerender(); });
  root.querySelector('#run').onclick = run;
  const sh = root.querySelector('#share');
  if (sh) sh.onclick = async () => {
    const el = document.getElementById('bench-card');
    const r = el.getBoundingClientRect();
    const res = await api.capture({ x: r.left, y: r.top, width: r.width, height: r.height });
    if (res && res.ok) toast('success', 'Result card copied', res.saved ? 'Also saved as a PNG.' : 'Paste it into Discord or anywhere.');
  };
  const d = root.querySelector('#dns');
  if (d) d.onclick = async () => { state.dnsRunning = true; rerender(); const r = await api.dnsTest(); state.dnsRunning = false; state.dns = r && r.ok ? r.results : null; rerender(); if (!r || !r.ok) toast('error', 'DNS test failed', r && r.error); };
  const dg = root.querySelector('#dns-go'); if (dg) dg.onclick = () => { S.query = 'dns'; };
}
function rerender() { const m = document.getElementById('main'); if (m && S.page === 'benchmark') { m.innerHTML = render(); mount(m); } }

async function run() {
  if (state.running) return;
  state.running = true; state.stage = 'Frame pacing'; state.pct = 2; rerender();
  off = api.onBench((p) => { state.stage = p.stage; state.pct = p.pct; const bar = document.querySelector('.progress i'); if (bar) bar.style.width = `${p.pct}%`; const st = document.querySelector('.card.pad b'); if (st && state.running) st.textContent = p.stage; });
  const frames = await framePacing(4000);
  const r = await api.benchmark();
  if (off) off();
  state.running = false;
  if (!r || !r.ok) { rerender(); if (r && r.code === 'plan') return upgradeModal(r.requiredPlan, r.error); return toast('error', 'Benchmark failed', r && r.error); }
  r.result.frames = frames;
  state.result = r.result; state.previous = r.previous;
  S.benchHist = [r.result, ...(S.benchHist || [])].slice(0, 20);
  rerender();
  toast('success', 'Benchmark done', state.previous ? 'Compared with your previous run.' : 'Run it again after tweaking to compare.');
}
export function unmount() { if (off) off(); }
