// Small helpers. Everything shown from the system (startup item names, game folders…) goes through esc().
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const bytes = (n) => { if (n == null) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = Number(n); while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } return `${v.toFixed(v < 10 && i ? 1 : 0)} ${u[i]}`; };
export const ago = (iso) => {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400); return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString();
};
export const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const hexToRgb = (h) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || ''); return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : '139, 123, 255'; };
export const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };

// Natural-language search: maps everyday phrases to tweak tags/categories.
const SYN = {
  lag: ['latency', 'stutter', 'ping', 'input'], laggy: ['latency', 'stutter', 'ping'], mouse: ['mouse', 'aim', 'acceleration', 'input'], aim: ['mouse', 'aim'],
  ping: ['ping', 'network', 'latency', 'dns', 'wifi'], internet: ['network', 'ping', 'dns', 'wifi', 'download'], wifi: ['wifi', 'ping', 'lag spikes'],
  fps: ['fps', 'power', 'gpu', 'cpu'], frames: ['fps', 'frame pacing'], stutter: ['stutter', 'frame pacing', 'shader', 'disk', 'ram'], stuttering: ['stutter'],
  crash: ['crash', 'stability', 'tdr', 'driver'], crashes: ['crash'], freeze: ['freeze', 'ram', 'stutter'], slow: ['fps', 'ram', 'disk', 'startup', 'background'],
  boot: ['boot', 'startup'], startup: ['startup', 'boot'], ram: ['ram', 'memory'], memory: ['ram'], disk: ['disk', 'loading'], loading: ['loading', 'disk', 'shader'],
  battery: ['battery', 'power'], laptop: ['battery', 'laptop', 'power'], hot: ['power', 'fans'], privacy: ['privacy', 'telemetry'], ads: ['ads', 'popups', 'tips'],
  popup: ['popups', 'notifications'], popups: ['popups'], keyboard: ['keyboard'], audio: ['audio'], sound: ['audio'], crackle: ['audio'], monitor: ['monitor', 'hz', 'refresh rate'],
  hz: ['hz', 'refresh rate'], tearing: ['tearing', 'vrr', 'gsync'], hdr: ['hdr'], download: ['download', 'network'], upload: ['upload', 'streaming'], stream: ['streaming', 'upload'],
  rubberbanding: ['packet loss'], 'packet': ['packet loss'], dns: ['dns'], game: ['fps', 'game'], fix: [], lower: [], improve: [], my: [], the: [], better: [], make: [], faster: ['fps', 'loading'],
};
export function searchScore(t, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return 1;
  const hay = `${t.name} ${t.desc} ${(t.tags || []).join(' ')} ${t.category} ${t.long ? `${t.long.what} ${t.long.why}` : ''}`.toLowerCase();
  if (hay.includes(q)) return 10;
  const words = q.split(/[^a-z0-9]+/).filter(Boolean);
  let score = 0;
  for (const w of words) {
    if (SYN[w] && !SYN[w].length) continue;
    if (hay.includes(w)) score += 3;
    for (const s of SYN[w] || []) if ((t.tags || []).includes(s) || hay.includes(s)) score += 1.5;
  }
  return score;
}
