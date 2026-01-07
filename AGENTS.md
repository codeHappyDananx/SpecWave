# SpecWave 协作说明

<!-- SPECWAVE:START core -->

## 【强制规则 - 会话锁定】（必须执行，不可跳过）

每次对话开始，你必须：

1. **先读 settings.json**：读取 `.specwave/settings.json`
2. **检查 currentSession**：
   - 存在且 `mode === "spec"`：你在 **spec 模式**，加载 `.specwave/roles/需求分析师.md`，按 `phase` 继续
   - 不存在或为 `null`：你在 **vibe 模式**，直接干活，不走流程
3. **模式切换**：
   - 进入 spec：用户说"新建需求"/"开 story"/"走流程" → 写入 `currentSession`，回复开头标注【spec 模式】
   - 退出 spec：用户说"退出 spec"/"算了"/"不走流程了" → 删除 `currentSession`，回复标注【已退出 spec 模式】

**这条规则优先级最高，任何情况下都必须执行。**

---

## 协作原则

- **执行要授权**：改代码前必须等用户说"开始"/"可以了"/"执行吧"
- **先给方案让用户改**：不问 A/B/C，先给推荐方案再问"这样对吗"
- **表达要自然**：先说结论，不堆术语；术语必须解释
- **只记决定**：落盘记录共识，不写过程复盘

## 工作区

- 需求资料：`.specwave/workspace/`
- 项目结构：`.specwave/workspace/project-map.md`

## Story 结构

```
STORY-000001(概要)/
├── 01-需求.md    ← 诉求 + 需求表格 + 验收口径
└── 02-任务.md    ← 任务清单（独立可执行）
```

## 流程（3 阶段）

```
诉求对齐 ──"继续"──→ 需求编写 ──"继续"──→ 任务拆解 ──"开始"──→ 执行
```

## 角色

| 角色 | 职责 | 边界 |
|------|------|------|
| 需求分析师 | 诉求→需求→任务 | 禁止改代码 |
| 开发执行者 | 执行任务清单 | 不自行扩展 |

详细流程见 `.specwave/roles/需求分析师.md`

## 状态枚举

- 阶段：诉求对齐｜需求编写｜任务拆解｜执行
- 诉求状态：对齐中｜已锁定
- 需求状态：编写中｜已确认
- 执行：锁定｜可执行｜执行中｜已完成

## 输出标题格式

```
【spec 模式 - <阶段>】
```

<!-- SPECWAVE:END core -->

## 初始化成果（只读）
- 项目路径图：`.specwave/workspace/project-map.md`
- 初始化快照：`.specwave/workspace/specs/INIT-000001(初始化成果-AGENTS快照).md`
- 说明：快照只做追溯；后续维护以 `project-map.md` 为准。

## SpecWave 协作门禁（给 AI / 开发者）

> 目标：**彻底解耦 + 可持续扩展**。UI 只渲染 `ViewModel`、只发 `UIIntent`；业务/文件系统/终端/AI 能力统一走 ports/adapters（后续接入）。

## 强制规则（写死）

1) **禁止把业务逻辑写进 UI**
   - `packages/ui-next` 只能做"展示 + 采集交互"，只能通过 `dispatch(intent)` 上报意图。
2) **改动即更新**
   - 如果你修改了某个文件/目录的职责、行为或入口（哪怕只是 UI 行为），必须同步更新 `.specwave/workspace/project-map.md` 的对应条目。
   - 新增文件：必须在 `.specwave/workspace/project-map.md` 补一条"它做什么 / 依赖谁 / 由谁依赖 / 边界备注"。
3) **先改 contracts，再改实现**
   - 新交互语义优先在 `packages/contracts` 定义 `UIIntent` / `ViewModel` 字段，再由 `store` 实现，再由 UI 消费。
4) **样式与新组件参照规范**
   - 新增组件、修改视觉风格、调整交互细节时，必须参照 `SPECWAVESTYLE.MD` 的口径。
5) **功能完成后，需要提交git但是不push。**

## 解耦与边界（当前仓库已落地的硬约束）

1) **三栏互不影响（强制）**
   - `packages/ui-next/src/panels/left` / `center` / `right` 之间 **禁止互相 import**。
   - Panels 允许依赖：`packages/ui-next/src/primitives`、`@specwave/contracts`。
   - Shell（`packages/ui-next/src/shell`）负责组合三栏与布局；Panels 不实现布局规则。

2) **样式互不影响（强制）**
   - 全局样式以 tokens + reset 为主：`packages/ui-next/src/styles.css`；允许引入 Tailwind（base+utilities）用于承载 `shadcn/ui` 组件（当前已启用 preflight；若出现全局样式联动，优先收敛影响面）。
   - 自写组件样式必须使用 `*.module.css` 并与组件同目录；`shadcn/ui` 引入组件可使用 Tailwind class，但要集中放在 `packages/ui-next/src/primitives/shadcn`，避免通用类名外溢。

3) **TypeScript 产物不进源码（强制）**
   - 根 `typecheck` 使用 `tsc -b`（project references 需要引用工程能 emit）。
   - `apps/desktop/tsconfig.json` 强制 `noEmit: true`。
   - 禁止把 `src/**.js`、`src/**.d.ts`、`dist-electron/`、`*.tsbuildinfo` 提交到 git（见 `.gitignore`）。

## 项目结构（为什么这样分层）

- `packages/contracts`：**唯一**的交互契约（`UIIntent` + `ViewModel`），用于解耦 UI 与运行时实现。
- `packages/ui-next`：纯 UI（React 组件 + Flat 样式 + 内置图标），不接触 Electron/Node/文件系统。
- `apps/desktop`：Electron 桌面端运行时（主进程、preload、renderer），负责把真实能力接到 `store`（未来通过 ports/adapters）。
