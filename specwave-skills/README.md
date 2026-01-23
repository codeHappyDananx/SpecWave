# SpecWave Skills

一套可复用的 AI 辅助需求分析与开发工具包，包含角色（roles）、提示卡（prompts）、项目级说明模板。

## 项目结构

```
specwave-skills/
├── bin/
│   └── specwave.js              # CLI 入口
├── resources/
│   ├── codex/
│   │   └── skills/
│   │       └── specwave-router/ # Codex 路由器（自动识别项目、建议角色）
│   └── packs/
│       ├── core/                # 中文版 pack
│       │   └── light/
│       │       ├── .specwave/
│       │       │   ├── pack.md           # Pack 元数据
│       │       │   ├── settings.json     # 运行时配置（门禁、模板等）
│       │       │   ├── prompts/          # 提示词（诉求对齐、需求编写...）
│       │       │   ├── roles/            # 角色（需求分析师、开发执行者...）
│       │       │   └── templates/        # 三文档模板（01-需求、02-设计、03-任务）
│       │       └── project-root/
│       │           └── AGENTS.md.template  # 项目级协作说明模板
│       └── core-en/             # 英文版 pack（待翻译）
├── package.json
└── README.md
```

### 关键文件说明

| 文件 | 用途 |
|------|------|
| `pack.md` | Pack 元数据（id、版本、语言），CLI 用于识别和展示 |
| `settings.json` | 运行时配置，AI 读取门禁规则、模板配置 |
| `AGENTS.md.template` | 初始化时复制到项目根目录，定义协作流程 |
| `roles/*.md` | 角色定义，决定 AI 在不同阶段的行为边界 |
| `prompts/*.md` | 提示词，定义每个阶段的具体执行逻辑 |
| `templates/*.md` | 三文档模板，Story 创建时使用 |

## 核心特性

- **三文档结构**：`01-需求.md` → `02-设计.md` → `03-任务.md`，需求、设计、任务分离
- **角色分离**：需求分析师（诉求→设计）+ 开发执行者（任务执行）
- **任务独立可执行**：每条任务包含足够上下文，新窗口的 AI 能直接执行
- **需求写法**：用“操作/预期”描述需求，用“操作 → 预期”写验收口径
- **阶段门禁**：每阶段需用户确认才能进入下一阶段

## 协作流程

```
诉求对齐 ─"继续"→ 需求编写 ─"继续"→ 设计方案 ─"继续"→ 任务拆解 ─ 明确授权 → 执行开发
    ↑                                                              │
    └──────────────────── 发现问题 ────────────────────────────────┘
```

## CLI 命令

- `specwave create`：初始化/刷新（交互式小向导）
- `specwave catalog`：输出资源概览

## 三分钟上手

1) 安装

```bash
npm i -g specwave-skills
# 或
npx -p specwave-skills specwave --help
```

本地开发调试用 `npm link`：

```bash
Set-Location specwave-skills
npm link
```

2) 生成初始化计划（不落盘）

```bash
specwave create --plan
```

3) 确认无误后落盘

```bash
specwave create --agree
```

直接执行 `specwave create` 会进入小向导（模型 → 语言），先打印计划，再确认落盘。

4) 查看索引

```bash
specwave catalog --format text
specwave catalog --format machine
```

## Codex CLI 自动路由

SpecWave 会安装 Codex 全局资源（`specwave-router` + 斜杠命令）：
- 自动识别 SpecWave 项目，建议下一步与角色
- 变更门禁：只有用户明确授权才会改代码
- 默认写入全局 `CODEX_HOME`（默认 `~/.codex`，Windows 对应用户目录下的 `.codex`）；要只影响当前项目，把 `CODEX_HOME` 指到项目根目录的 `.codex`
- 多窗口隔离：无需改用不同的 `CODEX_HOME`；`session_guard.py` 默认按当前窗口进程自动分槽写入 `specwave/state.json`，互不串线

单独安装/更新 Codex 资源：

```bash
specwave codex install --yes
```

## 命令参数

### specwave create
- `--dir <目录>`：目标目录（默认当前目录）
- `--plan`：只输出计划，不落盘
- `--agree`：确认执行并落盘

### specwave catalog
- `--format <text|machine>`：输出格式
- `--only <packs|roles|prompts>`：按类输出
