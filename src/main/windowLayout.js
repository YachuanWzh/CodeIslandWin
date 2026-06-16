'use strict';

// Pure window-sizing helper, kept dependency-free so it is unit-testable without
// Electron. Clamps the renderer's requested content height to what fits on screen:
// never below `min`, never taller than `available - topMargin` (so the island
// can't push its content off the bottom of the display — the panel scrolls
// internally instead).
function clampWindowHeight(requested, available, { min = 1, topMargin = 0 } = {}) {
  const ceiling = Math.max(min, available - topMargin);
  const bounded = Math.min(Math.max(requested, min), ceiling);
  return Math.round(bounded);
}

module.exports = { clampWindowHeight };
