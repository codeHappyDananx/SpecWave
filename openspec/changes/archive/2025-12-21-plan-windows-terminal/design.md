## 上下文
- 当前终端通过 WebSocket 连接 `terminal-server.js`
- `terminal-server.js` 依赖 node-pty
- 主进程使用外部 Node 启动终端服务器，稳定性不足
- 目标平台仅 Windows

## 目标 / 非目标
- 目标：接近 Windows Terminal 体验，支持 PowerShell 与 CMD
- 目标：不依赖 nvm 或外部 Node，应用内可启动
- 目标：保持 `contextIsolation: true` 与 `nodeIntegration: false`
- 非目标：多平台支持
- 非目标：多标签终端或远程连接

## 决策
- 决策：主进程直接使用 node-pty 创建 PTY，并通过 IPC 传输数据
- 决策：渲染进程使用 xterm 接收输出，按需发送输入与 resize
- 决策：默认 PowerShell，允许切换 CMD

## 考虑的替代方案
- 保持独立终端服务器 + WebSocket：实现成本低，但依赖外部 Node，打包复杂
- 直接拉起系统 Windows Terminal：无法内嵌，体验不一致
- 纯 Web 伪终端：无 PTY，兼容性差

## 风险 / 权衡
- node-pty 为原生模块，需要 Electron 侧 rebuild
- 不同 Windows 版本对 ConPTY 支持不同，需要明确最低版本
- 终端 IO 量大时需要节流与背压

## 迁移计划
- 第一步：保留现有 UI，替换数据通道为 IPC
- 第二步：移除 `terminal-server.js` 或保留为调试模式
- 第三步：完善文档与安装指引

## 待决问题
- 是否在 UI 中提供 PowerShell/CMD 切换入口
- node-pty 使用预编译包还是本地编译
