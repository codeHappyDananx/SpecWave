# SpecWave Skills

这是一套可复用的“角色（roles）+ 提示卡（prompts）+ 项目级说明模板”，并提供最小 CLI 用于初始化与索引：
- `specwave create`：初始化/刷新（交互式小向导：先选模型，再选语言；默认先预览计划，再确认落盘）
- `specwave catalog`：输出资源概览（text 或 machine）

## 三分钟上手

1) 安装（任选一种方式）

```bash
npm i -g specwave-skills
# 或
npx -p specwave-skills specwave --help
```

如果你是在本仓库里开发调试（还没发布到 npm），推荐用 `npm link`：

```bash
Set-Location specwave-skills
npm link
```

2) 在目标目录生成初始化计划（不落盘）

```bash
specwave create --plan
```

3) 确认无误后落盘

```bash
specwave create --agree
```

如果你想更顺手：直接执行 `specwave create` 会进入小向导（模型 → 语言），先打印计划，再让你输入一次确认（y/N），确认后才落盘。

说明：`create --agree` 也可用于“刷新版本”——会强制刷新机器区文件；项目根的 `AGENTS.md` 默认不覆盖已有内容（缺失/空文件才会生成）。

4) 查看索引（给人看，也给工具用）

```bash
specwave catalog --format text
specwave catalog --format machine
```

## Codex CLI 自动路由与斜杠命令（默认安装）
SpecWave 会把 Codex 侧需要的全局资源（`specwave-router` + 斜杠命令 prompts）一并装好，用来做到：
- 自动识别 SpecWave 项目，建议下一步与角色
- 斜杠命令一键进入：写需求 / 验收 / 提 Bug / 开始开发
- 变更门禁：只有你明确说“开始/START/可以开始执行”，才会写文件/改代码/跑有副作用的命令
- 会清理已废弃的“官方 prompts”（仅删除带 `managedBy: specwave` 标记的文件，避免误删你的自定义）

语言说明：当你在 `specwave create` 里选择 `en`，会安装英文版 prompts/roles，并同步安装英文版 `specwave-router`（Codex 全局资源也会跟随语言）。

如果你想单独安装/更新 Codex 全局资源，可以执行：

```bash
specwave codex install --plan
specwave codex install --yes
```

## 命令说明

### specwave create
- `--dir <目录>`：目标目录（默认当前目录）
- `--plan`：只输出将写入的内容，不落盘（默认行为）
- `--agree`：确认执行并落盘
 - 默认会“无感知”安装 Codex 全局资源（`specwave-router` + 斜杠命令 prompts）（写入到 `CODEX_HOME` 或默认目录）

高级参数（一般不需要）：
- `--profile <light|full>`：默认 `light`
- `--pack <packId>`：指定资源变体（项目内部用于扩展“模型/语言/风格”的组合）

### specwave catalog
- `--format <text|machine>`：默认 `text`
- `--only <packs|roles|prompts>`：按类输出（可选；兼容 `skills` 等价于 `roles`）

### specwave codex install
- `--plan`：只输出计划，不写入（默认）
- `--yes`：确认写入全局资源（写入到 `CODEX_HOME` 或默认目录）

安装后可用斜杠命令：
- `/specwave-write-requirements`
- `/specwave-acceptance-review`
- `/specwave-report-bug`
- `/specwave-start-dev`

## 发布形态（v1）
当前先跑通“资源+CLI”的默认包：`specwave-skills`。

后续会补齐另外两种形态（本仓库先预留，不在 v1 里强行一口吃掉）：
- 仅资源
- 仅 CLI
