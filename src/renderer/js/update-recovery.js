import { esc } from './util.js';

// Recovery must remain reachable when a mandatory update prevents account verification.
export function updateRecovery(session = {}, update = {}) {
  update = update || {};
  if (!session.updateRequired && !update.critical) return '';
  const version = update.version || session.minimumVersion;
  const percent = Math.max(0, Math.min(100, Math.round(Number(update.progress) || 0)));
  const messages = {
    checking: 'Checking for the latest version…',
    downloading: `Downloading the update… ${percent}%`,
    ready: 'The update is ready. Restart Woof Tweaks to finish installing it.',
    error: 'The update could not finish. Retry, or install the latest version from the website.',
    available: update.manual ? 'Install the latest version from the website to continue.' : 'A new version is available.',
  };
  const message = messages[update.status] || 'Check for an update to continue. Your account and backups are kept.';
  const active = ['checking', 'downloading'].includes(update.status);
  return `<section class="card update-recovery" style="max-width:650px;margin:8vh auto;padding:36px" aria-live="polite">
    <div class="eyebrow">WOOF TWEAKS UPDATE</div><h1 style="margin:12px 0">Update to continue.</h1>
    <p class="muted">${esc(message)}</p>${version ? `<p class="small muted">Version ${esc(version)}</p>` : ''}
    ${update.status === 'downloading' ? `<progress max="100" value="${percent}" aria-label="Update download progress" style="width:100%;margin:16px 0">${percent}%</progress>` : ''}
    ${update.error ? `<p class="note danger" style="overflow-wrap:anywhere">${esc(update.error)}</p>` : ''}
    <div class="row" style="flex-wrap:wrap;margin-top:20px">
      ${update.status === 'ready' ? '<button class="btn primary" data-action="update-install">Restart & update</button>' : active ? '' : `<button class="btn primary" data-action="update-check">${update.status === 'error' ? 'Retry update' : 'Check for update'}</button>`}
      ${update.status === 'available' ? '<button class="btn" data-action="update-download">Download update</button>' : ''}
      <button class="btn ghost" data-action="update-manual">Get latest installer</button>
      <button class="btn ghost" data-action="reconnect">Check account again</button>
      <button class="btn ghost" data-go="backups">Restore previous changes</button>
      <button class="btn ghost" data-action="support">Get support</button>
    </div><p class="muted small" style="margin-top:16px">New tweaks stay locked until this version is supported and your account is verified.</p>
  </section>`;
}
