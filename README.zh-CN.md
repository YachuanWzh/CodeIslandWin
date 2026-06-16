# CodeIslandWin

**[English](README.md) | 简体中文**

**Windows 版 AI 编码助手实时状态浮岛。** 这是 [CodeIsland](../CodeIsland)（macOS
灵动岛应用）的 Windows 移植版，基于 Electron + Node 实现。

CodeIslandWin 会在屏幕顶部居中悬浮一个像素风格的「浮岛」，实时展示 Claude Code 正在
做什么——包括活跃会话、当前调用的工具，以及需要你 **批准 / 拒绝** 的权限请求，让你
无需切回终端即可处理。

> MVP 范围：仅支持 **Claude Code**。架构上预留了扩展更多 CLI 的空间。

## 工作原理

```
Claude Code 触发 hook
  → node bridge.js --source claude   （从 stdin 读取事件 JSON）
    → Windows 命名管道  \\.\pipe\codeisland-<user>     （替代 macOS 的 Unix socket）
      → hookServer.js 收到事件
        → reduceEvent() 更新会话状态（纯状态机）
        → Electron 浮岛重新渲染
        → 权限/提问：服务端会一直阻塞直到你点击，
          然后把 JSON 决策通过管道写回 → bridge.js → stdout → Claude Code
```

与 macOS 原版的关键差异：

| macOS CodeIsland         | CodeIslandWin                       |
|--------------------------|-------------------------------------|
| MacBook 刘海面板          | 无边框透明的顶部居中悬浮窗            |
| Unix 域 socket           | Windows 命名管道（`net` 模块）        |
| 原生 Swift bridge 二进制  | 极小的 Node `bridge.js` 脚本          |
| Swift / SwiftUI          | Electron + HTML/CSS                  |

## 运行

```bash
cd CodeIslandWin
npm install
npm start
```

启动后会：
1. 启动命名管道 hook 服务。
2. 自动把 Claude Code 的 hook 写入 `~/.claude/settings.json`（幂等，可重复执行）。
3. 显示浮岛；有会话活跃时展开，空闲时收起。

在任意终端开启一个新的 Claude Code 会话——浮岛就会亮起。当 Claude 请求权限时，
浮岛中会出现 **Allow / Deny（批准 / 拒绝）** 卡片。

托盘图标可用于重新安装 / 卸载 hook，或退出程序。

## 打包发布

用 [electron-builder](https://www.electron.build/) 产出可双击运行的 Windows 安装包
（最终用户无需开发环境）：

```bash
npm run pack      # 仅解包到 dist/（较快，用于冒烟测试）
npm run dist      # 生成 NSIS 安装包 + 便携版 .exe 到 dist/
```

`npm run dist` 会生成 `CodeIsland Setup <版本>.exe` 安装包（可让用户自选安装目录）
以及一个单文件便携版 `.exe`。

## 开发 / 测试

```bash
npm test          # node:test 套件，覆盖全部非 GUI 核心逻辑
```

核心逻辑均有单元测试 + 集成测试覆盖：

| 模块 | 作用 |
|------|------|
| `src/core/eventNormalizer.js` | 把各 CLI 的原始事件名归一化为标准 PascalCase |
| `src/core/hookEvent.js`       | 解析 hook 负载并推导工具描述 |
| `src/core/pipePath.js`        | 按用户隔离的命名管道地址 |
| `src/core/sessionStore.js`    | 纯函数 `reduceEvent` 会话状态机 |
| `src/core/configInstaller.js` | 幂等地安装 / 卸载 Claude hook |
| `src/server/hookServer.js`    | 命名管道服务，负责权限/提问的阻塞式路由 |
| `src/bridge/bridge.js`        | stdin → 管道 → stdout 决策中继 |
| `src/main/appState.js`        | 会话表 + 权限请求代理 |
| `src/renderer/renderModel.js` | 纯函数：状态 → 视图模型 |

## 致谢

移植自 @wxtsky 的 [CodeIsland](https://github.com/wxtsky/CodeIsland)。
8-bit 音效与 Claude 吉祥物/图标复用自该 MIT 协议项目。

## 许可证

MIT
