const { test } = require('node:test');
const assert = require('node:assert');
const { clampWindowHeight } = require('../src/main/windowLayout');

test('a requested height below the available space passes through', () => {
  assert.strictEqual(clampWindowHeight(200, 1000, { min: 1, topMargin: 6 }), 200);
});

test('a requested height larger than available is capped to available minus topMargin', () => {
  assert.strictEqual(clampWindowHeight(5000, 1000, { min: 1, topMargin: 6 }), 994);
});

test('a requested height below the minimum floors to the minimum', () => {
  assert.strictEqual(clampWindowHeight(0, 1000, { min: 1, topMargin: 6 }), 1);
});

test('result is always a rounded integer', () => {
  assert.strictEqual(clampWindowHeight(199.6, 1000, { min: 1, topMargin: 6 }), 200);
});

test('defaults: min 1 and topMargin 0 when options omitted', () => {
  assert.strictEqual(clampWindowHeight(50, 1000), 50);
  assert.strictEqual(clampWindowHeight(5000, 1000), 1000);
});
