# OpenSpec Visualizer

一个现代化的桌面应用，用于浏览和管理 OpenSpec 规范驱动开发项目。

## 功能特性

- 项目目录选择和加载
- 树状导航浏览 changes/ 和 specs/ 目录
- Markdown 默认渲染视图（Typora 风格），支持语义双击选区与就地编辑
- Markdown 可选行号（LN 开关），行号与源文本对齐
- 文件内容查找（Ctrl+F）与高亮：当前命中蓝色、候选黄色
- 任务进度解析和展示
- tasks.md 任务看板（勾选/改标题/改描述）同源写回源 Markdown，支持撤销/重做
- 文件监听和自动刷新
- 搜索和过滤功能
- 亮色/暗色主题切换
- 窗口大小和位置记忆
- 最近打开的项目列表
- 右侧终端（多会话页签、PowerShell/CMD、图片粘贴落盘并输入绝对路径）

## 技术栈

- Electron 27
- Vue 3 + TypeScript
- Vite 5
- Pinia (状态管理)
- CodeMirror 6（Markdown 渲染视图/编辑、查找、撤销栈）
- Monaco Editor（代码/纯文本编辑兜底）
- highlight.js (代码高亮)
- chokidar (文件监听)
- xterm（内置终端）

## 安装

```bash
cd openspec-visualizer
npm install
```

如果 Electron 安装失败，请确保 `.npmrc` 文件包含镜像配置：

```
registry=https://registry.npmmirror.com
electron_mirror=https://npmmirror.com/mirrors/electron/
```

## 运行

### 开发模式

```bash
npm run electron:dev
```

或者双击 `start.bat`

### 构建生产版本

```bash
npm run electron:build
```

### 构建 macOS 版本

- macOS 的产物建议通过 GitHub Actions 构建（本仓库已提供 workflow），并输出 dmg/zip（x64/arm64）。
- 推送 tag（例如 v1.0.0）会触发自动构建，产物在 Actions 的 Artifacts 下载。
- 也可以在 macOS 本机执行：

```bash
npm run electron:build:mac
```

## 项目结构

```
openspec-visualizer/
├── electron/
│   ├── main.js           # Electron 主进程
│   └── preload.js        # 预加载脚本（IPC 桥接）
├── src/
│   ├── components/
│   │   ├── AppHeader.vue        # 顶部工具栏
│   │   ├── Sidebar.vue          # 左侧导航
│   │   ├── ContentPanel.vue     # 内容面板（视图/编辑/任务看板）
│   │   ├── MarkdownSurface.vue  # Markdown 渲染视图/就地编辑（CodeMirror 6）
│   │   ├── FileEditor.vue       # 代码/纯文本编辑（Monaco）
│   │   ├── TerminalPanel.vue    # 右侧终端
│   │   └── StatusBar.vue        # 状态栏
│   ├── stores/
│   │   ├── project.ts           # 项目状态
│   │   ├── tabs.ts              # 多会话页签
│   │   └── ui.ts                # UI 状态
│   ├── types/
│   │   └── index.ts           # 类型定义
│   ├── App.vue                # 根组件
│   ├── main.ts                # 应用入口
│   └── style.css              # 全局样式
├── package.json
├── vite.config.ts
├── .npmrc                     # npm 镜像配置
├── start.bat                  # Windows 启动脚本
└── install.bat                # Windows 安装脚本
```

## 使用说明

1. 启动应用后，点击"选择项目目录"按钮
2. 选择包含 `changes/` 或 `specs/` 目录的 OpenSpec 项目
3. 左侧导航树会显示项目结构
4. 点击文件查看内容（Markdown 默认 View；tasks.md 默认看板）
5. 使用左侧搜索框过滤文件；底部“显示全部文件”可展开全量文件树
6. Ctrl+F 在当前文件内查找（不会跳到顶部“搜索文件”；终端区域不接管）
7. 右上角 View 按钮切换渲染/源码（tasks.md 会在 看板 / View / Source 间切换）
8. Markdown 可用 LN 按钮显示行号
9. 点击右上角按钮切换主题

## 快捷键

- `Ctrl+F`：在当前文件中查找（终端区域不接管）
- `Ctrl+S`：保存（编辑器/MarkdownSurface）
- `Ctrl+Z`：撤销（终端除外）
- `Ctrl+Y` / `Ctrl+Shift+Z`：重做（终端除外）

## 已知问题

- GPU 进程错误：某些系统可能显示 GPU 相关错误，通常不影响功能
- 如果 Electron 安装失败，请使用 `.npmrc` 配置镜像

## 许可证

MIT
