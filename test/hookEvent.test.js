const { test } = require('node:test');
const assert = require('node:assert');
const { parseHookEvent } = require('../src/core/hookEvent');

function buf(obj) {
  return Buffer.from(JSON.stringify(obj));
}

test('returns null on non-JSON or missing event name', () => {
  assert.strictEqual(parseHookEvent(Buffer.from('not json')), null);
  assert.strictEqual(parseHookEvent(buf({ session_id: 'x' })), null);
  assert.strictEqual(parseHookEvent(Buffer.from('')), null);
});

test('extracts core fields from a Claude PreToolUse event', () => {
  const e = parseHookEvent(buf({
    hook_event_name: 'PreToolUse',
    session_id: 'abc',
    tool_name: 'Bash',
    tool_use_id: 'tu_1',
    tool_input: { command: 'ls -la', description: 'List files' },
  }));
  assert.strictEqual(e.eventName, 'PreToolUse');
  assert.strictEqual(e.sessionId, 'abc');
  assert.strictEqual(e.toolName, 'Bash');
  assert.strictEqual(e.toolUseId, 'tu_1');
  assert.deepStrictEqual(e.toolInput, { command: 'ls -la', description: 'List files' });
  assert.ok(e.rawJSON);
});

test('accepts camelCase aliases for event/session/tool', () => {
  const e = parseHookEvent(buf({ hookEventName: 'PostToolUse', sessionId: 's2', toolName: 'Read' }));
  assert.strictEqual(e.eventName, 'PostToolUse');
  assert.strictEqual(e.sessionId, 's2');
  assert.strictEqual(e.toolName, 'Read');
});

test('toolDescription summarizes common tools', () => {
  const bash = parseHookEvent(buf({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run tests' } }));
  assert.ok(bash.toolDescription.includes('Run tests'));

  const read = parseHookEvent(buf({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Read', tool_input: { file_path: 'C:/a/b/main.js' } }));
  assert.strictEqual(read.toolDescription, 'main.js');

  const edit = parseHookEvent(buf({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Edit', tool_input: { file_path: '/x/y/app.ts' } }));
  assert.strictEqual(edit.toolDescription, 'app.ts');
});

test('falls back to message-like top-level fields for description', () => {
  const e = parseHookEvent(buf({ hook_event_name: 'Notification', session_id: 's', message: 'Waiting for input' }));
  assert.strictEqual(e.toolDescription, 'Waiting for input');
});
