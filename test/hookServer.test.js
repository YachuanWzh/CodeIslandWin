const { test } = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { createHookServer, routeKind } = require('../src/server/hookServer');

function uniquePipe() {
  return `\\\\.\\pipe\\codeisland-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
}

// Send one newline-framed JSON payload over the pipe, collect the response.
function sendOverPipe(pipe, obj) {
  return new Promise((resolve, reject) => {
    const payload = typeof obj === 'string' ? obj : JSON.stringify(obj);
    const c = net.connect(pipe, () => {
      c.write(payload + '\n');
    });
    const chunks = [];
    c.on('data', (d) => chunks.push(d));
    c.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
    c.on('error', reject);
  });
}

test('routes a plain event to onEvent and replies {}', async () => {
  const pipe = uniquePipe();
  let received = null;
  const server = createHookServer({
    pipe,
    onEvent: (e) => { received = e; },
    onPermission: async () => 'allow',
    onQuestion: async () => null,
  });
  await server.start();
  try {
    const resp = await sendOverPipe(pipe, { hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'ls' } });
    assert.strictEqual(resp, '{}');
    assert.ok(received);
    assert.strictEqual(received.eventName, 'PreToolUse');
  } finally {
    await server.stop();
  }
});

test('permission request blocks, then replies with the resolved decision', async () => {
  const pipe = uniquePipe();
  const server = createHookServer({
    pipe,
    onEvent: () => {},
    onPermission: async (e) => (e.toolName === 'Bash' ? 'deny' : 'allow'),
    onQuestion: async () => null,
  });
  await server.start();
  try {
    const resp = await sendOverPipe(pipe, { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash', tool_use_id: 'tu1' });
    const parsed = JSON.parse(resp);
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PermissionRequest');
    assert.strictEqual(parsed.hookSpecificOutput.decision.behavior, 'deny');
  } finally {
    await server.stop();
  }
});

test('permission resolution can be deferred until a later user action', async () => {
  const pipe = uniquePipe();
  let resolveDecision;
  const server = createHookServer({
    pipe,
    onEvent: () => {},
    onPermission: () => new Promise((res) => { resolveDecision = res; }),
    onQuestion: async () => null,
  });
  await server.start();
  try {
    const respPromise = sendOverPipe(pipe, { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Write', tool_use_id: 'tu2' });
    // Simulate the user clicking "allow" 50ms later.
    setTimeout(() => resolveDecision('allow'), 50);
    const parsed = JSON.parse(await respPromise);
    assert.strictEqual(parsed.hookSpecificOutput.decision.behavior, 'allow');
  } finally {
    await server.stop();
  }
});

test('allowAll resolves to allow plus a session addRules rule for the tool', async () => {
  const pipe = uniquePipe();
  const server = createHookServer({
    pipe,
    onEvent: () => {},
    onPermission: async () => 'allowAll',
    onQuestion: async () => null,
  });
  await server.start();
  try {
    const resp = await sendOverPipe(pipe, { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash', tool_use_id: 'tu1' });
    const decision = JSON.parse(resp).hookSpecificOutput.decision;
    assert.strictEqual(decision.behavior, 'allow');
    const update = decision.updatedPermissions[0];
    assert.strictEqual(update.type, 'addRules');
    assert.strictEqual(update.behavior, 'allow');
    assert.strictEqual(update.destination, 'session');
    assert.deepStrictEqual(update.rules, [{ toolName: 'Bash', ruleContent: '*' }]);
  } finally {
    await server.stop();
  }
});

test('allowAll for an MCP tool omits ruleContent (bare tool name only)', async () => {
  const pipe = uniquePipe();
  const server = createHookServer({
    pipe,
    onEvent: () => {},
    onPermission: async () => 'allowAll',
    onQuestion: async () => null,
  });
  await server.start();
  try {
    const resp = await sendOverPipe(pipe, { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'mcp__github__create_issue', tool_use_id: 'tu1' });
    const decision = JSON.parse(resp).hookSpecificOutput.decision;
    assert.strictEqual(decision.behavior, 'allow');
    assert.deepStrictEqual(decision.updatedPermissions[0].rules, [{ toolName: 'mcp__github__create_issue' }]);
  } finally {
    await server.stop();
  }
});

test('routeKind classifies an AskUserQuestion permission request as askUserQuestion', () => {
  const askEvent = { eventName: 'PermissionRequest', toolName: 'AskUserQuestion', rawJSON: {} };
  assert.strictEqual(routeKind(askEvent), 'askUserQuestion');
  const permEvent = { eventName: 'PermissionRequest', toolName: 'Bash', rawJSON: {} };
  assert.strictEqual(routeKind(permEvent), 'permission');
});

test('AskUserQuestion request is routed to onAskUserQuestion and its object is written back', async () => {
  const pipe = uniquePipe();
  let seen = null;
  const server = createHookServer({
    pipe,
    onEvent: () => {},
    onPermission: async () => 'allow',
    onQuestion: async () => null,
    onAskUserQuestion: async (e) => {
      seen = e;
      return {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: { behavior: 'allow', updatedInput: { answers: { Q: 'A' } } },
        },
      };
    },
  });
  await server.start();
  try {
    const resp = await sendOverPipe(pipe, {
      hook_event_name: 'PermissionRequest',
      session_id: 's1',
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ question: 'Q', options: [{ label: 'A' }] }] },
    });
    const parsed = JSON.parse(resp);
    assert.strictEqual(seen.toolName, 'AskUserQuestion');
    assert.strictEqual(parsed.hookSpecificOutput.decision.behavior, 'allow');
    assert.deepStrictEqual(parsed.hookSpecificOutput.decision.updatedInput.answers, { Q: 'A' });
  } finally {
    await server.stop();
  }
});

test('malformed payload replies with a parse error and does not crash', async () => {
  const pipe = uniquePipe();
  const server = createHookServer({ pipe, onEvent: () => {}, onPermission: async () => 'allow', onQuestion: async () => null });
  await server.start();
  try {
    const resp = await sendOverPipe(pipe, 'definitely not json formatted as object so parse fails');
    // string JSON encodes to a quoted string -> parseHookEvent returns null -> error reply
    const parsed = JSON.parse(resp);
    assert.ok(parsed.error);
  } finally {
    await server.stop();
  }
});
