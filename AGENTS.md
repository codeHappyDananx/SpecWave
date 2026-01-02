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
  - 做什么：整改总览（当前结论/未关闭项/V1.x 待办/V2.0 规划），保持短而可维护。
  - 依赖谁：`docs/archive/整改文档-归档-2026-01-02.md`（历史归档，只读）。
  - 由谁依赖：人（评审/改造/回归时对照）。
- `docs/archive/整改文档-归档-2026-01-02.md`
  - 做什么：整改文档历史快照（只读归档），保留当时的问题清单与执行记录。
  - 依赖谁：无。
  - 由谁依赖：`整改文档.md`（历史引用）、人。
- `.gitignore`
  - 做什么：忽略依赖与构建产物；阻断 `tsc` 误输出污染源码目录。
  - 依赖谁：无。
  - 由谁依赖：git。
- `package.json`
  - 做什么：monorepo scripts 入口（`dev/build/typecheck`，其中 `typecheck` 使用 `tsc -b`）。
  - 依赖谁：`pnpm` / workspace。
  - 由谁依赖：所有 workspace。
- `pnpm-lock.yaml`
  - 做什么：依赖锁文件（保证安装可复现；升级 Electron 等二进制依赖时必须同步更新）。
  - 依赖谁：`pnpm`。
  - 由谁依赖：本仓库所有安装/构建/CI。
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
  - 做什么：Windows 一键启动（执行 `pnpm dev`），并提供常用排障开关（ANGLE/WebGL/GPU）与残留进程清理。
  - 依赖谁：`pnpm`。
  - 由谁依赖：人。
  - 默认行为：
    - 清理本仓库残留的 `electron/node/esbuild` 进程（避免端口占用与 cache 锁冲突）。
    - 设置开发环境 `SPECWAVE_USER_DATA_DIR=.tmp-specwave-userdata/`（可回收）。
    - 默认使用 `SPECWAVE_ANGLE=d3d11`（优先硬件加速 + WebGL2）。
    - 默认静默（不输出启动诊断日志）；需要时用 `--verbose` 打开。
    - 启动失败时会保留窗口并提示（避免双击“一闪而过”但无报错）。
  - 参数：
    - `start.bat d3d9|d3d11|warp|swiftshader|nogpu`
    - `start.bat --no-clean`
    - `start.bat --devtools`
    - `start.bat --verbose`

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
- `apps/desktop/package.json`
  - 做什么：桌面端 package 定义（Electron/React 等依赖版本；提供 `dev/build/preview/typecheck` scripts）。
  - 依赖谁：`pnpm` / workspace。
  - 由谁依赖：`pnpm --filter @specwave/desktop ...`。
- `apps/desktop/src/main/index.ts`
  - 做什么：Electron 主进程入口（注册 IPC handlers；创建 WelcomeWindow（无边框）与 MainWindow（有边框）；加载 renderer；打开外链；并负责 GPU/ANGLE/DevTools 的启动策略，且在生产模式 GPU 自救后持久化稳定配置）。
  - 依赖谁：Electron API。
  - 由谁依赖：electron-vite main entry。
  - 额外行为：转发 renderer 的 WelcomePage 关键日志到终端（只转发带 `[SpecWave][Welcome]` 前缀的 console，便于定位“随机某个背景黑屏/不渲染”）。
  - 窗口策略：
    - 启动默认创建 WelcomeWindow（`frame: false`），欢迎页右上角提供自绘 `X`（走 `APP_QUIT_REQUEST` → preload → IPC → `app.quit()`）。
    - 选择/打开项目时：renderer 调用 `specwave:openMainWindow` 创建 MainWindow（有边框），并携带 `projectPath` 作为 query；MainWindow `ready-to-show` 后再关闭 WelcomeWindow。
  - 启动开关（环境变量或同名 `--specwave-*` 参数）：
    - `SPECWAVE_ANGLE`：`d3d11`/`d3d9`/`warp`（Windows ANGLE 后端）。
    - `SPECWAVE_USE_GL`：`swiftshader-webgl`（软件 WebGL，用于 GPU 进程崩溃排查）。
    - `SPECWAVE_USER_DATA_DIR`：覆盖 Electron `userData` 目录（开发环境用于隔离 profile，避免 cache 锁冲突）。
    - `SPECWAVE_DISABLE_GPU`：`1` 时禁用 GPU（只用于排查/兜底）。
    - `SPECWAVE_DISABLE_GPU_SANDBOX`：`1` 时关闭 GPU sandbox（仅排查，存在安全权衡）。
    - `SPECWAVE_OPEN_DEVTOOLS`：`1` 时开发模式自动打开 DevTools。
    - `SPECWAVE_RESET_GPU_PREFS`：`1` 时清空 `userData/gpu-preferences.json`（重置自动自救的稳定 GPU 配置）。
  - 默认值：开发模式（Windows）默认 `ANGLE=d3d11`，优先硬件加速（WebGL2 背景动效在 three.js r163+ 下需要 WebGL2）。
  - 生产模式自动自救顺序（GPU 进程连续崩溃时）：`d3d11` → `d3d11 + disable-gpu-sandbox` → `d3d9` → `warp` → `swiftshader-webgl` → `disable-gpu`（并持久化到 `userData/gpu-preferences.json`）。
- `apps/desktop/src/main/gpuPrefs.ts`
  - 做什么：GPU 配置持久化（读写 `userData/gpu-preferences.json`），用于记住“自动自救”后的稳定 ANGLE/WebGL 策略（含 `disableGpuSandbox`），避免用户每次启动都要手动切换。
  - 依赖谁：Electron `app.getPath('userData')`、Node `fs/path`。
  - 由谁依赖：`apps/desktop/src/main/index.ts`。
- `apps/desktop/src/main/recentProjects.ts`
  - 做什么：最近项目持久化（读写 `userData/recent-projects.json`；默认最多 10 条、去重按最近打开排序；返回时补 `exists`）。
  - 依赖谁：Electron `app.getPath('userData')`、Node `fs/path`。
  - 由谁依赖：`apps/desktop/src/main/ipc.ts`。
- `apps/desktop/src/main/ipc.ts`
  - 做什么：主进程 IPC handlers（打开 MainWindow、退出应用；目录选择、读目录、读文本、写文本+sha256 冲突保护；以及最近项目读/写/移除）。
  - 依赖谁：Electron `ipcMain/dialog`、Node `fs/crypto`。
  - 由谁依赖：`apps/desktop/src/main/index.ts`。
- `apps/desktop/src/main/terminal/ptyManager.ts`
  - 做什么：主进程终端会话管理（`node-pty`）：创建/写入/resize/kill；把输出/退出事件转发给对应 renderer（`specwave:terminal:event`）。
  - 依赖谁：`node-pty`、Electron `WebContents`。
  - 由谁依赖：`apps/desktop/src/main/index.ts`。
- `apps/desktop/src/main/terminal/ipc.ts`
  - 做什么：终端 IPC 注册（`specwave:terminal:*`）：create/kill（invoke）、write/resize（send）。
  - 依赖谁：Electron `ipcMain`、`ptyManager`。
  - 由谁依赖：`apps/desktop/src/main/index.ts`。
- `apps/desktop/src/preload/index.ts`
  - 做什么：preload（通过 `contextBridge` 暴露 `window.specwave`：窗口控制、文件系统能力、最近项目持久化；以及终端会话 create/kill/write/resize 与事件订阅）。
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
  - 做什么：Zustand store（**唯一** UIIntent 入口 `dispatch(intent)`；按 `specwaveWindow=welcome|main` 决定启动形态；编排项目选择→文件树→打开/编辑/保存；维护布局拖拽；右区终端对接 `node-pty` 流式输出（preload 事件订阅 → store 聚合 → VM 输出），UI 不直接接触 Node 能力）。
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
  - 做什么：欢迎页（未打开项目时展示；**极简**：只渲染“打开项目”按钮，并在按钮下方居中展示历史项目列表；欢迎页窗口为 frameless：顶部 44px 为无感拖拽区，右上角自绘 `X` 用于退出应用；背景动效默认走 WebGL，若检测到软件 WebGL 或发生 `CONTEXT_LOST_WEBGL` 会自动切到 CSS 动效；背景 DPR 按系统缩放渲染）。
  - 依赖谁：`@specwave/contracts`、`primitives/Icons`、`vendor/react-bits`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/shell/WelcomePage.module.css`
  - 做什么：欢迎页样式（内容区居中；历史列表默认无背景；允许单页炫酷，但必须局部化，不影响主工作区）。
  - 依赖谁：tokens（CSS variables）。
  - 由谁依赖：`WelcomePage.tsx`。
- `packages/ui-next/src/shell/TopBar.tsx`
  - 做什么：顶部栏（项目 tabs / 搜索 / 功能入口），只上报 intents，不落业务逻辑。
  - 依赖谁：`primitives/*`、`@specwave/contracts`。
  - 由谁依赖：`SpecWaveApp.tsx`。
- `packages/ui-next/src/shell/TopBar.module.css`
  - 做什么：TopBar 样式（布局 + 项目 tabs 区 + 打开项目按钮；搜索输入样式在 `primitives/SearchInput`）。
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
- `packages/ui-next/src/vendor/react-bits/webglDiagnostics.ts`
  - 做什么：WebGL 初始化/丢上下文诊断（中文日志）+ 统一停帧；在丢上下文时广播 `specwave-webgl-context-lost`，用于 WelcomePage 自动切换到 CSS 动效，避免黑屏/低帧率拖垮体验。
  - 依赖谁：DOM canvas、console。
  - 由谁依赖：`FaultyTerminal` / `PrismaticBurst` / `Prism` / `ColorBends` / `Hyperspeed`。
- `packages/ui-next/src/vendor/react-bits/FaultyTerminal.tsx` / `packages/ui-next/src/vendor/react-bits/FaultyTerminal.module.css`
  - 做什么：WelcomePage 背景动效（WebGL/OGL）。
  - 依赖谁：`ogl`、React。
  - 由谁依赖：`WelcomePage.tsx`（随机背景池之一）。
- `packages/ui-next/src/vendor/react-bits/PrismaticBurst.tsx` / `packages/ui-next/src/vendor/react-bits/PrismaticBurst.module.css`
  - 做什么：WelcomePage 背景动效（WebGL/OGL）。
  - 依赖谁：`ogl`、React。
  - 由谁依赖：`WelcomePage.tsx`（随机背景池之一）。
- `packages/ui-next/src/vendor/react-bits/Prism.tsx` / `packages/ui-next/src/vendor/react-bits/Prism.module.css`
  - 做什么：WelcomePage 背景动效（WebGL/OGL）。
  - 依赖谁：`ogl`、React。
  - 由谁依赖：`WelcomePage.tsx`（随机背景池之一）。
- `packages/ui-next/src/vendor/react-bits/ColorBends.tsx` / `packages/ui-next/src/vendor/react-bits/ColorBends.module.css`
  - 做什么：WelcomePage 背景动效（WebGL/Three.js shader）。
  - 依赖谁：`three`、React。
  - 由谁依赖：`WelcomePage.tsx`（随机背景池之一）。
- `packages/ui-next/src/vendor/react-bits/Hyperspeed.tsx` / `packages/ui-next/src/vendor/react-bits/Hyperspeed.module.css` / `packages/ui-next/src/vendor/react-bits/HyperSpeedPresets.ts`
  - 做什么：WelcomePage 背景动效（Three.js + postprocessing）。
  - 依赖谁：`three`、`postprocessing`、React。
  - 由谁依赖：`WelcomePage.tsx`（随机背景池之一）。

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
- `packages/ui-next/src/primitives/ShinyText.tsx` / `packages/ui-next/src/primitives/ShinyText.module.css`
  - 做什么：渐变扫光文字（欢迎页按钮/关闭等“炫酷但局部化”的展示效果）。
  - 依赖谁：`motion/react`、React。
  - 由谁依赖：`WelcomePage.tsx`。
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
- `packages/ui-next/src/primitives/SearchInput.tsx` / `packages/ui-next/src/primitives/SearchInput.module.css`
  - 做什么：顶部搜索输入（带图标与清空），只负责输入展示与事件上报；样式局部化，避免影响其它区域。
  - 依赖谁：`Icons`、tokens（CSS variables）。
  - 由谁依赖：TopBar。

#### ui-next / panels（三栏内容）

- `packages/ui-next/src/panels/left/LeftPanel.tsx` / `packages/ui-next/src/panels/left/LeftPanel.module.css`
  - 做什么：左区（工作区树 + 项目文件树；点击目录展开，点击文件打开；用图标/颜色区分文件夹/文件/常见类型，且去掉冗余头部图标）。
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
  - 做什么：终端视图（xterm 渲染 + FitAddon 自适应；输入/resize 只派发 intents，输出由 store 推送）。
  - 依赖谁：`@xterm/xterm`、`@xterm/addon-fit`。
  - 由谁依赖：RightPanel。
- `packages/ui-next/src/panels/right/ChatView.tsx` / `packages/ui-next/src/panels/right/ChatView.module.css`
  - 做什么：对话视图（消息列表 + `PromptInput`）。
  - 依赖谁：`PromptInput`。
  - 由谁依赖：RightPanel。
