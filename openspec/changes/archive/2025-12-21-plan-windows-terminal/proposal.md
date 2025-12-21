# 变更：Windows 右侧终端可用性与原生体验

## 为什么
- 当前右侧终端无法稳定启动，主要问题是 node-pty 缺失与终端服务器启动链路依赖外部 Node
- 终端是核心操作入口，需要接近原生 Windows Terminal 的交互体验

## 变更内容
- 明确 Windows-only 的终端能力范围与验收标准
- 选定可靠的 PTY 方案与进程模型
- 定义 IPC 传输边界与错误处理
- 支持剪贴板图片落盘并粘贴绝对路径
- 支持终端多会话页签与新增会话入口
- 输出实施任务清单与文档改动

## 影响
- 受影响规范：terminal（新增）
- 受影响代码：electron/main.js、electron/preload.js、terminal-server.js、src/components/TerminalPanel.vue、package.json
- 运行环境：Windows + Node.js 18+ + node-pty 构建依赖
