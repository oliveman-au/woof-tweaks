'use strict';
// Game Mode Watcher: notices when a game from your profiles starts, applies that game's profile, and
// when the game closes, reverts exactly what the watcher applied (never your own manual changes).
// Optional session boosts while the game runs: High process priority, lower priority for listed
// background apps, keep the Mac awake, and (Ultra, Windows) hold a 0.5 ms timer.
const path = require('path');
const { run, spawnTracked, kill } = require('./exec');

let timer = null;
let opts = null;
let active = null; // { gameId, pid?, applied: [ids], lowered: [{pid,name}], helpers: [child] }

async function processes() {
  if (process.platform === 'win32') {
    const r = await run('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 10000 });
    return r.stdout.split('\n').map((l) => { const m = l.match(/^"([^"]+)","(\d+)"/); return m ? { name: m[1], pid: Number(m[2]) } : null; }).filter(Boolean);
  }
  const r = await run('ps', ['-Ao', 'pid=,comm='], { timeout: 8000 });
  return r.stdout.split('\n').map((l) => { const m = l.trim().match(/^(\d+)\s+(.+)$/); return m ? { pid: Number(m[1]), name: path.basename(m[2]) } : null; }).filter(Boolean);
}

const lower = (s) => String(s).toLowerCase();

async function setPriority(pid, cls) {
  if (process.platform === 'win32') {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `try { (Get-Process -Id ${Number(pid)}).PriorityClass = '${cls}' } catch {}`], { timeout: 8000 });
  } else {
    const nice = { High: -5, BelowNormal: 10, Normal: 0 }[cls];
    if (nice >= 0) await run('renice', ['-n', String(nice), '-p', String(Number(pid))], { timeout: 5000 });
  }
}

function holdTimer() {
  // A hidden PowerShell that requests a 0.5 ms system timer until it is stopped (killed when the game exits or the app quits).
  const code = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class WoofTimer { [DllImport("ntdll.dll")] public static extern int NtSetTimerResolution(uint d, bool s, out uint c); }'; $c = 0; [WoofTimer]::NtSetTimerResolution(5000, $true, [ref]$c) | Out-Null; while ($true) { Start-Sleep -Seconds 3600 }`;
  return spawnTracked('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { stdio: 'ignore' });
}

async function onStart(game, proc) {
  const s = opts.getSettings();
  active = { gameId: game.id, pid: proc.pid, name: proc.name, applied: [], lowered: [], helpers: [] };
  opts.emit('watcher:event', { type: 'start', game: game.id, name: game.name });
  if (opts.can('watcher') && (s.watcherGames || []).includes(game.id)) {
    const ids = opts.profileTweaks(game.id).filter((id) => !opts.isApplied(id));
    if (ids.length) {
      try {
        const r = await opts.apply(ids, { source: 'watcher', restorePoint: false });
        active.applied = r.results.filter((x) => x.ok && !x.skipped).map((x) => x.id);
      } catch (e) { opts.emit('watcher:event', { type: 'error', message: e.message }); }
    }
  }
  if (opts.can('sessionBoost') && s.sessionBoost) {
    await setPriority(proc.pid, 'High');
    const bg = new Set((s.lowerPriorityApps || []).map(lower));
    if (bg.size) for (const p of await processes()) if (bg.has(lower(p.name))) { await setPriority(p.pid, 'BelowNormal'); active.lowered.push(p); }
    if (process.platform === 'darwin') active.helpers.push(spawnTracked('caffeinate', ['-dimsu', '-w', String(proc.pid)], { stdio: 'ignore' }));
  }
  if (process.platform === 'win32' && opts.can('timerResolution') && s.timerResolution) active.helpers.push(holdTimer());
}

async function onStop() {
  const a = active;
  active = null;
  if (!a) return;
  for (const h of a.helpers) kill(h);
  for (const p of a.lowered) await setPriority(p.pid, 'Normal');
  // Revert only what the watcher itself applied, and only if it's still applied.
  const ids = a.applied.filter((id) => opts.isApplied(id));
  if (ids.length) { try { await opts.revert(ids, { source: 'watcher' }); } catch (e) { opts.emit('watcher:event', { type: 'error', message: e.message }); } }
  opts.emit('watcher:event', { type: 'stop', game: a.gameId });
}

async function poll() {
  if (opts.isBusy()) return;
  const procs = await processes();
  if (active) {
    if (!procs.some((p) => p.pid === active.pid)) await onStop();
    return;
  }
  const byName = new Map(procs.map((p) => [lower(p.name), p]));
  for (const g of opts.games()) {
    for (const name of (g.detect && g.detect.process) || []) {
      const p = byName.get(lower(name));
      if (p) { await onStart(g, p); return; }
    }
  }
}

function start(o) {
  opts = o;
  if (timer) return;
  timer = setInterval(() => { poll().catch(() => {}); }, 5000);
}
async function stop() {
  if (timer) { clearInterval(timer); timer = null; }
  if (active) { for (const h of active.helpers) kill(h); }
}
/** On quit: undo what the watcher applied so nothing is left changed behind your back. */
async function shutdown() { await stop(); if (active) await onStop(); }
const status = () => ({ running: !!timer, active: active ? { game: active.gameId, applied: active.applied.length } : null });

module.exports = { start, stop, shutdown, status, processes };
