'use strict';
// Running things with or without admin rights on each OS. One prompt covers a whole batch of changes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { run } = require('./exec');
const { isAdmin } = require('./platform');

let dataDir = null;
let adminCache = null;
let runnerPath = null;

function init(dir) { dataDir = dir; }
const runtimeDir = () => {
  const d = path.join(dataDir, 'runtime');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
async function alreadyAdmin() {
  if (adminCache === null) adminCache = await isAdmin();
  return adminCache;
}

// ---------- Windows: PowerShell runner ----------
const psExe = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
/** PowerShell single-quoted literal. */
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
const b64 = (s) => Buffer.from(s, 'utf16le').toString('base64');

function ensureRunner() {
  const src = fs.readFileSync(path.join(__dirname, 'runners', 'windows.ps1'), 'utf8');
  const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 10);
  const p = path.join(runtimeDir(), `runner-${hash}.ps1`);
  if (runnerPath !== p || !fs.existsSync(p)) {
    fs.writeFileSync(p, src);
    runnerPath = p;
  }
  return p;
}

/**
 * Run a job through the PowerShell runner. job = { mode, groups }.
 * Returns { ok, cancelled, admin, done, groups, error }.
 */
async function runWindows(job, { admin = false, timeout = 15 * 60_000 } = {}) {
  const runner = ensureRunner();
  const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const inFile = path.join(runtimeDir(), `job-${id}.json`);
  const outFile = path.join(runtimeDir(), `res-${id}.json`);
  fs.writeFileSync(inFile, JSON.stringify(job));
  const boot = `$ErrorActionPreference='Stop'; . ([ScriptBlock]::Create([IO.File]::ReadAllText(${psq(runner)}))); Invoke-WoofRunner -InFile ${psq(inFile)} -OutFile ${psq(outFile)}`;
  const direct = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64(boot)];
  let r;
  if (!admin || (await alreadyAdmin())) {
    r = await run(psExe(), direct, { timeout });
  } else {
    const outer = `try { $p = Start-Process -FilePath ${psq(psExe())} -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-EncodedCommand','${b64(boot)}') -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { exit 1223 }`;
    r = await run(psExe(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64(outer)], { timeout });
  }
  let res = null;
  try { res = JSON.parse(fs.readFileSync(outFile, 'utf8').replace(/^\uFEFF/, '')); } catch { /* no output */ }
  for (const f of [inFile, outFile]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  if (!res) {
    const cancelled = r.code === 1223;
    return { ok: false, cancelled, groups: [], error: cancelled ? 'Admin permission was declined, so nothing was changed.' : (r.timedOut ? 'Timed out.' : (r.stderr.trim().split('\n').pop() || `PowerShell exited with ${r.code}`)) };
  }
  return { ok: true, cancelled: false, ...res };
}

// ---------- macOS / Linux / ChromeOS: shell script ----------
async function canSudoQuietly() {
  if (process.env.WOOF_ELEVATE === 'sudo') return true;
  const r = await run('sudo', ['-n', 'true'], { timeout: 5000 });
  return r.code === 0;
}

/** Run a /bin/sh script, as admin if asked. Returns { code, stdout, stderr, cancelled, noAdmin }. */
async function runShell(script, { admin = false, timeout = 15 * 60_000 } = {}) {
  if (!admin || (await alreadyAdmin())) return run('/bin/sh', ['-c', script], { timeout });
  // CI runners have passwordless sudo and no GUI for a password prompt.
  if (process.env.WOOF_ELEVATE === 'sudo') return run('sudo', ['-n', '/bin/sh', '-c', script], { timeout });
  if (process.platform === 'darwin') {
    const r = await run('osascript', [
      '-e', 'on run argv',
      '-e', 'do shell script (item 1 of argv) with prompt "Woof Tweaks needs your password to change system settings." with administrator privileges',
      '-e', 'end run', script,
    ], { timeout });
    return { ...r, cancelled: r.code !== 0 && /-128|cancel/i.test(r.stderr) };
  }
  if (await canSudoQuietly()) return run('sudo', ['-n', '/bin/sh', '-c', script], { timeout });
  const pk = await run('/bin/sh', ['-c', 'command -v pkexec'], { timeout: 5000 });
  if (pk.code === 0) {
    const r = await run('pkexec', ['/bin/sh', '-c', script], { timeout });
    return { ...r, cancelled: r.code === 126 || r.code === 127 };
  }
  return { code: -1, stdout: '', stderr: 'No way to ask for admin rights on this system (pkexec is not installed).', noAdmin: true, cancelled: false };
}

module.exports = { init, runWindows, runShell, alreadyAdmin, psq };
