'use strict';
// What we changed, and exactly what it was before. Lives only on this computer (userData/backups/state.json).
// Every change records its ops + snapshots, so Revert restores the real original values — even after an
// app update changes a tweak's definition, or if the game it was for has been uninstalled.
const fs = require('fs');
const path = require('path');
const { writeAtomic } = require('../store');

const HISTORY_MAX = 500;
let file = null;
let dir = null;
let state = null;

const blank = () => ({ version: 2, applied: {}, history: [], journal: null, systemSnapshots: [] });

function init(dataDir) {
  dir = path.join(dataDir, 'backups');
  file = path.join(dir, 'state.json');
  fs.mkdirSync(dir, { recursive: true });
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!state || state.version !== 2) throw new Error('old format');
  } catch {
    // Keep a v1.0 backup file aside instead of overwriting it.
    const old = path.join(dir, 'restore.json');
    if (fs.existsSync(old)) { try { fs.renameSync(old, path.join(dir, 'restore.v1.json')); } catch { /* ignore */ } }
    state = blank();
  }
  state.applied = state.applied || {};
  state.history = state.history || [];
  state.systemSnapshots = state.systemSnapshots || [];
  return state;
}

function save() { writeAtomic(file, JSON.stringify(state, null, 1)); }

const applied = () => state.applied;
const isApplied = (id) => !!state.applied[id];
const get = (id) => state.applied[id] || null;

/** Record (or extend) an applied tweak. items: [{ op, snap, admin }] */
function record(id, info) {
  const prev = state.applied[id];
  state.seq = (state.seq || 0) + 1;
  state.applied[id] = {
    at: new Date().toISOString(),
    seq: state.seq,
    name: info.name,
    volatile: !!info.volatile,
    reboot: info.reboot || false,
    post: info.post || [],
    items: prev ? prev.items.concat(info.items) : info.items,
    interrupted: !!info.interrupted,
  };
  save();
}

function remove(id) { delete state.applied[id]; save(); }

function log(entry) {
  state.history.unshift({ at: new Date().toISOString(), ...entry });
  if (state.history.length > HISTORY_MAX) state.history.length = HISTORY_MAX;
  save();
}
const history = () => state.history;

// Journal: written before a batch starts and cleared when it finishes. If the app dies mid-batch,
// the next launch finds it and recovers the snapshots the runner had already saved.
function startJournal(j) { state.journal = { ...j, startedAt: new Date().toISOString() }; save(); }
function updateJournal(patch) { if (state.journal) { Object.assign(state.journal, patch); save(); } }
function endJournal() { state.journal = null; save(); }
const journal = () => state.journal;

function addSystemSnapshot(s) {
  state.systemSnapshots.unshift({ at: new Date().toISOString(), ...s });
  state.systemSnapshots.length = Math.min(state.systemSnapshots.length, 20);
  save();
}

/** Export everything (for "Backups → Export"). */
const exportAll = () => JSON.parse(JSON.stringify(state));
const backupDir = () => dir;

module.exports = { init, applied, isApplied, get, record, remove, log, history, startJournal, updateJournal, endJournal, journal, addSystemSnapshot, exportAll, backupDir };
