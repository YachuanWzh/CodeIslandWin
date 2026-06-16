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
│   🏝️  浮岛版 — WINDOWS 移植                      │
│                                                  │
│   [ 加载中... ████████░░ ] 状态：在线             │
└──────────────────────────────────────────────┘
```

> 🎮 **玩家 1：Claude Code** — 你的 AI 编码代理
> 🖥️ **战场：Windows 桌面** — 主战区
> 🏝️ **HUD：CodeIslandWin** — 实时任务控制中心

**[English](README.md) | 简体中文**

---

## 📟 任务简报

欢迎，特工。

Claude Code 在你的终端里埋头苦干——但你不可能 24 小时盯着它。**CodeIslandWin**
就是你的常驻 HUD。一个像素完美的浮岛悬浮在屏幕顶部中央，实时展示 Claude 的一举一动，
配上让 Game Boy 都自愧不如的 8-bit 音效。

当 Claude 需要权限运行命令，或向你提问时——浮岛会自动展开。你直接在浮窗里点
**批准 / 拒绝**，无需切回终端。

移植自 macOS 平台的 [CodeIsland](https://github.com/wxtsky/CodeIsland)（作者 **@wxtsky**）。

### 🎯 功能矩阵

| 🕹️ 事件 | 💬 HUD 显示 | 🔊 8-bit 音效 |
|-----------|-------------|-------------|
| Claude 启动会话 | `会话开始` | `♪ boot.wav` |
| 你提交 prompt | `思考中…` | `♪ submit.wav` |
| 工具执行（Bash / Read / Edit） | `▶ 运行中 · Bash` | `♪ start.wav` |
| 需要权限批准 | `⚠️ 等待批准` | `♪ approval.wav` |
| Claude 提问 | `? 问题` | `♪ approval.wav` |
| 任务完成 | `✓ 空闲` | `♪ complete.wav` |
| 工具执行失败 | `✗ 错误` | `♪ error.wav` |
| 上下文压缩中 | `压缩上下文中…` | — |

### 🎒 装备栏（技术栈）

```
⚡ Electron 31+          — 游戏引擎
📡 Windows Named Pipe    — 通信通道（替代 Unix socket）
🎨 HTML / CSS / JS       — 像素渲染器
🧪 node:test             — 质量保证
📦 electron-builder      — 打包工具
```

### 🔑 与 macOS 原版的关键差异

| macOS CodeIsland | CodeIslandWin |
|------------------|---------------|
| MacBook 刘海面板 | 无边框透明顶部居中悬浮窗 |
| Unix 域 socket | Windows 命名管道（`net` 模块） |
| 原生 Swift bridge 二进制 | 极小的 Node `bridge.js` 脚本 |
| Swift / SwiftUI | Electron + HTML/CSS |
| DMG 打包 | NSIS 安装包 + 便携版 EXE |

---

## 🕹️ 操作指南

```bash
# ▶ 启动
cd CodeIslandWin
npm install
npm start

# 🧪 训练模式（运行测试）
npm test

# 📦 构建发行版
npm run pack      # 解包到 dist/（快速冒烟测试）
npm run dist      # NSIS 安装包 + 便携版 .exe → dist/
```

启动后自动执行：
1. 启动命名管道 hook 服务。
2. 自动将 Claude Code hooks 写入 `~/.claude/settings.json`（幂等，可重复执行）。
3. 显示浮岛 pill——空闲时收起，需要你做决定时自动展开。

在任意终端开启一个**新的 Claude Code 会话**，浮岛就会亮起。

系统托盘菜单：重新安装 hooks / 卸载 hooks / 退出。

---

## 🗺️ 关卡地图（架构）

```
┌─ HOOK 层 ──────────────────────────────────┐
│                                             │
│  Claude Code hook 触发                      │
│    → bridge.js  (stdin → pipe → stdout)     │
│                                             │
└──────────────────┬──────────────────────────┘
                   │  \\.\pipe\codeisland-<用户>
┌──────────────────┴──────────────────────────┐
│  服务层                                      │
│                                             │
│  hookServer.js                              │
│  ├─ 普通事件：即发即忘                       │
│  └─ 阻塞等待：权限请求 / 提问                │
│     （等待用户点击 → 写回管道）              │
│                                             │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│  状态核心                                    │
│                                             │
│  sessionStore.js                            │
│  reduceEvent() — 纯状态机                   │
│  状态：idle → processing → running          │
│         → waitingApproval / waitingQuestion │
│                                             │
│  appState.js                                │
│  会话表 + 权限/问题代理                      │
│  发布/订阅 → 推送至渲染进程                  │
│                                             │
└──────────────────┬──────────────────────────┘
                   │  IPC (state-update)
┌──────────────────┴──────────────────────────┐
│  渲染层                                      │
│                                             │
│  renderModel.js  —  状态 → 视图模型          │
│  island.js       —  DOM 构建器               │
│  island.css      —  像素暗色主题             │
│                                             │
│  🖼️ Pill（始终可见）                         │
│  📋 Panel（有待处理决策时展开）              │
│  🎮 批准 / 拒绝 / 跳过 / 提交 按钮           │
│  🔊 8-bit 音效引擎（自动节流）               │
│                                             │
└─────────────────────────────────────────────┘
```

### 🧩 模块手册

| 模块 | 文件 | 职责 |
|--------|------|------|
| **Hook 中继** | `src/bridge/bridge.js` | stdin → 命名管道 → stdout 决策回传 |
| **事件解析** | `src/core/hookEvent.js` | 原始 hook payload → 结构化事件 + 工具描述 |
| **事件规范化** | `src/core/eventNormalizer.js` | CLI 事件名 → 标准 PascalCase |
| **状态机** | `src/core/sessionStore.js` | 纯函数 `reduceEvent()` — App 的心脏 |
| **Hook 安装器** | `src/core/configInstaller.js` | 幂等安装/卸载 Claude hooks |
| **问题解析** | `src/core/askQuestion.js` | AskUserQuestion payload → 结构化问题列表 |
| **管道地址** | `src/core/pipePath.js` | 按用户隔离的命名管道路径 |
| **管道服务** | `src/server/hookServer.js` | 命名管道服务端，含阻塞 I/O |
| **应用状态** | `src/main/appState.js` | 会话表、发布/订阅、权限/问题代理 |
| **窗口布局** | `src/main/windowLayout.js` | 窗口高度自适应 + 屏幕边界裁剪 |
| **主进程** | `src/main/main.js` | 窗口、托盘、IPC 路由、生命周期 |
| **预加载** | `src/main/preload.js` | contextBridge — 安全渲染进程↔主进程 API |
| **视图模型** | `src/renderer/renderModel.js` | 纯函数：状态 → 视图模型 |
| **渲染器** | `src/renderer/island.js` | DOM 构建 + 音效引擎 + 交互卡片 |
| **样式** | `src/renderer/island.css` | 暗色像素主题、可滚动面板、动画 |

### 🏆 已解锁成就

- [x] 实时 Claude Code 会话追踪
- [x] 交互式 Allow/Deny 权限卡片
- [x] AskUserQuestion — 单选 / 多选 / 自由文本输入
- [x] 每种事件 8-bit 音效反馈（自动节流防轰炸）
- [x] 静默模式 — 后台活动时浮岛保持收起
- [x] 系统托盘：安装 / 卸载 hooks / 退出
- [x] 首次启动自动安装 hooks
- [x] NSIS 安装包 + 便携单文件 EXE
- [x] 核心层完整 TDD 测试覆盖
- [x] 可滚动面板 + 隐藏滚动条（保持像素美学）
- [x] 窗口高度自适应屏幕边界

---

## 🧪 测试套件

```bash
npm test
```

纯 `node:test`——零额外依赖。覆盖范围：

| 测试文件 | 验证内容 |
|-----------|---------|
| `test/eventNormalizer.test.js` | 原始事件名 → 标准格式 |
| `test/hookEvent.test.js` | Payload 解析 + 工具描述推导 |
| `test/pipePath.test.js` | 命名管道地址生成 |
| `test/bridge.test.js` | stdin → pipe → stdout 中继 |
| `test/configInstaller.test.js` | Hook 安装/卸载幂等性 |
| `test/islandCss.test.js` | CSS 类名 + 结构断言 |
| `test/smoke.test.js` | 测试框架健全性检查 |

---

## 🙏 致谢

移植自 **@wxtsky** 的 [CodeIsland](https://github.com/wxtsky/CodeIsland)。
8-bit 音效与 Claude 吉祥物/图标复用自该 MIT 协议项目。

## 📜 许可证

MIT — 详见 [LICENSE](LICENSE)
