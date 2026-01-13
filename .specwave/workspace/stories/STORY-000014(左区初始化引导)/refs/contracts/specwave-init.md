# 初始化引导：交互契约（STORY-000014）

## 目标

把“左栏初始化引导”涉及的状态、失败语义、进度事件写成契约，避免实现阶段靠猜。

## `UIIntent`：界面意图

> 说明：UI 只负责派发意图与展示状态，不直接执行文件操作。

```ts
export type UIIntent =
  | { type: 'SPECWAVE_INIT_OPEN' }
  | { type: 'SPECWAVE_INIT_START' }
  | { type: 'SPECWAVE_INIT_RETRY' }
  | { type: 'SPECWAVE_INIT_CLOSE' }
  | { type: 'SPECWAVE_INIT_COPY_ERROR'; payload: { text: string } }
```

## `ViewModel`：视图模型

```ts
export type InitStepKey = 'check' | 'createWorkspace' | 'writeConfig' | 'verify'

export type InitStepStatus = 'todo' | 'doing' | 'done' | 'error'

export type InitWizardVM = {
  isOpen: boolean
  phase: 'idle' | 'running' | 'success' | 'failure'
  steps: Array<{ key: InitStepKey; title: string; status: InitStepStatus }>
  progress?: { percent: number; label?: string }
  logs: Array<{ level: 'info' | 'warn' | 'error'; text: string; time?: string }>
  error?: { title: string; detail?: string; canRetry: boolean; copyText?: string }
  actions: { canClose: boolean; canRetry: boolean }
}
```

## 运行时事件（实现侧到 UI）

> 说明：事件载荷建议走结构化对象，避免 UI 解析纯文本。

```ts
export type RuntimeEvent =
  | {
      type: 'SPECWAVE_INIT_PROGRESS'
      payload: {
        step?: { key: InitStepKey; status: InitStepStatus }
        progress?: { percent: number; label?: string }
        logAppend?: { level: 'info' | 'warn' | 'error'; text: string; time?: string }
      }
    }
  | {
      type: 'SPECWAVE_INIT_RESULT'
      payload:
        | { ok: true }
        | { ok: false; error: { title: string; detail?: string; canRetry: boolean; copyText?: string } }
    }
```

## 回归清单（最短步骤）

- 成功：未初始化项目 → 点击初始化 → 进度推进到完成 → 左栏刷新为正常工作区
- 失败：人为制造失败（如权限/路径不可写）→ 点击初始化 → 进入失败态 → 可重试且错误可复制
