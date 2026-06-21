'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

// Guards the packaging contract: an NSIS installer that lands the app in a
// fixed directory. The earlier `portable` target extracted to a random %TEMP%
// folder on every launch, so the Claude Code hook path it wrote (and the bridge
// it pointed at) broke as soon as that temp dir changed.
test('build produces an NSIS installer target (not a temp-extracted portable)', () => {
  assert.deepEqual(pkg.build.win.target, ['nsis']);
});

test('installer lets the user pick a stable install directory', () => {
  assert.equal(pkg.build.nsis.oneClick, false);
  assert.equal(pkg.build.nsis.allowToChangeInstallationDirectory, true);
});

// The Claude Code hook runs bridge.js with plain `node`, which cannot read
// files inside app.asar. bridge.js and its core deps must be unpacked so they
// exist as real files on disk for the hook to execute.
test('bridge and its core deps are unpacked from the asar archive', () => {
  assert.ok(Array.isArray(pkg.build.asarUnpack), 'build.asarUnpack must be declared');
  assert.ok(pkg.build.asarUnpack.some((p) => p.includes('src/bridge')), 'src/bridge must be unpacked');
  assert.ok(pkg.build.asarUnpack.some((p) => p.includes('src/core')), 'src/core must be unpacked');
});

test('build output goes to release/', () => {
  assert.equal(pkg.build.directories.output, 'release');
});

test('there is a convenience script to build the installer', () => {
  assert.equal(pkg.scripts.installer, 'electron-builder --win nsis');
});
