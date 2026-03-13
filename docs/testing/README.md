# 测试规范

## 1. 目标

- 所有新增需求在交付前必须先自测。
- 自测覆盖三层：组件交互、桌面端流程、回归用例。
- 测试必须可重复执行，不能依赖人工点原生系统弹窗。

## 2. 分层约定

### L1 组件交互测试

- 位置：`packages/ui-next/src/**/*.test.tsx`
- 工具：`Vitest + Testing Library + jsdom`
- 范围：按钮、输入框、列表排序、阶段切换、快捷交互
- 要求：优先断言用户可见结果和 `dispatch(intent)`，不要测试实现细节

### L2 桌面端单元测试

- 位置：`apps/desktop/src/**/*.test.ts`
- 工具：`Vitest`
- 范围：主进程能力、预处理、纯函数、IPC 边界

### L3 Electron E2E

- 位置：`apps/desktop/e2e/**/*.e2e.ts`
- 工具：`Playwright`
- 范围：欢迎页、打开项目、主界面切换、关键页面交互
- 要求：
  - 先 `build`，不要依赖 `electron-vite dev`
  - 启动时固定 `SPECWAVE_DISABLE_GPU=1`
  - 启动时固定 `SPECWAVE_TEST_MODE=1`
  - 每次测试必须使用独立 `SPECWAVE_USER_DATA_DIR`

## 3. 命名规范

- 单元/组件测试：`*.test.ts`、`*.test.tsx`
- 端到端测试：`*.e2e.ts`
- 测试标题直接描述行为，格式建议：
  - `应当...`
  - `支持...`
  - `...时不应...`

## 4. 用例编写规则

- 新功能至少补 1 个正常流测试。
- 有分支判断的交互至少补 1 个反向用例。
- 修 bug 必须补对应回归用例，防止二次复发。
- 断言优先级：
  1. 页面可见文本或可访问属性
  2. `dispatch(intent)` 或状态切换
  3. 最后才看 class 和内部实现

## 5. 执行口径

- 日常改动：

```bash
pnpm test:unit
```

- 涉及页面交互、窗口切换、欢迎页/主界面流程：

```bash
pnpm test:e2e
```

- 提交前全量验证：

```bash
pnpm verify
```

## 6. 稳定性规则

- 不走系统文件选择弹窗做 E2E。
- 不依赖外部 orchestrator 服务做 E2E。
- 随机背景、GPU、用户数据都要在测试中固定或隔离。
- 测试失败时优先修复用例稳定性，再判断是否是业务回归。

