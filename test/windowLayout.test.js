const { test } = require('node:test');
const assert = require('node:assert');
const { clampWindowHeight, computeWindowBounds } = require('../src/main/windowLayout');

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

const WORK = { x: 0, y: 0, width: 1920, height: 1080 };

test('computeWindowBounds centers at the top when no user position is set', () => {
  const b = computeWindowBounds(56, { workArea: WORK, width: 420, topMargin: 6, min: 1 });
  assert.deepStrictEqual(b, { x: 750, y: 6, width: 420, height: 56 });
});

test('computeWindowBounds honors the user-dragged position instead of centering', () => {
  const b = computeWindowBounds(56, {
    workArea: WORK, width: 420, topMargin: 6, min: 1,
    userPosition: { x: 1300, y: 400 },
  });
  assert.deepStrictEqual(b, { x: 1300, y: 400, width: 420, height: 56 });
});

test('computeWindowBounds still clamps height to the screen even when dragged', () => {
  const b = computeWindowBounds(5000, {
    workArea: WORK, width: 420, topMargin: 6, min: 1,
    userPosition: { x: 100, y: 200 },
  });
  assert.strictEqual(b.height, 1074); // 1080 - topMargin 6
  assert.strictEqual(b.x, 100);
  assert.strictEqual(b.y, 200);
});

test('computeWindowBounds offsets the centered x by the work area origin', () => {
  const b = computeWindowBounds(56, {
    workArea: { x: 1920, y: 0, width: 1920, height: 1080 }, width: 420, topMargin: 6, min: 1,
  });
  assert.strictEqual(b.x, 2670); // 1920 + (1920 - 420)/2
});
