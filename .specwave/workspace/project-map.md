# Project Map（项目路径图）

> 这是本仓库的“结构真相源”：只记录结论（结构/职责/边界），不写过程复盘。

## 0. 初始化成果
- 初始化快照（只读）：`.specwave/workspace/specs/INIT-000001(初始化成果-AGENTS快照).md`
- 本文件是“可持续更新版”，后续需求/任务统一引用这里。

## 1. 入口与运行方式
- 入口：桌面应用（Electron）+ 三栏 UI（`ui-next`）。
- 启动（开发）：`pnpm dev`（等价于 `pnpm -C apps/desktop dev`）；Windows 可用 `start.bat`。
- 构建：`pnpm build`（等价于 `pnpm -C apps/desktop build`）。
- 打包（Windows）：`pnpm -C apps/desktop dist:win`（输出到 `apps/desktop/release/`）。
- 类型检查：`pnpm typecheck`（`tsc -b`）。
- 运行环境：Windows（当前主要）。

## 2. 路径树（只展开到 2~3 层，忽略依赖目录）
```text
.
├─ apps/
│  └─ desktop/
│     ├─ src/
│     │  ├─ main/
│     │  ├─ preload/
│     │  └─ renderer/
│     └─ electron.vite.config.ts
├─ packages/
│  ├─ contracts/
│  │  └─ src/
│  └─ ui-next/
│     └─ src/
│        ├─ shell/
│        ├─ panels/
│        ├─ primitives/
│        └─ vendor/
├─ .codex/               (Codex 项目内资源，可选)
├─ .specwave/            (协作工作区)
├─ specwave-skills/      (技能包与 CLI)
└─ start.bat
```

## 3. 关键目录/文件职责
| 路径 | 职责（简述） | 依赖谁 | 被谁依赖 | 边界/备注 |
| --- | --- | --- | --- | --- |
| `packages/contracts` | 唯一交互契约：`UIIntent` + `AppViewModel`（含 `ContentKind`：text/markdown/task/image） | 无 | `apps/desktop`、`packages/ui-next` | 只放类型定义 |
| `packages/ui-next` | 纯 UI：只渲染 `ViewModel`、只派发 `UIIntent` | `@specwave/contracts` | `apps/desktop` renderer | 禁止接触 Node/Electron/文件系统 |
| `packages/ui-next/src/panels/left` | 左栏：文件树/搜索结果/Story 看板等展示（含右键菜单：复制路径/名称、打开所在文件夹） | `primitives`、contracts | `shell` | 禁止 import 其他 panels |
| `packages/ui-next/src/panels/left/StoryBoardView.tsx` | Story 看板视图：按阶段分列展示 Story 卡片 | `primitives/StoryCard`、contracts | `panels/left/LeftPanel` | 只渲染 StoryBoardVM，dispatch STORY_CARD_CLICK |
| `packages/ui-next/src/panels/center` | 中栏：内容工作区（markdown 渲染/源码编辑/文件内查找/图片预览/任务卡片看板 + 详情编辑 + “开始”联动终端） | `primitives`、contracts | `shell` | 禁止 import 其他 panels；UI 不解析 markdown，只消费 VM |
| `packages/ui-next/src/panels/center/PhaseIndicator.tsx` | 阶段流转指示器：展示 Story 5 阶段进度，支持点击跳转 | contracts | `panels/center/CenterPanel` | 只渲染 PhaseIndicatorVM，dispatch PHASE_INDICATOR_CLICK |
| `packages/ui-next/src/panels/right` | 右栏：终端/对话 tabs | `primitives` | `shell` | 禁止 import 其他 panels |
| `packages/ui-next/src/primitives` | 可复用 UI 组件与样式 | tokens | panels/shell | 自写组件样式用 CSS Modules；shadcn 引入组件允许 Tailwind class（集中在 `primitives/shadcn`） |
| `packages/ui-next/src/primitives/StoryCard.tsx` | Story 卡片组件：展示标题、创建时间、任务进度、阶段标签 | contracts | `panels/left/StoryBoardView` | 纯展示组件，不含业务逻辑 |
| `packages/ui-next/src/primitives/TiltedCard.tsx` | Tilted Card 动效容器（克制 tilt/scale，自动尊重“减少动态效果”） | `motion/react` | `panels/center` | 只做动效与降级，不绑定业务字段 |
| `packages/ui-next/src/primitives/shadcn` | shadcn/ui 引入的可控组件（new-york v4） | Tailwind v4 + Radix + lucide | panels/left、panels/center | 只在 primitives 内维护，避免散落；组件内部可带少量 reset（如 `list-none`）来保证样式稳定 |
| `packages/ui-next/src/primitives/shadcn/sidebar.tsx` | Sidebar 套件（Provider/Menu/Button 等） | Radix + lucide | `panels/left` | 与三栏布局共存：左栏固定用 `collapsible="none"` |
| `packages/ui-next/src/primitives/shadcn/button.tsx` | Button（shadcn/ui） | Radix Slot + cva | `primitives/shadcn/sidebar.tsx`、`panels/center` | 统一按钮交互与 focus ring |
| `packages/ui-next/src/primitives/shadcn/input.tsx` | Input（shadcn/ui） | 无 | `primitives/shadcn/sidebar.tsx`、`panels/center` | 统一输入框交互与 focus ring |
| `packages/ui-next/src/primitives/shadcn/textarea.tsx` | Textarea（shadcn/ui） | 无 | `panels/center` | 任务详情编辑用多行输入 |
| `packages/ui-next/src/primitives/shadcn/separator.tsx` | Separator（Sidebar 内部依赖） | Radix Separator | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `packages/ui-next/src/primitives/shadcn/sheet.tsx` | Sheet（抽屉/侧滑面板：任务详情等） | Radix Dialog + lucide | `primitives/shadcn/sidebar.tsx`、`panels/center` | 视觉口径遵守 Flat：调用方按需用 `!shadow-none` 等覆盖 |
| `packages/ui-next/src/primitives/shadcn/tooltip.tsx` | Tooltip（提示气泡） | Radix Tooltip | `primitives/shadcn/sidebar.tsx`、`panels/center` | 控制 hover/focus 提示，不承载业务逻辑 |
| `packages/ui-next/src/primitives/shadcn/skeleton.tsx` | Skeleton（Sidebar 内部依赖） | 无 | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `packages/ui-next/src/primitives/shadcn/use-mobile.ts` | `useIsMobile`（Sidebar 内部依赖） | React | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `apps/desktop/src/renderer/src/tailwind.css` | Tailwind（preflight + utilities），专门给 shadcn/ui 的 class 用 | `tailwind.config.cjs` | renderer 入口 | 放在 renderer 内编译，避免 monorepo 下依赖包里的 `@tailwind` 指令漏编译 |
| `packages/ui-next/src/styles.css` | 全局 tokens/reset（不放 Tailwind 指令） | 无 | renderer 入口 | 禁止把业务组件样式写进这里；支持 `data-theme="dark"` 覆盖 tokens；Tailwind 由 renderer 侧单独引入 |
| `tailwind.config.cjs` | Tailwind 配置 | 无 | renderer 构建链路 | content 覆盖 renderer + `ui-next`；补齐 shadcn tokens/colors 映射 |
| `apps/desktop/src/renderer/postcss.config.cjs` | renderer 的 PostCSS/Tailwind 配置 | `@tailwindcss/postcss` | Vite renderer | Tailwind v4：通过 `base` 指到仓库根，确保能扫到 `packages/ui-next` 里的 class；Tailwind 配置由 `styles.css` 的 `@config` 指定 |
| `components.json` | shadcn CLI 配置（未来可继续 add 组件） | 无 | 人/工具 | 输出路径指向 `primitives/shadcn`，避免散落 |
| `apps/desktop/src/main` | Electron 主进程：窗口、IPC、GPU 策略、pty（含目录监听与二进制读取） | Electron/Node | Electron entry | 系统能力集中在这里 |
| `apps/desktop/src/preload` | `contextBridge` 暴露能力：文件系统/终端/窗口控制（含目录变更事件与原生弹窗、在资源管理器定位/打开路径） | Electron | renderer | UI 不直连 Node 能力 |
| `apps/desktop/src/renderer/src/store.ts` | store：唯一 `dispatch(intent)` 入口，编排业务状态（含图片预览与文件外部变更处理） | contracts + preload API | UI | 业务逻辑集中在 store，不进 UI |
| `apps/desktop/package.json` | 桌面端依赖与 scripts（dev/build/dist），并内置 `electron-builder` 打包配置 | pnpm + electron-vite + electron-builder | 人/CI | `dist:win` 会生成 `release/`；签名走 `CSC_LINK`/`CSC_KEY_PASSWORD` |
| `start.bat` | Windows 启动与排障开关（ANGLE/GPU） | pnpm | 人 | 开发时默认静默启动 |
| `.codex` | 项目内 Codex 资源：skills + prompts（用于“只影响本项目”的 AI 行为） | `specwave create`（设置 `CODEX_HOME`） | Codex CLI | 默认写到全局 `CODEX_HOME`；需要可复现时指到项目根 `.codex` |
| `.codex/skills/specwave-router/session_guard.py` | 会话自愈脚本：把 `.specwave/settings.json` 的会话投影对齐到“当前 Codex 会话”，避免多会话串阶段 | Python | `AGENTS.md`、`specwave-router` | 并发会话会要求显式 `--session-id`；建议每次对话先 `sync` |
| `.specwave/workspace` | 需求/验收/追溯工作区 | 无 | 人+AI | 资料只落这里 |
| `specwave-skills` | skills/CLI 资源（可公开复用） | Node | `specwave` 命令 | 不属于业务源码 |

## 4. 边界与约束（影响面）
- 三栏互不 import：`left/center/right` 互相隔离，只能被 `shell` 组合。
- UI 与运行时解耦：UI 只消费 `ViewModel`、只发 `UIIntent`，真实能力走 preload + IPC。
- 样式隔离：全局以 tokens/reset 为主；Tailwind 已启用 preflight（全局基础 reset），自写组件仍优先用 CSS Modules，避免外溢。
