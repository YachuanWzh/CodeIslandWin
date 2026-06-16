const { test } = require('node:test');
const assert = require('node:assert');
const pkg = require('../package.json');

test('an npm script builds a distributable', () => {
  assert.ok(pkg.scripts && typeof pkg.scripts.dist === 'string', 'needs a "dist" script');
  assert.match(pkg.scripts.dist, /electron-builder/, 'dist should invoke electron-builder');
});

test('electron-builder is a declared devDependency', () => {
  assert.ok(pkg.devDependencies && pkg.devDependencies['electron-builder'], 'electron-builder must be a devDependency');
});

test('build config targets Windows with an appId', () => {
  assert.ok(pkg.build && typeof pkg.build === 'object', 'needs a "build" block');
  assert.ok(typeof pkg.build.appId === 'string' && pkg.build.appId.length > 0, 'build.appId required');
  assert.ok(pkg.build.win && Array.isArray(pkg.build.win.target), 'build.win.target must list Windows targets');
  assert.ok(pkg.build.win.target.length > 0, 'at least one Windows target');
});

test('packaged files include the app source and assets', () => {
  assert.ok(Array.isArray(pkg.build.files), 'build.files should be declared');
  assert.ok(pkg.build.files.some((f) => f.includes('src')), 'src must be packaged');
});
