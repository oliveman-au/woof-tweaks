'use strict';
// Small rotating log file (userData/logs/woof-tweaks.log, max ~1 MB × 2). Never logs tokens.
const fs = require('fs');
const path = require('path');

let file = null;
function init(dir) {
  const d = path.join(dir, 'logs');
  fs.mkdirSync(d, { recursive: true });
  file = path.join(d, 'woof-tweaks.log');
}
function write(level, msg, data) {
  const line = `${new Date().toISOString()} [${level}] ${msg}${data ? ` ${JSON.stringify(data).slice(0, 2000)}` : ''}\n`;
  if (process.env.WOOF_DEBUG) process.stdout.write(line);
  if (!file) return;
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, line);
  } catch { /* disk full: never crash because of logging */ }
}
const dir = () => (file ? path.dirname(file) : null);
module.exports = { init, dir, info: (m, d) => write('info', m, d), warn: (m, d) => write('warn', m, d), error: (m, d) => write('error', m, d) };
