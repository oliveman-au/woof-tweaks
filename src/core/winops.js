'use strict';
// Windows change types, JS side: admin needs, "is it already set?", and plain-English descriptions.
// The actual reading/writing happens in runners/windows.ps1.

const u32 = (v) => Number(v) >>> 0;
const lower = (s) => String(s == null ? '' : s).toLowerCase();

/** HKCU changes run as the signed-in user (never elevated, so they land in the right user's settings). */
function needsAdmin(op) {
  if (op.t === 'reg' || op.t === 'regFlags') return !/^HKCU\\/i.test(op.key);
  if (op.t === 'display') return false;
  return true;
}

/** Shape an op for the PowerShell runner (DWORDs are signed 32-bit in .NET). */
function forRunner(op) {
  if (op.t === 'reg' && op.type === 'dword' && op.value != null) return { ...op, value: u32(op.value) | 0 };
  return op;
}

const BCD_YES = /^(yes|ja|oui|s[ií]|sim|tak|da|evet|kyll|igen|ano)/i;
const bcdBool = (v) => (BCD_YES.test(String(v)) ? 'yes' : (/^(no|nein|non|nee|nie|ne|ei|nem)/i.test(String(v)) ? 'no' : lower(v)));

function adapterTarget(op, a) {
  const t = String(op.value);
  if (t === 'max' || t === 'min') {
    const nums = (a.valid || []).filter((x) => /^\d+$/.test(x)).map(Number);
    if (nums.length) return String(t === 'max' ? Math.max(...nums) : Math.min(...nums));
    const lim = t === 'max' ? a.max : a.min;
    return lim == null ? null : String(lim);
  }
  if ((a.valid || []).length && !a.valid.includes(t)) return null;
  return t;
}

/** true = already as the tweak wants; false = not; null = can't tell / doesn't apply. */
function matches(op, snap) {
  if (!snap || snap.na || snap.unknown) return null;
  switch (op.t) {
    case 'reg': {
      if (op.value === null) return !snap.exists;
      if (!snap.exists) return false;
      if (op.type === 'dword' || op.type === 'qword') return u32(snap.value) === u32(op.value) || Number(snap.value) === Number(op.value);
      if (op.type === 'multisz') return JSON.stringify(snap.value || []) === JSON.stringify(op.value);
      // Task Manager's StartupApproved blobs: first byte odd = disabled (the rest is a timestamp).
      if (op.startupApproved) { try { return (Buffer.from(String(snap.value), 'base64')[0] & 1) === 1; } catch { return false; } }
      return String(snap.value) === String(op.value);
    }
    case 'regFlags': return Object.entries(op.flags).every(([k, v]) => snap.flags && String(snap.flags[k]) === String(v));
    case 'service': return snap.start === op.start;
    case 'powerScheme': return lower(snap.active) === lower(op.guid);
    case 'powerSetting': return Number(snap.ac) === Number(op.ac) && (op.dc == null || Number(snap.dc) === Number(op.dc));
    case 'bcd': return op.value === null ? !snap.exists : (snap.exists && bcdBool(snap.value) === lower(op.value));
    case 'netsh': return lower(snap.value) === lower(op.value);
    case 'adapterProp': {
      const rel = (snap.adapters || []).map((a) => [a, adapterTarget(op, a)]).filter(([, t]) => t != null);
      if (!rel.length) return null;
      return rel.every(([a, t]) => String(a.value) === t);
    }
    case 'dns': { const v4 = (l) => (l || []).filter((x) => !String(x).includes(':')).join(','); return (snap.adapters || []).every((a) => v4(a.servers) === v4(op.servers)); }
    case 'task': return op.enabled ? snap.state !== 'Disabled' : snap.state === 'Disabled';
    case 'mmagent': return snap.value === !!op.enabled;
    case 'hibernate': return snap.value === !!op.enabled;
    case 'defenderExclusion': return !!snap.present;
    case 'display': return Number(snap.hz) >= Number(snap.max);
    default: return null;
  }
}

const fmt = (v) => (v === null || v === undefined ? '(not set)' : Array.isArray(v) ? v.join(', ') : String(v));
const shortKey = (k) => k.replace(/^HKCU\\/, 'HKCU\\').replace(/^HKLM\\/, 'HKLM\\');

/** Plain-English "what will change" line for the preview / dry run. */
function describe(op, snap) {
  const cur = snap && !snap.na && !snap.unknown;
  switch (op.t) {
    case 'reg': return { target: `${shortKey(op.key)}\\${op.name}`, from: cur ? (snap.exists ? fmt(snap.value) : '(not set)') : '?', to: op.value === null ? '(removed)' : fmt(op.value) };
    case 'regFlags': return { target: `${shortKey(op.key)}\\${op.name}`, from: cur ? Object.keys(op.flags).map((k) => `${k}=${snap.flags && snap.flags[k] != null ? snap.flags[k] : '(unset)'}`).join(' ') : '?', to: Object.entries(op.flags).map(([k, v]) => `${k}=${v}`).join(' ') };
    case 'service': return { target: `Service “${op.name}” startup`, from: cur ? `${snap.start}${snap.status ? ` (${snap.status})` : ''}` : '?', to: `${op.start}${op.stop ? ' (stopped now)' : ''}` };
    case 'powerScheme': return { target: 'Active power plan', from: cur ? snap.active : '?', to: op.label || op.guid };
    case 'powerSetting': return { target: `Power setting ${op.label || op.setting}`, from: cur ? `AC ${snap.ac}${snap.dc != null ? ` / DC ${snap.dc}` : ''}` : '?', to: `AC ${op.ac}${op.dc != null ? ` / DC ${op.dc}` : ''}` };
    case 'bcd': return { target: `Boot setting ${op.name}`, from: cur ? (snap.exists ? snap.value : '(default)') : '(needs admin to read)', to: op.value === null ? '(default)' : op.value };
    case 'netsh': return { target: `TCP ${op.setting}`, from: cur ? snap.value : '?', to: op.value };
    case 'adapterProp': return { target: `Network adapter “${op.label || op.keyword}”`, from: cur ? (snap.adapters || []).map((a) => `${a.adapter}: ${a.value}`).join('; ') : '?', to: op.value };
    case 'dns': return { target: 'DNS servers', from: cur ? (snap.adapters || []).map((a) => `${a.adapter}: ${a.static ? a.servers.join(', ') : 'automatic'}`).join('; ') : '?', to: op.servers.join(', ') };
    case 'task': return { target: `Scheduled task ${op.name}`, from: cur ? snap.state : '?', to: op.enabled ? 'Enabled' : 'Disabled' };
    case 'mmagent': return { target: op.feature, from: cur ? (snap.value ? 'On' : 'Off') : '(needs admin to read)', to: op.enabled ? 'On' : 'Off' };
    case 'hibernate': return { target: 'Hibernation', from: cur ? (snap.value ? 'On' : 'Off') : '?', to: op.enabled ? 'On' : 'Off' };
    case 'defenderExclusion': return { target: 'Microsoft Defender exclusion', from: cur ? (snap.present ? 'Excluded' : 'Scanned') : '?', to: `Exclude ${op.path}` };
    case 'display': return { target: 'Display refresh rate', from: cur ? `${snap.hz} Hz` : '?', to: cur ? `${snap.max} Hz` : 'Highest supported' };
    default: return { target: op.t, from: '?', to: '?' };
  }
}

/** A stable identity for "what this op touches", used to make sure no two tweaks fight over the same value. */
function targetKey(op) {
  switch (op.t) {
    case 'reg': return `reg:${lower(op.key)}\\${lower(op.name)}`;
    case 'regFlags': return `regflags:${lower(op.key)}\\${lower(op.name)}:${Object.keys(op.flags).map(lower).sort().join(',')}`;
    case 'service': return `svc:${lower(op.name)}`;
    case 'powerScheme': return 'power:scheme';
    case 'powerSetting': return `power:${lower(op.scheme || 'active')}:${lower(op.sub)}:${lower(op.setting)}`;
    case 'bcd': return `bcd:${lower(op.name)}`;
    case 'netsh': return `netsh:${op.setting}`;
    case 'adapterProp': return `nic:${lower(op.keyword)}`;
    case 'dns': return 'dns';
    case 'task': return `task:${lower(op.path)}${lower(op.name)}`;
    case 'mmagent': return `mm:${lower(op.feature)}`;
    case 'hibernate': return 'hibernate';
    case 'defenderExclusion': return `defender:${lower(op.path)}`;
    case 'display': return 'display';
    default: return `${op.t}:?`;
  }
}

module.exports = { needsAdmin, forRunner, matches, describe, targetKey, bcdBool };
