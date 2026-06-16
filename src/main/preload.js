'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codeisland', {
  onState: (cb) => ipcRenderer.on('state-update', (_e, payload) => cb(payload)),
  resize: (height) => ipcRenderer.send('resize', height),
  decide: (key, behavior) => ipcRenderer.send('permission-decision', { key, behavior }),
  answer: (key, answer) => ipcRenderer.send('question-answer', { key, answer }),
  quit: () => ipcRenderer.send('quit'),
});
