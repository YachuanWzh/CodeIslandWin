'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('node:path');
const { createAppState } = require('./appState');
const { createHookServer } = require('../server/hookServer');
const { renderModel } = require('../renderer/renderModel');
const { computeWindowBounds } = require('./windowLayout');
const { pipePath } = require('../core/pipePath');
const { resolveBridgePath } = require('../core/bridgeResolver');
const { installClaudeHooks, uninstallClaudeHooks } = require('../core/configInstaller');

const WIN_WIDTH = 420;
const TOP_MARGIN = 6;

let win = null;
let tray = null;
let server = null;
const appState = createAppState();

// Where the user last dragged the island to. `null` means "use the default
// top-center spot". Once set, positionWindow keeps these coordinates so the
// content-driven resizes stop snapping the island back to center.
let userPosition = null;
// The bounds we last applied programmatically, so the `moved` handler can tell
// our own setBounds apart from a real user drag (timing-independent).
let lastSetBounds = null;

function bridgePath() {
  // Redirect into app.asar.unpacked when packaged so the hook's plain `node`
  // can read bridge.js (it cannot read files inside the asar archive).
  return resolveBridgePath(__dirname);
}

function positionWindow(height) {
  if (!win) return;
  const display = screen.getPrimaryDisplay();
  // Never let the island grow past the bottom of the screen — clamp to the work
  // area and let the panel scroll internally for content that doesn't fit.
  const bounds = computeWindowBounds(height, {
    workArea: display.workArea,
    width: WIN_WIDTH,
    topMargin: TOP_MARGIN,
    min: 1,
    userPosition,
  });
  lastSetBounds = bounds;
  win.setBounds(bounds);
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_WIDTH,
    height: 56,
    frame: false,
    transparent: true,
    resizable: false,
    // Movable so the OS honors the pill's -webkit-app-region: drag region —
    // without this the drag region is inert and the island can't be moved.
    movable: true,
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
  // A transparent window still swallows clicks on every pixel, so the fixed-width
  // island would block the mostly-empty area around the pill. Start fully
  // click-through; the renderer re-arms us (set-ignore-mouse) only while the
  // cursor is over visible content. forward:true keeps move events flowing so the
  // renderer can detect re-entry.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Remember where the user drags the island to. A move whose final position
  // matches the bounds we set programmatically is our own resize, not a drag —
  // ignore those so a content-driven resize can't masquerade as a user move.
  win.on('moved', () => {
    if (!win || win.isDestroyed()) return;
    const { x, y } = win.getBounds();
    if (lastSetBounds && x === lastSetBounds.x && y === lastSetBounds.y) return;
    userPosition = { x, y };
  });

  positionWindow(56);
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

ipcMain.on('resize', (_evt, height) => positionWindow(height));
// Renderer hit-test result: ignore mouse events (pass clicks through to whatever
// is underneath) everywhere except over the pill/panel. forward:true so we keep
// receiving move events to re-arm when the cursor returns to content.
ipcMain.on('set-ignore-mouse', (_evt, ignore) => {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!!ignore, { forward: true });
});
// Manual drag from the renderer: remember the new top-left and apply it (height
// stays whatever the content currently needs).
ipcMain.on('move-window', (_evt, { x, y }) => {
  if (!win || win.isDestroyed()) return;
  userPosition = { x: Math.round(x), y: Math.round(y) };
  positionWindow(win.getBounds().height);
});
// Double-click on the pill: forget the dragged position and snap back to the
// default top-center spot, keeping the current height.
ipcMain.on('reset-position', () => {
  if (!win || win.isDestroyed()) return;
  userPosition = null;
  positionWindow(win.getBounds().height);
});
ipcMain.on('permission-decision', (_evt, { key, behavior }) => appState.resolvePermission(key, behavior));
ipcMain.on('question-answer', (_evt, { key, answer }) => appState.resolveQuestion(key, answer));
ipcMain.on('ask-answer', (_evt, { key, answers }) => appState.resolveAskUserQuestion(key, answers));
ipcMain.on('ask-skip', (_evt, { key }) => appState.skipAskUserQuestion(key));
ipcMain.on('quit', () => app.quit());

app.on('window-all-closed', () => { /* keep running in tray */ });
app.on('before-quit', async () => { if (server) await server.stop(); });
