# 变更：终端皮肤与 Windows Terminal 同步

## 为什么
- 当前终端配色与字体固定，无法匹配用户的 Windows Terminal 配置
- 需要尽量接近原生 Windows Terminal 的外观与样式

## 变更内容
- 读取 Windows Terminal settings.json 并解析配色与字体
- 映射到 xterm 主题配置与字体设置
- 无法读取时提供稳定回退

## 影响
- 受影响规范：terminal（新增需求）
- 受影响代码：electron/main.js、electron/preload.js、src/components/TerminalPanel.vue、src/types/index.ts