# CodeIslandWin

**English | [简体中文](README.zh-CN.md)**

**Real-time AI coding agent status island for Windows.** A Windows port of
[CodeIsland](../CodeIsland) (macOS Dynamic Island app), built with Electron + Node.

CodeIslandWin floats a compact pixel-styled "island" at the top-center of your
screen and shows what Claude Code is doing in real time — active sessions, the
current tool call, and permission requests you can **approve / deny** without
leaving your terminal.

> MVP scope: **Claude Code** only. The architecture leaves room for more CLIs.

## How it works

```
Claude Code hook fires
  → node bridge.js --source claude   (reads the event JSON on stdin)
    → Windows Named Pipe  \\.\pipe\codeisland-<user>     (replaces the macOS Unix socket)
      → hookServer.js receives the event
        → reduceEvent() updates session state (pure state machine)
        → Electron island re-renders
        → permission/question: the server BLOCKS until you click,
          then writes the JSON decision back over the pipe → bridge.js → stdout → Claude Code
```

Key differences from the macOS original:

| macOS CodeIsland            | CodeIslandWin                         |
|-----------------------------|---------------------------------------|
| MacBook notch panel         | Frameless transparent top-center overlay |
| Unix domain socket          | Windows Named Pipe (`net` module)     |
| Native Swift bridge binary  | Tiny Node `bridge.js` script          |
| Swift / SwiftUI             | Electron + HTML/CSS                    |

## Run

```bash
cd CodeIslandWin
npm install
npm start
```

On launch it:
1. Starts the named-pipe hook server.
2. Auto-installs Claude Code hooks into `~/.claude/settings.json` (idempotent).
3. Shows the island; it expands when a session is active and collapses when idle.

Open a new Claude Code session in any terminal — the island lights up. When Claude
asks for permission, an **Allow / Deny** card appears in the island.

The tray icon lets you re-install / uninstall hooks or quit.

## Package a distributable

To produce a double-clickable Windows build (no dev environment needed by the
end user), use [electron-builder](https://www.electron.build/):

```bash
npm run pack      # unpacked app into dist/ (fast, for smoke-testing)
npm run dist      # NSIS installer + portable .exe into dist/
```

`npm run dist` emits a `CodeIsland Setup <version>.exe` installer (lets the user
pick an install location) and a portable single-file `.exe`.

## Develop / test

```bash
npm test          # node:test suite covering the whole non-GUI core
```

The core is fully unit + integration tested:

| Module | What it does |
|--------|--------------|
| `src/core/eventNormalizer.js` | raw CLI event names → canonical PascalCase |
| `src/core/hookEvent.js`       | parse a hook payload + derive a tool description |
| `src/core/pipePath.js`        | per-user named-pipe address |
| `src/core/sessionStore.js`    | pure `reduceEvent` session state machine |
| `src/core/configInstaller.js` | idempotent install/uninstall of Claude hooks |
| `src/server/hookServer.js`    | named-pipe server, blocking permission/question routing |
| `src/bridge/bridge.js`        | stdin → pipe → stdout decision relay |
| `src/main/appState.js`        | session map + permission brokering |
| `src/renderer/renderModel.js` | pure state → view-model |

## Credits

Ported from [CodeIsland](https://github.com/wxtsky/CodeIsland) by @wxtsky.
8-bit sounds and the Claude mascot/icon are reused from that MIT-licensed project.

## License

MIT
