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
  assert.match(body, /max-height:/, 'panel must have a max-height to scroll within');
});

test('row-desc no longer hard-clips long command text', () => {
  const body = ruleBody('.row-desc {');
  assert.doesNotMatch(body, /overflow:\s*hidden/, 'row-desc must not clip with overflow:hidden');
  assert.match(body, /overflow-y:\s*auto/, 'row-desc should scroll when long');
});
