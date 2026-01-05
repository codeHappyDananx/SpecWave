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
├─ .specwave/            (协作工作区)
├─ specwave-skills/      (技能包与 CLI)
└─ start.bat
```

## 3. 关键目录/文件职责
| 路径 | 职责（简述） | 依赖谁 | 被谁依赖 | 边界/备注 |
| --- | --- | --- | --- | --- |
| `packages/contracts` | 唯一交互契约：`UIIntent` + `AppViewModel`（含 `ContentKind`：text/markdown/task/image） | 无 | `apps/desktop`、`packages/ui-next` | 只放类型定义 |
| `packages/ui-next` | 纯 UI：只渲染 `ViewModel`、只派发 `UIIntent` | `@specwave/contracts` | `apps/desktop` renderer | 禁止接触 Node/Electron/文件系统 |
| `packages/ui-next/src/panels/left` | 左栏：文件树/搜索结果等展示 | `primitives`、contracts | `shell` | 禁止 import 其他 panels |
| `packages/ui-next/src/panels/center` | 中栏：编辑/预览/查找（含图片预览） | `primitives`、contracts | `shell` | 禁止 import 其他 panels |
| `packages/ui-next/src/panels/right` | 右栏：终端/对话 tabs | `primitives` | `shell` | 禁止 import 其他 panels |
| `packages/ui-next/src/primitives` | 可复用 UI 组件与样式 | tokens | panels/shell | 自写组件样式用 CSS Modules；shadcn 引入组件允许 Tailwind class（集中在 `primitives/shadcn`） |
| `packages/ui-next/src/primitives/shadcn` | shadcn/ui 引入的可控组件（new-york v4） | Tailwind v4 + Radix + lucide | panels/left | 只在 primitives 内维护，避免散落；组件内部可带少量 reset（如 `list-none`）来保证样式稳定 |
| `packages/ui-next/src/primitives/shadcn/sidebar.tsx` | Sidebar 套件（Provider/Menu/Button 等） | Radix + lucide | `panels/left` | 与三栏布局共存：左栏固定用 `collapsible="none"` |
| `packages/ui-next/src/primitives/shadcn/button.tsx` | Button（Sidebar 内部依赖） | Radix Slot + cva | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `packages/ui-next/src/primitives/shadcn/input.tsx` | Input（Sidebar 内部依赖） | 无 | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `packages/ui-next/src/primitives/shadcn/separator.tsx` | Separator（Sidebar 内部依赖） | Radix Separator | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `packages/ui-next/src/primitives/shadcn/sheet.tsx` | Sheet（Sidebar 内部依赖，移动端/抽屉） | Radix Dialog + lucide | `primitives/shadcn/sidebar.tsx` | 桌面端当前不启用 offcanvas |
| `packages/ui-next/src/primitives/shadcn/tooltip.tsx` | Tooltip（Sidebar 内部依赖） | Radix Tooltip | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `packages/ui-next/src/primitives/shadcn/skeleton.tsx` | Skeleton（Sidebar 内部依赖） | 无 | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `packages/ui-next/src/primitives/shadcn/use-mobile.ts` | `useIsMobile`（Sidebar 内部依赖） | React | `primitives/shadcn/sidebar.tsx` | 仅供 shadcn 组件复用 |
| `apps/desktop/src/renderer/src/tailwind.css` | Tailwind（preflight + utilities），专门给 shadcn/ui 的 class 用 | `tailwind.config.cjs` | renderer 入口 | 放在 renderer 内编译，避免 monorepo 下依赖包里的 `@tailwind` 指令漏编译 |
| `packages/ui-next/src/styles.css` | 全局 tokens/reset（不放 Tailwind 指令） | 无 | renderer 入口 | 禁止把业务组件样式写进这里；Tailwind 由 renderer 侧单独引入 |
| `tailwind.config.cjs` | Tailwind 配置 | 无 | renderer 构建链路 | content 覆盖 renderer + `ui-next`；补齐 shadcn tokens/colors 映射 |
| `apps/desktop/src/renderer/postcss.config.cjs` | renderer 的 PostCSS/Tailwind 配置 | `@tailwindcss/postcss` | Vite renderer | Tailwind v4：通过 `base` 指到仓库根，确保能扫到 `packages/ui-next` 里的 class；Tailwind 配置由 `styles.css` 的 `@config` 指定 |
| `components.json` | shadcn CLI 配置（未来可继续 add 组件） | 无 | 人/工具 | 输出路径指向 `primitives/shadcn`，避免散落 |
| `apps/desktop/src/main` | Electron 主进程：窗口、IPC、GPU 策略、pty（含目录监听与二进制读取） | Electron/Node | Electron entry | 系统能力集中在这里 |
| `apps/desktop/src/preload` | `contextBridge` 暴露能力：文件系统/终端/窗口控制（含目录变更事件与原生弹窗） | Electron | renderer | UI 不直连 Node 能力 |
| `apps/desktop/src/renderer/src/store.ts` | store：唯一 `dispatch(intent)` 入口，编排业务状态（含图片预览与文件外部变更处理） | contracts + preload API | UI | 业务逻辑集中在 store，不进 UI |
| `apps/desktop/package.json` | 桌面端依赖与 scripts（dev/build/dist），并内置 `electron-builder` 打包配置 | pnpm + electron-vite + electron-builder | 人/CI | `dist:win` 会生成 `release/`；签名走 `CSC_LINK`/`CSC_KEY_PASSWORD` |
| `start.bat` | Windows 启动与排障开关（ANGLE/GPU） | pnpm | 人 | 开发时默认静默启动 |
| `.specwave/workspace` | 需求/验收/追溯工作区 | 无 | 人+AI | 资料只落这里 |
| `specwave-skills` | skills/CLI 资源（可公开复用） | Node | `specwave` 命令 | 不属于业务源码 |

## 4. 边界与约束（影响面）
- 三栏互不 import：`left/center/right` 互相隔离，只能被 `shell` 组合。
- UI 与运行时解耦：UI 只消费 `ViewModel`、只发 `UIIntent`，真实能力走 preload + IPC。
- 样式隔离：全局以 tokens/reset 为主；Tailwind 已启用 preflight（全局基础 reset），自写组件仍优先用 CSS Modules，避免外溢。
