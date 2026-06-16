const { test } = require('node:test');
const assert = require('node:assert');
const { createAppState } = require('../src/main/appState');
const { parseHookEvent } = require('../src/core/hookEvent');

const ev = (o) => parseHookEvent(Buffer.from(JSON.stringify(o)));

test('handleEvent updates the session snapshot and notifies subscribers', () => {
  const app = createAppState();
  let notified = 0;
  app.subscribe(() => { notified++; });
  app.handleEvent(ev({ hook_event_name: 'SessionStart', session_id: 's1', _source: 'claude', cwd: 'C:/p' }));
  app.handleEvent(ev({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls' } }));
  assert.strictEqual(app.snapshot().sessions.s1.status, 'running');
  assert.ok(notified >= 2);
});

test('SessionEnd removes the session via the removeSession effect', () => {
  const app = createAppState();
  app.handleEvent(ev({ hook_event_name: 'SessionStart', session_id: 's1', _source: 'claude' }));
  app.handleEvent(ev({ hook_event_name: 'SessionEnd', session_id: 's1' }));
  assert.strictEqual(app.snapshot().sessions.s1, undefined);
});

test('requestPermission resolves when the user decides, and clears pending', async () => {
  const app = createAppState();
  const p = app.requestPermission(ev({ hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash', tool_use_id: 'tu1' }));
  // Session is now waiting for approval and a pending entry exists.
  assert.strictEqual(app.snapshot().sessions.s1.status, 'waitingApproval');
  const pending = app.listPending();
  assert.strictEqual(pending.length, 1);
  // User clicks allow.
  app.resolvePermission(pending[0].key, 'allow');
  assert.strictEqual(await p, 'allow');
  assert.strictEqual(app.listPending().length, 0);
});

test('resolvePermission moves the session out of the waiting state', async () => {
  const app = createAppState();
  const p = app.requestPermission(ev({ hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Write', tool_use_id: 'tu2' }));
  const { key } = app.listPending()[0];
  app.resolvePermission(key, 'deny');
  await p;
  assert.notStrictEqual(app.snapshot().sessions.s1.status, 'waitingApproval');
});
