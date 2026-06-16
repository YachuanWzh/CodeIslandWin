const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'island.css'), 'utf8');

// Extract the body of a CSS rule by its selector, so assertions target one block.
function ruleBody(selector) {
  const start = css.indexOf(selector);
  assert.notStrictEqual(start, -1, `selector ${selector} not found`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

test('the panel scrolls internally instead of clipping overflow', () => {
  const body = ruleBody('.panel {');
  assert.match(body, /overflow-y:\s*auto/, 'panel must scroll vertically');
  // The panel must fill the remaining window via flex (min-height:0 lets a flex
  // item shrink below content so overflow scrolls) rather than capping itself to
  // 100vh — a 100vh cap feeds back into the content-driven window resize and
  // collapses the island to nothing.
  assert.match(body, /min-height:\s*0/, 'panel must allow flex shrink to scroll');
  assert.doesNotMatch(body, /100vh/, 'panel must not cap to viewport height (feedback loop)');
});

test('scrollable areas hide the scrollbar but stay scrollable', () => {
  // The panel/row-desc still scroll (overflow-y:auto asserted elsewhere); the
  // scrollbar chrome itself is hidden for a cleaner island.
  const bar = ruleBody('::-webkit-scrollbar {');
  assert.match(bar, /display:\s*none/, 'webkit scrollbar must be hidden');
});

test('row-desc no longer hard-clips long command text', () => {
  const body = ruleBody('.row-desc {');
  assert.doesNotMatch(body, /overflow:\s*hidden/, 'row-desc must not clip with overflow:hidden');
  assert.match(body, /overflow-y:\s*auto/, 'row-desc should scroll when long');
});
