'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class Store {
  constructor(name = 'config') {
    this._path = path.join(app.getPath('userData'), `${name}.json`);
    this._data = {};
    try { this._data = JSON.parse(fs.readFileSync(this._path, 'utf8')); } catch {}
  }

  get(key, fallback) {
    return key in this._data ? this._data[key] : fallback;
  }

  set(key, val) {
    this._data[key] = val;
    this._save();
  }

  delete(key) {
    delete this._data[key];
    this._save();
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this._path), { recursive: true });
      fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2));
    } catch {}
  }
}

module.exports = Store;
