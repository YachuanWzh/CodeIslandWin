const { test } = require('node:test');
const assert = require('node:assert');

test('test harness runs', () => {
  assert.strictEqual(1 + 1, 2);
});
