## 1. 需求与设计
- [x] 1.1 盘点当前 electron-builder 配置与 Windows-only 依赖点
- [x] 1.2 明确 macOS 出包策略（CI 构建、无签名）

## 2. 实施
- [x] 2.1 增加 macOS target（dmg/zip，x64/arm64）与构建脚本
- [x] 2.2 终端默认 shell 跨平台：Windows=PowerShell/CMD，macOS=zsh/bash
- [x] 2.3 渲染进程 shell 选项随平台切换
- [x] 2.4 输出 GitHub Actions workflow（macOS 出包）

## 3. 文档与验证
- [x] 3.1 更新项目约束与使用说明（macOS 构建边界）
- [x] 3.2 运行 openspec-cn validate add-macos-support --strict
- [ ] 3.3 CI 出包验证（tag 触发 + 产物可下载）
