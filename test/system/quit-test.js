'use strict';
// Real-app smoke test (CI): launches Woof Tweaks, checks the UI loads with no errors, checks a second
// launch just hands over to the first (single instance), then closes the window like clicking X and
// verifies the whole app — every helper process — is gone. Linux CI runs it under xvfb-run.
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const electron = require('electron'); // path to the Electron binary when required from Node
const ROOT = path.join(__dirname, '../..');
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error(`✖ ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`✔ ${msg}`);

function ourProcesses() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like \'electron*\' } | Select-Object -ExpandProperty ProcessId"', { encoding: 'utf8' });
      return out.split(/\s+/).filter(Boolean);
    }
    return execSync(`pgrep -f "${path.join(ROOT, 'node_modules/electron/dist')}" || true`, { encoding: 'utf8' }).split(/\s+/).filter(Boolean);
  } catch { return []; }
}
const getJson = (p) => new Promise((resolve, reject) => http.get(`http://127.0.0.1:${PORT}${p}`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on('error', reject));

async function cdp(fn) {
  const pages = await getJson('/json');
  const page = pages.find((t) => t.type === 'page' && /index\.html/.test(t.url));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  try { return await fn(send, events); } finally { ws.close(); }
}

(async () => {
  const env = { ...process.env, WOOF_DEBUG: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = spawn(electron, [ROOT, `--remote-debugging-port=${PORT}`, '--no-sandbox'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; app.stdout.on('data', (d) => { log += d; }); app.stderr.on('data', (d) => { log += d; });
  let exited = null; app.on('exit', (code) => { exited = code; });

  for (let i = 0; i < 60; i++) { try { await getJson('/json'); break; } catch { await sleep(1000); } }
  await sleep(3000);

  // 1) UI loads with no exceptions or console errors (reload with Runtime enabled to catch everything).
  const loaded = await cdp(async (send, events) => {
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Page.reload', { ignoreCache: true });
    await sleep(9000);
    const r = await send('Runtime.evaluate', { expression: "({ title: document.title, nav: document.querySelectorAll('.nav').length, h1: (document.querySelector('.onb h1, .page h1') || {}).textContent || '', os: window.woof && window.woof.info.osName })", returnByValue: true });
    const errors = events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
      .map((e) => JSON.stringify(e.params).slice(0, 300));
    return { info: r.result && r.result.result ? r.result.result.value : null, errors };
  }).catch((e) => ({ info: null, errors: [String(e)] }));
  if (loaded.info && loaded.info.nav >= 10 && loaded.info.title === 'Woof Tweaks') ok(`UI loaded on ${loaded.info.os}: "${loaded.info.h1}" with ${loaded.info.nav} nav items`); else fail(`UI did not load: ${JSON.stringify(loaded.info)}`);
  if (loaded.errors.length) fail(`console errors:\n  ${loaded.errors.join('\n  ')}`); else ok('no console errors or exceptions');

  // 2) Single instance: a second launch exits on its own and the first keeps running.
  const second = spawn(electron, [ROOT, '--no-sandbox'], { env, stdio: 'ignore' });
  const secondCode = await new Promise((r) => { const t = setTimeout(() => { second.kill(); r('timeout'); }, 20000); second.on('exit', (c) => { clearTimeout(t); r(c); }); });
  if (secondCode === 'timeout') fail('second launch did not exit (single-instance lock missing)'); else ok(`second launch handed over and exited (code ${secondCode})`);
  if (exited !== null) fail('first instance died when the second started'); else ok('first instance still running');

  // 3) Click X (close the window) → the whole app quits, nothing left behind.
  const before = ourProcesses().length;
  await cdp((send) => send('Runtime.evaluate', { expression: 'setTimeout(() => window.close(), 50); 1' })).catch(() => {});
  const t0 = Date.now();
  while (exited === null && Date.now() - t0 < 30000) await sleep(250);
  if (exited === null) { fail('app did not quit within 30 s of closing the window'); app.kill('SIGKILL'); } else ok(`app quit ${((Date.now() - t0) / 1000).toFixed(1)} s after the window closed (exit code ${exited})`);
  await sleep(2500);
  const left = ourProcesses();
  if (left.length) fail(`${left.length} Electron process(es) left running after quit (had ${before}): ${left.join(', ')}`); else ok(`no processes left behind (had ${before} while running)`);
  if (/\[error\]/.test(log)) console.log(`app log errors:\n${log.split('\n').filter((l) => /\[error\]/.test(l)).join('\n')}`);
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e); process.exit(1); });
