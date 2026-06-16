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

// Draft answers for in-flight AskUserQuestion cards, keyed by pending key, so the
// user's selections survive the periodic state re-renders. Each draft is an array
// (one entry per question): { value, set: string[], other, otherText }.
const askDrafts = new Map();

function draftFor(pend) {
  let d = askDrafts.get(pend.key);
  if (!d || d.length !== pend.questions.length) {
    d = pend.questions.map(() => ({ value: null, set: [], other: false, otherText: '' }));
    askDrafts.set(pend.key, d);
  }
  return d;
}

// Resolve one question's draft into the final answer string (multi-select labels
// are joined with ", ", mirroring the macOS app).
function answerForQuestion(q, qd) {
  if (q.options && q.options.length) {
    if (q.multiSelect) {
      const parts = [...qd.set];
      if (qd.other && qd.otherText.trim()) parts.push(qd.otherText.trim());
      return parts.join(', ');
    }
    if (qd.other) return qd.otherText.trim();
    return qd.value || '';
  }
  return qd.otherText.trim(); // text-only question
}

function buildAskCard(div, pend, onChanged) {
  const draft = draftFor(pend);

  pend.questions.forEach((q, qi) => {
    const qd = draft[qi];
    const qEl = document.createElement('div');
    qEl.className = 'question';
    if (q.header) {
      const h = document.createElement('div');
      h.className = 'q-header';
      h.textContent = q.header;
      qEl.appendChild(h);
    }
    const t = document.createElement('div');
    t.className = 'q-text';
    t.textContent = q.question;
    qEl.appendChild(t);

    const hasOptions = q.options && q.options.length;
    if (hasOptions) {
      const opts = document.createElement('div');
      opts.className = 'q-options';
      q.options.forEach((opt) => {
        const selected = q.multiSelect ? qd.set.includes(opt.label) : (!qd.other && qd.value === opt.label);
        opts.appendChild(optionRow(opt.label, opt.description, q.multiSelect, selected, () => {
          if (q.multiSelect) {
            const i = qd.set.indexOf(opt.label);
            if (i >= 0) qd.set.splice(i, 1); else qd.set.push(opt.label);
          } else {
            qd.value = opt.label;
            qd.other = false;
          }
          onChanged();
        }));
      });
      // "Other / custom" free-text option
      opts.appendChild(optionRow('其他（自定义输入）', null, q.multiSelect, qd.other, () => {
        qd.other = !qd.other;
        if (!q.multiSelect && qd.other) qd.value = null;
        onChanged();
      }));
      qEl.appendChild(opts);
      if (qd.other) qEl.appendChild(textInput(qd, onChanged));
    } else {
      // Text-only question.
      qEl.appendChild(textInput(qd, onChanged));
    }
    div.appendChild(qEl);
  });

  const allAnswered = pend.questions.every((q, qi) => answerForQuestion(q, draft[qi]).length > 0);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const skip = document.createElement('button');
  skip.className = 'btn btn-skip';
  skip.textContent = 'Skip';
  skip.onclick = () => { askDrafts.delete(pend.key); window.codeisland.skipQuestions(pend.key); };
  const submit = document.createElement('button');
  submit.className = 'btn btn-submit';
  submit.textContent = 'Submit';
  submit.disabled = !allAnswered;
  submit.style.opacity = allAnswered ? '1' : '0.5';
  submit.onclick = () => {
    if (!allAnswered) return;
    const answers = {};
    pend.questions.forEach((q, qi) => { answers[q.question] = answerForQuestion(q, draft[qi]); });
    askDrafts.delete(pend.key);
    window.codeisland.answerQuestions(pend.key, answers);
  };
  actions.append(skip, submit);
  div.appendChild(actions);
}

function optionRow(label, description, multi, selected, onClick) {
  const row = document.createElement('div');
  row.className = `opt${selected ? ' selected' : ''}`;
  const mark = document.createElement('span');
  mark.className = 'opt-mark';
  mark.textContent = multi ? (selected ? '☑' : '☐') : (selected ? '◉' : '○');
  const body = document.createElement('div');
  body.className = 'opt-body';
  const lab = document.createElement('span');
  lab.className = 'opt-label';
  lab.textContent = label;
  body.appendChild(lab);
  if (description) {
    const d = document.createElement('span');
    d.className = 'opt-desc';
    d.textContent = description;
    body.appendChild(d);
  }
  row.append(mark, body);
  row.onclick = onClick;
  return row;
}

function textInput(qd, onChanged) {
  const input = document.createElement('input');
  input.className = 'q-input';
  input.type = 'text';
  input.placeholder = '输入你的回答…';
  input.value = qd.otherText;
  input.oninput = (e) => { qd.otherText = e.target.value; };
  // Refresh the Submit enabled state when focus leaves or Enter is pressed, so
  // typing isn't interrupted by DOM rebuilds.
  input.onchange = () => onChanged();
  input.onkeydown = (e) => { if (e.key === 'Enter') { qd.otherText = input.value; onChanged(); } };
  return input;
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
    } else if (pend && pend.kind === 'askUserQuestion' && pend.questions) {
      // onChanged re-renders from the cached state so selection changes (and the
      // Submit enabled state) are reflected without waiting for a new push.
      buildAskCard(div, pend, () => render({ model, pending, sounds: [] }));
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
