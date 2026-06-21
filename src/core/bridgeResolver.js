'use strict';

const path = require('node:path');

// Resolve the on-disk path to bridge.js from the main process directory
// (__dirname of src/main).
//
// When packaged, src/main lives inside app.asar, which the Claude Code hook's
// plain `node` cannot read. bridge.js and its core deps are unpacked via
// electron-builder's `asarUnpack`, landing in app.asar.unpacked as real files,
// so redirect the path from app.asar to app.asar.unpacked. In dev there is no
// app.asar segment and the path is returned unchanged.
function resolveBridgePath(mainDir) {
  const bridge = path.join(mainDir, '..', 'bridge', 'bridge.js');
  const packed = `app.asar${path.sep}`;
  const unpacked = `app.asar.unpacked${path.sep}`;
  return bridge.includes(packed) ? bridge.replace(packed, unpacked) : bridge;
}

module.exports = { resolveBridgePath };
