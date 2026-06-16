'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  isAskUserQuestion,
  parseQuestions,
  buildAllowResponse,
  buildDenyResponse,
} = require('../src/core/askQuestion');

function askEvent(questions, extra = {}) {
  return {
    eventName: 'PermissionRequest',
    toolName: 'AskUserQuestion',
    toolInput: { questions, ...extra },
    rawJSON: { hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion' },
  };
}

test('isAskUserQuestion detects the AskUserQuestion permission tool', () => {
  assert.strictEqual(isAskUserQuestion(askEvent([])), true);
  assert.strictEqual(isAskUserQuestion({ eventName: 'PermissionRequest', toolName: 'Bash' }), false);
  assert.strictEqual(isAskUserQuestion({ eventName: 'PreToolUse', toolName: 'AskUserQuestion' }), false);
  assert.strictEqual(isAskUserQuestion(null), false);
});

test('parseQuestions extracts question text, header, multiSelect, and options', () => {
  const items = parseQuestions(askEvent([
    {
      question: 'Pick a color',
      header: 'Color',
      multiSelect: false,
      options: [
        { label: 'Red', description: 'warm' },
        { label: 'Blue', description: 'cool' },
      ],
    },
    {
      question: 'Pick toppings',
      header: 'Toppings',
      multiSelect: true,
      options: [{ label: 'Cheese' }, { label: 'Olives' }],
    },
  ]));
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].question, 'Pick a color');
  assert.strictEqual(items[0].header, 'Color');
  assert.strictEqual(items[0].multiSelect, false);
  assert.deepStrictEqual(items[0].options, [
    { label: 'Red', description: 'warm' },
    { label: 'Blue', description: 'cool' },
  ]);
  assert.strictEqual(items[1].multiSelect, true);
  assert.deepStrictEqual(items[1].options, [
    { label: 'Cheese', description: null },
    { label: 'Olives', description: null },
  ]);
});

test('parseQuestions falls back to a single text-input question when questions[] is absent', () => {
  const items = parseQuestions({
    eventName: 'PermissionRequest',
    toolName: 'AskUserQuestion',
    toolInput: { question: 'What is your name?' },
    rawJSON: {},
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].question, 'What is your name?');
  assert.strictEqual(items[0].options, null);
});

test('buildAllowResponse returns a PermissionRequest allow with answers keyed by question text', () => {
  const event = askEvent([
    { question: 'Pick a color', header: 'Color', options: [{ label: 'Red' }] },
  ]);
  const resp = buildAllowResponse(event, { 'Pick a color': 'Red' });
  assert.strictEqual(resp.hookSpecificOutput.hookEventName, 'PermissionRequest');
  assert.strictEqual(resp.hookSpecificOutput.decision.behavior, 'allow');
  const ui = resp.hookSpecificOutput.decision.updatedInput;
  // questions must always be present (Claude calls H.map on it)
  assert.ok(Array.isArray(ui.questions));
  assert.deepStrictEqual(ui.answers, { 'Pick a color': 'Red' });
  assert.strictEqual(ui.answer, 'Red');
});

test('buildDenyResponse returns a PermissionRequest deny', () => {
  const resp = buildDenyResponse();
  assert.strictEqual(resp.hookSpecificOutput.hookEventName, 'PermissionRequest');
  assert.strictEqual(resp.hookSpecificOutput.decision.behavior, 'deny');
});
