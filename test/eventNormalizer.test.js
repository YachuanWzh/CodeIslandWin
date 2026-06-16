const { test } = require('node:test');
const assert = require('node:assert');
const { normalize } = require('../src/core/eventNormalizer');

test('Claude PascalCase names pass through unchanged', () => {
  for (const name of ['PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'SessionStart', 'SessionEnd', 'Notification', 'UserPromptSubmit']) {
    assert.strictEqual(normalize(name), name);
  }
});

test('snake_case aliases map to PascalCase', () => {
  assert.strictEqual(normalize('pre_tool_use'), 'PreToolUse');
  assert.strictEqual(normalize('post_tool_use'), 'PostToolUse');
  assert.strictEqual(normalize('permission_request'), 'PermissionRequest');
  assert.strictEqual(normalize('session_start'), 'SessionStart');
});

test('camelCase aliases map to PascalCase', () => {
  assert.strictEqual(normalize('preToolUse'), 'PreToolUse');
  assert.strictEqual(normalize('sessionStart'), 'SessionStart');
  assert.strictEqual(normalize('userPromptSubmitted'), 'UserPromptSubmit');
});

test('unknown names are returned as-is', () => {
  assert.strictEqual(normalize('SomethingWeird'), 'SomethingWeird');
});
