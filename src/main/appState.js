'use strict';

const { reduceEvent, Status } = require('../core/sessionStore');
const { parseQuestions, buildAllowResponse, buildDenyResponse } = require('../core/askQuestion');

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
        entry.resolve(denyValueFor(entry.kind));
        pending.delete(key);
      }
    }
  }

  // The "abandon" value differs per pending kind: permission expects 'deny',
  // AskUserQuestion expects a full PermissionRequest deny object, and a plain
  // notification question expects null.
  function denyValueFor(kind) {
    if (kind === 'permission') return 'deny';
    if (kind === 'askUserQuestion') return buildDenyResponse();
    return null;
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

  // AskUserQuestion (Claude Code's select/type tool). Parses the questions,
  // blocks until the UI submits answers, and resolves with the full hook
  // response object the server writes back. Empty question lists auto-allow so
  // the agent is never wedged on a prompt with nothing to answer.
  function requestAskUserQuestion(event) {
    const sessionId = event.sessionId || 'default';
    ensureSession(sessionId);
    const questions = parseQuestions(event);

    if (!questions.length) {
      return Promise.resolve(buildAllowResponse(event, {}));
    }

    const s = sessions[sessionId];
    s.status = Status.waitingQuestion;
    s.toolDescription = questions[0].question || s.toolDescription;
    s.lastActivity = Date.now();

    const key = `ask-${++seq}`;
    const promise = new Promise((resolve) => {
      pending.set(key, { resolve, event, sessionId, kind: 'askUserQuestion', questions });
    });
    notify([{ type: 'playSound', event: 'PermissionRequest' }]);
    return promise;
  }

  // answers: { [questionText]: answerString }. Multi-select answers are
  // pre-joined by the UI before they reach here.
  function resolveAskUserQuestion(key, answers) {
    const entry = pending.get(key);
    if (!entry) return false;
    pending.delete(key);
    clearWaitingQuestion(entry.sessionId);
    entry.resolve(buildAllowResponse(entry.event, answers || {}));
    notify();
    return true;
  }

  function skipAskUserQuestion(key) {
    const entry = pending.get(key);
    if (!entry) return false;
    pending.delete(key);
    clearWaitingQuestion(entry.sessionId);
    entry.resolve(buildDenyResponse());
    notify();
    return true;
  }

  function clearWaitingQuestion(sessionId) {
    const s = sessions[sessionId];
    if (s && s.status === Status.waitingQuestion && !hasPendingForSession(sessionId)) {
      s.status = Status.processing;
      s.currentTool = null;
      s.toolDescription = null;
    }
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
    // Pass the decision through verbatim: 'deny', 'allow', or 'allowAll' (allow
    // this call and persist a same-tool session rule). The hook server turns it
    // into the right PermissionRequest response. Anything unexpected falls back
    // to a plain allow.
    const decision = behavior === 'deny' || behavior === 'allowAll' ? behavior : 'allow';
    entry.resolve(decision);
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
      questions: e.questions || null,
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
    requestAskUserQuestion,
    resolvePermission,
    resolveQuestion,
    resolveAskUserQuestion,
    skipAskUserQuestion,
    listPending,
    cleanupIdle,
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    snapshot() { return { sessions }; },
  };
}

module.exports = { createAppState };
