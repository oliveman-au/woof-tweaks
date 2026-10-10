'use strict';
// The background updater: a hidden "Woof Tweaks --background-update" run that starts with the device (and every
// 6 hours while it's on), installs any new version silently and exits. It never opens the app's window.
//   Windows: login item "WoofTweaksUpdater" + Task Scheduler task "Woof Tweaks Updater" (every 6 h)
//   macOS:   LaunchAgent stream.woof-services.tweaks.updater (at login + every 6 h)
//   Linux:   ~/.config/autostart/woof-tweaks-updater.desktop (at login)
// The installer's uninstall step removes the Windows entries (build/installer.nsh).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const FLAG = '--background-update';
const WIN_TASK = 'Woof Tweaks Updater';
const WIN_RUN_NAME = 'WoofTweaksUpdater';
const MAC_LABEL = 'stream.woof-services.tweaks.updater';
const EVERY_SECONDS = 6 * 3600;

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** LaunchAgent plist for the hidden updater (pure, for tests). */
function macPlist(exe) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${MAC_LABEL}</string>
  <key>ProgramArguments</key><array><string>${xml(exe)}</string><string>${FLAG}</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>${EVERY_SECONDS}</integer>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
</dict>
</plist>
`;
}

/** schtasks arguments for the every-6-hours Windows task (pure, for tests). Runs as the signed-in user, no admin. */
function winTaskArgs(exe) {
  return ['/Create', '/F', '/TN', WIN_TASK, '/SC', 'HOURLY', '/MO', '6', '/TR', `"${exe}" ${FLAG}`];
}

/** Autostart entry for Linux (pure, for tests). */
function linuxDesktop(exe) {
  return `[Desktop Entry]\nType=Application\nName=Woof Tweaks Updater\nExec="${exe}" ${FLAG}\nNoDisplay=true\nX-GNOME-Autostart-enabled=true\nTerminal=false\n`;
}

const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { windowsHide: true, timeout: 20_000 }, (e, out, err) => resolve({ ok: !e, out: String(out || ''), err: String(err || e?.message || '') })));

/** Make sure the hidden updater is registered for this device (idempotent; called on every app start). */
async function ensureBackgroundTask(app, log = console) {
  const testing = process.env.WOOF_BG_TEST === '1'; // CI: register from a dev build, but never start anything
  if (!app.isPackaged && !testing) return { ok: false, reason: 'dev' };
  const exe = process.platform === 'linux' ? (process.env.APPIMAGE || (testing ? process.execPath : '')) : process.execPath;
  if (!exe) return { ok: false, reason: 'no executable path' };
  try {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: true, path: exe, args: [FLAG], name: WIN_RUN_NAME, enabled: true });
      const r = await run('schtasks', winTaskArgs(exe));
      if (!r.ok) log.warn?.('background task (schtasks) not created', { err: r.err.slice(0, 200) });
      return { ok: true };
    }
    if (process.platform === 'darwin') {
      const bundle = path.resolve(exe, '..', '..', '..');
      if (!bundle.endsWith('.app') || bundle.includes('/AppTranslocation/')) return { ok: false, reason: 'not installed in Applications' };
      const file = path.join(os.homedir(), 'Library', 'LaunchAgents', `${MAC_LABEL}.plist`);
      const want = macPlist(exe);
      const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (have !== want) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, want);
        const uid = String(process.getuid());
        if (testing) return { ok: true };
        await run('/bin/launchctl', ['bootout', `gui/${uid}/${MAC_LABEL}`]);
        const r = await run('/bin/launchctl', ['bootstrap', `gui/${uid}`, file]);
        if (!r.ok) await run('/bin/launchctl', ['load', '-w', file]);
      }
      return { ok: true };
    }
    if (process.platform === 'linux') {
      const file = path.join(os.homedir(), '.config', 'autostart', 'woof-tweaks-updater.desktop');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, linuxDesktop(exe));
      return { ok: true };
    }
  } catch (e) {
    log.warn?.('background task not registered', { e: e.message });
    return { ok: false, reason: e.message };
  }
  return { ok: false, reason: 'unsupported platform' };
}

module.exports = { FLAG, WIN_TASK, WIN_RUN_NAME, MAC_LABEL, macPlist, winTaskArgs, linuxDesktop, ensureBackgroundTask };
