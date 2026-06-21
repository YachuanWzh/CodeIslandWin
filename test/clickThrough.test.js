const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');

// A transparent Electron window still swallows clicks on every pixel, so the
// fixed-width island would block the mostly-empty area around the pill. The
// window is made click-through everywhere and only re-armed where the cursor is
// actually over visible content (pill / panel). This is OS/DOM behavior we can't
// drive headlessly, so guard the wiring contract via source assertions (same
// approach as dragReset.test / islandCss.test).

test('preload exposes a setIgnoreMouse bridge', () => {
  const preload = read('main', 'preload.js');
  assert.match(preload, /setIgnoreMouse\s*:/, 'preload must expose setIgnoreMouse');
  assert.match(
    preload,
    /ipcRenderer\.send\(\s*['"]set-ignore-mouse['"]/,
    'setIgnoreMouse must send the set-ignore-mouse channel',
  );
});

test('main enables forwarding click-through when the window is created', () => {
  const main = read('main', 'main.js');
  // forward:true keeps move events flowing so the renderer can detect re-entry
  // over the pill and re-arm the window.
  assert.match(
    main,
    /setIgnoreMouseEvents\([^)]*forward\s*:\s*true/,
    'main must enable mouse-event forwarding on the window',
  );
});

test('main handles set-ignore-mouse and toggles the window', () => {
  const main = read('main', 'main.js');
  assert.match(
    main,
    /ipcMain\.on\(\s*['"]set-ignore-mouse['"]/,
    'main must handle the set-ignore-mouse channel',
  );
});

test('the renderer hit-tests the cursor and toggles passthrough', () => {
  const island = read('renderer', 'island.js');
  // Hit-test the element under the cursor and only stay interactive over content.
  assert.match(island, /elementFromPoint\(/, 'renderer must hit-test with elementFromPoint');
  assert.match(island, /setIgnoreMouse\(/, 'renderer must toggle passthrough via setIgnoreMouse');
  // While dragging the window must stay interactive so the drag isn't dropped.
  assert.match(island, /dragStart/, 'passthrough must account for an in-progress drag');
});

test('the renderer reserves room for the drop shadow so it is not clipped', () => {
  const island = read('renderer', 'island.js');
  // body{overflow:hidden} clips a shadow that reaches past the window edge, which
  // is the "weird" hard line at the bottom. The resize must add a shadow pad.
  assert.match(island, /SHADOW_PAD/, 'resize must reserve a named shadow pad');
});
