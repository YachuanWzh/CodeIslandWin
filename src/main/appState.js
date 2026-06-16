'use strict';

const { reduceEvent, Status } = require('../core/sessionStore');

// Main-process application state: owns the session map, applies the pure
// reducer, and brokers blocking permission/question requests between the
// hook server (which awaits a decision) and the UI (which produces one).
function createAppState() {
  const sessions = {};
  const subscribers = new Set();
  // key -> { resolve, event, sessionId, kind }
  const pending = new Map();
  let seq = 0;

  function notify(effects = []) {
    for (const fn of subscribers) {
      try { fn({ sessions }, effects); } catch { /* a flaky listener must not break state */ }
    }
  }

  function applyEffects(effects) {
    for (const e of effects) {
      if (e.type === 'removeSession') {
        denyPendingForSession(e.sessionId);
        delete sessions[e.sessionId];
      }
    }
  }

  function denyPendingForSession(sessionId) {
    for (const [key, entry] of pending) {
      if (entry.sessionId === sessionId) {
        entry.resolve(entry.kind === 'permission' ? 'deny' : null);
        pending.delete(key);
      }
    }
  }

  function handleEvent(event) {
    const { effects } = reduceEvent(sessions, event);
    applyEffects(effects);
    notify(effects);
  }

  function ensureSession(sessionId) {
    if (!sessions[sessionId]) {
      reduceEvent(sessions, { eventName: 'SessionStart', sessionId, rawJSON: {} });
    }
  }

  function requestPermission(event) {
    const sessionId = event.sessionId || 'default';
    ensureSession(sessionId);
    const s = sessions[sessionId];
    s.status = Status.waitingApproval;
    s.currentTool = event.toolName || s.currentTool;
    s.toolDescription = event.toolDescription || s.toolDescription;
    s.lastActivity = Date.now();

    const key = `perm-${++seq}`;
    const promise = new Promise((resolve) => {
      pending.set(key, { resolve, event, sessionId, kind: 'permission' });
    });
    notify([{ type: 'playSound', event: 'PermissionRequest' }]);
    return promise;
  }

  function requestQuestion(event) {
    const sessionId = event.sessionId || 'default';
    ensureSession(sessionId);
    const s = sessions[sessionId];
    s.status = Status.waitingQuestion;
    s.toolDescription = event.toolDescription || s.toolDescription;
    s.lastActivity = Date.now();

    const key = `ques-${++seq}`;
    const promise = new Promise((resolve) => {
      pending.set(key, { resolve, event, sessionId, kind: 'question' });
    });
    notify([{ type: 'playSound', event: 'Notification' }]);
    return promise;
  }

  function resolvePermission(key, behavior) {
    const entry = pending.get(key);
    if (!entry) return false;
    pending.delete(key);
    // Move the session out of the waiting state if nothing else is pending for it.
    const s = sessions[entry.sessionId];
    if (s && s.status === Status.waitingApproval && !hasPendingForSession(entry.sessionId)) {
      s.status = Status.processing;
      s.currentTool = null;
      s.toolDescription = null;
    }
    entry.resolve(behavior === 'deny' ? 'deny' : 'allow');
    notify();
    return true;
  }

  function resolveQuestion(key, answer) {
    const entry = pending.get(key);
    if (!entry) return false;
    pending.delete(key);
    const s = sessions[entry.sessionId];
    if (s && s.status === Status.waitingQuestion && !hasPendingForSession(entry.sessionId)) {
      s.status = Status.processing;
    }
    entry.resolve(answer ?? null);
    notify();
    return true;
  }

  function hasPendingForSession(sessionId) {
    for (const entry of pending.values()) if (entry.sessionId === sessionId) return true;
    return false;
  }

  function listPending() {
    return [...pending.entries()].map(([key, e]) => ({
      key,
      sessionId: e.sessionId,
      kind: e.kind,
      toolName: e.event.toolName || null,
      toolDescription: e.event.toolDescription || null,
    }));
  }

  // Drop sessions that have been idle for longer than maxIdleMs.
  function cleanupIdle(maxIdleMs = 5 * 60 * 1000, now = Date.now()) {
    let changed = false;
    for (const [id, s] of Object.entries(sessions)) {
      if (s.status === Status.idle && now - (s.lastActivity || 0) > maxIdleMs) {
        delete sessions[id];
        changed = true;
      }
    }
    if (changed) notify();
  }

  return {
    handleEvent,
    requestPermission,
    requestQuestion,
    resolvePermission,
    resolveQuestion,
    listPending,
    cleanupIdle,
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    snapshot() { return { sessions }; },
  };
}

module.exports = { createAppState };
