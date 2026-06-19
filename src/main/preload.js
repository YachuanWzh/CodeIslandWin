'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codeisland', {
  onState: (cb) => ipcRenderer.on('state-update', (_e, payload) => cb(payload)),
  resize: (height) => ipcRenderer.send('resize', height),
  resetPosition: () => ipcRenderer.send('reset-position'),
  decide: (key, behavior) => ipcRenderer.send('permission-decision', { key, behavior }),
  answer: (key, answer) => ipcRenderer.send('question-answer', { key, answer }),
  answerQuestions: (key, answers) => ipcRenderer.send('ask-answer', { key, answers }),
  skipQuestions: (key) => ipcRenderer.send('ask-skip', { key }),
  quit: () => ipcRenderer.send('quit'),
});
