#!/usr/bin/env node
'use strict';

// codeisland-bridge (Windows) — Node port of the macOS Swift bridge.
// Reads a hook event JSON on stdin, enriches it, forwards it over the named
// pipe to the CodeIsland app, and for blocking events (permission/question)
// relays the app's JSON decision back to stdout for the CLI to consume.
//
// Designed to never disrupt the host CLI: any failure (no app running, bad
// input, broken pipe) exits 0 silently.

const net = require('node:net');
const { pipePath } = require('../core/pipePath');
const { normalize } = require('../core/eventNormalizer');

const HARD_TIMEOUT_MS = 8000;

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (d) => chunks.push(d));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks)));
  });
}

function nonEmpty(v) {
  return typeof v === 'string' && v.trim() ? v : null;
}

async function main() {
  if (process.env.CODEISLAND_SKIP) process.exit(0);

  const sourceTag = getArg('--source');
  const eventTag = getArg('--event');

  const input = await readStdin();
  if (!input.length) process.exit(0);

  let json;
  try {
    json = JSON.parse(input.toString('utf8'));
  } catch {
    process.exit(0);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) process.exit(0);

  // Normalize common aliases so downstream sees a stable shape.
  if (!json.hook_event_name) {
    json.hook_event_name = nonEmpty(json.hookEventName) || nonEmpty(json.eventName) || nonEmpty(json.event) || eventTag || undefined;
  }
  if (!json.session_id) {
    json.session_id = nonEmpty(json.sessionId) || undefined;
  }

  // Tag source + parent pid for the app's session tracking.
  if (sourceTag) json._source = sourceTag;
  if (typeof process.ppid === 'number' && process.ppid > 0) json._ppid = process.ppid;

  if (!json.hook_event_name || !json.session_id) process.exit(0);

  const normalizedName = normalize(json.hook_event_name);
  const isQuestion = normalizedName === 'Notification' && typeof json.question === 'string';
  const isBlocking = normalizedName === 'PermissionRequest' || isQuestion;

  const pipe = pipePath(process.env);
  const payload = JSON.stringify(json) + '\n';

  // Hard deadline so a hung app never wedges the CLI. Blocking events legitimately
  // wait for a human, so they get no auto-deadline.
  let deadline = null;
  if (!isBlocking) {
    deadline = setTimeout(() => process.exit(0), HARD_TIMEOUT_MS);
    if (deadline.unref) deadline.unref();
  }

  const socket = net.connect(pipe);
  let response = '';
  let settled = false;

  const finish = (code) => {
    if (settled) return;
    settled = true;
    if (deadline) clearTimeout(deadline);
    if (isBlocking && response) process.stdout.write(response, () => process.exit(code));
    else process.exit(code);
  };

  socket.on('connect', () => socket.write(payload));
  socket.on('data', (d) => { response += d.toString('utf8'); });
  socket.on('close', () => finish(0));
  socket.on('error', () => finish(0)); // no app listening, etc. — stay silent
}

main();
