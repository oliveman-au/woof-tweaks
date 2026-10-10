'use strict';
// Real-OS test (CI) of the hidden background updater: `--background-update` must open no window, exit by itself,
// register the start-up entries (Windows login item + Task Scheduler task, macOS LaunchAgent, Linux autostart),
// and step aside when the app is already open. Cleans everything up afterwards. Linux CI runs it under xvfb-run.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const electron = require('electron');
const ROOT = path.join(__dirname, '../..');
const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { console.error(`✖ ${m}`); process.exitCode = 1; };
const ok = (m) => console.log(`✔ ${m}`);
const env = { ...process.env, WOOF_BG_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const pages = () => new Promise((resolve) => http.get(`http://127.0.0.1:${PORT}/json`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve([]); } }); }).on('error', () => resolve(null)));
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return null; } };

function registered() {
  if (process.platform === 'win32') {
    const task = sh('schtasks', ['/Query', '/TN', 'Woof Tweaks Updater', '/V', '/FO', 'LIST']);
    const run = sh('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'WoofTweaksUpdater']);
    return { task: !!task && /--background-update/.test(task), login: !!run && /--background-update/.test(run) };
  }
  if (process.platform === 'darwin') {
    const f = path.join(os.homedir(), 'Library/LaunchAgents/stream.woof-services.tweaks.updater.plist');
    return { agent: fs.existsSync(f) && /--background-update/.test(fs.readFileSync(f, 'utf8')) };
  }
  const f = path.join(os.homedir(), '.config/autostart/woof-tweaks-updater.desktop');
  return { autostart: fs.existsSync(f) && /--background-update/.test(fs.readFileSync(f, 'utf8')) };
}
function cleanup() {
  if (process.platform === 'win32') { sh('schtasks', ['/Delete', '/F', '/TN', 'Woof Tweaks Updater']); sh('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'WoofTweaksUpdater', '/f']); }
  else if (process.platform === 'darwin') fs.rmSync(path.join(os.homedir(), 'Library/LaunchAgents/stream.woof-services.tweaks.updater.plist'), { force: true });
  else fs.rmSync(path.join(os.homedir(), '.config/autostart/woof-tweaks-updater.desktop'), { force: true });
}

(async () => {
  cleanup();
  // 1) Hidden run: no window, registers the entries, exits on its own.
  const bg = spawn(electron, [ROOT, '--background-update', `--remote-debugging-port=${PORT}`, '--no-sandbox'], { env, stdio: 'ignore' });
  let code = null; bg.on('exit', (c) => { code = c; });
  let sawWindow = false;
  const t0 = Date.now();
  while (code === null && Date.now() - t0 < 60_000) {
    const p = await pages();
    if (p && p.some((t) => t.type === 'page')) sawWindow = true;
    await sleep(500);
  }
  if (code === null) { fail('background run did not exit within 60 s'); bg.kill(); } else ok(`background run exited by itself after ${((Date.now() - t0) / 1000).toFixed(1)} s (code ${code})`);
  if (sawWindow) fail('background run opened a window'); else ok('no window was opened');
  const r = registered();
  if (Object.values(r).every(Boolean)) ok(`start-up entries registered: ${JSON.stringify(r)}`); else fail(`start-up entries missing: ${JSON.stringify(r)}`);

  // 2) With the app open, a background run steps aside immediately.
  const appEnv = { ...env }; delete appEnv.WOOF_BG_TEST;
  const app = spawn(electron, [ROOT, '--no-sandbox'], { env: appEnv, stdio: 'ignore' });
  await sleep(8000);
  const bg2 = spawn(electron, [ROOT, '--background-update', '--no-sandbox'], { env, stdio: 'ignore' });
  const code2 = await new Promise((res) => { const t = setTimeout(() => { bg2.kill(); res('timeout'); }, 20_000); bg2.on('exit', (c) => { clearTimeout(t); res(c); }); });
  if (code2 === 'timeout') fail('background run did not step aside while the app was open'); else ok('background run stepped aside while the app was open');
  app.kill();
  await sleep(1500);
  cleanup();
  const after = registered();
  if (Object.values(after).some(Boolean)) fail(`cleanup left entries behind: ${JSON.stringify(after)}`); else ok('test entries cleaned up');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e); cleanup(); process.exit(1); });
