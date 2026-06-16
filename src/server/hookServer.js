'use strict';

const net = require('node:net');
const { parseHookEvent } = require('../core/hookEvent');
const { normalize } = require('../core/eventNormalizer');
const { pipePath } = require('../core/pipePath');

const MAX_PAYLOAD = 1024 * 1024; // 1MB, matches macOS HookServer.

function permissionResponse(behavior) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior },
    },
  });
}

function routeKind(event) {
  const name = normalize(event.eventName);
  if (name === 'PermissionRequest') return 'permission';
  if (name === 'Notification' && typeof event.rawJSON.question === 'string') return 'question';
  return 'event';
}

// Named-pipe server that mirrors macOS HookServer: receives a hook event,
// routes it, and for blocking events (permission/question) holds the
// connection open until the handler resolves a decision, then writes the
// JSON response back to the bridge.
//
// onEvent(event)            -> void           (fire-and-forget UI update)
// onPermission(event)       -> Promise<'allow'|'deny'>
// onQuestion(event)         -> Promise<object|null>  (raw hook response object, or null to skip)
function createHookServer({ pipe = pipePath(), onEvent, onPermission, onQuestion } = {}) {
  // Windows named pipes do not support TCP-style half-close, so we frame the
  // request with a trailing newline instead of relying on the peer's FIN: the
  // bridge writes `JSON\n` and waits, we read up to the newline, then reply and
  // fully close. JSON.stringify never emits a literal newline, so `\n` is a
  // safe delimiter.
  const server = net.createServer();

  server.on('connection', (socket) => {
    let buf = '';
    let handled = false;

    socket.on('error', () => { /* ignore: broken pipe on a flaky bridge must not crash */ });

    socket.on('data', (chunk) => {
      if (handled) return;
      buf += chunk.toString('utf8');
      if (buf.length > MAX_PAYLOAD) {
        handled = true;
        socket.destroy();
        return;
      }
      const nl = buf.indexOf('\n');
      if (nl === -1) return; // wait for the full line
      handled = true;
      processMessage(socket, buf.slice(0, nl));
    });
  });

  async function processMessage(socket, line) {
    const event = parseHookEvent(Buffer.from(line, 'utf8'));
    if (!event) {
      safeEnd(socket, JSON.stringify({ error: 'parse_failed' }));
      return;
    }
    try {
      switch (routeKind(event)) {
        case 'permission': {
          const behavior = (await onPermission(event)) === 'deny' ? 'deny' : 'allow';
          safeEnd(socket, permissionResponse(behavior));
          break;
        }
        case 'question': {
          const answer = await onQuestion(event);
          safeEnd(socket, answer ? JSON.stringify(answer) : '{}');
          break;
        }
        default:
          onEvent(event);
          safeEnd(socket, '{}');
      }
    } catch (err) {
      safeEnd(socket, '{}');
    }
  }

  function safeEnd(socket, payload) {
    try { socket.end(payload); } catch { /* socket already gone */ }
  }

  return {
    pipe,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(pipe, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
    },
    stop() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { createHookServer, permissionResponse, routeKind };
