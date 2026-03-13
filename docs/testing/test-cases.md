# 测试案例清单

## 已自动化

### UI-PROMPT

- `UI-PROMPT-001` 提交输入框：按 `Enter` 提交去首尾空格后的内容，并清空输入框
- `UI-PROMPT-002` 提交输入框：空白内容和 `Shift+Enter` 不触发提交

### UI-TOPBAR

- `UI-TOPBAR-001` 顶栏搜索：输入后派发 `GLOBAL_SEARCH_SET`
- `UI-TOPBAR-002` 顶栏搜索：点击清空后派发空查询
- `UI-TOPBAR-003` 终端按钮：右栏已是终端时派发 `PANEL_TOGGLE_RIGHT`
- `UI-TOPBAR-004` 主题按钮：默认切换主题，`Shift+点击` 切换主色
- `UI-TOPBAR-005` 项目页签：支持激活和关闭

### UI-LEFT

- `UI-LEFT-001` 左侧切换条：点击“工作区/能力”派发正确意图
- `UI-LEFT-002` 左侧切换条：当前标签有激活态标记
- `UI-LEFT-003` Story 看板：挂载时只派发一次 `STORY_BOARD_LOAD`
- `UI-LEFT-004` Story 看板：按 Story 编号倒序展示
- `UI-LEFT-005` Story 看板：点击刷新派发 `STORY_BOARD_REFRESH`
- `UI-LEFT-006` Story 看板：点击卡片派发 `STORY_CARD_CLICK`

### UI-CENTER

- `UI-CENTER-001` 阶段指示器：隐藏态不渲染
- `UI-CENTER-002` 阶段指示器：只显示 `STORY-xxxxxx`
- `UI-CENTER-003` 阶段指示器：可用阶段可点击并派发意图
- `UI-CENTER-004` 阶段指示器：不可用阶段不可点击

### E2E-DESKTOP

- `E2E-DESKTOP-001` 欢迎页：展示最近项目列表
- `E2E-DESKTOP-002` 欢迎页：点击最近项目进入主界面
- `E2E-DESKTOP-003` 主界面：主题按钮可切换浅深色
- `E2E-DESKTOP-004` 主界面：`Shift+点击` 主题按钮可切换主色

## 下一批建议

- `UI-WELCOME-001` 欢迎页：最近项目移除
- `UI-RIGHT-001` 右栏：终端/对话模式切换
- `UI-RIGHT-002` 终端分区：拖拽换位与合并
- `UI-CENTER-005` 中栏：任务详情编辑与保存状态
- `E2E-DESKTOP-005` 主界面：快捷键切换右栏模式
- `E2E-DESKTOP-006` 主界面：打开 Story 文档并切换阶段
