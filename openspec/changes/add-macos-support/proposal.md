# 变更：支持 macOS 打包与基础运行

## 为什么
- 当前构建配置仅输出 Windows 安装包与便携包，macOS 用户无法直接使用。
- 作为开源工具，提供 macOS 产物可以显著降低上手门槛，减少“只能在 Windows 用”的限制。

## 变更内容
- 增加 electron-builder 的 macOS target（dmg/zip，x64/arm64）。
- 引入 GitHub Actions 在 macOS Runner 上自动出包（无签名/无公证）。
- 调整终端默认 shell：Windows 维持 PowerShell/CMD，macOS 使用 zsh/bash，并确保非 Windows 环境不会触发 Windows-only 逻辑崩溃。
- 更新项目约束与使用文档，明确本地构建与 CI 构建的边界。

## 影响
- 受影响规范：terminal（修改默认 shell 与跨平台行为说明）
- 受影响代码：package.json、electron/main.js、electron/preload.js、src/components/TerminalPanel.vue、src/types/index.ts
- 受影响工程：新增 GitHub Actions workflow（macOS 出包）
