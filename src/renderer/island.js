'use strict';

// Renderer: receives state pushes from main, renders the island, plays sounds,
// and sends permission decisions back. renderModel already did the heavy lifting
// in the main process, so this stays a thin DOM layer.

const islandEl = document.getElementById('island');
const pillEl = document.getElementById('pill');
const pillStatusEl = document.getElementById('pill-status');
const pillCountEl = document.getElementById('pill-count');
const panelEl = document.getElementById('panel');

const SOUND_MAP = {
  SessionStart: '8bit_boot',
  UserPromptSubmit: '8bit_submit',
  PreToolUse: '8bit_start',
  PermissionRequest: '8bit_approval',
  Notification: '8bit_approval',
  Stop: '8bit_complete',
  PostToolUseFailure: '8bit_error',
};
const audioCache = {};
let lastSoundAt = 0;

function playSound(name) {
  const file = SOUND_MAP[name];
  if (!file) return;
  const now = Date.now();
  if (now - lastSoundAt < 120) return; // throttle bursts
  lastSoundAt = now;
  try {
    const a = audioCache[file] || (audioCache[file] = new Audio(`../assets/sounds/${file}.wav`));
    a.currentTime = 0;
    a.volume = 0.5;
    a.play().catch(() => {});
  } catch { /* ignore */ }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pendingForSession(pending, sessionId) {
  return pending.find((p) => p.sessionId === sessionId) || null;
}

function render({ model, pending, sounds }) {
  (sounds || []).forEach(playSound);

  // Pill
  islandEl.classList.toggle('collapsed', model.collapsed);
  pillEl.className = `pill state-${model.mascotState}`;
  pillCountEl.textContent = model.count > 0 ? String(model.count) : '';

  const top = model.rows[0];
  if (model.collapsed || !top) {
    pillStatusEl.textContent = 'CodeIsland';
  } else {
    pillStatusEl.textContent = top.statusLabel;
  }

  // Panel rows
  panelEl.innerHTML = '';
  for (const row of model.rows) {
    const pend = row.pending ? pendingForSession(pending, row.id) : null;
    const div = document.createElement('div');
    div.className = `row s-${row.statusKey}`;
    div.innerHTML = `
      <div class="row-head">
        <img class="row-icon" src="../assets/claude.png" alt="" />
        <span class="row-title">${escapeHtml(row.title)}</span>
        <span class="row-status">${escapeHtml(row.statusLabel)}</span>
      </div>
      ${row.toolDescription ? `<div class="row-desc">${escapeHtml(row.toolDescription)}</div>` : ''}
    `;
    if (pend && pend.kind === 'permission') {
      const actions = document.createElement('div');
      actions.className = 'actions';
      const allow = document.createElement('button');
      allow.className = 'btn btn-allow';
      allow.textContent = 'Allow';
      allow.onclick = () => window.codeisland.decide(pend.key, 'allow');
      const deny = document.createElement('button');
      deny.className = 'btn btn-deny';
      deny.textContent = 'Deny';
      deny.onclick = () => window.codeisland.decide(pend.key, 'deny');
      actions.append(allow, deny);
      div.appendChild(actions);
    }
    panelEl.appendChild(div);
  }

  // Ask main to fit the window to content.
  requestAnimationFrame(() => {
    const h = Math.ceil(islandEl.getBoundingClientRect().height) + 8;
    window.codeisland.resize(h);
  });
}

window.codeisland.onState(render);
