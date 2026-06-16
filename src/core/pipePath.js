'use strict';

// Windows named-pipe address used between the bridge and the app, replacing
// the macOS Unix socket (/tmp/codeisland-<uid>.sock). Per-user so multiple
// users on one machine don't collide. Override with CODEISLAND_PIPE.
function pipePath(env = process.env) {
  if (env.CODEISLAND_PIPE && env.CODEISLAND_PIPE.trim()) {
    return env.CODEISLAND_PIPE.trim();
  }
  const user = (env.USERNAME || env.USER || 'default').trim() || 'default';
  return `\\\\.\\pipe\\codeisland-${user}`;
}

module.exports = { pipePath };
