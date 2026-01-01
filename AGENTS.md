# SpecWave 协作门禁（给 AI / 开发者）

> 目标：**彻底解耦 + 可持续扩展**。UI 只渲染 `ViewModel`、只发 `UIIntent`；业务/文件系统/终端/AI 能力统一走 ports/adapters（后续接入）。

## 强制规则（写死）

1) **禁止把业务逻辑写进 UI**  
   - `packages/ui-next` 只能做“展示 + 采集交互”，只能通过 `dispatch(intent)` 上报意图。
2) **改动即更新**  
   - 如果你修改了某个文件的职责/行为/入口（哪怕只是 UI 行为），必须同步更新本文件对应条目。
   - 新增文件：必须在本文件补一条“它做什么/由谁依赖/依赖谁”。
3) **先改 contracts，再改实现**  
   - 新交互语义优先在 `packages/contracts` 定义 `UIIntent` / `ViewModel` 字段，再由 `store` 实现，再由 UI 消费。
4) **样式与新组件参照规范**  
   - 新增组件、修改视觉风格、调整交互细节时，必须参照 `SPECWAVESTYLE.MD` 的口径。

## 项目结构（为什么这样分层）

- `packages/contracts`：**唯一**的交互契约（`UIIntent` + `ViewModel`），用于解耦 UI 与运行时实现。
- `packages/ui-next`：纯 UI（React 组件 + Flat 样式 + 内置图标），不接触 Electron/Node/文件系统。
- `apps/desktop`：Electron 桌面端运行时（主进程、preload、renderer），负责把真实能力接到 `store`（未来通过 ports/adapters）。

## 功能与文件职责清单（关键文件）

### 根目录
- `package.json`：monorepo workspace 脚本入口（`dev/build/typecheck`）。
- `pnpm-workspace.yaml`：pnpm workspace 定义。
- `tsconfig.json`：TS project references 聚合。
- `start.bat`：Windows 一键启动（执行 `pnpm dev`）。

### contracts（交互契约层）
- `packages/contracts/src/index.ts`
  - 定义：`UIIntent`、`AppViewModel`、`ProjectTabVM`、`RightMode`、`CenterMode` 等。
  - 约束：任何“新增按钮/交互/模式切换”先在这里落契约。
  - 布局：`LayoutVM` + 拖拽相关 intents（`LAYOUT_*`），用于三栏可拉伸与收起动画。

### desktop（桌面运行时层）
- `apps/desktop/src/main/index.ts`
  - Electron 主进程：创建窗口、加载 renderer。
- `apps/desktop/src/preload/index.ts`
  - preload：暴露 `window.specwave` 的最小 API（后续扩展 ports）。
- `apps/desktop/src/renderer/src/main.tsx`
  - renderer 入口：注入字体与全局样式，渲染 React。
- `apps/desktop/src/renderer/src/ui/App.tsx`
  - UI 容器：绑定全局快捷键（目前保留，但不在 UI 里展示任何“快捷键提示按钮”）。
  - 把 `vm/dispatch` 传给 `SpecWaveApp`。
- `apps/desktop/src/renderer/src/store.ts`
  - Zustand store：**唯一**的 UIIntent 入口 `dispatch(intent)`，维护 mock `AppViewModel`。
  - 当前行为（可替换/可演进）：
    - 顶部“打开项目”会新增一个 mock 项目 tab（后续会接真实选择器/磁盘扫描）。
    - 右区支持终端/对话模式切换；`+` 新增终端面板或对话会话。
    - 中区可切换 work/tasks；关闭中区时默认打开右区终端（右区仍允许关闭，关闭后右侧可为空白）。
    - 三栏支持拖拽改宽度：按“先压中区→再压右区/左区→达到最小值后收起”的规则执行（由 `LAYOUT_DRAG_*` 驱动）。

### ui-next（纯 UI 层）
- `packages/ui-next/src/styles.css`
  - 全局 Flat tokens + 组件样式。
  - 约束：禁止阴影/玻璃态；层级靠字号/色块/留白。
- `packages/ui-next/src/primitives/Icons.tsx`
  - 内置 SVG 图标（与本项目 Flat 风格一致），避免引入第三方图标库。
- `packages/ui-next/src/primitives/PromptInput.tsx`
  - 统一输入框组件（终端/对话共用）：Enter 提交、Shift+Enter 不提交（保留给未来多行输入扩展）。
- `packages/ui-next/src/shell/SpecWaveApp.tsx`
  - 工作区 5 区域的 UI Shell：
    - 顶部：项目 tabs + 搜索 + 4 个功能图标（打开项目/任务/终端/皮肤）。
    - 左区：文件/导航面板（图标化头部）。
    - 中区：内容区（work/tasks）。
    - 右区：终端/对话切换（图标 tabs）+ `+` 新增 + 多页签。
    - 底部：状态条（不展示任何快捷键提示按钮）。
  - 交互：三栏之间提供透明分隔拖拽条；拖拽仅上报 `LAYOUT_DRAG_*`，不在 UI 内实现规则。
  - 响应式：窗口变窄时三栏会被压缩，但各区域内容有最小展示宽度；达到后在该区域出现横向滚动条（不是整页横滚）。
  - 中区口径：中区内容最小展示宽度 = 当前窗口宽度的 70%（至少 320px）；小于该宽度时中区内部横向滚动查看。
  - 右区页签：终端/对话的页签条展示在右区头部（紧挨着模式切换按钮右侧），终端/对话内容区不再重复渲染页签条。
  - 终端空态：当所有终端页签关闭后，右区展示“点击 + 新建终端”的提示，不渲染输入框（避免布局异常）。
