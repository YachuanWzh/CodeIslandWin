'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { resolveBridgePath } = require('../src/core/bridgeResolver');

// In dev the main process runs from the source tree, so bridge.js is a real
// sibling file and the path needs no rewriting.
test('dev path (no asar) resolves to the sibling bridge.js unchanged', () => {
  const mainDir = ['C:', 'proj', 'src', 'main'].join(path.sep);
  const expected = ['C:', 'proj', 'src', 'bridge', 'bridge.js'].join(path.sep);
  assert.strictEqual(resolveBridgePath(mainDir), expected);
});

// When packaged, src/main lives inside app.asar, which plain `node` (used by the
// Claude Code hook) cannot read. bridge.js is unpacked via asarUnpack, so the
// resolved path must point into app.asar.unpacked, never inside the archive.
test('packaged path redirects app.asar to app.asar.unpacked so plain node can read it', () => {
  const mainDir = ['C:', 'app', 'resources', 'app.asar', 'src', 'main'].join(path.sep);
  const expected = ['C:', 'app', 'resources', 'app.asar.unpacked', 'src', 'bridge', 'bridge.js'].join(path.sep);
  const got = resolveBridgePath(mainDir);
  assert.strictEqual(got, expected);
  assert.ok(!got.includes(`app.asar${path.sep}src`), 'must not point inside the asar archive');
});
