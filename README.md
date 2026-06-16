# 🕹️ CodeIslandWin

```
┌──────────────────────────────────────────────┐
│  ██████╗ ██████╗ ██████╗ ███████╗ ██╗ ███████╗ │
│ ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔╝ ██╔════╝ │
│ ██║     ██║   ██║██║  ██║█████╗  ██║  ███████╗ │
│ ██║     ██║   ██║██║  ██║██╔══╝  ██║  ╚════██║ │
│ └██████╗╚██████╔╝██████╔╝███████╗██║  ███████║ │
│  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚══════╝ │
│                                                  │
│   🏝️  ISLAND EDITION — WINDOWS PORT              │
│                                                  │
│   [ LOADING... ████████░░ ] STATUS: ONLINE       │
└──────────────────────────────────────────────┘
```

> 🎮 **PLAYER 1: Claude Code** — Your AI coding agent
> 🖥️ **STAGE: Windows Desktop** — The battlefield
> 🏝️ **HUD: CodeIslandWin** — Your real-time mission control

---

## 📟 MISSION BRIEFING

Welcome, agent.

Claude Code runs in your terminal, churning through tasks — but you can't stare at
it 24/7. **CodeIslandWin** is your always-on-top HUD. A pixel-perfect floating
island that sits at the top-center of your screen and shows you exactly what Claude
is doing, in real time, with 8-bit sound effects that would make a Game Boy proud.

When Claude needs permission to run a command, or asks you a question — the island
expands. You click **Allow** or **Deny** right there, without touching the terminal.

Ported from the macOS [CodeIsland](https://github.com/wxtsky/CodeIsland) by **@wxtsky**.

### 🎯 FEATURE MATRIX

| 🕹️ Event | 💬 HUD Display | 🔊 8-bit SFX |
|-----------|---------------|-------------|
| Claude boots a session | `SESSION START` | `♪ boot.wav` |
| You submit a prompt | `THINKING…` | `♪ submit.wav` |
| Tool fires (Bash / Read / Edit) | `▶ Running · Bash` | `♪ start.wav` |
| Permission needed | `⚠️ NEEDS APPROVAL` | `♪ approval.wav` |
| Claude asks a question | `? QUESTION` | `♪ approval.wav` |
| Task complete | `✓ IDLE` | `♪ complete.wav` |
| Tool fails | `✗ ERROR` | `♪ error.wav` |
| Context compacting | `Compacting context…` | — |

### 🎒 INVENTORY (Tech Stack)

```
⚡ Electron 31+          — Game Engine
📡 Windows Named Pipe    — Comms Channel (replaces Unix socket)
🎨 HTML / CSS / JS       — Pixel Art Renderer
🧪 node:test             — Quality Assurance
📦 electron-builder      — Packager
```

### 🔑 KEY DIFFERENCES FROM macOS ORIGINAL

| macOS CodeIsland | CodeIslandWin |
|------------------|---------------|
| MacBook notch panel | Frameless transparent top-center overlay |
| Unix domain socket | Windows Named Pipe (`net` module) |
| Native Swift bridge binary | Tiny Node `bridge.js` script |
| Swift / SwiftUI | Electron + HTML/CSS |
| DMG | NSIS installer + Portable EXE |

---

## 🕹️ CONTROLS

```bash
# ▶ POWER ON
cd CodeIslandWin
npm install
npm start

# 🧪 TRAINING MODE (run tests)
npm test

# 📦 BUILD RELEASE
npm run pack      # unpacked → dist/ (fast smoke test)
npm run dist      # NSIS installer + portable .exe → dist/
```

On launch the island:
1. Starts the Named Pipe hook server.
2. Auto-installs Claude Code hooks into `~/.claude/settings.json` (idempotent).
3. Shows the pill — collapsed when idle, expands when a session needs you.

Open a **new Claude Code session** in any terminal and the island lights up.

System tray menu: re-install hooks / uninstall hooks / quit.

---

## 🗺️ LEVEL MAP (Architecture)

```
┌─ HOOK LAYER ──────────────────────────────┐
│                                            │
│  Claude Code hook fires                    │
│    → bridge.js  (stdin → pipe → stdout)    │
│                                            │
└──────────────────┬─────────────────────────┘
                   │  \\.\pipe\codeisland-<user>
┌──────────────────┴─────────────────────────┐
│  SERVER LAYER                              │
│                                            │
│  hookServer.js                             │
│  ├─ Fire-and-forget: normal events         │
│  └─ BLOCKING: permission / question        │
│     (awaits user click → writes back)      │
│                                            │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────┴─────────────────────────┐
│  STATE CORE                                │
│                                            │
│  sessionStore.js                           │
│  reduceEvent() — pure state machine        │
│  Status: idle → processing → running       │
│           → waitingApproval / waitingQuestion│
│                                            │
│  appState.js                               │
│  Session map + permission brokering        │
│  Pub/sub → pushes to renderer              │
│                                            │
└──────────────────┬─────────────────────────┘
                   │  IPC (state-update)
┌──────────────────┴─────────────────────────┐
│  RENDER LAYER                              │
│                                            │
│  renderModel.js  —  state → view-model     │
│  island.js       —  DOM builder            │
│  island.css      —  pixel-dark theme       │
│                                            │
│  🖼️ Pill (always visible)                  │
│  📋 Panel (expands on pending decision)    │
│  🎮 Allow / Deny / Submit / Skip buttons   │
│  🔊 8-bit sound engine (throttled)         │
│                                            │
└────────────────────────────────────────────┘
```

### 🧩 MODULE REFERENCE

| Module | File | Role |
|--------|------|------|
| **Hook relay** | `src/bridge/bridge.js` | stdin → Named Pipe → stdout decision relay |
| **Event parser** | `src/core/hookEvent.js` | Raw hook payload → structured event + tool description |
| **Event normalizer** | `src/core/eventNormalizer.js` | CLI event names → canonical PascalCase |
| **State machine** | `src/core/sessionStore.js` | Pure `reduceEvent()` — the heart of the app |
| **Hook installer** | `src/core/configInstaller.js` | Idempotent install/uninstall of Claude hooks |
| **Question parser** | `src/core/askQuestion.js` | AskUserQuestion payload → structured questions |
| **Pipe address** | `src/core/pipePath.js` | Per-user Named Pipe path |
| **Pipe server** | `src/server/hookServer.js` | Named Pipe server with blocking I/O for decisions |
| **App state** | `src/main/appState.js` | Session map, pub/sub, permission/question brokering |
| **Window layout** | `src/main/windowLayout.js` | Height clamping to screen bounds |
| **Main process** | `src/main/main.js` | Window, tray, IPC routing, lifecycle |
| **Preload** | `src/main/preload.js` | contextBridge — safe renderer↔main API |
| **View model** | `src/renderer/renderModel.js` | Pure state → view-model (rows, collapsed, mascotState) |
| **Renderer** | `src/renderer/island.js` | DOM builder + sound engine + interaction cards |
| **Styles** | `src/renderer/island.css` | Dark pixel theme, scrollable panel, animations |

### 🏆 ACHIEVEMENTS UNLOCKED

- [x] Real-time Claude Code session tracking
- [x] Interactive Allow/Deny permission cards
- [x] AskUserQuestion — select / multi-select / free-text input
- [x] 8-bit sound effects per event (throttled to avoid ear rape)
- [x] Quiet mode — island stays collapsed during background activity
- [x] System tray with hook install/uninstall/quit
- [x] Auto-install hooks on first launch
- [x] NSIS installer + portable single-file EXE
- [x] Full TDD test suite on the core layer
- [x] Scrollable panel with hidden scrollbar (clean pixel look)
- [x] Window height clamped to screen bounds

---

## 🧪 TEST SUITE

```bash
npm test
```

Pure `node:test` — no extra deps. Covers:

| Test file | What it verifies |
|-----------|-----------------|
| `test/eventNormalizer.test.js` | Raw event name → canonical form |
| `test/hookEvent.test.js` | Payload parsing + tool description derivation |
| `test/pipePath.test.js` | Named Pipe address generation |
| `test/bridge.test.js` | stdin → pipe → stdout relay |
| `test/configInstaller.test.js` | Hook install/uninstall idempotency |
| `test/islandCss.test.js` | CSS class + structure assertions |
| `test/smoke.test.js` | Harness sanity check |

---

## 🙏 CREDITS

Ported from [CodeIsland](https://github.com/wxtsky/CodeIsland) by **@wxtsky**.
8-bit sounds and the Claude mascot/icon are reused from that MIT-licensed project.

## 📜 LICENSE

MIT — see [LICENSE](LICENSE)
