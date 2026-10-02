'use strict';
const path = require('path');
const fs = require('fs');

/** Write a file atomically (temp file + rename), so a crash or power cut never leaves half a JSON file. */
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Tiny JSON settings store (electron-store is ESM-only). Writes are debounced and flushed on quit. */
class Store {
  constructor(name = 'config', dir) {
    if (!dir) dir = require('electron').app.getPath('userData');
    this._path = path.join(dir, `${name}.json`);
    this._data = {};
    this._timer = null;
    try { this._data = JSON.parse(fs.readFileSync(this._path, 'utf8')) || {}; } catch { this._data = {}; }
  }

  get(key, fallback) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : fallback; }

  set(key, val) { this._data[key] = val; this._schedule(); }

  delete(key) { delete this._data[key]; this._schedule(); }

  clear() { this._data = {}; this.flush(); }

  _schedule() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    try { writeAtomic(this._path, JSON.stringify(this._data, null, 2)); } catch { /* disk full / read-only: keep in memory */ }
  }
}

module.exports = Store;
module.exports.writeAtomic = writeAtomic;
