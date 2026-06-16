# Plan: AskUserQuestion (选择/输入) support + Quiet mode for CodeIslandWin

## Goal
1. Support Claude Code's `AskUserQuestion` tool (single-select / multi-select / free-text)
   so the user can *choose* or *type* an answer — not just Allow/Deny.
2. Quiet mode: CodeIslandWin only plays a sound and visibly expands when a decision is
   needed (authorization = Allow/Deny, or information input = select/input). All other
   events (PreToolUse / PostToolUse / Stop / SessionStart / Running / Thinking …) stay
   silent and collapsed.

## Background (verified from source)
- Claude Code sends AskUserQuestion as a `PermissionRequest` hook with
  `tool_name == "AskUserQuestion"` and `tool_input.questions = [{question, header,
  multiSelect, options:[{label,description}]}]`.
- Correct response (mirrors macOS `handleAskUserQuestion`):
  `{hookSpecificOutput:{hookEventName:"PermissionRequest",decision:{behavior:"allow",
  updatedInput:{...toolInput, questions, answers:{<questionText>:<answer>}, answer:<first>}}}}`.
  `answers` MUST be keyed by **question text** (Claude looks up `answers[question.question]`).
  Multi-select answers are joined with ", " (macOS behavior).
- Skip / drain → `{...decision:{behavior:"deny"}}`.
- Sounds today: `sessionStore.reduceEvent` pushes `{type:'playSound'}` for EVERY event
  (line ~181) + SessionEnd; the renderer maps them to wav files. Blocking sounds also
  come from `appState.requestPermission/requestQuestion`.
- Expansion today: `renderModel` collapses only when every session is idle.

## Assumption (user did not answer the clarifying question)
Quiet mode = "fully quiet": non-blocking events produce **no sound and no expansion**
(island stays the collapsed "CodeIsland" pill). Sessions are still tracked silently.
Reversible UI choice.

## Tasks (each: RED → GREEN → commit)

### T1 — Quiet sounds: reducer stops emitting playSound for ordinary events
- RED: `sessionStore.test.js` — replace the "every event emits playSound" test with one
  asserting PreToolUse / Stop / SessionStart emit **no** playSound effect.
- GREEN: remove the blanket `effects.push({type:'playSound',event})` and the SessionEnd
  playSound from `reduceEvent`. (Blocking sounds keep coming from appState.)

### T2 — Quiet expansion: island stays collapsed unless a decision is pending
- RED: `renderModel.test.js` — running/processing sessions → `collapsed:true`;
  waitingApproval/waitingQuestion → `collapsed:false`.
- GREEN: `renderModel` — `collapsed = !rows.some(r => r.statusKey is waiting*)`.

### T3 — core/askQuestion.js: pure parse + response builders (new module + tests)
- RED: `askQuestion.test.js` — `isAskUserQuestion(event)`; `parseQuestions(event)` →
  items [{question, header, multiSelect, options:[{label,description}]}];
  `buildAllowResponse(event, answers)` → correct hookSpecificOutput w/ updatedInput;
  `buildDenyResponse()`.
- GREEN: implement `src/core/askQuestion.js`.

### T4 — hookServer routes AskUserQuestion to onAskUserQuestion
- RED: `hookServer.test.js` — `routeKind` returns `'askUserQuestion'` for
  PermissionRequest+AskUserQuestion; server calls `onAskUserQuestion` and writes its
  JSON object back.
- GREEN: add kind + `onAskUserQuestion` param + case in `processMessage`.

### T5 — appState: requestAskUserQuestion / resolveAskUserQuestion / skip
- RED: `appState.test.js` — request sets `waitingQuestion`; `listPending` exposes
  kind `'askUserQuestion'` with `questions`; resolve produces allow+updatedInput+answers;
  empty questions → immediate allow (non-blocking); session removal denies pending ask.
- GREEN: implement in `appState.js`.

### T6 — Wire main.js + preload.js
- `onAskUserQuestion: (e) => appState.requestAskUserQuestion(e)`.
- IPC `ask-answer {key, answers}` → resolveAskUserQuestion; `ask-skip {key}` → skip.
- preload exposes `answerQuestions(key, answers)` / `skipQuestion(key)`.
- Extend `integration.test.js` with a full bridge round-trip for AskUserQuestion.

### T7 — renderer island.js: question card UI
- For pending kind `'askUserQuestion'`: render each question (header + text), options as
  radio (single) / checkbox (multi), an "Other/自定义" free-text input, and Submit/Skip.
- Collect answers keyed by question text; send via `answerQuestions`.

## Verify
- `node --test` full suite green. Manual smoke optional (Electron).
