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
- 一键打包（Windows）：`.\pack-win.cmd`（默认会跑 `typecheck` 与 `apps/desktop` 单测；可用 `-SkipChecks` 跳过）。
- 测试（单元 + 交互）：`pnpm test:unit`。
- Electron E2E：`pnpm test:e2e`。
- 全量校验：`pnpm verify`（`typecheck + test:unit + test:e2e`）。
- 类型检查：`pnpm typecheck`（`tsc -b`）。
- 运行环境：Windows（当前主要）。

## 2. 路径树（只展开到 2~3 层，忽略依赖目录）
```text
.
├─ .github/
├─ apps/
│  ├─ desktop/
│     ├─ src/
│     │  ├─ main/
│     │  ├─ preload/
│     │  └─ renderer/
│     └─ electron.vite.config.ts
│  └─ orchestrator/
│     └─ src/
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
├─ LICENSE
├─ TRADEMARKS.md
├─ CONTRIBUTING.md
├─ SECURITY.md
└─ start.bat
```

## 3. 关键目录/文件职责
| 路径 | 职责（简述） | 依赖谁 | 被谁依赖 | 边界/备注 |
| --- | --- | --- | --- | --- |
| `packages/contracts` | 唯一交互契约：`UIIntent` + `AppViewModel`（含 `ContentKind`：text/markdown/task/image） | 无 | `apps/desktop`、`packages/ui-next` | 只放类型定义 |
| `packages/contracts/src/index.ts` | 交互契约实现文件：新增终端分区 `TerminalDockVM` 与 `TERMINAL_DOCK_*`，以及左区“工作区/能力”切换与 `codexCapabilities`：能力视图（`MCP` + 技能 + 技能目录浏览）相关意图与 VM | 无 | `apps/desktop`、`packages/ui-next` | 仅类型与注释，禁止放实现 |
| `packages/ui-next` | 纯 UI：只渲染 `ViewModel`、只派发 `UIIntent` | `@specwave/contracts` | `apps/desktop` renderer | 禁止接触 Node/Electron/文件系统 |
| `packages/ui-next/vitest.config.ts` | UI 组件交互测试配置：`jsdom` + `Testing Library` | `vitest` | `packages/ui-next` tests | 只服务组件/交互测试，不承载业务逻辑 |
| `packages/ui-next/src/test` | UI 测试公共初始化：补 `matchMedia`、`ResizeObserver`、动画与 canvas mock | `vitest` | `packages/ui-next` tests | 保持测试环境稳定，避免组件各自重复 mock |
| `packages/ui-next/src/panels/left` | 左栏：文件树/搜索结果/Story 看板等展示（含右键菜单：复制路径/名称、打开所在文件夹）；新增常驻切换条以切换“工作区/能力” | `primitives`、contracts | `shell` | 禁止 import 其他 panels |
| `packages/ui-next/src/panels/left/LeftRailSwitcher.tsx` | 左区常驻切换条：图标 + `HoverCard`：悬浮详情（右侧展开），切换左区主体内容 | `primitives/shadcn`、contracts | `panels/left/LeftPanel` | 只派发 `LEFT_PANEL_TAB_SET` |
| `packages/ui-next/src/panels/left/codexCapabilities/CodexCapabilitiesView.tsx` | `codex`：工具名 能力视图：展示 `MCP` 与技能列表、状态、刷新与安装入口；技能支持“目录浏览”并可联动中区打开文件（遵从 Flat，使用 `shadcn/ui`：组件库 组合并通过 `className` 去阴影） | `primitives`、contracts | `panels/left/LeftPanel` | 只渲染 VM、只派发意图 |
| `packages/ui-next/src/panels/left/SpecWaveInitGuide.tsx` | 左栏 SpecWave 未初始化态引导卡片 + 初始化弹出框（步骤/进度/日志/失败可复制） | `primitives/shadcn`、contracts | `panels/left/LeftPanel` | 只渲染 `explorer.specwaveInit`，按钮只派发 `SPECWAVE_INIT_*` |
| `packages/ui-next/src/panels/left/StoryBoardView.tsx` | Story 看板视图：列表展示 Story 卡片（按编号倒序），支持高亮当前活跃 Story | `primitives/StoryCard`、contracts | `panels/left/LeftPanel` | 只渲染 StoryBoardVM，dispatch STORY_CARD_CLICK |
| `packages/ui-next/src/panels/left/StoryCardInExplorer.tsx` | 文件浏览器内嵌 Story 卡片：在 stories 目录下展示 Story 信息，支持归档状态和活动高亮 | contracts | `panels/left/LeftPanel` | 点击 dispatch STORY_CARD_SELECT |
| `packages/ui-next/src/panels/center` | 中栏：内容工作区（markdown 渲染/源码编辑/文件内查找/图片预览/任务卡片看板 + 详情编辑 + 详情条目化展示 + “开始”联动终端） | `primitives`、contracts | `shell` | 禁止 import 其他 panels；UI 不解析 markdown，只消费 VM |
| `packages/ui-next/src/panels/center/PhaseIndicator.tsx` | 阶段流转指示器：ReactBits Stepper 风格，展示 Story 6 阶段进度（诉求/需求/设计/任务/执行/完成），支持点击跳转，带动画效果 | contracts、motion/react | `panels/center/CenterPanel` | 只渲染 PhaseIndicatorVM，dispatch PHASE_INDICATOR_CLICK |
| `packages/ui-next/src/panels/center/ReactBitsStepper.tsx` | React Bits Stepper 组件：展示 Story 3 阶段进度（需求/设计/任务），支持点击切换阶段，带动画效果 | contracts、motion/react | `panels/center/CenterPanel` | 只渲染 StoryStepperVM，dispatch STORY_STEPPER_PHASE_CLICK |
| `packages/ui-next/src/panels/center/CenterPanel.tsx` | 中栏主面板：任务卡片详情展示与编辑入口（详情条目化展示） | `primitives`、contracts | `shell` | 仅展示与交互采集 |
| `packages/ui-next/src/panels/right` | 右栏：终端分区/对话（右区切换 + 终端分区拖拽布局） | `primitives` | `shell` | 禁止 import 其他 panels |
| `packages/ui-next/src/shell/ports.ts` | UI 端口类型：`subscribeTerminalEvent`（订阅终端事件） | 无 | `shell/SpecWaveApp`、`panels/right`、renderer `ui/App.tsx` | 只放类型定义，避免 UI 直接依赖 preload |
| `packages/ui-next/src/panels/right/TerminalDockView.tsx` | 终端分区视图：最多 4 区布局；拖拽标题页签实现移动/交换/合并/分区；分隔条拖动调整尺寸 | contracts + `TerminalRuntime` | `panels/right/RightPanel` | 只派发 `UIIntent`；布局与拖拽命中留在 UI，分区归一化逻辑在 store |
| `packages/ui-next/src/panels/right/TerminalRuntime.tsx` | 终端运行时：封装 `@xterm/xterm` 实例生命周期，订阅终端事件并直写缓冲；负责复制/粘贴/自适应尺寸（通过分区挂载点） | contracts + `shell/ports.ts` | `TerminalDockView` | 终端输出不进 VM；剪贴板与 `pty`（伪终端）能力走 preload |
| `packages/ui-next/src/panels/right/TerminalView.tsx` | 终端视图：单区模式的 `@xterm/xterm` 封装（保留旧入口） | contracts + `shell/ports.ts` | （保留） | 只派发 `UIIntent`；终端输出不进 VM |
| `packages/ui-next/src/primitives` | 可复用 UI 组件与样式 | tokens | panels/shell | 自写组件样式用 CSS Modules；shadcn 引入组件允许 Tailwind class（集中在 `primitives/shadcn`） |
| `packages/ui-next/src/primitives/StoryCard.tsx` | Story 卡片组件：展示需求号、标题、任务进度、阶段标签，支持 isActive 高亮 | contracts | `panels/left/StoryBoardView` | 纯展示组件，不含业务逻辑 |
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
| `apps/desktop/src/main/ipc.ts` | 主进程 `IPC`：进程间通信 注册；初始化入口与事件推送；剪贴板读写；新增 `specwave:selectFile` 与 `specwave:codex:*`：能力探测/安装相关通道（`mcpProbe` 与 `skillsProbe` 分开） | Electron/Node | preload | `codex` 能力探测/安装只在主进程执行并统一脱敏 |
| `apps/desktop/src/main/codexCapabilities` | `codex`：工具名 能力实现：调用官方 `codex mcp`：命令行界面 获取配置，使用官方 `@modelcontextprotocol/sdk`：软件开发包 做握手探测，并实现 `MCP`/技能安装与回滚清理 | Node | `main/ipc.ts` | 不把敏感值回传 renderer；失败需可理解且脱敏 |
| `apps/desktop/src/main/terminal/ipc.ts` | 终端 `IPC`：进程间通信 注册终端写入/尺寸/图片粘贴通道 | Electron/Node | preload | 只做 `IPC` 转发 |
| `apps/desktop/src/main/terminal/pasteImage.ts` | 终端图片粘贴助手：剪贴板读图、落盘 `.terminal-paste`、必要时写入 `.gitignore` | Electron/Node | `main/terminal/ipc.ts` | 仅主进程使用 |
| `apps/desktop/src/preload` | `contextBridge` 暴露能力：文件系统/终端/窗口控制（含目录变更事件与原生弹窗、在资源管理器定位/打开路径） | Electron | renderer | UI 不直连 Node 能力 |
| `apps/desktop/src/preload/index.ts` | preload 桥接实现：初始化引导事件、终端能力、剪贴板能力；新增 `selectFile` 与 `codexMcpProbe/codexSkillsProbe/codexMcpInstallFromJson/codexSkillInstall`：能力探测与安装桥接 | Electron | renderer store | 只做桥接与参数校验，不放业务编排 |
| `apps/desktop/src/renderer/src/store.ts` | store：唯一 `dispatch(intent)` 入口，编排业务状态（图片预览与文件外部变更处理等）；终端输出不写入 VM，由 UI 侧 xterm 直接消费事件流 | contracts + preload API | UI | 业务逻辑集中在 store，不进 UI |
| `apps/desktop/playwright.config.ts` | Electron E2E 配置：固定单 worker、失败保留 trace/screenshot/video | `@playwright/test` | `apps/desktop/e2e` | 稳定优先，不走 dev server |
| `apps/desktop/e2e` | 桌面端端到端测试：启动 Electron 产物、隔离 userData、验证欢迎页到主界面流程 | Playwright + Electron | 人/CI | 禁止依赖原生文件选择框与外部 orchestrator 服务 |
| `apps/desktop/src/renderer/src/store/shared/terminalDock.ts` | 终端分区纯函数：分区归一化、拖拽落点（移动/交换/合并/分区）、分隔条比例更新 | contracts | `store/handlers/panel.ts`、`store/handlers/terminal.ts`、`store/handlers/task.ts` | 不触发副作用；保证“最多 4 区且不留空区” |
| `apps/desktop/src/renderer/src/store/handlers/codexCapabilities.ts` | `codex`：工具名 能力意图处理：切换左区 tab、刷新探测、安装 `MCP`/技能（含覆盖确认）；技能目录浏览（读取目录、展开子目录、打开文件） | preload API | `store.ts` | 只编排状态；不在 renderer 执行命令与文件写入 |
| `apps/desktop/src/renderer/src/store/handlers/specwaveInit.ts` | 初始化引导状态机：消费 `SPECWAVE_INIT_*` 意图，订阅运行时进度事件并映射为 `explorer.specwaveInit` | contracts + preload API | `store.ts` | 只编排状态与刷新工作区树，不触达 UI 组件 |
| `apps/desktop/package.json` | 桌面端依赖与 scripts（dev/build/test/e2e/dist），并内置 `electron-builder` 打包配置 | pnpm + electron-vite + electron-builder + Playwright | 人/CI | `dist:win` 会生成 `release/`；签名走 `CSC_LINK`/`CSC_KEY_PASSWORD` |
| `apps/orchestrator` | 结果导向自动交付编排服务（HTTP API + 状态机 + 调度） | `@specwave/contracts` + Node `http` | 私有化部署进程 / 运维 | 默认监听 `127.0.0.1:8787`，状态文件 `.specwave/orchestrator-state.json` |
| `apps/orchestrator/src/orchestratorService.ts` | 编排核心：请求状态机、审批闸门、验收超时提醒升级、暂停恢复、结果包与通知队列生成 | contracts 类型 | `httpServer.ts`、测试 | 单进程内聚实现，先保证流程闭环，再扩展外部队列 |
| `apps/orchestrator/src/httpServer.ts` | 北向接口：`/api/v1/requests`、`/approvals`、`/runs/:id/resume`、`/channels/:channel/webhook`、通知与指标接口 | `orchestratorService.ts` | 外部渠道适配层 / 客户端 | 统一 JSON 返回与错误码；支持手动 `tick` 调度 |
| `apps/orchestrator/src/desktopAutomation.ts` + `desktopAutomation.ps1` | 本机桌面执行层：识别“打开应用 / 打开链接 / 邮件撰写 / 当前窗口输入 / 常用 IM 发消息”等诉求，调用 PowerShell 执行并返回校验结果；内置 `notepad` 自测链路 | Node `child_process` + Windows PowerShell | `index.ts`、`dingtalkAppbot.ts`、测试 | 当前对 IM 场景只做弱校验；可抓取聊天窗口当前可见列表截图，给上层做候选确认，避免误发 |
| `apps/orchestrator/src/desktopChatOcr.ts` | 聊天候选 OCR：下载/缓存本地 OCR 语言包，识别微信等聊天窗口截图，并把原始识别文本提炼为联系人候选列表 | Node `fetch` + `tesseract.js` | `desktopAutomation.ts`、测试 | 只负责 OCR 与候选提炼，不直接执行发送 |
| `apps/orchestrator/src/dingtalkAppbot.ts` | 钉钉应用机器人入口：解析入站消息、转发 Agent、接入本机桌面执行器；对模糊联系人诉求维护短期会话状态，支持“候选列表 + 是/序号/名字”确认回合 | `orchestratorService.ts` + `desktopAutomation.ts` | `httpServer.ts`、测试 | 群聊遵守 @ 规则；桌面模糊指令优先走确认态，避免直接误发 |
| `apps/orchestrator/src/channelAdapters.ts` | 渠道归一化层：`webchat` / `dingtalk` / `wecom` / `telegram` 入参统一为标准 webhook payload | contracts 类型 | `httpServer.ts` | 只做协议转换与字段校验，不做业务状态变更 |
| `apps/orchestrator/src/static/webchat.html` | 手机端 H5 对话页：提交诉求、轮询请求状态、展示结果卡与事件流 | 浏览器 + orchestrator API | `httpServer.ts`（`/webchat`） | 作为 MVP 手机入口，优先验证“甲方只看结果”闭环 |
| `apps/orchestrator/src/stateStore.ts` | 编排状态持久化（JSON 文件原子写入） | Node 文件系统 | `orchestratorService.ts` | MVP 持久化实现，后续可替换 DB / 事件存储 |
| `apps/orchestrator/Dockerfile` + `docker-compose.yml` | 私有化打包部署入口 | Docker | 运维/交付 | 容器默认暴露 `8787`，状态文件映射到宿主卷 |
| `.github/CODEOWNERS` | 仓库评审归属规则：要求受保护分支按代码所有者审阅 | GitHub | 人/平台 | 与分支保护配合使用，当前默认归属仓库所有者 |
| `LICENSE` | 项目根许可证：采用 `AGPL-3.0-or-later`，保护网络服务场景下的源码回流 | GNU `AGPL` 文本 | 所有代码使用者 | 不覆盖第三方依赖的独立许可证 |
| `TRADEMARKS.md` | 品牌保护规则：保留 `SpecWave` 名称、Logo、图标等商标使用权 | 无 | 代码使用者、发行者 | 代码开源不等于品牌开放 |
| `CONTRIBUTING.md` | 开源协作规则：贡献流程、`DCO` 签名、测试与许可证要求 | 无 | 外部贡献者、维护者 | 外部贡献默认按项目许可证分发 |
| `SECURITY.md` | 漏洞披露策略：要求私密上报，约定响应窗口 | 无 | 安全研究者、维护者 | 禁止公开披露未修复漏洞细节 |
| `start.bat` | Windows 启动与排障开关（ANGLE/GPU） | pnpm | 人 | 开发时默认静默启动 |
| `pack-win.cmd` | Windows 一键打包入口：调用 `pack-win.ps1` 并绕过执行策略限制 | PowerShell | 人 | 用于生成 exe；产物输出到 `apps/desktop/release/`（已在 `.gitignore` 忽略） |
| `pack-win.ps1` | Windows 一键打包脚本：必要时 `pnpm install`，可选跑检查，然后执行 `pnpm -C apps/desktop dist:win` | pnpm + electron-builder | `pack-win.cmd` | 支持参数：`-SkipInstall`、`-SkipChecks` |
| `docs/testing` | 测试规范与案例台账：约定分层、命名、执行口径和已覆盖/待覆盖清单 | Markdown | 人/AI | 改测试策略或新增重要用例时必须同步维护 |
| `.codex` | 项目内 Codex 资源：skills + prompts（用于“只影响本项目”的 AI 行为） | `specwave create`（设置 `CODEX_HOME`） | Codex CLI | 默认写到全局 `CODEX_HOME`；需要可复现时指到项目根 `.codex` |
| `.codex/skills/specwave-router/session_guard.py` | 会话自愈脚本：把 `.specwave/settings.json` 的会话投影对齐到“当前 Codex 会话”，避免多会话串阶段 | Python | `AGENTS.md`、`specwave-router` | 并发会话会要求显式 `--session-id`；建议每次对话先 `sync` |
| `.specwave/workspace` | 需求/验收/追溯工作区 | 无 | 人+AI | 资料只落这里 |
| `specwave-skills` | skills/`CLI`：命令行 资源（可公开复用） | Node | `specwave` 命令、桌面端初始化引导 | pack 资源路径：`specwave-skills/resources/packs/core/light` |

## 4. 边界与约束（影响面）
- 三栏互不 import：`left/center/right` 互相隔离，只能被 `shell` 组合。
- UI 与运行时解耦：UI 只消费 `ViewModel`、只发 `UIIntent`，真实能力走 preload + IPC。
- 样式隔离：全局以 tokens/reset 为主；Tailwind 已启用 preflight（全局基础 reset），自写组件仍优先用 CSS Modules，避免外溢。
