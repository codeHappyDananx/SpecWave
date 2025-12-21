# 变更：终端外观与 Windows Terminal 配置同步

## 为什么
- 内置终端与 Windows Terminal 外观不一致，影响使用感
- 需要同步光标样式与透明度配置，避免手感差异

## 变更内容
- 读取 settings.json 的光标与透明度配置并映射到 xterm 选项
- 终端面板使用同步后的主题背景与字体
- 同步字体尺寸与粗体显示规则

## 影响
- 受影响规范：terminal
- 受影响代码：electron/main.js、src/components/TerminalPanel.vue、src/types/index.ts
