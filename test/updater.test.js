'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLatestYml, cmpVersion } = require('../src/updater');

const YML = `version: 1.1.2
files:
  - url: Woof-Tweaks-1.1.2-universal.zip
    sha512: yboTRLdfwIy9wSMzMVkZk+Kfn20M1GTcCdTecWBJmCR15m7xeL/cEz29PFirHXlPiEf3i/uk0ik8SFTZnTki6A==
    size: 193480471
  - url: Woof-Tweaks-1.1.2-universal.dmg
    sha512: UzqZAFqTpG57uCAhJHI1X9aFwsoNzTy3KdlGoIm5dDJ5BJvAsh/1BSDsFRrQ0lsYU6LHb9Smo2sYFV7K2qCh0w==
    size: 193588321
path: Woof-Tweaks-1.1.2-universal.zip
sha512: yboTRLdfwIy9wSMzMVkZk+Kfn20M1GTcCdTecWBJmCR15m7xeL/cEz29PFirHXlPiEf3i/uk0ik8SFTZnTki6A==
releaseDate: '2026-10-08T14:51:17.676Z'
`;

test('reads the mac zip from latest-mac.yml', () => {
  const info = parseLatestYml(YML);
  assert.equal(info.version, '1.1.2');
  assert.equal(info.url, 'Woof-Tweaks-1.1.2-universal.zip');
  assert.equal(info.size, 193480471);
  assert.match(info.sha512, /^ybo.*==$/);
});

test('rejects update info without a zip', () => {
  assert.equal(parseLatestYml('version: 1.2.0\nfiles: []\n'), null);
  assert.equal(parseLatestYml('garbage'), null);
});

test('version comparison', () => {
  assert.equal(cmpVersion('1.1.10', '1.1.9'), 1);
  assert.equal(cmpVersion('1.1.2', '1.1.2'), 0);
  assert.equal(cmpVersion('1.0.9', '1.1.0'), -1);
});
