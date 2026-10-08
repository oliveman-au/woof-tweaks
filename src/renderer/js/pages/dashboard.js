import { icon } from '../icons.js';
import { esc, plural } from '../util.js';
import { ring, sparkline, gameArt, PLAN_NAME } from '../components.js';
import { S, go, applyFlow, revertFlow, toast, modal, refreshScan, render as renderApp, plan } from '../app.js';

const api = window.woof;
let offMon = null;
const hist = { cpu: [], ram: [], gpu: [], ping: [] };

/** Optimisation score: share of tweaks recommended for this PC (that your plan includes) that are optimised. */
function score() {
  const pool = S.tweaks.filter((t) => !t.locked && !t.security && t.risk !== 'advanced' && t.status && t.status !== 'na' && t.status !== 'unknown' && !t.blocked && !t.hidden && !['startup', 'game'].includes(t.category) && !t.exclusive);
  const exclusivePlan = S.tweaks.some((t) => t.exclusive === 'power-plan' && t.status === 'optimised');
  if (!pool.length) return { pct: 0, done: 0, total: 0 };
  const done = pool.filter((t) => t.status === 'optimised').length + (exclusivePlan ? 1 : 0);
  const total = pool.length + (S.tweaks.some((t) => t.exclusive === 'power-plan') ? 1 : 0);
  return { pct: Math.round((done / total) * 100), done, total };
}

// Since 1.1.2 the Woof Gaming plan adapts to the PC. Laptops and CPUs that pick their own best cores (AMD Ryzen 9 X3D,
// Intel hybrid) stay on Windows' Balanced plan; an older High-performance-style plan there can cause FPS drops in busy fights.
const PLANS = ['win-plan-woof', 'win-plan-high', 'win-plan-ultimate'];
function selfManagedCores(hw) {
  const cpu = String(hw.cpu || '');
  return /ryzen\s*9\s*\d{4}x3d/i.test(cpu)
    || (hw.cpuVendor === 'intel' && (/core\s*(\(tm\))?\s*ultra/i.test(cpu) || (hw.cpuThreads > hw.cpuCores && hw.cpuThreads < hw.cpuCores * 2)));
}
function planNeedsUpdate() {
  const hw = S.hw || {};
  if (S.info.platform !== 'win32' || !(hw.isLaptop || selfManagedCores(hw))) return null;
  const applied = PLANS.map((id) => S.tweakMap.get(id)).filter((t) => t && t.applied);
  const woof = S.tweakMap.get('win-plan-woof');
  if (!applied.length || !woof || woof.blocked) return null;
  const stale = applied.some((t) => t.id !== 'win-plan-woof') || (woof.applied && woof.status && woof.status !== 'optimised');
  return stale ? applied.map((t) => t.id) : null;
}

function recommended() {
  return S.tweaks.filter((t) => !t.applied && t.status === 'default' && !t.blocked && (t.recommended || (t.risk === 'safe' && ['fps', 'stability', 'input'].includes(t.category))) && !t.exclusive)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || Number(a.locked) - Number(b.locked)).slice(0, 5);
}

const fmtNum = (v, unit) => (v == null ? '<span class="dim">n/a</span>' : `${v}<small>${unit}</small>`);
const barCls = (v, hi = 80, crit = 92) => (v >= crit ? 'crit' : v >= hi ? 'hot' : '');

export function render() {
  const hw = S.hw || {};
  const sc = score();
  const recs = recommended();
  const installed = S.games.filter((g) => g.installed).slice(0, 4);
  const gpu = hw.gpu || (hw.gpus && hw.gpus[0] && hw.gpus[0].name) || '—';
  const refresh = hw.refreshHz ? `${hw.refreshHz} Hz${hw.maxRefreshHz && hw.maxRefreshHz > hw.refreshHz ? ` <span class="badge moderate" data-tip="Your display supports ${hw.maxRefreshHz} Hz">max ${hw.maxRefreshHz}</span>` : ''}` : '—';
  const m = S.lastMonitor || {};
  return `<div class="page">
    <div class="page-head"><div><h1>${greeting()}${S.session.name ? `, ${esc(S.session.name.split(' ')[0])}` : ''}</h1><p>Here's how your ${esc(S.info.osName)} PC is doing. Everything Woof Tweaks changes is backed up and can be undone.</p></div>
      <div class="actions"><button class="btn" id="fixlag">${icon('stethoscope', 'sm')}Fix my lag</button></div></div>
    ${planNeedsUpdate() ? `<div class="note warn" style="margin:0 0 14px">${icon('bolt', 'sm')}<div style="flex:1"><b>Update your power plan for this ${S.hw && S.hw.isLaptop ? 'laptop' : 'CPU'}.</b> Your current gaming power plan can push games onto slower cores or make the CPU throttle, which shows up as FPS drops (and higher in-game ping) in busy fights. The new Woof Gaming plan adapts to your PC.</div><button class="btn sm primary" id="plan-fix">Update plan</button></div>` : ''}
    <div class="hero">
      <div class="card score-card">
        ${ring(S.scan ? sc.pct : 0, 'Optimisation score', 'score')}
        <div class="col" style="gap:8px;position:relative;z-index:1">
          <h2>Optimisation score</h2>
          <p class="muted small">${S.scan ? `${sc.done} of ${sc.total} recommended settings for your plan are optimised.` : 'Checking your current settings…'}</p>
          <div class="row wrap" style="gap:8px;margin-top:4px">
            <button class="btn primary" id="full-opt">${icon('bolt', 'sm')}Full optimise</button>
            <button class="btn" data-go="tweaks">${icon('sliders', 'sm')}Pick tweaks</button>
          </div>
          <p class="dim tiny">Full optimise = the Balanced preset for the ${esc(PLAN_NAME[plan()])} plan. Never includes advanced or security trade-off tweaks.</p>
        </div>
      </div>
      <div class="card pad col">
        <div class="row"><h2>Quick actions</h2></div>
        <div class="quick">
          <button class="btn" id="qa-revert">${icon('undo')}Revert all<span class="spacer"></span><span class="dim tiny">${S.tweaks.filter((t) => t.applied).length}</span></button>
          <button class="btn" id="qa-rp">${icon('backup')}${S.info.platform === 'win32' ? 'Create restore point' : 'View backups'}</button>
          <button class="btn" data-go="benchmark">${icon('bench')}Run benchmark</button>
          <button class="btn" data-go="cleanup">${icon('broom')}Clean up</button>
        </div>
      </div>
    </div>

    <div class="card pad" style="margin-top:14px">
      <div class="row" style="margin-bottom:12px"><h2>Live monitor</h2><span class="spacer"></span><span class="dim tiny">Readings the OS exposes without admin — "n/a" means your system doesn't share it.</span></div>
      <div class="mon" id="mon">
        <div class="m"><div class="k">CPU</div><div class="v" id="m-cpu">${fmtNum(m.cpu, '%')}</div><div class="bar"><i class="${barCls(m.cpu)}" style="width:${m.cpu || 0}%"></i></div>${sparkline(hist.cpu)}</div>
        <div class="m"><div class="k">RAM</div><div class="v" id="m-ram">${fmtNum(m.ram, '%')}</div><div class="bar"><i class="${barCls(m.ram, 85, 95)}" style="width:${m.ram || 0}%"></i></div>${sparkline(hist.ram)}</div>
        <div class="m"><div class="k">GPU</div><div class="v" id="m-gpu">${fmtNum(m.gpu, '%')}</div><div class="bar"><i style="width:${m.gpu || 0}%"></i></div>${sparkline(hist.gpu)}</div>
        <div class="m"><div class="k">Temperature</div><div class="v" id="m-temp">${m.gpuTemp != null ? fmtNum(m.gpuTemp, '°C GPU') : m.cpuTemp != null ? fmtNum(m.cpuTemp, '°C CPU') : m.throttling != null ? (m.throttling ? '<span style="color:var(--red)">Throttling</span>' : '<span style="color:var(--green)">Cool</span>') : '<span class="dim">n/a</span>'}</div><div class="bar"><i class="${barCls(m.gpuTemp || m.cpuTemp || 0, 80, 90)}" style="width:${Math.min(100, m.gpuTemp || m.cpuTemp || 0)}%"></i></div></div>
        <div class="m"><div class="k">Ping</div><div class="v" id="m-ping">${fmtNum(m.ping, ' ms')}</div><div class="bar"><i class="${barCls(m.ping || 0, 60, 120)}" style="width:${Math.min(100, (m.ping || 0) / 1.5)}%"></i></div>${sparkline(hist.ping, 150)}</div>
      </div>
    </div>

    <div class="grid g2" style="margin-top:14px">
      <div class="card pad col">
        <div class="row"><h2>Your PC</h2><span class="spacer"></span><button class="btn ghost sm" id="rehw">${icon('refresh', 'sm')}Re-scan</button></div>
        <div class="sysinfo">
          <div class="si"><div class="k">${icon('cpu', 'sm')}CPU</div><div class="v" title="${esc(hw.cpu)}">${esc(hw.cpu || '—')}</div><div class="x">${hw.cpuCores ? `${hw.cpuCores} cores` : ''}</div></div>
          <div class="si"><div class="k">${icon('gpu', 'sm')}GPU</div><div class="v" title="${esc(gpu)}">${esc(gpu)}</div><div class="x">${hw.driverAgeDays != null ? `Driver ${hw.driverAgeDays > 180 ? `<span style="color:var(--amber)">${Math.round(hw.driverAgeDays / 30)} months old</span>` : `${hw.driverAgeDays} days old`}` : ''}</div></div>
          <div class="si"><div class="k">${icon('ram', 'sm')}RAM</div><div class="v">${hw.ramGB ? `${hw.ramGB} GB` : '—'}</div><div class="x">${hw.ramGB && hw.ramGB < 16 ? '16 GB recommended for modern games' : ''}</div></div>
          <div class="si"><div class="k">${icon('disk', 'sm')}System drive</div><div class="v">${hw.systemDisk === 'ssd' ? 'SSD' : hw.systemDisk === 'hdd' ? '<span style="color:var(--amber)">Hard drive (HDD)</span>' : '—'}</div><div class="x">${hw.systemFreeGB != null ? `${hw.systemFreeGB} GB free` : ''}</div></div>
          <div class="si"><div class="k">${icon('monitor', 'sm')}Display</div><div class="v">${refresh}</div><div class="x">${hw.isLaptop ? 'Laptop' : 'Desktop'}</div></div>
          <div class="si"><div class="k">${icon('windows', 'sm')}System</div><div class="v">${esc(hw.osName || S.info.osName)}</div><div class="x">${esc(hw.model || '')}</div></div>
        </div>
      </div>
      <div class="card pad col">
        <div class="row"><h2>Recommended for you</h2><span class="spacer"></span><button class="btn ghost sm" data-go="tweaks">See all</button></div>
        ${!S.scan ? '<div class="skel" style="height:220px"></div>' : recs.length ? recs.map((t) => `<div class="rec-item"><span class="icon-wrap">${icon(t.recommended ? 'star' : 'bolt')}</span><div style="flex:1;min-width:0"><div class="strong ellipsis">${esc(t.name)}</div><div class="dim tiny ellipsis">${esc(t.desc)}</div></div>${t.locked ? `<button class="btn sm" data-action="upgrade" data-plan="${t.tier}">${icon('lock', 'sm')}${PLAN_NAME[t.tier]}</button>` : `<button class="btn sm primary" data-apply="${esc(t.id)}">Apply</button>`}</div>`).join('') : `<div class="note ok">${icon('check')}<div>Nice — everything we'd recommend for this PC is already done.</div></div>`}
      </div>
    </div>

    ${installed.length ? `<div class="row" style="margin:22px 2px 10px"><h2 class="h2">Your games</h2><span class="spacer"></span><button class="btn ghost sm" data-go="games">All games</button></div>
    <div class="games-grid">${installed.map((g) => `<button class="game ${g.locked ? 'locked' : ''}" data-go="games" data-param="${esc(g.id)}">${gameArt(g)}<div class="corner"><span class="badge installed">${icon('check')}Installed</span></div><div class="game-body"><div class="game-name">${esc(g.name)}</div><div class="game-meta">${esc(g.installed.source)} · ${g.tweakIds.length + g.extraIds.length} tweaks</div></div></button>`).join('')}</div>` : ''}
  </div>`;
}

function greeting() { const h = new Date().getHours(); return h < 5 ? 'Late-night gaming' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

export function mount(root) {
  root.querySelector('#full-opt').onclick = async () => {
    const ps = await api.presets();
    const balanced = Array.isArray(ps) && ps.find((p) => p.id === 'balanced');
    if (!balanced) return toast('error', 'Couldn\'t load the optimise set');
    return applyFlow(balanced.ids, { title: 'Full optimise', force: true });
  };
  root.querySelector('#qa-revert').onclick = () => { const n = S.tweaks.filter((t) => t.applied).length; if (!n) return toast('info', 'Nothing to revert', 'Woof Tweaks hasn\'t changed anything yet.'); return revertFlow('all', { title: 'Reverting everything', confirm: true }); };
  root.querySelector('#qa-rp').onclick = async () => {
    if (S.info.platform !== 'win32') return go('backups');
    toast('info', 'Creating a restore point…', 'Windows will ask for admin permission.');
    const r = await api.createRestorePoint();
    if (r && r.ok) toast('success', r.created === false ? 'Restore point skipped' : 'Restore point created', r.message || 'You can roll back from Windows System Restore.');
    else toast('error', 'Couldn\'t create a restore point', r && r.error);
  };
  root.querySelector('#rehw').onclick = async () => { const h = await api.hardware(true); if (h && !h.error) S.hw = h; await refreshScan(); renderApp(); toast('success', 'Re-scanned your PC'); };
  root.querySelector('#fixlag').onclick = fixMyLag;
  const planFix = root.querySelector('#plan-fix');
  if (planFix) planFix.onclick = async () => {
    const ids = planNeedsUpdate();
    if (!ids) return;
    await revertFlow(ids, { title: 'Removing the old power plan' });
    await applyFlow(['win-plan-woof'], { title: 'Woof Gaming power plan' });
  };
  root.querySelectorAll('[data-apply]').forEach((b) => { b.onclick = () => applyFlow([b.dataset.apply], { title: S.tweakMap.get(b.dataset.apply).name }); });
  api.monitorStart();
  offMon = api.onMonitor((m) => {
    S.lastMonitor = m;
    for (const k of ['cpu', 'ram', 'gpu', 'ping']) { hist[k].push(m[k]); if (hist[k].length > 40) hist[k].shift(); }
    const mon = document.getElementById('mon');
    if (!mon) return;
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('m-cpu', fmtNum(m.cpu, '%')); set('m-ram', fmtNum(m.ram, '%')); set('m-gpu', fmtNum(m.gpu, '%')); set('m-ping', fmtNum(m.ping, ' ms'));
    set('m-temp', m.gpuTemp != null ? fmtNum(m.gpuTemp, '°C GPU') : m.cpuTemp != null ? fmtNum(m.cpuTemp, '°C CPU') : m.throttling != null ? (m.throttling ? '<span style="color:var(--red)">Throttling</span>' : '<span style="color:var(--green)">Cool</span>') : '<span class="dim">n/a</span>');
    const bars = mon.querySelectorAll('.bar i');
    const vals = [[m.cpu, 80, 92], [m.ram, 85, 95], [m.gpu, 101, 101], [m.gpuTemp || m.cpuTemp || 0, 80, 90], [Math.min(100, (m.ping || 0) / 1.5), 40, 80]];
    bars.forEach((b, i) => { const [v, hi, cr] = vals[i]; b.style.width = `${Math.min(100, v || 0)}%`; b.className = barCls(v || 0, hi, cr); });
    const sparks = mon.querySelectorAll('.spark');
    [['cpu', 100], ['ram', 100], ['gpu', 100], ['ping', 150]].forEach(([k, max], i) => { if (sparks[i]) sparks[i].outerHTML = sparkline(hist[k], max); });
  });
}
export function unmount() { if (offMon) offMon(); offMon = null; api.monitorStop(); }

export async function fixMyLag() {
  const res = await modal({
    title: 'Fix my lag', icon: 'stethoscope', wide: true,
    body: '<div class="col" style="gap:10px"><p class="muted">Checking CPU, memory, disk, network, heat, power and display — about 10 seconds.</p><div class="progress indeterminate"><i></i></div></div>',
    actions: [{ label: 'Close', kind: 'ghost', value: null }],
    onMount: async (ov, done) => {
      const r = await api.diagnose();
      if (!r || !r.ok) { ov.querySelector('.modal-body').innerHTML = `<div class="note danger">${icon('alert')}<div>${esc((r && r.error) || 'The check failed.')}</div></div>`; return; }
      const sev = { high: 'danger', medium: 'warn', low: 'info' };
      const fixIds = [...new Set(r.findings.flatMap((f) => f.fixes))].filter((id) => S.tweakMap.has(id) && !S.tweakMap.get(id).applied);
      ov.querySelector('.modal-body').innerHTML = `
        <div class="statbox" style="margin-bottom:14px"><div class="s"><b>${r.cpu}%</b><span>CPU now</span></div><div class="s"><b>${r.ram}%</b><span>RAM used</span></div><div class="s"><b>${r.network.avg != null ? `${r.network.avg} ms` : '—'}</b><span>Ping</span></div><div class="s"><b>${r.network.jitter != null ? `${r.network.jitter} ms` : '—'}</b><span>Jitter · ${r.network.loss}% loss</span></div></div>
        ${r.findings.length ? r.findings.map((f) => `<div class="note ${sev[f.severity]}" style="margin-top:8px">${icon(f.severity === 'low' ? 'info' : 'alert')}<div style="flex:1"><b>${esc(f.area)}: ${esc(f.title)}</b><div class="small" style="margin-top:2px">${esc(f.detail)}</div>
          ${f.fixes.length ? `<div class="row wrap" style="gap:6px;margin-top:8px">${f.fixes.map((id) => { const tw = S.tweakMap.get(id); const ac = S.actions.find((a) => a.id === id); const gd = S.guides.find((g) => g.id === id); const label = tw ? tw.name : ac ? ac.name : gd ? gd.name : null; if (!label) return ''; return `<span class="badge ${tw && tw.applied ? 'ok' : 'neutral'}">${tw && tw.applied ? icon('check') : ''}${esc(label)}</span>`; }).join('')}</div>` : ''}</div></div>`).join('') : `<div class="note ok">${icon('check')}<div><b>No obvious problems found.</b> If a specific game still lags, open it in Games for its own settings.</div></div>`}`;
      const foot = ov.querySelector('.modal-foot');
      if (fixIds.length) {
        const b = document.createElement('button');
        b.className = 'btn primary'; b.innerHTML = `${icon('bolt', 'sm')}Apply ${fixIds.length} suggested fix${fixIds.length === 1 ? '' : 'es'}`;
        b.onclick = () => { done('fix'); applyFlow(fixIds, { title: 'Fix my lag', force: true }); };
        foot.appendChild(b);
      }
      const ac = r.findings.flatMap((f) => f.fixes).filter((id) => S.actions.find((a) => a.id === id));
      if (ac.length) { const b2 = document.createElement('button'); b2.className = 'btn'; b2.textContent = 'Open Cleanup'; b2.onclick = () => { done('clean'); go('cleanup'); }; foot.prepend(b2); }
    },
  });
  return res;
}
