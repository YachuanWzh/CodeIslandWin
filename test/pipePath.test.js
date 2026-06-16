const { test } = require('node:test');
const assert = require('node:assert');
const { pipePath } = require('../src/core/pipePath');

test('returns a Windows named-pipe path under \\\\.\\pipe\\', () => {
  const p = pipePath({ USERNAME: 'alice' });
  assert.ok(p.startsWith('\\\\.\\pipe\\codeisland-'), p);
  assert.ok(p.endsWith('alice'), p);
});

test('is deterministic for the same user', () => {
  assert.strictEqual(pipePath({ USERNAME: 'bob' }), pipePath({ USERNAME: 'bob' }));
});

test('honors CODEISLAND_PIPE override', () => {
  assert.strictEqual(pipePath({ CODEISLAND_PIPE: '\\\\.\\pipe\\custom' }), '\\\\.\\pipe\\custom');
});

test('falls back to a default when no username is present', () => {
  const p = pipePath({});
  assert.ok(p.startsWith('\\\\.\\pipe\\codeisland-'), p);
});
