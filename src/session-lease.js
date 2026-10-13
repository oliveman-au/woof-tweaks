'use strict';
const { createPublicKey, verify } = require('crypto');
const { performance } = require('perf_hooks');
const PUBLIC_KEY = 'I73M/RXqL3Qd9B9/sCScFrDsouUAfLX5wQYsrHC5nEQ=';
function createVerifier({ publicKey = PUBLIC_KEY, wall = Date.now, monotonic = () => performance.now() } = {}) {
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'base64')]), format: 'der', type: 'spki' });
  let lease = null, deadline = 0;
  function clear() { lease = null; deadline = 0; }
  function accept(token, app, device) {
    try {
      if (typeof token !== 'string' || token.length > 4000) return false;
      const parts = token.split('.');
      if (parts.length !== 2 || !parts.every(p => /^[\w-]+$/.test(p))) return false;
      if (!verify(null, Buffer.from(parts[0]), key, Buffer.from(parts[1], 'base64url'))) return false;
      const c = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const now = wall() / 1000;
      if (c.typ !== 'woof-session-v1' || c.app !== app || c.device !== device || !Number.isSafeInteger(c.sub) || c.sub <= 0 ||
          !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || c.exp - c.iat !== 900 || c.iat > now + 30 || c.exp <= now) return false;
      // In-memory only: restarting the app requires a fresh online check. Changing the system clock cannot extend a running session.
      lease = c; deadline = monotonic() + Math.min(900000, (c.exp - now) * 1000); return true;
    } catch { return false; }
  }
  function claims() { if (!lease || monotonic() >= deadline || wall() >= lease.exp * 1000) { clear(); return null; } return lease; }
  return { accept, claims, clear, remaining: () => claims() ? Math.max(0, Math.min(deadline - monotonic(), lease.exp * 1000 - wall())) : 0 };
}
module.exports = { createVerifier };
