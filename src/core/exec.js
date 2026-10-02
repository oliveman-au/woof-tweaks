'use strict';
// Child-process helpers. Every child we start is tracked so quitting the app can never leave one running.
const { spawn, spawnSync } = require('child_process');

const children = new Set();

/**
 * Run a program (no shell, so arguments are never re-parsed). Resolves { code, stdout, stderr, timedOut };
 * never rejects for a non-zero exit — callers decide what a failure means.
 */
function run(cmd, args = [], opts = {}) {
  const { timeout = 60_000, input, env, cwd } = opts;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd, env: env ? { ...process.env, ...env } : process.env,
        windowsHide: true,
        // Own process group on macOS/Linux so a whole tree can be stopped at once.
        detached: process.platform !== 'win32',
      });
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: String(e && e.message || e), timedOut: false });
      return;
    }
    children.add(child);
    let stdout = '', stderr = '', timedOut = false, done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      children.delete(child);
      resolve({ code, stdout, stderr, timedOut });
    };
    const timer = timeout ? setTimeout(() => { timedOut = true; kill(child); }, timeout) : null;
    child.stdout && child.stdout.on('data', (d) => { if (stdout.length < 8e6) stdout += d; });
    child.stderr && child.stderr.on('data', (d) => { if (stderr.length < 1e6) stderr += d; });
    child.on('error', (e) => { stderr += String(e && e.message || e); finish(-1); });
    child.on('close', (code) => finish(code == null ? -1 : code));
    if (input != null) { child.stdin.on('error', () => {}); child.stdin.end(input); } else child.stdin && child.stdin.end();
  });
}

/** Long-running child (e.g. the live monitor). Tracked like run(); returns the ChildProcess. */
function spawnTracked(cmd, args = [], opts = {}) {
  const child = spawn(cmd, args, { windowsHide: true, detached: process.platform !== 'win32', ...opts });
  children.add(child);
  child.on('close', () => children.delete(child));
  child.on('error', () => children.delete(child));
  return child;
}

function kill(child) {
  if (!child || child.exitCode != null || child.killed) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
  } catch { /* already gone */ }
}

/** Stop every child we started (used on quit). Elevated helpers are never killed mid-change; callers wait for them first. */
function killAll() { for (const c of [...children]) kill(c); children.clear(); }
const running = () => children.size;

module.exports = { run, spawnTracked, kill, killAll, running };
