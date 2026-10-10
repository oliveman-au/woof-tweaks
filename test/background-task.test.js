'use strict';
const test = require('node:test');
const assert = require('node:assert');
const bg = require('../src/background-task');

test('macOS LaunchAgent runs the hidden updater at login and every 6 hours', () => {
  const p = bg.macPlist('/Applications/Woof Tweaks.app/Contents/MacOS/Woof Tweaks');
  assert.match(p, /<string>\/Applications\/Woof Tweaks\.app\/Contents\/MacOS\/Woof Tweaks<\/string><string>--background-update<\/string>/);
  assert.match(p, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(p, /<integer>21600<\/integer>/);
  assert.match(p, /<string>stream\.woof-services\.tweaks\.updater<\/string>/);
});

test('plist escapes odd characters in the path', () => {
  assert.match(bg.macPlist('/Apps/A&B <x>.app/Contents/MacOS/A'), /A&amp;B &lt;x&gt;/);
});

test('Windows task runs every 6 hours as the user with the background flag', () => {
  const a = bg.winTaskArgs('C:\\Users\\me\\AppData\\Local\\Programs\\Woof Tweaks\\Woof Tweaks.exe');
  assert.deepEqual(a.slice(0, 8), ['/Create', '/F', '/TN', 'Woof Tweaks Updater', '/SC', 'HOURLY', '/MO', '6']);
  assert.equal(a[9], '"C:\\Users\\me\\AppData\\Local\\Programs\\Woof Tweaks\\Woof Tweaks.exe" --background-update');
  assert.ok(!a.includes('/RL') && !a.includes('HIGHEST'), 'never asks for admin');
});

test('Linux autostart entry is hidden and passes the flag', () => {
  const d = bg.linuxDesktop('/home/me/Woof-Tweaks.AppImage');
  assert.match(d, /Exec="\/home\/me\/Woof-Tweaks\.AppImage" --background-update/);
  assert.match(d, /NoDisplay=true/);
});
