'use strict';
// Pure helpers for the updater (no Electron here, so they can be unit-tested anywhere).

const cmpVersion = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; return 0; };

/** latest-mac.yml -> { version, file, sha512, size, notes } (only the fields we need; no YAML library). */
function parseLatestYml(text) {
  const version = (text.match(/^version:\s*['"]?([\d.]+)['"]?\s*$/m) || [])[1];
  const files = [...text.matchAll(/-\s+url:\s*(\S+)\s*\n\s+sha512:\s*(\S+)\s*\n\s+size:\s*(\d+)/g)].map((m) => ({ url: m[1], sha512: m[2], size: Number(m[3]) }));
  const zip = files.find((f) => /\.zip$/.test(f.url));
  const notes = (text.match(/^releaseNotes:\s*([\s\S]*)$/m) || [])[1] || '';
  return version && zip ? { version, ...zip, notes } : null;
}

module.exports = { parseLatestYml, cmpVersion };
