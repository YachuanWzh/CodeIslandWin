const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');

// Double-clicking the pill must recenter the island. The actual drag/click is an
// OS/DOM behavior we can't drive headlessly, so guard the wiring contract across
// the three glue layers via source assertions (same approach as islandCss.test).

test('preload exposes a resetPosition bridge that sends reset-position', () => {
  const preload = read('main', 'preload.js');
  assert.match(preload, /resetPosition\s*:/, 'preload must expose resetPosition');
  assert.match(preload, /ipcRenderer\.send\(\s*['"]reset-position['"]/, 'resetPosition must send the reset-position channel');
});

test('the renderer recenters the island on a double-click of the pill', () => {
  const island = read('renderer', 'island.js');
  assert.match(island, /pillEl\.addEventListener\(\s*['"]dblclick['"]/, 'pill must listen for dblclick');
  assert.match(island, /resetPosition\(\)/, 'dblclick must call resetPosition');
});

test('main clears the dragged position and recenters on reset-position', () => {
  const main = read('main', 'main.js');
  assert.match(main, /ipcMain\.on\(\s*['"]reset-position['"]/, 'main must handle reset-position');
  // The handler must drop the remembered drag position so positionWindow centers.
  assert.match(main, /userPosition\s*=\s*null/, 'reset must clear userPosition');
});
