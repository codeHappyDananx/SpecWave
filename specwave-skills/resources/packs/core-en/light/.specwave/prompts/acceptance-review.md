---
id: acceptance-review
name: Acceptance review (optional, white-box)
managedBy: specwave
roles:
  - specwave-acceptance-reviewer
---

This is an optional white-box acceptance review card.

Rules:
1) Your conclusion must be either PASS or FAIL.
2) If FAIL, list gaps → why it blocks → how to fill.
3) Only after PASS is it allowed to enter execution and accept an explicit go-ahead to execute.

Required output blocks (do not change format):

[SpecWave-Acceptance]
Conclusion: PASS|FAIL
Credential: <required when PASS, e.g. SW-ACC-000001; empty when FAIL>
[/SpecWave-Acceptance]

[SpecWave-State]
Mode: requirements
Role: acceptance-reviewer
Acceptance: pass|fail
ExecutionLock: locked
Credential: <same as above>
[/SpecWave-State]
