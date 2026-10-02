'use strict';
// Which OS are we on (including ChromeOS's Linux container), and are we already admin?
const fs = require('fs');
const os = require('os');
const { run } = require('./exec');

let cached = null;

function isChromeOS() {
  if (process.platform !== 'linux') return false;
  if (process.env.WOOF_FAKE_OS === 'chromeos') return true;
  // Crostini (ChromeOS Linux) containers ship these markers.
  return fs.existsSync('/dev/.cros_milestone') || fs.existsSync('/opt/google/cros-containers') || fs.existsSync('/etc/apt/sources.list.d/cros.list');
}

/** 'win32' | 'darwin' | 'linux' | 'chromeos'. Tweaks list which of these they support. */
function osId() {
  if (process.env.WOOF_FAKE_OS) return process.env.WOOF_FAKE_OS;
  if (!cached) cached = isChromeOS() ? 'chromeos' : process.platform;
  return cached;
}

const OS_NAMES = { win32: 'Windows', darwin: 'macOS', linux: 'Linux', chromeos: 'ChromeOS' };

async function isAdmin() {
  if (process.platform === 'win32') {
    // "net session" only succeeds in an elevated process.
    const r = await run('net', ['session'], { timeout: 8000 });
    return r.code === 0;
  }
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

function osVersion() {
  const rel = os.release();
  if (process.platform === 'win32') {
    const build = Number(rel.split('.')[2] || 0);
    return { name: build >= 22000 ? 'Windows 11' : 'Windows 10', build, release: rel };
  }
  return { name: OS_NAMES[osId()], build: 0, release: rel };
}

module.exports = { osId, isChromeOS, isAdmin, osVersion, OS_NAMES };
