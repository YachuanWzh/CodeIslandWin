const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createAppState } = require('../src/main/appState');
const { createHookServer } = require('../src/server/hookServer');

const BRIDGE = path.join(__dirname, '..', 'src', 'bridge', 'bridge.js');

function uniquePipe() {
  return `\\\\.\\pipe\\codeisland-itest-${process.pid}-${Math.random().toString(36).slice(2)}`;
}

function runBridge(pipe, stdinObj) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BRIDGE, '--source', 'claude'], { env: { ...process.env, CODEISLAND_PIPE: pipe } });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify(stdinObj));
  });
}

// Wire the exact runtime composition used by main.js (minus Electron) and drive
// it with the real bridge process.
function wire() {
  const pipe = uniquePipe();
  const appState = createAppState();
  const server = createHookServer({
    pipe,
    onEvent: (e) => appState.handleEvent(e),
    onPermission: (e) => appState.requestPermission(e),
    onQuestion: async (e) => { await appState.requestQuestion(e); return null; },
    onAskUserQuestion: (e) => appState.requestAskUserQuestion(e),
  });
  return { pipe, appState, server };
}

test('end-to-end: a SessionStart + PreToolUse from the bridge updates app state', async () => {
  const { pipe, appState, server } = wire();
  await server.start();
  try {
    await runBridge(pipe, { hook_event_name: 'SessionStart', session_id: 's1', cwd: 'C:/proj' });
    await runBridge(pipe, { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls', description: 'list' } });
    const s = appState.snapshot().sessions.s1;
    assert.ok(s, 'session should exist');
    assert.strictEqual(s.status, 'running');
    assert.strictEqual(s.currentTool, 'Bash');
    assert.strictEqual(s.cwd, 'C:/proj');
  } finally {
    await server.stop();
  }
});

test('end-to-end: a permission request blocks until the UI decides, decision reaches the bridge', async () => {
  const { pipe, appState, server } = wire();
  await server.start();
  try {
    const bridgeDone = runBridge(pipe, { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash', tool_use_id: 'tu1' });
    // Poll until the pending request shows up, then approve it (simulating a click).
    await new Promise((resolve) => {
      const iv = setInterval(() => {
        const pending = appState.listPending();
        if (pending.length === 1) { clearInterval(iv); appState.resolvePermission(pending[0].key, 'allow'); resolve(); }
      }, 10);
    });
    const { stdout } = await bridgeDone;
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.hookSpecificOutput.decision.behavior, 'allow');
  } finally {
    await server.stop();
  }
});

test('end-to-end: an AskUserQuestion blocks until the user answers, answer reaches the bridge', async () => {
  const { pipe, appState, server } = wire();
  await server.start();
  try {
    const bridgeDone = runBridge(pipe, {
      hook_event_name: 'PermissionRequest',
      session_id: 's1',
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ question: 'Pick a color', options: [{ label: 'Red' }, { label: 'Blue' }] }] },
    });
    // Poll until the question is pending, then answer it (simulating a click).
    await new Promise((resolve) => {
      const iv = setInterval(() => {
        const pending = appState.listPending();
        if (pending.length === 1 && pending[0].kind === 'askUserQuestion') {
          clearInterval(iv);
          appState.resolveAskUserQuestion(pending[0].key, { 'Pick a color': 'Blue' });
          resolve();
        }
      }, 10);
    });
    const { stdout } = await bridgeDone;
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.hookSpecificOutput.decision.behavior, 'allow');
    assert.deepStrictEqual(parsed.hookSpecificOutput.decision.updatedInput.answers, { 'Pick a color': 'Blue' });
  } finally {
    await server.stop();
  }
});
