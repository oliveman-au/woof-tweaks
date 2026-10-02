'use strict';
// macOS / Linux / ChromeOS changes. Snapshots are read here in Node (no admin needed for reads). Changes are
// written as a small generated shell script, so one admin prompt covers a whole batch. Each tweak is an
// all-or-nothing block: if any command fails, the block restores the tweak's earlier values before moving on.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('./exec');

const HOME = os.homedir();
const expand = (p) => (p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);
/** Single-quote for /bin/sh (handles any text except NUL). */
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const out = (r) => (r.code === 0 ? r.stdout.trim() : null);
const SYSCTL_FILE = '/etc/sysctl.d/99-woof-tweaks.conf';
const norm = (v) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');

// ---------- helpers ----------
async function which(bin) {
  const r = await run('/bin/sh', ['-c', `command -v ${q(bin)}`], { timeout: 5000 });
  return r.code === 0 ? r.stdout.trim() : null;
}

/** Expand a path containing * in any segment (no shell). */
function glob(pattern) {
  const parts = pattern.split('/').filter(Boolean);
  let paths = ['/'];
  for (const part of parts) {
    const next = [];
    for (const base of paths) {
      if (!part.includes('*')) { next.push(path.join(base, part)); continue; }
      const rx = new RegExp(`^${part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      let names = [];
      try { names = fs.readdirSync(base); } catch { /* not a dir */ }
      for (const n of names.sort()) if (rx.test(n)) next.push(path.join(base, n));
    }
    paths = next;
  }
  return paths.filter((p) => fs.existsSync(p));
}

function defaultsArgs(op) {
  const a = [];
  if (op.host === 'current') a.push('-currentHost');
  return a;
}
const DEFAULTS_TYPE = { boolean: '-bool', integer: '-int', float: '-float', string: '-string' };
const typeFlag = (t) => DEFAULTS_TYPE[t] || { bool: '-bool', int: '-int', float: '-float', string: '-string' }[t];

// ---------- read (snapshot) ----------
async function read(op) {
  switch (op.t) {
    case 'defaults': {
      const v = await run('defaults', [...defaultsArgs(op), 'read', op.domain, op.key], { timeout: 8000 });
      if (v.code !== 0) return { exists: false };
      const t = await run('defaults', [...defaultsArgs(op), 'read-type', op.domain, op.key], { timeout: 8000 });
      const type = (t.stdout.match(/Type is (\w+)/) || [])[1] || 'string';
      if (!DEFAULTS_TYPE[type]) return { exists: true, complex: true, type };
      return { exists: true, type, value: v.stdout.trim() };
    }
    case 'sysctl': {
      const v = out(await run('sysctl', ['-n', op.key], { timeout: 5000 }));
      if (v == null) return { na: true, why: `This system doesn't have ${op.key}` };
      let persisted = null;
      if (op.persist) {
        try {
          const line = fs.readFileSync(SYSCTL_FILE, 'utf8').split('\n').find((l) => l.split('=')[0].trim() === op.key);
          persisted = line ? line.split('=').slice(1).join('=').trim() : null;
        } catch { /* no file yet */ }
      }
      return { value: norm(v), persisted };
    }
    case 'sysfs': {
      const files = glob(op.glob);
      if (!files.length) return { na: true, why: op.why || 'Not supported by this hardware' };
      const list = [];
      for (const f of files) {
        let raw;
        try { raw = fs.readFileSync(f, 'utf8').trim(); } catch { continue; }
        const value = op.bracket ? ((raw.match(/\[([^\]]+)\]/) || [])[1] || raw) : raw;
        let available = null;
        if (op.bracket) available = raw.replace(/[[\]]/g, '').split(/\s+/);
        else if (op.availableFrom) { try { available = fs.readFileSync(path.join(path.dirname(f), op.availableFrom), 'utf8').trim().split(/\s+/); } catch { /* none */ } }
        if (available && !available.includes(String(op.value))) continue;
        list.push({ path: f, value });
      }
      if (!list.length) return { na: true, why: op.why || `"${op.value}" isn't available on this hardware` };
      return { files: list };
    }
    case 'gsettings': {
      if (!(await which('gsettings'))) return { na: true, why: 'Not a GNOME desktop' };
      const v = await run('gsettings', ['get', op.schema, op.key], { timeout: 5000 });
      if (v.code !== 0) return { na: true, why: 'This desktop doesn\'t have that setting' };
      return { value: v.stdout.trim() };
    }
    case 'systemd': {
      if (!(await which('systemctl'))) return { na: true, why: 'This system doesn\'t use systemd' };
      const scope = op.scope === 'user' ? ['--user'] : [];
      const en = await run('systemctl', [...scope, 'is-enabled', op.unit], { timeout: 8000 });
      const state = en.stdout.trim();
      if (!state || /not-found/.test(state + en.stderr) || /No such file/i.test(en.stderr)) return { na: true, why: `${op.unit} isn't installed` };
      const act = await run('systemctl', [...scope, 'is-active', op.unit], { timeout: 8000 });
      return { enabled: state, active: act.stdout.trim() === 'active' };
    }
    case 'file': {
      const p = expand(op.path);
      try { return { exists: true, content: fs.readFileSync(p, 'utf8') }; } catch (e) {
        if (e.code === 'ENOENT') return { exists: false };
        return { unknown: true, why: `Can't read ${p}` };
      }
    }
    case 'pmset': {
      const v = out(await run('pmset', ['-g'], { timeout: 5000 }));
      const m = v && v.match(new RegExp(`^\\s*${op.key}\\s+(\\S+)`, 'm'));
      if (!m) return { na: true, why: op.why || 'This Mac doesn\'t support that power setting' };
      return { value: m[1] };
    }
    case 'mdutil': {
      const v = await run('mdutil', ['-s', op.volume || '/'], { timeout: 10000 });
      if (/disabled/i.test(v.stdout)) return { enabled: false };
      if (/enabled/i.test(v.stdout)) return { enabled: true };
      return { unknown: true, why: 'Could not read Spotlight status' };
    }
    case 'macDns': {
      const services = await macServices();
      if (!services.length) return { na: true, why: 'No connected network' };
      const list = [];
      for (const s of services) {
        const r = await run('networksetup', ['-getdnsservers', s], { timeout: 8000 });
        const servers = (r.stdout.match(/^[0-9a-fA-F:.]+$/gm) || []).map((x) => x.trim());
        list.push({ service: s, servers });
      }
      return { services: list };
    }
    case 'nvidia': {
      if (!(await which('nvidia-settings'))) return { na: true, why: 'NVIDIA settings tool not installed' };
      const v = await run('nvidia-settings', ['-q', op.attr, '-t'], { timeout: 8000 });
      if (v.code !== 0 || !v.stdout.trim()) return { na: true, why: 'Not available on this GPU/desktop' };
      return { value: v.stdout.trim().split('\n')[0] };
    }
    case 'adb': {
      if (!(await which('adb'))) return { na: true, why: 'Android tools aren\'t set up. In ChromeOS Settings → Developers → Linux, turn on "Develop Android apps", then run: sudo apt install adb' };
      const d = await run('adb', ['devices'], { timeout: 8000 });
      if (!/\tdevice$/m.test(d.stdout)) return { na: true, why: 'No Android device connected (turn on "Develop Android apps" in ChromeOS settings, then run "adb connect arc")' };
      const v = await run('adb', ['shell', 'settings', 'get', op.ns, op.key], { timeout: 8000 });
      if (v.code !== 0) return { unknown: true };
      return { value: v.stdout.trim() };
    }
    case 'iface': {
      const r = await run('ifconfig', [op.name], { timeout: 5000 });
      if (r.code !== 0) return { na: true, why: `No ${op.name} interface on this Mac` };
      const flags = (r.stdout.match(/flags=\w+<([^>]*)>/) || [])[1] || '';
      return { up: flags.split(',').includes('UP') };
    }
    case 'ppd': {
      if (!(await which('powerprofilesctl'))) return { na: true, why: 'power-profiles-daemon isn\'t installed' };
      const r = await run('powerprofilesctl', ['get'], { timeout: 5000 });
      if (r.code !== 0) return { na: true, why: 'Power profiles aren\'t available' };
      const list = await run('powerprofilesctl', ['list'], { timeout: 5000 });
      if (!new RegExp(`\\b${op.value}:`).test(list.stdout)) return { na: true, why: `This PC has no "${op.value}" power profile` };
      return { value: r.stdout.trim() };
    }
    case 'tuned': {
      if (!(await which('tuned-adm'))) return { na: true, why: 'tuned isn\'t installed' };
      const r = await run('tuned-adm', ['active'], { timeout: 8000 });
      const m = r.stdout.match(/Current active profile:\s*(\S+)/);
      return { value: m ? m[1] : 'none' };
    }
    case 'pkg': {
      const mgr = await pkgManager();
      if (!mgr) return { na: true, why: 'Unsupported package manager' };
      const name = op.names[mgr];
      if (!name) return { na: true, why: `Not packaged for ${mgr}` };
      const installed = await pkgInstalled(mgr, name);
      return { manager: mgr, name, installed };
    }
    default: throw new Error(`Unknown change type ${op.t}`);
  }
}

async function macServices() {
  const r = await run('networksetup', ['-listallnetworkservices'], { timeout: 8000 });
  const names = r.stdout.split('\n').slice(1).map((s) => s.trim()).filter((s) => s && !s.startsWith('*'));
  const active = [];
  for (const n of names) {
    const info = await run('networksetup', ['-getinfo', n], { timeout: 8000 });
    if (/^IP address: \d/m.test(info.stdout)) active.push(n);
  }
  return active;
}

async function pkgManager() {
  for (const m of ['apt-get', 'dnf', 'pacman', 'zypper']) if (await which(m)) return m === 'apt-get' ? 'apt' : m;
  return null;
}
async function pkgInstalled(mgr, name) {
  const cmd = { apt: ['dpkg', ['-s', name]], dnf: ['rpm', ['-q', name]], zypper: ['rpm', ['-q', name]], pacman: ['pacman', ['-Q', name]] }[mgr];
  const r = await run(cmd[0], cmd[1], { timeout: 10000 });
  return r.code === 0 && !/deinstall/.test(r.stdout);
}

// ---------- write / restore as shell ----------
function writeSh(op, snap) {
  switch (op.t) {
    case 'defaults': {
      const pre = ['defaults', ...defaultsArgs(op)].map(q).join(' ');
      if (op.value === null) return `${pre} delete ${q(op.domain)} ${q(op.key)} 2>/dev/null || true`;
      return `${pre} write ${q(op.domain)} ${q(op.key)} ${typeFlag(op.type)} ${q(op.type === 'bool' ? (op.value ? 'true' : 'false') : op.value)}`;
    }
    case 'sysctl': {
      let s = `sysctl -w ${q(`${op.key}=${op.value}`)} >/dev/null`;
      if (op.persist) s += ` && woof_persist ${q(op.key)} ${q(op.value)}`;
      return s;
    }
    case 'sysfs': return snap.files.map((f) => `printf '%s' ${q(op.value)} > ${q(f.path)}`).join(' && ');
    case 'gsettings': return `gsettings set ${q(op.schema)} ${q(op.key)} ${q(op.value)}`;
    case 'systemd': {
      const scope = op.scope === 'user' ? '--user ' : '';
      return op.enabled ? `systemctl ${scope}enable --now ${q(op.unit)}` : `systemctl ${scope}disable --now ${q(op.unit)}`;
    }
    case 'file': {
      const p = expand(op.path);
      return `mkdir -p ${q(path.dirname(p))} && printf '%s' ${q(op.content)} > ${q(p)}`;
    }
    case 'pmset': return `pmset -${op.scope || 'a'} ${q(op.key)} ${q(op.value)}`;
    case 'mdutil': return `mdutil -i ${op.enabled ? 'on' : 'off'} ${q(op.volume || '/')} >/dev/null`;
    case 'iface': return `ifconfig ${q(op.name)} ${op.up ? 'up' : 'down'}`;
    case 'ppd': return `powerprofilesctl set ${q(op.value)}`;
    case 'tuned': return `tuned-adm profile ${q(op.value)}`;
    case 'macDns': return snap.services.map((s) => `networksetup -setdnsservers ${q(s.service)} ${op.servers.map(q).join(' ')}`).join(' && ') + ' && (dscacheutil -flushcache; killall -HUP mDNSResponder 2>/dev/null; true)';
    case 'nvidia': return `nvidia-settings -a ${q(`${op.attr}=${op.value}`)} >/dev/null`;
    case 'adb': return `adb shell settings put ${q(op.ns)} ${q(op.key)} ${q(op.value)}`;
    case 'pkg': return pkgCmd(snap.manager, op.install === false ? 'remove' : 'install', snap.name);
    default: throw new Error(`Unknown change type ${op.t}`);
  }
}

function restoreSh(op, snap) {
  if (!snap || snap.na || snap.unknown) return null;
  switch (op.t) {
    case 'defaults': {
      const pre = ['defaults', ...defaultsArgs(op)].map(q).join(' ');
      if (!snap.exists) return `${pre} delete ${q(op.domain)} ${q(op.key)} 2>/dev/null || true`;
      if (snap.complex) return null;
      const v = snap.type === 'boolean' ? (snap.value === '1' ? 'true' : 'false') : snap.value;
      return `${pre} write ${q(op.domain)} ${q(op.key)} ${typeFlag(snap.type)} ${q(v)}`;
    }
    case 'sysctl': {
      let s = `sysctl -w ${q(`${op.key}=${snap.value}`)} >/dev/null`;
      if (op.persist) s += snap.persisted != null ? ` && woof_persist ${q(op.key)} ${q(snap.persisted)}` : ` && woof_unpersist ${q(op.key)}`;
      return s;
    }
    case 'sysfs': return snap.files.map((f) => `printf '%s' ${q(f.value)} > ${q(f.path)}`).join(' ; ');
    case 'gsettings': return `gsettings set ${q(op.schema)} ${q(op.key)} ${q(snap.value)}`;
    case 'systemd': {
      const scope = op.scope === 'user' ? '--user ' : '';
      const parts = [];
      if (/^enabled/.test(snap.enabled)) parts.push(`systemctl ${scope}enable ${q(op.unit)}`);
      else if (snap.enabled === 'disabled') parts.push(`systemctl ${scope}disable ${q(op.unit)}`);
      parts.push(snap.active ? `systemctl ${scope}start ${q(op.unit)}` : `systemctl ${scope}stop ${q(op.unit)}`);
      return parts.join(' ; ');
    }
    case 'file': {
      const p = expand(op.path);
      return snap.exists ? `printf '%s' ${q(snap.content)} > ${q(p)}` : `rm -f ${q(p)}`;
    }
    case 'pmset': return `pmset -${op.scope || 'a'} ${q(op.key)} ${q(snap.value)}`;
    case 'mdutil': return `mdutil -i ${snap.enabled ? 'on' : 'off'} ${q(op.volume || '/')} >/dev/null`;
    case 'iface': return `ifconfig ${q(op.name)} ${snap.up ? 'up' : 'down'}`;
    case 'ppd': return `powerprofilesctl set ${q(snap.value)}`;
    case 'tuned': return snap.value === 'none' ? 'tuned-adm off' : `tuned-adm profile ${q(snap.value)}`;
    case 'macDns': return snap.services.map((s) => `networksetup -setdnsservers ${q(s.service)} ${s.servers.length ? s.servers.map(q).join(' ') : 'Empty'}`).join(' ; ') + ' ; (dscacheutil -flushcache; killall -HUP mDNSResponder 2>/dev/null; true)';
    case 'nvidia': return `nvidia-settings -a ${q(`${op.attr}=${snap.value}`)} >/dev/null`;
    case 'adb': return snap.value === 'null' ? `adb shell settings delete ${q(op.ns)} ${q(op.key)}` : `adb shell settings put ${q(op.ns)} ${q(op.key)} ${q(snap.value)}`;
    case 'pkg': return snap.installed === (op.install !== false) ? null : pkgCmd(snap.manager, snap.installed ? 'install' : 'remove', snap.name);
    default: return null;
  }
}

function pkgCmd(mgr, action, name) {
  const n = q(name);
  const c = {
    apt: { install: `DEBIAN_FRONTEND=noninteractive apt-get install -y ${n}`, remove: `DEBIAN_FRONTEND=noninteractive apt-get remove -y ${n}` },
    dnf: { install: `dnf install -y ${n}`, remove: `dnf remove -y ${n}` },
    zypper: { install: `zypper --non-interactive install ${n}`, remove: `zypper --non-interactive remove ${n}` },
    pacman: { install: `pacman -S --noconfirm --needed ${n}`, remove: `pacman -R --noconfirm ${n}` },
  }[mgr];
  return `${c[action]} >/dev/null`;
}

/** Does the current value match what the op wants? null = can't tell. */
function matches(op, snap) {
  if (!snap || snap.na) return null;
  if (snap.unknown) return null;
  switch (op.t) {
    case 'defaults': {
      if (op.value === null) return !snap.exists;
      if (!snap.exists) return false;
      if (op.type === 'bool') return (snap.value === '1') === !!op.value;
      if (op.type === 'float' || op.type === 'int') return Number(snap.value) === Number(op.value);
      return snap.value === String(op.value);
    }
    case 'sysctl': return norm(snap.value) === norm(op.value);
    case 'sysfs': return snap.files.every((f) => f.value === String(op.value));
    case 'gsettings': return norm(snap.value).replace(/^'(.*)'$/, '$1') === norm(op.value).replace(/^'(.*)'$/, '$1');
    case 'systemd': return op.enabled ? /^enabled/.test(snap.enabled) : !/^enabled/.test(snap.enabled) && !snap.active;
    case 'file': return snap.exists && snap.content === op.content;
    case 'pmset': return String(snap.value) === String(op.value);
    case 'mdutil': return snap.enabled === !!op.enabled;
    case 'iface': return snap.up === !!op.up;
    case 'ppd': case 'tuned': return snap.value === op.value;
    case 'macDns': return snap.services.every((s) => s.servers.join(',') === op.servers.join(','));
    case 'nvidia': return String(snap.value) === String(op.value);
    case 'adb': return String(snap.value) === String(op.value);
    case 'pkg': return snap.installed === (op.install !== false);
    default: return null;
  }
}

/** Ops that change system-wide state need admin (root). */
function needsAdmin(op) {
  switch (op.t) {
    case 'sysctl': case 'sysfs': case 'pmset': case 'mdutil': case 'macDns': case 'pkg': case 'iface': case 'tuned': return true;
    case 'defaults': return !!op.admin;
    case 'systemd': return op.scope !== 'user';
    case 'file': return !expand(op.path).startsWith(HOME + path.sep);
    default: return false;
  }
}

const POST = {
  dock: 'killall Dock 2>/dev/null || true',
  uiserver: 'killall SystemUIServer 2>/dev/null || true',
  finder: 'killall Finder 2>/dev/null || true',
  cfprefs: 'killall cfprefsd 2>/dev/null || true',
  sysctl: 'sysctl --system >/dev/null 2>&1 || true',
  resolved: '(systemctl restart systemd-resolved 2>/dev/null || true)',
  pipewire: '(systemctl --user restart pipewire pipewire-pulse wireplumber 2>/dev/null || true)',
  systemd: '(systemctl daemon-reload 2>/dev/null || true)',
};

/**
 * Build the shell script for a batch. groups: [{ id, items: [{ op, snap }], post }], mode 'apply' | 'restore'.
 * Prints one "WOOF <index> OK" / "WOOF <index> FAIL <message>" line per group.
 */
function buildScript(groups, mode) {
  const lines = [
    '#!/bin/sh',
    'PATH=/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH',
    `WOOF_SYSCTL_FILE=${q(SYSCTL_FILE)}`,
    'woof_persist() { mkdir -p "$(dirname "$WOOF_SYSCTL_FILE")" && touch "$WOOF_SYSCTL_FILE" && grep -v "^$1 *=" "$WOOF_SYSCTL_FILE" > "$WOOF_SYSCTL_FILE.tmp"; printf "%s = %s\\n" "$1" "$2" >> "$WOOF_SYSCTL_FILE.tmp" && mv "$WOOF_SYSCTL_FILE.tmp" "$WOOF_SYSCTL_FILE"; }',
    'woof_unpersist() { [ -f "$WOOF_SYSCTL_FILE" ] || return 0; grep -v "^$1 *=" "$WOOF_SYSCTL_FILE" > "$WOOF_SYSCTL_FILE.tmp"; mv "$WOOF_SYSCTL_FILE.tmp" "$WOOF_SYSCTL_FILE"; [ -s "$WOOF_SYSCTL_FILE" ] || rm -f "$WOOF_SYSCTL_FILE"; }',
    'woof_last() { printf "%s" "$1" | tr "\\n" " " | tail -c 300; }',
  ];
  groups.forEach((g, i) => {
    const live = g.items.filter((it) => !(it.snap && (it.snap.na || it.snap.unknown)));
    const post = (g.post || []).map((p) => POST[p]).filter(Boolean);
    if (mode === 'apply') {
      const writes = live.map((it) => writeSh(it.op, it.snap));
      const undo = live.map((it) => restoreSh(it.op, it.snap)).filter(Boolean).reverse();
      if (!writes.length) { lines.push(`echo "WOOF ${i} OK"`); return; }
      lines.push(`if out=$( { ${writes.join(' && ')} ; } 2>&1 ); then ${post.join('; ') || ':'}; echo "WOOF ${i} OK"; else ( ${undo.join(' ; ') || ':'} ) >/dev/null 2>&1; ${post.join('; ') || ':'}; echo "WOOF ${i} FAIL $(woof_last "$out")"; fi`);
    } else {
      const undo = live.map((it) => restoreSh(it.op, it.snap)).filter(Boolean).reverse();
      if (!undo.length) { lines.push(`echo "WOOF ${i} OK"`); return; }
      lines.push(`woof_err=""; ${undo.map((c) => `out=$( { ${c} ; } 2>&1 ) || woof_err="$out"`).join('; ')}; ${post.join('; ') || ':'}; if [ -z "$woof_err" ]; then echo "WOOF ${i} OK"; else echo "WOOF ${i} FAIL $(woof_last "$woof_err")"; fi`);
    }
  });
  lines.push('exit 0', '');
  return lines.join('\n');
}

function parseScriptOutput(stdout, count) {
  const res = Array.from({ length: count }, () => ({ ok: false, error: 'Did not run' }));
  for (const line of String(stdout).split('\n')) {
    const m = line.match(/^WOOF (\d+) (OK|FAIL)\s*(.*)$/);
    if (!m) continue;
    const i = Number(m[1]);
    if (i < count) res[i] = m[2] === 'OK' ? { ok: true } : { ok: false, error: (m[3] || 'Command failed').trim() };
  }
  return res;
}

/** A stable identity for what an op touches (so no two tweaks fight over one setting). */
function targetKey(op) {
  switch (op.t) {
    case 'defaults': return `defaults:${op.host || ''}:${op.domain}:${op.key}`;
    case 'sysctl': return `sysctl:${op.key}`;
    case 'sysfs': return `sysfs:${op.glob}`;
    case 'gsettings': return `gsettings:${op.schema}:${op.key}`;
    case 'systemd': return `systemd:${op.scope || 'system'}:${op.unit}`;
    case 'file': return `file:${op.path}`;
    case 'pmset': return `pmset:${op.key}`;
    case 'mdutil': return `mdutil:${op.volume || '/'}`;
    case 'macDns': return 'dns';
    case 'nvidia': return `nvidia:${op.attr}`;
    case 'adb': return `adb:${op.ns}:${op.key}`;
    case 'pkg': return `pkg:${Object.values(op.names).join(',')}`;
    case 'iface': return `iface:${op.name}`;
    case 'ppd': return 'ppd';
    case 'tuned': return 'tuned';
    default: return `${op.t}:?`;
  }
}

module.exports = { targetKey, read, writeSh, restoreSh, matches, needsAdmin, buildScript, parseScriptOutput, q, glob, which, expand, SYSCTL_FILE };
