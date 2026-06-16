'use strict';

// Pure view-model: turns raw session state into the rows the island renders.
// Kept dependency-free so it runs in both Node (tests) and the renderer.

const STATUS_PRIORITY = {
  waitingApproval: 5,
  waitingQuestion: 4,
  running: 3,
  processing: 2,
  idle: 0,
};

function basename(p) {
  if (!p) return null;
  const parts = String(p).replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || null;
}

function statusLabel(session) {
  switch (session.status) {
    case 'waitingApproval':
      return 'Needs approval';
    case 'waitingQuestion':
      return 'Question';
    case 'running':
      return session.currentTool ? `Running · ${session.currentTool}` : 'Running';
    case 'processing':
      return 'Thinking…';
    case 'idle':
    default:
      return 'Idle';
  }
}

function mascotStateFor(status) {
  switch (status) {
    case 'waitingApproval':
    case 'waitingQuestion':
      return 'waiting';
    case 'running':
      return 'running';
    case 'processing':
      return 'processing';
    default:
      return 'idle';
  }
}

function titleFor(id, session) {
  return basename(session.cwd) || (typeof id === 'string' ? id.slice(0, 8) : 'session');
}

function renderModel(state = {}) {
  const sessions = state.sessions || {};
  const entries = Object.entries(sessions);

  const rows = entries
    .map(([id, session]) => ({
      id,
      source: session.source || 'claude',
      icon: session.source || 'claude',
      title: titleFor(id, session),
      statusKey: session.status || 'idle',
      statusLabel: statusLabel(session),
      tool: session.currentTool || null,
      toolDescription: session.toolDescription || null,
      pending: session.status === 'waitingApproval' || session.status === 'waitingQuestion',
      lastActivity: session.lastActivity || 0,
      lastAssistantMessage: session.lastAssistantMessage || null,
    }))
    .sort((a, b) => {
      const pa = STATUS_PRIORITY[a.statusKey] ?? 1;
      const pb = STATUS_PRIORITY[b.statusKey] ?? 1;
      if (pb !== pa) return pb - pa;
      return b.lastActivity - a.lastActivity;
    });

  const top = rows[0];
  // Quiet mode: the island only expands when a session needs a human decision —
  // authorization (waitingApproval) or information input (waitingQuestion).
  // Ordinary activity (running/processing/idle) is tracked silently and stays
  // collapsed so the island isn't noisy.
  const hasPending = rows.some(
    (r) => r.statusKey === 'waitingApproval' || r.statusKey === 'waitingQuestion'
  );

  return {
    collapsed: !hasPending,
    count: rows.length,
    rows,
    mascotState: top ? mascotStateFor(top.statusKey) : 'idle',
  };
}

module.exports = { renderModel, STATUS_PRIORITY };
