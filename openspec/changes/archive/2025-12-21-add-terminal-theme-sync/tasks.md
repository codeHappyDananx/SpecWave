## 1. 规范
- [x] 1.1 定义 Windows Terminal 配置解析与回退策略
- [x] 1.2 定义终端主题与字体映射规则

## 2. 实施
- [x] 2.1 读取 Windows Terminal settings.json 并解析配置
- [x] 2.2 暴露终端主题 IPC 给渲染进程
- [x] 2.3 在 xterm 初始化中应用主题与字体
- [x] 2.4 添加回退与错误提示

## 3. 验证
- [x] 3.1 运行 openspec-cn validate add-terminal-theme-sync --strict
- [x] 3.2 手动验证主题与字体同步
