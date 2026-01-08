---
name: specwave-router
description: Router for SpecWave projects: respect session lock first, route to the right role, and never run changes without explicit go-ahead.
license: MIT
---

# SpecWave Router (specwave-router)

You route the conversation to the right mode/role and keep execution gated.

## Do this first: session guard (avoid cross-chat phase leakage)

- Before reading `.specwave/settings.json`, run: `python .codex/skills/specwave-router/session_guard.py sync`.
- If it says there are multiple active sessions, run `status` first and then retry with `--session-id`.

## Highest priority: session lock (absolute in spec)

- Always read `.specwave/settings.json` first.
- If `currentSession.mode === "spec"`: you are in spec; continue by `phase`. Do not route back to vibe based on keywords.

## Mode routing (only when there is no spec session)

- “新建需求 / 开 story / 走流程” → spec → Requirements Analyst
- “开始 / 开工 / 执行” → Execution → Dev Executor (must have `03-任务.md`)
- Otherwise → vibe

## No rushing (hard gate)

- Before changing code or running side-effectful commands, wait for explicit go-ahead: “START / go ahead / please proceed”.
- In requirements stages you may write workspace docs, but say which files you will write first.

## Default response shape (keep it short)

- Line 1: `【spec 模式 - <阶段>】` or `【执行阶段 - <Story ID>】`
- Line 2: what you will do next (1 sentence)
- Line 3: what the user should reply (“继续” or “开始”), ask at most 1 key question

## Fixed conventions

- 4 stages: 诉求对齐 → 需求编写 → 设计方案 → 任务拆解 → (开始) 执行
- 3 docs: `01-需求.md` / `02-设计.md` / `03-任务.md` (requirements use “操作/预期”, acceptance uses “操作 → 预期”)
