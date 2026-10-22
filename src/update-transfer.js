'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

// Keep the deadline active until the response body has been consumed, not just
// until headers arrive. The same signal also interrupts a blocked file pipeline.
async function withUpdateResponse(url, { timeoutMs, userAgent, fetchImpl = globalThis.fetch }, consume) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': userAgent } });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${response.status}`);
    }
    return await consume(response, controller.signal);
  } finally {
    clearTimeout(timer);
    controller.abort(); // release any body left unread after a validation/consumer failure
  }
}

async function saveVerifiedUpdate(response, signal, { destination, size, sha512, onProgress = () => {} }) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > 800 * 1048576 || !/^[A-Za-z0-9+/]{86}==$/.test(sha512)) throw new Error('Update information invalid');
  if (!response.body) throw new Error('The download was empty');
  const hash = crypto.createHash('sha512');
  let received = 0;
  const check = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > size) return callback(new Error('Download larger than expected'));
      hash.update(chunk);
      onProgress(Math.round(received / size * 100));
      callback(null, chunk);
    },
  });
  // pipeline propagates network/disk errors and destroys every stream on abort.
  // A stale retry must never overwrite a file belonging to another attempt.
  await pipeline(response.body, check, fs.createWriteStream(destination, { flags: 'wx' }), { signal });
  if (received !== size || hash.digest('base64') !== sha512) throw new Error("The download didn't match its checksum");
}

module.exports = { withUpdateResponse, saveVerifiedUpdate };
