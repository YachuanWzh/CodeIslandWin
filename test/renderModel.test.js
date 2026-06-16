const { test } = require('node:test');
const assert = require('node:assert');
const { renderModel } = require('../src/renderer/renderModel');

test('empty state collapses with zero rows', () => {
  const m = renderModel({ sessions: {} });
  assert.strictEqual(m.collapsed, true);
  assert.strictEqual(m.rows.length, 0);
  assert.strictEqual(m.count, 0);
});

test('a session needing approval expands the island and is marked pending', () => {
  const m = renderModel({
    sessions: { s1: { status: 'waitingApproval', source: 'claude', currentTool: 'Bash', toolDescription: 'rm -rf', cwd: 'C:/proj', lastActivity: 1 } },
  });
  assert.strictEqual(m.collapsed, false);
  assert.strictEqual(m.rows.length, 1);
  assert.strictEqual(m.rows[0].statusKey, 'waitingApproval');
  assert.strictEqual(m.rows[0].pending, true);
  assert.ok(/approv/i.test(m.rows[0].statusLabel));
});

test('quiet mode: running/processing activity does NOT expand the island', () => {
  const running = renderModel({ sessions: { s1: { status: 'running', currentTool: 'Bash', cwd: 'C:/x', lastActivity: 1 } } });
  assert.strictEqual(running.collapsed, true);
  const processing = renderModel({ sessions: { s1: { status: 'processing', cwd: 'C:/x', lastActivity: 1 } } });
  assert.strictEqual(processing.collapsed, true);
});

test('a session needing input (waitingQuestion) expands the island', () => {
  const m = renderModel({ sessions: { s1: { status: 'waitingQuestion', cwd: 'C:/x', lastActivity: 1 } } });
  assert.strictEqual(m.collapsed, false);
});

test('rows are ordered by status priority (waiting > running > processing > idle)', () => {
  const m = renderModel({
    sessions: {
      a: { status: 'idle', lastActivity: 5, cwd: 'C:/a' },
      b: { status: 'running', currentTool: 'Read', lastActivity: 4, cwd: 'C:/b' },
      c: { status: 'waitingApproval', lastActivity: 3, cwd: 'C:/c' },
      d: { status: 'processing', lastActivity: 2, cwd: 'C:/d' },
    },
  });
  assert.deepStrictEqual(m.rows.map((r) => r.statusKey), ['waitingApproval', 'running', 'processing', 'idle']);
});

test('title is derived from the cwd basename', () => {
  const m = renderModel({ sessions: { s1: { status: 'running', cwd: 'C:/Users/me/my-app', lastActivity: 1 } } });
  assert.strictEqual(m.rows[0].title, 'my-app');
});

test('running status surfaces the current tool', () => {
  const m = renderModel({ sessions: { s1: { status: 'running', currentTool: 'Bash', toolDescription: 'npm test', cwd: 'C:/x', lastActivity: 1 } } });
  assert.ok(m.rows[0].statusLabel.includes('Bash'));
  assert.strictEqual(m.rows[0].toolDescription, 'npm test');
});

test('quiet mode: mascotState stays idle while only background activity is present', () => {
  const m = renderModel({ sessions: { s1: { status: 'running', currentTool: 'Bash', cwd: 'C:/x', lastActivity: 1 } } });
  assert.strictEqual(m.mascotState, 'idle');
});

test('mascotState reflects the top (most urgent) session', () => {
  const m = renderModel({
    sessions: {
      a: { status: 'processing', lastActivity: 9, cwd: 'C:/a' },
      b: { status: 'waitingApproval', lastActivity: 1, cwd: 'C:/b' },
    },
  });
  assert.strictEqual(m.mascotState, 'waiting');
});
