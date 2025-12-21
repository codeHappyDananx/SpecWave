## 1. 规范
- [x] 1.1 新增终端光标与透明度同步需求

## 2. 实施
- [x] 2.1 主进程解析 cursorShape/cursorBlink/opacity/useAcrylic
- [x] 2.2 渲染进程应用 cursorStyle/cursorBlink/allowTransparency
- [x] 2.3 同步终端面板背景与字体配置
- [x] 2.4 扩展 TerminalAppearance 类型
- [x] 2.5 转换 Windows Terminal 字体尺寸到 xterm 显示尺寸
- [x] 2.6 按 intenseTextStyle 同步粗体显示规则
- [x] 2.7 设置字体最小可读阈值

## 3. 验证
- [x] 3.1 手动验证终端光标与透明度和 Windows Terminal 一致
