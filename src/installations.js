'use strict';
// Minimal installation counting: no login, hardware identifiers or usage history.
const HEARTBEAT_MS = 6 * 3600_000;
function createReporter({ post, deviceId, osId, version, schedule = setTimeout, cancel = clearTimeout }) {
  let stopped = true, timer = null, pending = null, failures = 0;
  async function tick() {
    if (stopped || pending) return pending;
    pending = (async () => {
      let delay = HEARTBEAT_MS;
      try {
        const response = await post('/api/app/install', { deviceId: deviceId(), platform: osId(), appVersion: version });
        if (response.status !== 200 || response.body?.ok !== true) throw new Error('Registration unavailable');
        failures = 0;
      } catch {
        // Counting must never prevent opening or using the app.
        delay = Math.min(3600_000, 60_000 * 2 ** Math.min(failures++, 6));
      } finally {
        pending = null;
        if (!stopped) {
          timer = schedule(() => { timer = null; void tick(); }, delay);
          timer?.unref?.();
        }
      }
    })();
    return pending;
  }
  return {
    start() { if (!stopped) return; stopped = false; void tick(); },
    stop() { stopped = true; if (timer !== null) cancel(timer); timer = null; },
  };
}
module.exports = { createReporter, HEARTBEAT_MS };
