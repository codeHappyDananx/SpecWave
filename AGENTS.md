# SpecWave 协作门禁（给 AI / 开发者）

> 目标：**彻底解耦 + 可持续扩展**。UI 只渲染 `ViewModel`、只发 `UIIntent`；业务/文件系统/终端/AI 能力统一走 ports/adapters（后续接入）。

## 强制规则（写死）

1) **禁止把业务逻辑写进 UI**  
   - `packages/ui-next` 只能做“展示 + 采集交互”，只能通过 `dispatch(intent)` 上报意图。
2) **改动即更新**  
   - 如果你修改了某个文件的职责/行为/入口（哪怕只是 UI 行为），必须同步更新本文件对应条目。
   - 新增文件：必须在本文件补一条“它做什么 / 依赖谁 / 由谁依赖”。
3) **先改 contracts，再改实现**  
   - 新交互语义优先在 `packages/contracts` 定义 `UIIntent` / `ViewModel` 字段，再由 `store` 实现，再由 UI 消费。
4) **样式与新组件参照规范**  
   - 新增组件、修改视觉风格、调整交互细节时，必须参照 `SPECWAVESTYLE.MD` 的口径。

## 解耦与边界（当前仓库已落地的硬约束）

1) **三栏互不影响（强制）**  
   - `packages/ui-next/src/panels/left` / `center` / `right` 之间 **禁止互相 import**。  
   - Panels 允许依赖：`packages/ui-next/src/primitives`、`@specwave/contracts`。  
   - Shell（`packages/ui-next/src/shell`）负责组合三栏与布局；Panels 不实现布局规则。

2) **样式互不影响（强制）**  
   - 全局样式只允许放 tokens + reset：`packages/ui-next/src/styles.css`（禁止写组件样式）。  
   - 组件样式必须使用 `*.module.css`，并与组件同目录（或 `primitives` 目录），避免通用类名外溢。

3) **TypeScript 产物不进源码（强制）**  
   - 根 `typecheck` 使用 `tsc -b`（project references 需要引用工程能 emit）。  
   - `apps/desktop/tsconfig.json` 强制 `noEmit: true`。  
   - 禁止把 `src/**.js`、`src/**.d.ts`、`dist-electron/`、`*.tsbuildinfo` 提交到 git（见 `.gitignore`）。

## 项目结构（为什么这样分层）

- `packages/contracts`：**唯一**的交互契约（`UIIntent` + `ViewModel`），用于解耦 UI 与运行时实现。
- `packages/ui-next`：纯 UI（React 组件 + Flat 样式 + 内置图标），不接触 Electron/Node/文件系统。
- `apps/desktop`：Electron 桌面端运行时（主进程、preload、renderer），负责把真实能力接到 `store`（未来通过 ports/adapters）。

## 功能与文件职责清单（源码/配置为主）

### 根目录

- `整改文档.md`
  - 做什么：记录 UI 解耦评审点、整改顺序与验收口径。
  - 依赖谁：无。
  - 由谁依赖：人（评审/改造/回归时对照）。
- `.gitignore`
  - 做什么：忽略依赖与构建产物；阻断 `tsc` 误输出污染源码目录。
  - 依赖谁：无。
  - 由谁依赖：git。
- `package.json`
  - 做什么：monorepo scripts 入口（`dev/build/typecheck`，其中 `typecheck` 使用 `tsc -b`）。
  - 依赖谁：`pnpm` / workspace。
  - 由谁依赖：所有 workspace。
- `pnpm-workspace.yaml`
  - 做什么：pnpm workspace 定义。
  - 依赖谁：无。
  - 由谁依赖：`pnpm`。
- `tsconfig.base.json`
  - 做什么：全项目 TS 基础配置（strict + bundler resolution）。
  - 依赖谁：无。
  - 由谁依赖：各子项目 tsconfig。
- `tsconfig.json`
  - 做什么：TS project references 聚合入口。
  - 依赖谁：各子项目 tsconfig。
  - 由谁依赖：根 `typecheck`。
- `SPECWAVESTYLE.MD`
  - 做什么：**唯一视觉口径**（Light/Flat）。
  - 依赖谁：无。
  - 由谁依赖：所有 UI 样式改动。
- `README.md`
  - 做什么：仓库目标与开发指引。
  - 依赖谁：无。
  - 由谁依赖：人。
- `start.bat`
  - 做什么：Windows 一键启动（执行 `pnpm dev`）。
  - 依赖谁：`pnpm`。
  - 由谁依赖：人。

### contracts（交互契约层）

- `packages/contracts/src/index.ts`
  - 做什么：定义 `UIIntent`、`AppViewModel`（含 app/explorer/content/layout）以及任务/文件树等 UI 交互契约。
  - 依赖谁：无（只做类型定义）。
  - 由谁依赖：`apps/desktop` store、`packages/ui-next` UI。

### desktop（桌面运行时层）

- `apps/desktop/electron.vite.config.ts`
  - 做什么：Electron-Vite 构建/开发配置（main/preload/renderer）。
  - 依赖谁：`electron-vite`、`@vitejs/plugin-react`。
  - 由谁依赖：`pnpm -C apps/desktop dev/build`。
- `apps/desktop/tsconfig.json`
  - 做什么：桌面端 TS 配置（强制 `noEmit`，只做类型检查）。
  - 依赖谁：`tsconfig.base.json`。
  - 由谁依赖：根 `typecheck`、`apps/desktop` 的 `typecheck` script。
- `apps/desktop/src/main/index.ts`
  - 做什么：Electron 主进程入口（注册 IPC handlers、创建窗口、加载 renderer、打开外链）。
  - 依赖谁：Electron API。
  - 由谁依赖：electron-vite main entry。
- `apps/desktop/src/main/recentProjects.ts`
  - 做什么：最近项目持久化（读写 `userData/recent-projects.json`；默认最多 10 条、去重按最近打开排序；返回时补 `exists`）。
  - 依赖谁：Electron `app.getPath('userData')`、Node `fs/path`。
  - 由谁依赖：`apps/desktop/src/main/ipc.ts`。
- `apps/desktop/src/main/ipc.ts`
  - 做什么：主进程 IPC handlers（目录选择、读目录、读文本、写文本+sha256 冲突保护；以及最近项目读/写/移除）。
  - 依赖谁：Electron `ipcMain/dialog`、Node `fs/crypto`。
  - 由谁依赖：`apps/desktop/src/main/index.ts`。
- `apps/desktop/src/preload/index.ts`
  - 做什么：preload（通过 `contextBridge` 暴露 `window.specwave`：目录选择/读目录/读文件/保存文件；以及最近项目读/写/移除）。
  - 依赖谁：Electron API。
  - 由谁依赖：主进程 `BrowserWindow.webPreferences.preload`。
- `apps/desktop/src/renderer/index.html`
  - 做什么：renderer HTML 入口（挂载 `#root`）。
  - 依赖谁：无。
  - 由谁依赖：electron-vite renderer。
- `apps/desktop/src/renderer/src/fonts.css`
  - 做什么：离线字体 `@font-face` 声明（Outfit / JetBrains Mono）。
  - 依赖谁：`assets/fonts/*`。
  - 由谁依赖：`apps/desktop/src/renderer/src/main.tsx`。
- `apps/desktop/src/renderer/src/vite-env.d.ts`
  - 做什么：Vite 类型声明 + CSS Modules 声明。
  - 依赖谁：`vite/client`。
  - 由谁依赖：renderer TS 编译期。
- `apps/desktop/src/renderer/src/main.tsx`
  - 做什么：renderer 入口（引入字体与全局 tokens/reset，渲染 React 根）。
  - 依赖谁：`./fonts.css`、`@specwave/ui-next/src/styles.css`、`./ui/App`。
  - 由谁依赖：`index.html`。
- `apps/desktop/src/renderer/src/ui/App.tsx`
  - 做什么：renderer UI 容器（绑定全局快捷键；把 `vm/dispatch` 传给 `SpecWaveApp`）。
  - 依赖谁：`useAppStore`、`@specwave/ui-next`。
  - 由谁依赖：`main.tsx`。
- `apps/desktop/src/renderer/src/store.ts`
  - 做什么：Zustand store（**唯一** UIIntent 入口 `dispatch(intent)`；负责 welcome/main 模式切换；编排项目选择→文件树→打开/编辑/保存；并维护布局拖拽与右区 mock；最近项目走 preload→主进程持久化）。
  - 依赖谁：`@specwave/contracts`。
  - 由谁依赖：`App.tsx`。

> 字体资源目录：`apps/desktop/src/renderer/assets/fonts/*` 为静态资源（不在此逐文件列职责）。

### ui-next（纯 UI 层）

- `packages/ui-next/src/index.ts`
  - 做什么：对外导出 `SpecWaveApp`（UI 入口）。
  - 依赖谁：`./shell/SpecWaveApp`。
  - 由谁依赖：`apps/desktop` renderer。
- `packages/ui-next/src/styles.css`
  - 做什么：全局 tokens + reset（禁止写组件样式）。
  - 依赖谁：无。
  - 由谁依赖：`apps/desktop/src/renderer/src/main.tsx`。
- `packages/ui-next/src/css.d.ts`
  - 做什么：为 `packages/ui-next` 提供 CSS Modules 类型声明。
  - 依赖谁：无。
  - 由谁依赖：`packages/ui-next` TS 编译期。

#### ui-next / shell（组合层）

- `packages/ui-next/src/shell/SpecWaveApp.tsx`
  - 做什么：UI Shell（按 `vm.app.mode` 在 WelcomePage 与主工作区之间切换；主工作区组合 TopBar / LayoutGrid / StatusBar 与三栏 panels）。
  - 依赖谁：`shell/*`、`panels/*`、`@specwave/contracts`。
  - 由谁依赖：`packages/ui-next/src/index.ts`。
- `packages/ui-next/src/shell/SpecWaveApp.module.css`
  - 做什么：Shell 容器布局样式（root/app）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/shell/WelcomePage.tsx`
  - 做什么：欢迎页（未打开项目时展示；只负责“打开项目 + 最近项目管理”，不引入三栏逻辑）。
  - 依赖谁：`@specwave/contracts`、`primitives/Icons`、`vendor/react-bits`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/shell/WelcomePage.module.css`
  - 做什么：欢迎页样式（允许单页炫酷，但必须局部化，不影响主工作区）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：`WelcomePage.tsx`。
- `packages/ui-next/src/shell/TopBar.tsx`
  - 做什么：顶部栏（项目 tabs / 搜索 / 功能入口），只上报 intents，不落业务逻辑。
  - 依赖谁：`primitives/*`、`@specwave/contracts`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/shell/TopBar.module.css`
  - 做什么：TopBar 样式（布局 + 搜索输入 + 打开项目按钮）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：`TopBar.tsx`。
- `packages/ui-next/src/shell/LayoutGrid.tsx`
  - 做什么：三栏网格 + splitter 拖拽（只派发 `LAYOUT_*`）。
  - 依赖谁：`@specwave/contracts`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/shell/LayoutGrid.module.css`
  - 做什么：三栏网格样式（pane/splitter/dragging）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：`LayoutGrid.tsx`。
- `packages/ui-next/src/shell/StatusBar.tsx`
  - 做什么：底部状态条（展示项目/文件/保存状态与错误）。
  - 依赖谁：`primitives/Badge`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/shell/StatusBar.module.css`
  - 做什么：状态条样式。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：`StatusBar.tsx`。

#### ui-next / vendor（第三方源码）

- `packages/ui-next/src/vendor/react-bits/NOTICE.md`
  - 做什么：记录 react-bits 源码的来源、改造点与使用口径。
  - 依赖谁：无。
  - 由谁依赖：人（排查/升级/合规时对照）。
- `packages/ui-next/src/vendor/react-bits/LICENSE.md`
  - 做什么：react-bits 的许可证（MIT + Commons Clause）。
  - 依赖谁：无。
  - 由谁依赖：人（合规审阅）。
- `packages/ui-next/src/vendor/react-bits/FaultyTerminal.tsx` / `packages/ui-next/src/vendor/react-bits/FaultyTerminal.module.css`
  - 做什么：WelcomePage 背景动效（WebGL/OGL）；只允许 WelcomePage 引用，避免把动效扩散到主工作区。
  - 依赖谁：`ogl`、React。
  - 由谁依赖：`WelcomePage.tsx`。

#### ui-next / primitives（可复用组件）

- `packages/ui-next/src/primitives/Icons.tsx`
  - 做什么：内置 SVG 图标（Flat 风格）。
  - 依赖谁：无。
  - 由谁依赖：TopBar/Panels/Primitives。
- `packages/ui-next/src/primitives/keyboard.ts`
  - 做什么：键盘 Enter/Space 激活的通用辅助（用于可聚焦 tab）。
  - 依赖谁：React 类型。
  - 由谁依赖：`ProjectTab`、`ClosableTab`。
- `packages/ui-next/src/primitives/IconButton.tsx` / `packages/ui-next/src/primitives/IconButton.module.css`
  - 做什么：图标按钮（统一 active/hover/press 反馈）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：TopBar、RightPanel。
- `packages/ui-next/src/primitives/Tab.tsx` / `packages/ui-next/src/primitives/Tab.module.css`
  - 做什么：Tab 按钮（用于 tablist）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：CenterPanel。
- `packages/ui-next/src/primitives/ProjectTab.tsx` / `packages/ui-next/src/primitives/ProjectTab.module.css`
  - 做什么：项目页签（可关闭）。
  - 依赖谁：`Icons`、`keyboard`。
  - 由谁依赖：TopBar。
- `packages/ui-next/src/primitives/ClosableTab.tsx` / `packages/ui-next/src/primitives/ClosableTab.module.css`
  - 做什么：可关闭页签（终端/对话会话 tabs）。
  - 依赖谁：`Icons`、`keyboard`。
  - 由谁依赖：RightPanel。
- `packages/ui-next/src/primitives/Badge.tsx` / `packages/ui-next/src/primitives/Badge.module.css`
  - 做什么：徽标（支持 tone 与 mono）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：CenterPanel、StatusBar。
- `packages/ui-next/src/primitives/Panel.tsx` / `packages/ui-next/src/primitives/Panel.module.css`
  - 做什么：三栏面板骨架（header + scroll body + min width 变量）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：LeftPanel、CenterPanel、RightPanel。
- `packages/ui-next/src/primitives/PromptInput.tsx` / `packages/ui-next/src/primitives/PromptInput.module.css`
  - 做什么：统一输入框（终端/对话共用）：Enter 提交、Shift+Enter 不提交。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：TerminalView、ChatView。

#### ui-next / panels（三栏内容）

- `packages/ui-next/src/panels/left/LeftPanel.tsx` / `packages/ui-next/src/panels/left/LeftPanel.module.css`
  - 做什么：左区（工作区树 + 项目文件树；点击目录展开，点击文件打开）。
  - 依赖谁：`Panel`、`Icons`、`@specwave/contracts`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/panels/center/CenterPanel.tsx` / `packages/ui-next/src/panels/center/CenterPanel.module.css`
  - 做什么：中区（文件渲染/源码编辑/保存；task 文件支持任务看板勾选写回）。
  - 依赖谁：`Panel`、`Badge`、`Icons`、`react-markdown`、`@specwave/contracts`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/panels/right/RightPanel.tsx` / `packages/ui-next/src/panels/right/RightPanel.module.css`
  - 做什么：右区（终端/对话切换 + tabs + 新增入口），只派发右区相关 intents。
  - 依赖谁：`Panel`、`IconButton`、`ClosableTab`、`Icons`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/panels/right/TerminalView.tsx` / `packages/ui-next/src/panels/right/TerminalView.module.css`
  - 做什么：终端视图（输出区 + `PromptInput`）。
  - 依赖谁：`PromptInput`。
  - 由谁依赖：RightPanel。
- `packages/ui-next/src/panels/right/ChatView.tsx` / `packages/ui-next/src/panels/right/ChatView.module.css`
  - 做什么：对话视图（消息列表 + `PromptInput`）。
  - 依赖谁：`PromptInput`。
  - 由谁依赖：RightPanel。
