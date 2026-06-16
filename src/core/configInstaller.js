'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Claude Code events CodeIslandWin hooks into, with per-event timeout (seconds).
// Blocking events (PermissionRequest / Notification questions) get a long
// timeout so the user has time to answer; the rest are fire-and-forget.
const CLAUDE_EVENTS = [
  { name: 'UserPromptSubmit', timeout: 5 },
  { name: 'PreToolUse', timeout: 5 },
  { name: 'PostToolUse', timeout: 5 },
  { name: 'PostToolUseFailure', timeout: 5 },
  { name: 'PermissionRequest', timeout: 86400 },
  { name: 'Stop', timeout: 5 },
  { name: 'SubagentStart', timeout: 5 },
  { name: 'SubagentStop', timeout: 5 },
  { name: 'SessionStart', timeout: 5 },
  { name: 'SessionEnd', timeout: 5 },
  { name: 'Notification', timeout: 86400 },
  { name: 'PreCompact', timeout: 5 },
];

// Marker stamped on every hook entry we own, so uninstall can surgically
// remove ours without touching the user's hooks.
const MARKER = '_codeisland';

function defaultClaudeSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function readSettings(settingsPath) {
  try {
    const txt = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(txt);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettings(settingsPath, cfg) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function buildCommand(nodePath, bridgePath) {
  // Quote the bridge path for Windows paths containing spaces.
  return `${nodePath} "${bridgePath}" --source claude`;
}

function isOursGroup(group) {
  return Array.isArray(group?.hooks) && group.hooks.some((h) => h && h[MARKER] === true);
}

// Install (or repair) CodeIslandWin's Claude Code hooks idempotently.
function installClaudeHooks({ settingsPath = defaultClaudeSettingsPath(), bridgePath, nodePath = 'node' } = {}) {
  if (!bridgePath) throw new Error('installClaudeHooks: bridgePath is required');
  const cfg = readSettings(settingsPath);
  if (!cfg.hooks || typeof cfg.hooks !== 'object' || Array.isArray(cfg.hooks)) cfg.hooks = {};

  const command = buildCommand(nodePath, bridgePath);

  for (const evt of CLAUDE_EVENTS) {
    const existing = Array.isArray(cfg.hooks[evt.name]) ? cfg.hooks[evt.name] : [];
    // Drop any prior CodeIsland groups so re-install never duplicates.
    const userGroups = existing.filter((g) => !isOursGroup(g));
    const ourGroup = {
      matcher: '',
      hooks: [{ type: 'command', command, timeout: evt.timeout, [MARKER]: true }],
    };
    cfg.hooks[evt.name] = [...userGroups, ourGroup];
  }

  writeSettings(settingsPath, cfg);
  return { settingsPath, command, events: CLAUDE_EVENTS.map((e) => e.name) };
}

// Remove only CodeIslandWin's hooks, preserving the user's own.
function uninstallClaudeHooks({ settingsPath = defaultClaudeSettingsPath() } = {}) {
  const cfg = readSettings(settingsPath);
  if (!cfg.hooks || typeof cfg.hooks !== 'object') return { settingsPath, changed: false };

  for (const name of Object.keys(cfg.hooks)) {
    if (!Array.isArray(cfg.hooks[name])) continue;
    const kept = cfg.hooks[name]
      .map((g) => {
        if (!Array.isArray(g?.hooks)) return g;
        const hooks = g.hooks.filter((h) => !(h && h[MARKER] === true));
        return { ...g, hooks };
      })
      .filter((g) => !Array.isArray(g?.hooks) || g.hooks.length > 0);
    cfg.hooks[name] = kept;
  }

  writeSettings(settingsPath, cfg);
  return { settingsPath, changed: true };
}

module.exports = {
  installClaudeHooks,
  uninstallClaudeHooks,
  defaultClaudeSettingsPath,
  CLAUDE_EVENTS,
  MARKER,
};
