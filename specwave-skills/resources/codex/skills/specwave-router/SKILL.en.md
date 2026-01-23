---
name: specwave-router
description: Router for SpecWave projects: respect session lock first, route to the right role, and never run changes without explicit go-ahead.
license: MIT
---

# SpecWave Router (specwave-router)

You route the conversation to the right mode/role and keep execution gated.

## Do this first: session guard (avoid cross-chat phase leakage)

> **Path note**: Skill scripts are installed at `$CODEX_HOME/skills/specwave-router/` (default `~/.codex/skills/specwave-router/`).

- Before making any routing decisions, run: `python ~/.codex/skills/specwave-router/session_guard.py sync` (it writes into `~/.codex/specwave/state.json` and no longer writes `.specwave/settings.json`; if `CODEX_HOME` is set, it writes to `$CODEX_HOME/specwave/state.json`).
- Session identity is isolated by the current window/process by default; use `--session-id` only if you need an explicit fixed key.

## Highest priority: session lock (absolute in spec)

- Always use `~/.codex/specwave/state.json` as the source of truth (if you ran `sync`, rely on the post-sync result; if `CODEX_HOME` is set, use `$CODEX_HOME/specwave/state.json`).
- If `currentSession.mode === "spec"`: you are in spec; continue by `phase`. Do not route back to vibe based on keywords.

## Mode routing (only when there is no spec session)

- "新建需求 / 开 story / 走流程" → spec → Requirements Analyst
- "开始 / 开工 / 执行" → Execution → Dev Executor (must have `03-任务.md`)
- Otherwise → vibe

## No rushing (hard gate)

- Before changing code or running side-effectful commands, wait for explicit go-ahead: "START / go ahead / please proceed".
- In requirements stages you may write workspace docs, but say which files you will write first.

## Default response shape (keep it short)

- Line 1: `【spec 模式 - <阶段>】` or `【执行阶段 - <Story ID>】`
- Line 2: what you will do next (1 sentence)
- Line 3: what the user should reply ("继续" or "开始"), ask at most 1 key question

## Fixed conventions

- 4 stages: 诉求对齐 → 需求编写 → 设计方案 → 任务拆解 → (开始) 执行
- 3 docs: `01-需求.md` / `02-设计.md` / `03-任务.md` (requirements use "操作/预期", acceptance uses "操作 → 预期")

## Archive tool

When user says "归档"/"archive"/"archive STORY-xxx", use the archive tool:

```bash
# List archivable Stories
python ~/.codex/skills/specwave-router/archive_story.py list

# Archive a specific Story (requires all tasks completed)
python ~/.codex/skills/specwave-router/archive_story.py STORY-000001

# Force archive (skip task completion check)
python ~/.codex/skills/specwave-router/archive_story.py STORY-000001 --force
```
