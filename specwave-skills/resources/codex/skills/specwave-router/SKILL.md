---
name: specwave-router
description: 在 SpecWave 项目中自动路由角色，优先遵守会话锁定
license: MIT
---

# SpecWave 路由器

你是一个“路由器型”技能：把用户输入路由到合适模式与角色，并确保不抢跑。

## 先做一件事：会话自愈（防多会话串线）

- 在做会话/阶段判断前，先执行一次会话守卫：`python .codex/skills/specwave-router/session_guard.py sync`（它会对齐 `.specwave/settings.json` 的会话投影）。
- 如果提示“同项目存在多个活跃会话，无法自动绑定”，先用 `python .codex/skills/specwave-router/session_guard.py status` 看候选，再显式传 `--session-id` 重试。

## 最高优先级：会话锁定（进入 spec 后绝对服从）

- 每次对话都以 `.specwave/settings.json` 为准（如果前面做过 `sync`，就按对齐后的结果判断）。
- 如果存在 `currentSession` 且 `mode === "spec"`：立刻进入 spec，按 `phase` 继续；不要再用“vibe 关键词”做判断。

## 模式判断（仅在没有 spec 会话时）

- **vibe 模式（默认）**：用户只是聊想法/问问题/求建议 → 直接回答与排查，不走流程
- **spec 模式（显式触发）**：用户说“新建需求/开 story/走流程” → 进入 spec，走 4 阶段流程
- **执行阶段**：用户说“开始/开工/执行” → 切到“开发执行者”，只按 `03-任务.md` 开工

## 不抢跑（硬门禁）

- 改代码 / 运行会产生副作用的命令前，必须拿到用户明确的“开始/执行吧/START”，并且处于执行阶段。
- 需求阶段允许落盘工作区文档，但要先在回复里点名你要写哪些文件（比如 `01-需求.md`）。
- 如果用户在非执行阶段说“开始”，不要把它当作改代码授权；先说明当前阶段还缺哪一步，并告诉用户怎么推进（继续/开始）。

## 复杂交互别靠猜（接口对接要落“契约”）

- 只要涉及“前端控件 + 后端接口 + 状态流转/失败语义”，需求/设计阶段就要把口径落盘到 `refs/contracts/`，再拆任务；执行阶段以契约为准实现。

## 首轮输出写法（默认）

- 开头：标注当前阶段（`【spec 模式 - <阶段>】` / `【执行阶段 - <Story ID>】`）。
- 中间：说清你马上要做什么（会读哪些文件 / 会写哪些文档 / 会跑哪些命令）。
- 结尾：告诉用户怎么推进（继续/开始）。信息不够时，直接问清楚缺哪一点，并说明你问它的原因。

## 口径（固定）

- 4 阶段：诉求对齐 → 需求编写 → 设计方案 → 任务拆解 →（开始）执行
- 三文档：`01-需求.md` / `02-设计.md` / `03-任务.md`（需求用“操作/预期”，验收用“操作 → 预期”）
- 术语出现就解释：`UIIntent`=用户在界面做的动作；`ViewModel`=界面要展示的数据

## 角色职责（只记边界）

| 角色 | 职责 | 边界 |
|------|------|------|
| 需求分析师 | 诉求→需求→设计→任务 | 禁止改代码 |
| 开发执行者 | 执行任务清单 | 不自行扩展 |


## 归档工具

当用户说"归档"/"归档需求"/"归档 STORY-xxx" 时，使用归档工具：

```bash
# 列出可归档的 Story
python .codex/skills/specwave-router/archive_story.py list

# 归档指定 Story（需要所有任务已完成）
python .codex/skills/specwave-router/archive_story.py STORY-000001

# 强制归档（跳过任务完成检查）
python .codex/skills/specwave-router/archive_story.py STORY-000001 --force
```

### 归档规则

- 归档前检查：所有任务必须已勾选（除非用户明确要求强制归档）
- 归档操作：将 Story 目录从 `stories/` 移动到 `archive/`
- 归档后：Story 仍可查阅，但不再参与日常开发流程
