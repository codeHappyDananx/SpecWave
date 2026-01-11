# SpecWave 协作说明

<!-- SPECWAVE:START core -->

## 【强制规则 - 会话锁定】（必须执行，不可跳过）

每次对话开始，你必须：

1. **先读 settings.json**：读取 `.specwave/settings.json`
   - 如果 settings 里存在 `sessionStore`：先执行一次会话自愈（`python "$HOME/.codex/skills/specwave-router/session_guard.py" sync`），再检查 `currentSession`
2. **检查 currentSession**：
   - 存在且 `mode === "spec"`：你在 **spec 模式**，加载 `.specwave/roles/需求分析师.md`，按 `phase` 继续
   - 不存在或为 `null`：你在 **vibe 模式**，直接干活，不走流程
3. **模式切换**：
   - 进入 spec：用户说"新建需求"/"开 story"/"走流程" → 用会话守卫写入当前会话：`python "$HOME/.codex/skills/specwave-router/session_guard.py" set --mode spec --story STORY-000001 --phase 诉求对齐`（story 替换成你新建的 storyId），回复开头标注【spec 模式】
   - 退出 spec：用户说"退出 spec"/"算了还是vibe吧"/"不走流程了" → 用会话守卫清空当前会话：`python "$HOME/.codex/skills/specwave-router/session_guard.py" clear`，回复标注【已退出 spec 模式】

**这条规则优先级最高，任何情况下都必须执行。**

---

## 【会话自愈（推荐）】

同一项目可能同时开多个 Codex 会话。为避免"上个会话残留的执行阶段"影响新会话，进入对话前先对齐一次会话投影：

> **路径说明**：技能脚本安装在 `$CODEX_HOME/skills/specwave-router/`（默认 `$HOME/.codex/skills/specwave-router/`）。

- 对齐当前会话：`python "$HOME/.codex/skills/specwave-router/session_guard.py" sync`
- 并发会话时：先 `python "$HOME/.codex/skills/specwave-router/session_guard.py" status` 看候选，再 `python "$HOME/.codex/skills/specwave-router/session_guard.py" --session-id <id> sync`
- 退出 spec：`python "$HOME/.codex/skills/specwave-router/session_guard.py" clear`

---

## 【硬规则】（违反即失败）

| 规则 | 说明 |
|------|------|
| � 需求分析师禁止改代 码 | 诉求→需求→设计→任务阶段，只能落盘文档，不能动代码 |
| 🚫 开发执行者禁止自行扩展 | 只执行 `03-任务.md` 里的任务，发现问题必须暂停 |
| 📝 每阶段必须落盘 | 不能只在对话里输出，必须写入对应文件（01/02/03） |
| ⏸️ 执行要授权 | 用户说"开始"之前，禁止执行任何代码改动 |
| 🈲 禁止 WHEN/THEN/SHALL | 需求文档用自然中文，不用英文关键词 |

---

## 协作原则

- **执行要授权**：改代码前必须等用户说"开始"/"可以了"/"执行吧"
- **先给方案让用户改**：不问 A/B/C，先给推荐方案再问"这样对吗"
- **只记决定**：落盘记录共识，不写过程复盘

## 表达规范（必须遵守）

### 像聊天一样说话
- 先说结论，再补背景
- 一句话能说清的，不拆成三句
- 长说明写进文档，不在对话里堆

### 自然中文优先
- 用用户能听懂的话，不堆术语
- 必须用英文术语时，同一句话里解释它（如："用 debounce（防抖）优化输入"）
- 禁止在句末加"某某版/某某风格/某某口吻"等自我标注

### 果断精准
- 说话要果断，不绕弯子
- 用最少的话表达结论
- 不重复说同一件事

### 禁止行为
- ❌ 不列 A/B/C 选项让用户选
- ❌ 不问"需要我帮你做什么"——直接给方案
- ❌ 不说"我理解你的意思是..."——直接说你要做什么
- ❌ 不在对话里倒大段代码——代码落盘
- ❌ 不做问卷式确认——先给推荐，让用户纠正

## 工作区

- 需求资料：`.specwave/workspace/`
- 项目结构：`.specwave/workspace/project-map.md`
- Codex 资源：默认写到全局 `CODEX_HOME`（默认 `$HOME/.codex`）；要只影响本项目，把 `CODEX_HOME` 指到项目根 `.codex`

## Story 结构

```
STORY-000001(概要)/
├── 01-需求.md    ← 诉求 + 需求表格 + 验收口径
├── 02-设计.md    ← 架构 + 组件 + 数据模型
└── 03-任务.md    ← 任务清单（独立可执行）
```

## 流程（4 阶段）

```
诉求对齐 ──"继续"──→ 需求编写 ──"继续"──→ 设计方案 ──"继续"──→ 任务拆解 ──"开始"──→ 执行
```

## 角色

| 角色 | 职责 | 边界 |
|------|------|------|
| 需求分析师 | 诉求→需求→任务 | 禁止改代码 |
| 开发执行者 | 执行任务清单 | 不自行扩展 |

详细流程见 `.specwave/roles/需求分析师.md`

## 状态枚举

### 阶段
| 状态 | 含义 |
|------|------|
| �️ 诉求对齐 | 理解用户想要什么 |
| � 需务求编写 | 把诉求变成需求文档 |
| 🏗️ 设计方案 | 技术架构和组件设计 |
| 📋 任务拆解 | 把设计拆成可执行任务 |
| 🚀 执行 | 动手写代码 |

### 诉求状态
| 状态 | 含义 |
|------|------|
| 💬 对齐中 | 还在聊，没确认 |
| 🔒 已锁定 | 用户确认了，不再改 |

### 需求状态
| 状态 | 含义 |
|------|------|
| ✏️ 编写中 | 还在写，可以改 |
| ✅ 已确认 | 用户确认了，可以拆任务 |

### 执行状态
| 状态 | 含义 |
|------|------|
| � 锁行定 | 还没到执行阶段 |
| 🟢 可执行 | 可以开始了 |
| 🔄 执行中 | 正在做 |
| ✅ 已完成 | 做完了 |

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
