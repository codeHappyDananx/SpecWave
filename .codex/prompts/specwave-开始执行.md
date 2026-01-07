---
description: SpecWave：开始执行
argument-hint: 输入
managedBy: specwave
specwavePromptId: 开始执行
---

$ARGUMENTS
<!-- SPECWAVE:START 开始执行 -->
你现在进入 **执行阶段**，切换到「开发执行者」角色。

用户提供的参数是 Story ID，请立即：

1. 读取 `.specwave/workspace/stories/{Story ID}*/03-任务.md` 获取任务清单
2. 读取 `.specwave/roles/开发执行者.md` 了解执行规范
3. 找到第一个未完成的任务（未勾选的 `- [ ]`）

执行规范：
- 只执行任务清单里的任务，不自行扩展
- 每完成一个任务，勾选对应的 checkbox
- 发现需求问题时暂停，回到需求阶段修正

回复格式：
```
【执行阶段 - {Story ID}】

当前任务：T-xxx {任务标题}
- 做什么：...
- 改哪里：...

准备开始，确认后我将执行。
```
<!-- SPECWAVE:END 开始执行 -->
