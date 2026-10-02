'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { TWEAKS, PLAN_ORDER } = require('./tweaks');

const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const BACKUP_FILE = path.join(BACKUP_DIR, 'restore.json');

function ensureDir() { fs.mkdirSync(BACKUP_DIR, { recursive: true }); }

function loadBackup() {
  ensureDir();
  try { return JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8')); } catch { return { version: 1, tweaks: {} }; }
}

function saveBackup(data) {
  ensureDir();
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2));
}

function deviceId() {
  const p = path.join(app.getPath('userData'), '.device-id');
  try { return fs.readFileSync(p, 'utf8').trim(); } catch {
    const id = crypto.randomUUID();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, id);
    return id;
  }
}

function canApply(tweak, plan) {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(tweak.plan);
}

async function scan() {
  const platform = process.platform;
  const backup = loadBackup();
  const results = {};
  for (const t of TWEAKS) {
    if (t.platform !== platform && t.platform !== 'all') continue;
    try {
      const current = t.check();
      results[t.id] = { current, applied: !!backup.tweaks[t.id], optimal: current === t.optimal };
    } catch {
      results[t.id] = { current: null, applied: !!backup.tweaks[t.id], optimal: false };
    }
  }
  return results;
}

async function apply(ids, plan) {
  const platform = process.platform;
  const backup = loadBackup();
  const results = [];
  const needsElevation = [];

  for (const id of ids) {
    const t = TWEAKS.find((tw) => tw.id === id);
    if (!t) { results.push({ id, ok: false, error: 'Unknown tweak' }); continue; }
    if (t.platform !== platform && t.platform !== 'all') { results.push({ id, ok: false, error: 'Wrong platform' }); continue; }
    if (!canApply(t, plan)) { results.push({ id, ok: false, error: 'Plan too low', requiredPlan: t.plan }); continue; }
    if (t.elevated) needsElevation.push(t);
    else {
      try {
        const prev = t.check();
        if (!backup.tweaks[id]) backup.tweaks[id] = { appliedAt: new Date().toISOString(), prev };
        t.apply();
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e.message });
      }
    }
  }

  if (needsElevation.length > 0) {
    const elevated = applyElevated(needsElevation, backup);
    results.push(...elevated);
  }

  saveBackup(backup);
  return { ok: results.every((r) => r.ok), results };
}

function applyElevated(tweaks, backup) {
  const results = [];
  if (process.platform === 'win32') {
    const cmds = [];
    for (const t of tweaks) {
      try {
        const prev = t.check();
        if (!backup.tweaks[t.id]) backup.tweaks[t.id] = { appliedAt: new Date().toISOString(), prev };
        cmds.push(t.elevatedCmd());
      } catch (e) {
        results.push({ id: t.id, ok: false, error: e.message });
      }
    }
    if (cmds.length > 0) {
      const script = cmds.join(' & ');
      try {
        execSync(`powershell -Command "Start-Process cmd -ArgumentList '/c ${script.replace(/"/g, '\\"')}' -Verb RunAs -Wait"`, { timeout: 30000 });
        for (const t of tweaks) if (!results.find((r) => r.id === t.id)) results.push({ id: t.id, ok: true });
      } catch (e) {
        for (const t of tweaks) if (!results.find((r) => r.id === t.id)) results.push({ id: t.id, ok: false, error: 'Elevation denied or failed' });
      }
    }
  } else {
    const cmds = tweaks.map((t) => {
      try {
        const prev = t.check();
        if (!backup.tweaks[t.id]) backup.tweaks[t.id] = { appliedAt: new Date().toISOString(), prev };
        return t.elevatedCmd();
      } catch (e) {
        results.push({ id: t.id, ok: false, error: e.message });
        return null;
      }
    }).filter(Boolean);
    if (cmds.length > 0) {
      const script = cmds.join(' && ');
      try {
        const sudoPrompt = require('child_process');
        sudoPrompt.execSync(`osascript -e 'do shell script "${script.replace(/"/g, '\\"')}" with administrator privileges'`, { timeout: 30000 });
        for (const t of tweaks) if (!results.find((r) => r.id === t.id)) results.push({ id: t.id, ok: true });
      } catch {
        for (const t of tweaks) if (!results.find((r) => r.id === t.id)) results.push({ id: t.id, ok: false, error: 'Elevation denied' });
      }
    }
  }
  return results;
}

async function revert(ids) {
  const backup = loadBackup();
  const results = [];
  for (const id of ids) {
    const t = TWEAKS.find((tw) => tw.id === id);
    const saved = backup.tweaks[id];
    if (!t || !saved) { results.push({ id, ok: false, error: 'No backup' }); continue; }
    try {
      t.revert(saved.prev);
      delete backup.tweaks[id];
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e.message });
    }
  }
  saveBackup(backup);
  return { ok: results.every((r) => r.ok), results };
}

async function revertAll() {
  const backup = loadBackup();
  const ids = Object.keys(backup.tweaks);
  if (ids.length === 0) return { ok: true, results: [] };
  return revert(ids);
}

module.exports = { scan, apply, revert, revertAll, deviceId, loadBackup };
