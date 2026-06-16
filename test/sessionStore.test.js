const { test } = require('node:test');
const assert = require('node:assert');
const { reduceEvent } = require('../src/core/sessionStore');
const { parseHookEvent } = require('../src/core/hookEvent');

function ev(obj) {
  return parseHookEvent(Buffer.from(JSON.stringify(obj)));
}

test('SessionStart creates a fresh idle session with metadata', () => {
  const sessions = {};
  reduceEvent(sessions, ev({ hook_event_name: 'SessionStart', session_id: 's1', _source: 'claude', cwd: 'C:/proj', model: 'claude-opus-4-8' }));
  assert.ok(sessions.s1);
  assert.strictEqual(sessions.s1.status, 'idle');
  assert.strictEqual(sessions.s1.source, 'claude');
  assert.strictEqual(sessions.s1.cwd, 'C:/proj');
  assert.strictEqual(sessions.s1.model, 'claude-opus-4-8');
});

test('UserPromptSubmit moves to processing and records the prompt', () => {
  const sessions = {};
  reduceEvent(sessions, ev({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'fix the bug' }));
  assert.strictEqual(sessions.s1.status, 'processing');
  assert.strictEqual(sessions.s1.lastUserPrompt, 'fix the bug');
  assert.deepStrictEqual(sessions.s1.recentMessages.at(-1), { isUser: true, text: 'fix the bug' });
});

test('PreToolUse moves to running with current tool + description', () => {
  const sessions = {};
  reduceEvent(sessions, ev({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls', description: 'list' } }));
  assert.strictEqual(sessions.s1.status, 'running');
  assert.strictEqual(sessions.s1.currentTool, 'Bash');
  assert.ok(sessions.s1.toolDescription.includes('list'));
});

test('PostToolUse records history (success) and returns to processing', () => {
  const sessions = {};
  reduceEvent(sessions, ev({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Read', tool_input: { file_path: '/a/b.js' } }));
  reduceEvent(sessions, ev({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Read' }));
  assert.strictEqual(sessions.s1.status, 'processing');
  assert.strictEqual(sessions.s1.currentTool, null);
  assert.strictEqual(sessions.s1.history.length, 1);
  assert.strictEqual(sessions.s1.history[0].tool, 'Read');
  assert.strictEqual(sessions.s1.history[0].success, true);
});

test('PostToolUseFailure records a failed history entry', () => {
  const sessions = {};
  reduceEvent(sessions, ev({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'boom' } }));
  reduceEvent(sessions, ev({ hook_event_name: 'PostToolUseFailure', session_id: 's1', tool_name: 'Bash' }));
  assert.strictEqual(sessions.s1.history.at(-1).success, false);
});

test('Stop sets idle, captures assistant message, emits enqueueCompletion', () => {
  const sessions = {};
  const { effects } = reduceEvent(sessions, ev({ hook_event_name: 'Stop', session_id: 's1', last_assistant_message: 'done!' }));
  assert.strictEqual(sessions.s1.status, 'idle');
  assert.strictEqual(sessions.s1.lastAssistantMessage, 'done!');
  assert.ok(effects.some(e => e.type === 'enqueueCompletion' && e.sessionId === 's1'));
});

test('SessionEnd emits removeSession effect', () => {
  const sessions = { s1: { status: 'idle' } };
  const { effects } = reduceEvent(sessions, ev({ hook_event_name: 'SessionEnd', session_id: 's1' }));
  assert.ok(effects.some(e => e.type === 'removeSession' && e.sessionId === 's1'));
});

test('every event emits a playSound effect carrying the normalized name', () => {
  const sessions = {};
  const { effects } = reduceEvent(sessions, ev({ hook_event_name: 'pre_tool_use', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'x' } }));
  assert.ok(effects.some(e => e.type === 'playSound' && e.event === 'PreToolUse'));
});

test('waiting status is preserved against activity events', () => {
  const sessions = { s1: { status: 'waitingApproval', currentTool: 'Bash', history: [], recentMessages: [] } };
  reduceEvent(sessions, ev({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Read', tool_input: { file_path: '/x.js' } }));
  assert.strictEqual(sessions.s1.status, 'waitingApproval');
});
