const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHookServer } = require('../src/server/hookServer');

const BRIDGE = path.join(__dirname, '..', 'src', 'bridge', 'bridge.js');

function uniquePipe() {
  return `\\\\.\\pipe\\codeisland-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
}

// Run the bridge as a child process with the given stdin and CODEISLAND_PIPE.
function runBridge(pipe, stdinObj, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BRIDGE, ...args], {
      env: { ...process.env, CODEISLAND_PIPE: pipe },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(JSON.stringify(stdinObj));
    child.stdin.end();
  });
}

test('forwards a non-blocking event to the server and prints nothing', async () => {
  const pipe = uniquePipe();
  let received = null;
  const server = createHookServer({ pipe, onEvent: (e) => { received = e; }, onPermission: async () => 'allow', onQuestion: async () => null });
  await server.start();
  try {
    const { code, stdout } = await runBridge(pipe, { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls' } }, ['--source', 'claude']);
    assert.strictEqual(code, 0);
    assert.strictEqual(stdout.trim(), '');
    assert.ok(received, 'server should have received the event');
    assert.strictEqual(received.eventName, 'PreToolUse');
    assert.strictEqual(received.rawJSON._source, 'claude');
  } finally {
    await server.stop();
  }
});

test('relays a blocking permission decision to stdout', async () => {
  const pipe = uniquePipe();
  const server = createHookServer({ pipe, onEvent: () => {}, onPermission: async () => 'deny', onQuestion: async () => null });
  await server.start();
  try {
    const { code, stdout } = await runBridge(pipe, { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash', tool_use_id: 'tu1' }, ['--source', 'claude']);
    assert.strictEqual(code, 0);
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.hookSpecificOutput.decision.behavior, 'deny');
  } finally {
    await server.stop();
  }
});

test('exits cleanly when no server is listening', async () => {
  const pipe = uniquePipe(); // nothing listening
  const { code, stdout } = await runBridge(pipe, { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash' }, ['--source', 'claude']);
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('exits cleanly on empty / invalid stdin', async () => {
  const pipe = uniquePipe();
  const { code } = await runBridge(pipe, '', ['--source', 'claude']);
  assert.strictEqual(code, 0);
});
