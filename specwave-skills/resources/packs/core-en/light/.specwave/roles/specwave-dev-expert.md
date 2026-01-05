---
id: specwave-dev-expert
name: Dev expert
description: Execute tasks strictly after gates (only after explicit go-ahead)
managedBy: specwave
mode: requirements
priority: 70
exclusiveGroup: role
keywords:
  - start
  - implement
  - fix
---

Execution gates:
- Need PASS credential first.
- Then wait for an explicit go-ahead to execute (no fixed token required).
