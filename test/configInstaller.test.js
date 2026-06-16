const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installClaudeHooks, uninstallClaudeHooks, CLAUDE_EVENTS } = require('../src/core/configInstaller');

function tmpSettings() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-win-'));
  return path.join(dir, 'settings.json');
}

const opts = (settingsPath) => ({ settingsPath, bridgePath: 'C:/app/bridge.js', nodePath: 'node' });

test('fresh install creates settings.json with a hook for every event', () => {
  const sp = tmpSettings();
  installClaudeHooks(opts(sp));
  const cfg = JSON.parse(fs.readFileSync(sp, 'utf8'));
  for (const evt of CLAUDE_EVENTS) {
    assert.ok(Array.isArray(cfg.hooks[evt.name]), `missing ${evt.name}`);
    const cmd = cfg.hooks[evt.name][0].hooks[0].command;
    assert.ok(cmd.includes('bridge.js'), cmd);
    assert.ok(cmd.includes('--source claude'), cmd);
  }
});

test('PermissionRequest hook uses a long blocking timeout', () => {
  const sp = tmpSettings();
  installClaudeHooks(opts(sp));
  const cfg = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.strictEqual(cfg.hooks.PermissionRequest[0].hooks[0].timeout, 86400);
  assert.strictEqual(cfg.hooks.PreToolUse[0].hooks[0].timeout, 5);
});

test('install is idempotent — re-running does not duplicate entries', () => {
  const sp = tmpSettings();
  installClaudeHooks(opts(sp));
  installClaudeHooks(opts(sp));
  const cfg = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.strictEqual(cfg.hooks.PreToolUse.length, 1);
  assert.strictEqual(cfg.hooks.PreToolUse[0].hooks.length, 1);
});

test('install preserves unrelated settings and the user\'s own hooks', () => {
  const sp = tmpSettings();
  fs.writeFileSync(sp, JSON.stringify({
    theme: 'dark',
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own-hook' }] }] },
  }));
  installClaudeHooks(opts(sp));
  const cfg = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.strictEqual(cfg.theme, 'dark');
  const cmds = cfg.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes('my-own-hook'), 'user hook preserved');
  assert.ok(cmds.some((c) => c.includes('bridge.js')), 'codeisland hook added');
});

test('uninstall removes only codeisland hooks and keeps user hooks + settings', () => {
  const sp = tmpSettings();
  fs.writeFileSync(sp, JSON.stringify({
    theme: 'dark',
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own-hook' }] }] },
  }));
  installClaudeHooks(opts(sp));
  uninstallClaudeHooks({ settingsPath: sp });
  const cfg = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.strictEqual(cfg.theme, 'dark');
  const cmds = (cfg.hooks.PreToolUse || []).flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes('my-own-hook'), 'user hook kept');
  assert.ok(!cmds.some((c) => c.includes('bridge.js')), 'codeisland hook removed');
  assert.ok(!cfg.hooks.Stop || cfg.hooks.Stop.length === 0, 'codeisland-only event arrays cleared');
});
