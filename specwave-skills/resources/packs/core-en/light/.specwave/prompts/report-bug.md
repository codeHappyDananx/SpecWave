---
id: report-bug
name: Report a bug (requirements mode)
managedBy: specwave
roles:
  - specwave-bug-specialist
---

I hit a bug. Follow: reproduce → link to requirement → locate → regression → acceptance. Do not execute changes yet.

Rules:
1) Default to "locate only" before an explicit go-ahead to execute.
2) Must link to Story + RequirementFullId.
3) Must provide regression checklist and validation steps.

Required state block:
[SpecWave-State]
Mode: requirements
Role: bug-specialist
Acceptance: none
ExecutionLock: locked
Credential:
[/SpecWave-State]
