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

test('resolvePermission passes the allowAll decision through to the hook server', async () => {
  const app = createAppState();
  const p = app.requestPermission(ev({ hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash', tool_use_id: 'tu1' }));
  const { key } = app.listPending()[0];
  app.resolvePermission(key, 'allowAll');
  assert.strictEqual(await p, 'allowAll');
  assert.strictEqual(app.listPending().length, 0);
  assert.notStrictEqual(app.snapshot().sessions.s1.status, 'waitingApproval');
});

test('resolvePermission moves the session out of the waiting state', async () => {
  const app = createAppState();
  const p = app.requestPermission(ev({ hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Write', tool_use_id: 'tu2' }));
  const { key } = app.listPending()[0];
  app.resolvePermission(key, 'deny');
  await p;
  assert.notStrictEqual(app.snapshot().sessions.s1.status, 'waitingApproval');
});

const askEv = (questions) => ev({
  hook_event_name: 'PermissionRequest',
  session_id: 's1',
  tool_name: 'AskUserQuestion',
  tool_input: { questions },
});

test('requestAskUserQuestion sets waitingQuestion and exposes the parsed questions', () => {
  const app = createAppState();
  app.requestAskUserQuestion(askEv([
    { question: 'Pick a color', header: 'Color', options: [{ label: 'Red' }, { label: 'Blue' }] },
  ]));
  assert.strictEqual(app.snapshot().sessions.s1.status, 'waitingQuestion');
  const pending = app.listPending();
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].kind, 'askUserQuestion');
  assert.strictEqual(pending[0].questions.length, 1);
  assert.strictEqual(pending[0].questions[0].question, 'Pick a color');
  assert.deepStrictEqual(pending[0].questions[0].options.map((o) => o.label), ['Red', 'Blue']);
});

test('resolveAskUserQuestion replies with an allow + answers keyed by question text', async () => {
  const app = createAppState();
  const p = app.requestAskUserQuestion(askEv([
    { question: 'Pick a color', options: [{ label: 'Red' }] },
  ]));
  const { key } = app.listPending()[0];
  app.resolveAskUserQuestion(key, { 'Pick a color': 'Red' });
  const resp = await p;
  assert.strictEqual(resp.hookSpecificOutput.decision.behavior, 'allow');
  assert.deepStrictEqual(resp.hookSpecificOutput.decision.updatedInput.answers, { 'Pick a color': 'Red' });
  assert.strictEqual(app.listPending().length, 0);
  assert.notStrictEqual(app.snapshot().sessions.s1.status, 'waitingQuestion');
});

test('skipAskUserQuestion replies with a deny', async () => {
  const app = createAppState();
  const p = app.requestAskUserQuestion(askEv([{ question: 'Pick', options: [{ label: 'A' }] }]));
  const { key } = app.listPending()[0];
  app.skipAskUserQuestion(key);
  const resp = await p;
  assert.strictEqual(resp.hookSpecificOutput.decision.behavior, 'deny');
});

test('requestAskUserQuestion with no questions auto-allows without blocking', async () => {
  const app = createAppState();
  const resp = await app.requestAskUserQuestion(askEv([]));
  assert.strictEqual(resp.hookSpecificOutput.decision.behavior, 'allow');
  assert.strictEqual(app.listPending().length, 0);
});

test('removing a session denies any pending AskUserQuestion', async () => {
  const app = createAppState();
  const p = app.requestAskUserQuestion(askEv([{ question: 'Pick', options: [{ label: 'A' }] }]));
  app.handleEvent(ev({ hook_event_name: 'SessionEnd', session_id: 's1' }));
  const resp = await p;
  assert.strictEqual(resp.hookSpecificOutput.decision.behavior, 'deny');
});
