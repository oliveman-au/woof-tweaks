'use strict';
// Game profiles are plain JSON files in ./profiles — adding a game is a data-only change.
// This module loads them, finds which games are installed, and builds each game's extras
// (per-.exe fullscreen flag, GPU preference, High priority, QoS tag, Defender exclusion).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gameTier, extraTier } = require('../config/tiers');
const { rank } = require('../core/plans');

const DIR = path.join(__dirname, 'profiles');
let profiles = null;
let installed = new Map(); // id -> { dir, exePath, source }

function load() {
  if (profiles) return profiles;
  profiles = [];
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      p.tier = gameTier(p.id);
      profiles.push(p);
    } catch (e) { console.error(`[games] bad profile ${f}: ${e.message}`); }
  }
  // General first, then free → ultra, then A–Z.
  profiles.sort((a, b) => (a.id === 'general' ? -1 : b.id === 'general' ? 1 : rank(a.tier) - rank(b.tier) || a.name.localeCompare(b.name)));
  return profiles;
}
const get = (id) => load().find((p) => p.id === id) || null;

/** Validate a profile (used by tests and when importing a custom profile). Returns a list of problems. */
function validate(p, knownTweaks) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['not an object'];
  if (!/^[a-z0-9-]{2,40}$/.test(p.id || '')) errs.push('id must be 2–40 lowercase letters/numbers');
  if (!p.name) errs.push('name missing');
  if (!Array.isArray(p.platforms) || !p.platforms.length) errs.push('platforms missing');
  for (const [osKey, ids] of Object.entries(p.tweaks || {})) {
    if (!Array.isArray(ids)) { errs.push(`tweaks.${osKey} must be a list`); continue; }
    if (knownTweaks) for (const id of ids) if (!knownTweaks.has(id)) errs.push(`unknown tweak ${id}`);
  }
  for (const s of p.settings || []) if (!s.setting || s.value == null) errs.push('each setting needs setting + value');
  return errs;
}

// ---------- installed-game detection ----------
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

function steamRoots(hw) {
  const home = os.homedir();
  const c = [];
  if (process.platform === 'win32') {
    if (hw && hw.steamPath) c.push(hw.steamPath.replace(/\//g, '\\'));
    c.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  } else if (process.platform === 'darwin') c.push(path.join(home, 'Library/Application Support/Steam'));
  else c.push(path.join(home, '.steam/steam'), path.join(home, '.local/share/Steam'), path.join(home, '.var/app/com.valvesoftware.Steam/.local/share/Steam'));
  return [...new Set(c)].filter(exists);
}

/** appid -> install folder, from every Steam library. */
function steamApps(hw) {
  const out = new Map();
  for (const root of steamRoots(hw)) {
    const libs = new Set([root]);
    const vdf = readText(path.join(root, 'steamapps', 'libraryfolders.vdf')) || '';
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, '\\'));
    for (const lib of libs) {
      const sa = path.join(lib, 'steamapps');
      let files = [];
      try { files = fs.readdirSync(sa).filter((n) => /^appmanifest_\d+\.acf$/.test(n)); } catch { continue; }
      for (const f of files) {
        const acf = readText(path.join(sa, f)) || '';
        const id = Number((acf.match(/"appid"\s+"(\d+)"/) || [])[1]);
        const dir = (acf.match(/"installdir"\s+"([^"]+)"/) || [])[1];
        if (id && dir) out.set(id, { dir: path.join(sa, 'common', dir), shaderCache: path.join(sa, 'shadercache', String(id)), library: lib });
      }
    }
  }
  return out;
}

function epicApps() {
  const dir = process.platform === 'win32' ? 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support/Epic/EpicGamesLauncher/Data/Manifests') : null;
  const out = [];
  if (!dir) return out;
  let files = [];
  try { files = fs.readdirSync(dir).filter((n) => n.endsWith('.item')); } catch { return out; }
  for (const f of files) {
    try {
      const j = JSON.parse(readText(path.join(dir, f)));
      out.push({ name: j.DisplayName || '', app: j.AppName || '', dir: j.InstallLocation || '', exe: j.LaunchExecutable || '' });
    } catch { /* skip */ }
  }
  return out;
}

/** Look for one of the game's .exe names inside its folder (bounded so it stays fast). */
function findExe(root, names, maxDepth = 6) {
  if (!root || !names || !names.length || !exists(root)) return null;
  const want = new Set(names.map((n) => n.toLowerCase()));
  let seen = 0;
  const walk = (dir, depth) => {
    if (depth > maxDepth || seen > 6000) return null;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) { seen++; if (e.isFile() && want.has(e.name.toLowerCase())) return path.join(dir, e.name); }
    for (const e of entries) {
      if (!e.isDirectory() || /^(\.|_|redist|redistributables|directx|vcredist|__installer|support|engine\\extras)/i.test(e.name)) continue;
      const r = walk(path.join(dir, e.name), depth + 1);
      if (r) return r;
    }
    return null;
  };
  return walk(root, 0);
}

function latestRobloxExe() {
  const roots = [path.join(process.env.LOCALAPPDATA || '', 'Roblox', 'Versions'), 'C:\\Program Files (x86)\\Roblox\\Versions', 'C:\\Program Files\\Roblox\\Versions'];
  let best = null;
  for (const r of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(r); } catch { continue; }
    for (const d of dirs) {
      const exe = path.join(r, d, 'RobloxPlayerBeta.exe');
      try { const st = fs.statSync(exe); if (!best || st.mtimeMs > best.t) best = { t: st.mtimeMs, exe, dir: path.join(r, d) }; } catch { /* none */ }
    }
  }
  return best;
}

function minecraftDir() {
  const home = os.homedir();
  const p = process.platform === 'win32' ? path.join(process.env.APPDATA || '', '.minecraft')
    : process.platform === 'darwin' ? path.join(home, 'Library/Application Support/minecraft') : path.join(home, '.minecraft');
  return exists(p) ? p : null;
}

/** Find installed games. Never throws; returns Map id -> { dir, exePath, source, shaderCache }. */
function detect(hw = {}) {
  const found = new Map();
  let steam = new Map(); let epic = [];
  try { steam = steamApps(hw); } catch { /* none */ }
  try { epic = epicApps(); } catch { /* none */ }
  const apps = hw.apps || [];
  for (const p of load()) {
    if (p.id === 'general') continue;
    const d = p.detect || {};
    let hit = null;
    if (d.steam && steam.has(d.steam)) hit = { ...steam.get(d.steam), source: 'Steam' };
    if (!hit && d.epic) {
      const e = epic.find((x) => x.app === d.epic || x.name.toLowerCase() === String(d.epic).toLowerCase());
      if (e) hit = { dir: e.dir, source: 'Epic Games', exeHint: e.exe };
    }
    if (!hit && d.riot && hw.riot) {
      const r = hw.riot.find((x) => x.product.toLowerCase().startsWith(d.riot));
      if (r) hit = { dir: r.dir, source: 'Riot' };
    }
    if (!hit && d.roblox && process.platform === 'win32') {
      const r = latestRobloxExe();
      if (r) hit = { dir: r.dir, exePath: r.exe, source: 'Roblox' };
    }
    if (!hit && d.minecraft) {
      const m = minecraftDir();
      if (m) hit = { dir: m, source: 'Minecraft Launcher', minecraft: true };
      else if ((hw.appx || []).some((a) => /MinecraftUWP/i.test(a.name))) hit = { dir: null, source: 'Microsoft Store', bedrock: true };
    }
    if (!hit && d.macApp && process.platform === 'darwin') {
      const a = apps.find((x) => x.name.toLowerCase() === d.macApp.toLowerCase());
      if (a) hit = { dir: a.dir, source: 'App' };
    }
    if (!hit && process.platform === 'win32') {
      // Battle.net / EA app / Ubisoft / Rockstar / HoYoPlay / BSG and others register normal uninstall entries.
      const names = [d.battlenet, d.ea, d.ubisoft, d.rockstar, d.hoyoplay, d.battlestate, d.gog, p.name].filter(Boolean).map((s) => s.toLowerCase());
      const a = apps.find((x) => x.dir && names.some((n) => x.name.toLowerCase().startsWith(n)));
      if (a) hit = { dir: a.dir, source: 'Installed' };
    }
    if (!hit) continue;
    if (!hit.exePath && process.platform === 'win32') hit.exePath = findExe(hit.dir, d.exe || []);
    found.set(p.id, hit);
  }
  installed = found;
  return found;
}
const installedMap = () => installed;

// ---------- per-game extras as tweaks ----------
const effTier = (game, extra) => [game.tier, extraTier(extra)].sort((a, b) => rank(b) - rank(a))[0];
const exeName = (p, inst) => (inst && inst.exePath ? path.basename(inst.exePath) : (p.detect && p.detect.exe && p.detect.exe[0]) || null);

/** Build the per-game tweak definitions (Windows) for every profile. Installed-only extras need a found .exe/folder. */
function gameTweaks(osId) {
  if (osId !== 'win32') return [];
  const out = [];
  const byKey = new Map(); // one tweak per .exe/folder even if two profiles share it (e.g. CoD + Warzone)
  const push = (key, t, p) => {
    const prev = byKey.get(key);
    if (prev) {
      prev.games.push(p.id);
      prev.name = prev.name.replace(/^[^:]+:/, (m) => `${m.slice(0, -1)} / ${p.name}:`);
      return;
    }
    t.games = [p.id];
    byKey.set(key, t);
    out.push(t);
  };
  const IFEO = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options';
  for (const p of load()) {
    if (p.id === 'general' || !p.platforms.includes('win32')) continue;
    const inst = installed.get(p.id);
    const ex = new Set(p.extras || []);
    const exe = exeName(p, inst);
    const base = { os: ['win32'], game: p.id, category: 'game', risk: 'safe', reboot: false };
    if (ex.has('fso') && inst && inst.exePath) push(`fso:${inst.exePath.toLowerCase()}`, { ...base, id: `game.${p.id}.fso`, tier: effTier(p, 'fso'), name: `${p.name}: disable fullscreen optimisations`, desc: 'Sets the compatibility flag on this game\'s .exe.', long: { what: `Adds "Disable fullscreen optimizations" for ${inst.exePath}.`, why: 'True exclusive fullscreen = lowest input lag for DX9/11 games.', risk: 'Replaces any other compatibility flags you set on this .exe until you Revert.' }, changes: [{ t: 'reg', key: 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers', name: inst.exePath, type: 'sz', value: '~ DISABLEDXMAXIMIZEDWINDOWEDMODE' }], tags: ['fullscreen', p.name.toLowerCase()] }, p);
    if (ex.has('gpuPreference') && inst && inst.exePath) push(`gpu:${inst.exePath.toLowerCase()}`, { ...base, id: `game.${p.id}.gpu`, tier: effTier(p, 'gpuPreference'), name: `${p.name}: use the high-performance GPU`, desc: 'Windows Graphics setting: High performance for this game.', long: { what: `Sets Settings → Display → Graphics → ${path.basename(inst.exePath)} → High performance.`, why: 'On laptops with two GPUs, games sometimes start on the weak integrated one.', risk: 'Safe. No effect on PCs with one GPU.' }, changes: [{ t: 'reg', key: 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', name: inst.exePath, type: 'sz', value: 'GpuPreference=2;' }], recommend: (hw) => (hw.gpus || []).length > 1, tags: ['gpu', 'laptop', p.name.toLowerCase()] }, p);
    if (ex.has('priority') && exe) push(`prio:${exe.toLowerCase()}`, { ...base, id: `game.${p.id}.priority`, tier: effTier(p, 'priority'), name: `${p.name}: launch at High priority`, desc: 'Windows starts this game with High CPU priority every time.', long: { what: `Sets Image File Execution Options\\${exe}\\PerfOptions CpuPriorityClass = High.`, why: 'Background apps can\'t steal CPU time from the game as easily.', risk: p.antiCheat ? `Safe, but if ${p.antiCheat} ever complains, Revert this one.` : 'Safe.' }, changes: [{ t: 'reg', key: `${IFEO}\\${exe}\\PerfOptions`, name: 'CpuPriorityClass', type: 'dword', value: 3 }], tags: ['priority', 'cpu', p.name.toLowerCase()] }, p);
    if (ex.has('dscp') && exe) push(`dscp:${exe.toLowerCase()}`, { ...base, id: `game.${p.id}.dscp`, tier: effTier(p, 'dscp'), requires: ['win-qos-no-nla'], name: `${p.name}: mark game traffic high priority (QoS)`, desc: 'Tags this game\'s packets with DSCP 46 (expedited forwarding).', long: { what: `Creates a QoS policy for ${exe} with DSCP value 46.`, why: 'Routers with QoS/SQM that honour DSCP will prioritise the game over downloads. Many home routers ignore it — it can\'t hurt.', risk: 'Safe.' }, changes: qosPolicy(p, exe), tags: ['qos', 'ping', p.name.toLowerCase()] }, p);
    if (ex.has('defender') && inst && inst.dir) push(`def:${inst.dir.toLowerCase()}`, { ...base, id: `game.${p.id}.defender`, tier: effTier(p, 'defender'), risk: 'moderate', name: `${p.name}: Defender exclusion for the game folder`, desc: 'Defender stops scanning this game\'s files as they load.', long: { what: `Adds a Microsoft Defender exclusion for ${inst.dir}.`, why: 'Real-time scanning of big game files can cause loading stutter.', risk: 'Files in that folder aren\'t scanned. Only exclude games installed from official stores. Revert removes it.' }, changes: [{ t: 'defenderExclusion', path: inst.dir }], tags: ['defender', 'antivirus', 'loading', p.name.toLowerCase()] }, p);
  }
  return out;
}

function qosPolicy(p, exe) {
  const key = `HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\QoS\\Woof Tweaks - ${p.name.replace(/[\\/:*?"<>|]/g, '')}`;
  const sz = (name, value) => ({ t: 'reg', key, name, type: 'sz', value });
  return [sz('Version', '1.0'), sz('Application Name', exe), sz('Protocol', '*'), sz('Local Port', '*'), sz('Local IP', '*'), sz('Local IP Prefix Length', '*'), sz('Remote Port', '*'), sz('Remote IP', '*'), sz('Remote IP Prefix Length', '*'), sz('DSCP Value', '46'), sz('Throttle Rate', '-1')];
}

/** Shared prerequisite for QoS tags on non-domain PCs. */
const QOS_PREREQ = {
  id: 'win-qos-no-nla', os: ['win32'], category: 'network', risk: 'safe', reboot: 'restart', tier: 'pro', hiddenUnlessNeeded: true,
  name: 'Allow game QoS tags on home networks', desc: 'Lets Windows apply QoS policies on non-work networks.',
  long: { what: 'Sets Tcpip\\QoS "Do not use NLA" = 1.', why: 'Without it, Windows only applies QoS policies on company (domain) networks.', risk: 'Safe. Needs a restart.' },
  changes: [{ t: 'reg', key: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\QoS', name: 'Do not use NLA', type: 'sz', value: '1' }], tags: ['qos'],
};

/** Copy-ready text with {{placeholders}} filled from this PC (e.g. Minecraft RAM). */
function fill(text, hw = {}) {
  const ram = hw.ramGB || 8;
  const mcRam = ram >= 32 ? '8G' : ram >= 16 ? '6G' : ram >= 12 ? '4G' : '3G';
  const weak = ram < 8 || (hw.gpuVendors || []).every((v) => v === 'intel' || v === 'apple' || v === 'other');
  const mcRender = weak ? 8 : ram >= 16 ? 16 : 12;
  return String(text).replace(/\{\{mcRam\}\}/g, mcRam).replace(/\{\{mcRender\}\}/g, String(mcRender)).replace(/\{\{mcSim\}\}/g, String(Math.min(mcRender, weak ? 6 : 10)));
}

module.exports = { load, get, validate, detect, installedMap, gameTweaks, QOS_PREREQ, fill, findExe, steamApps, minecraftDir };
