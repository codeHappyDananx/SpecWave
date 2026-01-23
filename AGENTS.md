# SpecWave 协作说明

<!-- SPECWAVE:START core -->

## 模式路由（必须执行）

默认不做会话锁定判断：不要每次对话读取 `.specwave/settings.json`（它只保留规则配置，不承载运行态会话信息）。

只有当用户触发 SpecWave 的技能（`specwave-router` 或斜杠命令）时，才做会话/阶段判断：
1) 先执行 `python ~/.codex/skills/specwave-router/session_guard.py sync`
2) 再以 `~/.codex/specwave/state.json` 中该窗口对应的 `currentSession` 为准（默认按窗口进程自动隔离；如果设置了 `CODEX_HOME`：Codex 家目录，则以 `$CODEX_HOME/specwave/state.json` 为准）

| currentSession | 模式 | 行为 |
|----------------|------|------|
| 存在且 `mode === "spec"` | spec 模式 | 加载 `.specwave/roles/需求分析师.md`，按 `phase` 继续 |
| 不存在或为 `null` | vibe 模式 | 直接干活，不走流程 |

**模式切换**：
- 进入 spec：用户说"新建需求"/"开 story"/"走流程" → 回复开头标注【spec 模式】
- 退出 spec：用户说"退出 spec"/"算了还是vibe吧" → 回复标注【已退出 spec 模式】

---

## vibe 模式（默认）

vibe 模式下你是普通助手，直接帮用户干活。

**禁止行为**：
- 🚫 不读 `.specwave/workspace/stories/` 下的任何文件
- 🚫 不读 `.specwave/roles/`、`.specwave/templates/`
- 🚫 不主动提及 spec 流程

**允许行为**：
- ✅ 读 `.specwave/workspace/project-map.md`（项目结构）
- ✅ 读项目源码、配置文件
- ✅ 直接改代码、跑命令

---

## spec 模式

进入 spec 模式后，加载 `.specwave/roles/需求分析师.md` 获取完整流程。

**流程概览**：
```
诉求对齐 ──"继续"──→ 需求编写 ──"继续"──→ 设计方案 ──"继续"──→ 任务拆解 ──"开始"──→ 执行
```

**核心约束**（详见角色文件）：
- 需求分析师禁止改代码
- 每阶段必须落盘对应文件
- "开始"只有在第4阶段（拆任务）完成后才触发执行

**硬规则（必须遵守）**：
- 只认 `~/.codex/specwave/state.json` 的 `currentSession`，忽略 `.specwave/settings.json` 的运行态字段（如果设置了 `CODEX_HOME`：Codex 家目录，则以 `$CODEX_HOME/specwave/state.json` 为准）
- **默认禁止读历史 Story**：禁止读取 `.specwave/workspace/stories/` 下非当前 Story 的任何文件；只有用户明确点名“参考/关联 STORY-xxxxxx”才允许读取并说明用途
- **严格按模板落盘**：写 `01-需求.md` / `02-设计.md` / `03-任务.md` 前，必须先读取对应的 `.specwave/templates/01-需求.md` / `02-设计.md` / `03-任务.md`，并按模板结构填写，禁止自创格式
- **逐步确认，不揉阶段**：每次只完成一个阶段文档；写完 `02-设计.md` 必须先等用户回复“继续”确认，才能写 `03-任务.md`
- **违规惩罚（参考历史需求 = 违规）**：一旦误读历史 Story（非当前 Story 且未获授权）→ 立刻停止、标记违规、回到模板重写当前阶段文档，再请求用户确认

---

## 表达规范

- 先说结论，再补背景
- 一句话能说清的，不拆成三句
- 不列 A/B/C 选项，先给推荐方案
- 自然中文优先，禁止 WHEN/THEN/SHALL

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
