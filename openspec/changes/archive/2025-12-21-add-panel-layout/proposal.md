# 变更：面板自由拉伸与一键收缩

## 为什么
- 三栏布局可用但伸缩受限，影响以任务或终端为主的使用场景
- 需要一键切换主视图，并保留宽度记忆

## 变更内容
- 允许三面板自由拉伸，记忆宽度
- 任务与终端作为同一区域可收缩切换主视图
- 文件面板与任务面板联动收缩

## 影响
- 受影响规范：panel-layout（新增）
- 受影响代码：src/App.vue、src/stores/ui.ts、src/components/Sidebar.vue、src/components/ContentPanel.vue、src/components/TerminalPanel.vue
