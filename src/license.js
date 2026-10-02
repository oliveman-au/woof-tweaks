'use strict';
// Account + plan. The server decides the plan (no DRM, no local unlocks). Login is a device link:
// the app gets a short code, the user approves it on woof-services.stream, the app's poll gets a token.
// The token is stored encrypted with the OS keychain (Electron safeStorage) when available.
const https = require('https');
const { safeStorage } = require('electron');
const { isPlan } = require('./core/plans');

const SITE = process.env.WOOF_SITE || 'https://woof-services.stream';
const OFFLINE_GRACE_MS = 7 * 24 * 3600_000;

let store = null;
let deviceId = () => 'unknown';
let osId = () => process.platform;
let version = '0.0.0';
let emit = () => {};
let poll = null;

function init(opts) {
  store = opts.store; deviceId = opts.deviceId; osId = opts.osId; version = opts.version; emit = opts.emit || emit;
}

function post(pathname, body, timeout = 12_000) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, SITE);
    const data = JSON.stringify(body);
    // Node requests carry no Origin header — the site uses that to tell the app from a browser.
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': `WoofTweaks/${version}` }, timeout }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; if (buf.length > 1e6) req.destroy(); });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch { reject(new Error(`Bad response (${res.statusCode})`)); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('The website took too long to answer')));
    req.end(data);
  });
}

// ---------- token storage ----------
function saveToken(token, name) {
  let rec;
  if (safeStorage && safeStorage.isEncryptionAvailable()) rec = { enc: safeStorage.encryptString(token).toString('base64'), name };
  else rec = { raw: token, name };
  store.set('session', rec);
}
function getToken() {
  const s = store.get('session');
  if (!s) return null;
  try {
    if (s.enc) return safeStorage.decryptString(Buffer.from(s.enc, 'base64'));
    return s.raw || null;
  } catch { return null; }
}

// ---------- plan ----------
function cachedPlan() {
  const p = store.get('plan', 'free');
  const at = store.get('planCheckedAt', 0);
  if (!isPlan(p) || !getToken()) return 'free';
  if (Date.now() - at > OFFLINE_GRACE_MS) return 'free';
  return p;
}

let checking = null;
async function refresh() {
  if (checking) return checking;
  checking = (async () => {
    const token = getToken();
    if (!token) { store.set('plan', 'free'); return session(); }
    try {
      const r = await post('/api/app/license', { token, deviceId: deviceId(), platform: osId(), appVersion: version });
      const b = r.body || {};
      if (b.signedIn === false) { clearSession(); emit('auth:state', { status: 'signed-out', reason: 'Your login expired. Please log in again.' }); return session(); }
      if (isPlan(b.plan)) { store.set('plan', b.plan); store.set('planCheckedAt', Date.now()); }
      if (b.name) { const s = store.get('session'); if (s) store.set('session', { ...s, name: b.name }); }
      store.set('lastOnlineAt', Date.now());
      return session();
    } catch (e) {
      return { ...session(), offline: true, error: e.message };
    } finally { checking = null; }
  })();
  return checking;
}

function session() {
  const s = store.get('session');
  return { signedIn: !!(s && getToken()), name: (s && s.name) || null, plan: cachedPlan(), checkedAt: store.get('planCheckedAt', 0) || null };
}

function clearSession() {
  store.delete('session');
  store.set('plan', 'free');
  store.delete('planCheckedAt');
}

// ---------- device-link login ----------
async function startLogin(openUrl) {
  cancelLogin();
  const r = await post('/api/app/link/start', { deviceId: deviceId(), platform: osId(), appVersion: version });
  const b = r.body || {};
  if (!b.ok) throw new Error(b.error || 'Could not start login');
  const until = Date.now() + (b.expiresIn || 600) * 1000;
  const interval = Math.max(2, b.interval || 3) * 1000;
  const state = { code: b.code, url: b.url, expiresAt: until };
  emit('auth:state', { status: 'pending', ...state });
  openUrl(b.url);
  const tick = async () => {
    if (!poll) return;
    if (Date.now() > until) { poll = null; emit('auth:state', { status: 'expired' }); return; }
    try {
      const p = (await post('/api/app/link/poll', { pollToken: b.pollToken })).body || {};
      if (p.status === 'approved' && p.token) {
        poll = null;
        saveToken(p.token, p.name || null);
        if (isPlan(p.plan)) { store.set('plan', p.plan); store.set('planCheckedAt', Date.now()); }
        emit('auth:state', { status: 'approved', ...session() });
        return;
      }
      if (p.status === 'denied' || p.status === 'expired') { poll = null; emit('auth:state', { status: p.status }); return; }
    } catch { /* network blip: keep polling */ }
    if (poll) poll = setTimeout(tick, interval);
  };
  poll = setTimeout(tick, interval);
  return state;
}

function cancelLogin() { if (poll) { clearTimeout(poll); poll = null; } }

async function logout() {
  cancelLogin();
  const token = getToken();
  clearSession();
  if (token) { try { await post('/api/app/logout', { token }, 6000); } catch { /* offline: token expires on its own */ } }
  return session();
}

/** For other app→site calls (feedback, cloud sync). */
async function authedPost(pathname, body) {
  const token = getToken();
  if (!token) throw new Error('Log in first');
  const r = await post(pathname, { ...body, token, deviceId: deviceId() });
  if (r.status === 401) { clearSession(); throw new Error('Your login expired. Please log in again.'); }
  return r.body;
}

const stop = () => cancelLogin();

module.exports = { init, refresh, session, cachedPlan, startLogin, cancelLogin, logout, authedPost, stop, SITE };
