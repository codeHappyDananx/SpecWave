# SpecWave

这是一个“规范 + AI 工作区”的桌面端新仓库（重构版）。

## 目标（第一阶段）

- 先把三段工作区壳跑起来：左区 / 中区 / 右区
- UI 与业务彻底解耦：UI 只发 `UIIntent`、只读 `ViewModel`
- 视觉口径固定：Light Mode + Flat（无阴影、无模糊）
- 字体离线内置：Outfit + JetBrains Mono

## 开发

- 安装依赖：`pnpm install`
- 启动开发：`pnpm dev`
- 类型检查：`pnpm typecheck`

## 快捷键（MVP）

- `Ctrl+S`：保存（示意）
- `Ctrl+F`：查找（示意）
- `Ctrl+Alt+1`：切到右区“终端”（并自动显示右区）
- `Ctrl+Alt+2`：切到右区“对话”（并自动显示右区）

## 目录约定（简述）

- `apps`：可运行的应用（先做桌面端）
- `packages`：可复用的模块（contracts / ui-next 等）
