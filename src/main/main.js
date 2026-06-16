'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('node:path');
const { createAppState } = require('./appState');
const { createHookServer } = require('../server/hookServer');
const { renderModel } = require('../renderer/renderModel');
const { pipePath } = require('../core/pipePath');
const { installClaudeHooks, uninstallClaudeHooks } = require('../core/configInstaller');

const WIN_WIDTH = 420;
const TOP_MARGIN = 6;

let win = null;
let tray = null;
let server = null;
const appState = createAppState();

function bridgePath() {
  return path.join(__dirname, '..', 'bridge', 'bridge.js');
}

function positionTopCenter(height) {
  if (!win) return;
  const display = screen.getPrimaryDisplay();
  const { x, width } = display.workArea;
  const winX = Math.round(x + (width - WIN_WIDTH) / 2);
  win.setBounds({ x: winX, y: TOP_MARGIN, width: WIN_WIDTH, height: Math.max(1, Math.round(height)) });
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: 56,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  positionTopCenter(56);
}

function pushState(effects = []) {
  if (!win || win.isDestroyed()) return;
  const sounds = effects.filter((e) => e.type === 'playSound').map((e) => e.event);
  win.webContents.send('state-update', {
    model: renderModel(appState.snapshot()),
    pending: appState.listPending(),
    sounds,
  });
}

async function startServer() {
  server = createHookServer({
    pipe: pipePath(process.env),
    onEvent: (event) => appState.handleEvent(event),
    onPermission: (event) => appState.requestPermission(event),
    onQuestion: (event) => {
      // Plain notification-style questions (no AskUserQuestion tool). No
      // interactive UI for these yet; acknowledge so the agent isn't blocked.
      appState.handleEvent(event);
      return null;
    },
    // AskUserQuestion: interactive select/type. Blocks until the user answers in
    // the island; resolves with the full PermissionRequest allow+answers object.
    onAskUserQuestion: (event) => appState.requestAskUserQuestion(event),
  });
  await server.start();
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'claude.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('CodeIsland (Windows)');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Install Claude Code hooks', click: () => { try { installClaudeHooks({ bridgePath: bridgePath() }); } catch (e) { console.error(e); } } },
    { label: 'Uninstall Claude Code hooks', click: () => { try { uninstallClaudeHooks(); } catch (e) { console.error(e); } } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

app.whenReady().then(async () => {
  createWindow();
  buildTray();
  await startServer();

  // Auto-install hooks on first launch so the chain works out of the box.
  try { installClaudeHooks({ bridgePath: bridgePath() }); } catch (e) { console.error('hook install failed', e); }

  appState.subscribe((_, effects) => pushState(effects));
  pushState();

  setInterval(() => appState.cleanupIdle(), 30 * 1000);
});

ipcMain.on('resize', (_evt, height) => positionTopCenter(height));
ipcMain.on('permission-decision', (_evt, { key, behavior }) => appState.resolvePermission(key, behavior));
ipcMain.on('question-answer', (_evt, { key, answer }) => appState.resolveQuestion(key, answer));
ipcMain.on('ask-answer', (_evt, { key, answers }) => appState.resolveAskUserQuestion(key, answers));
ipcMain.on('ask-skip', (_evt, { key }) => appState.skipAskUserQuestion(key));
ipcMain.on('quit', () => app.quit());

app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('before-quit', async () => { if (server) await server.stop(); });
