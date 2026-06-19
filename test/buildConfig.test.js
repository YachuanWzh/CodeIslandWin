'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

// Guards the packaging contract the user asked for: a single double-clickable
// portable CodeIsland.exe that lands in release/ (kept out of git).
test('build produces a single portable target', () => {
  assert.deepEqual(pkg.build.win.target, ['portable']);
});

test('portable artifact is named CodeIsland.exe', () => {
  assert.equal(pkg.build.portable.artifactName, 'CodeIsland.exe');
});

test('build output goes to release/', () => {
  assert.equal(pkg.build.directories.output, 'release');
});

test('there is a convenience script to build the exe', () => {
  assert.equal(pkg.scripts.exe, 'electron-builder --win portable');
});
