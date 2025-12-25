# OpenSpec Visualizer

一个现代化的桌面应用，用于浏览和管理 OpenSpec 规范驱动开发项目。

## 功能特性

- 项目目录选择和加载
- 树状导航浏览 changes/ 和 specs/ 目录
- Markdown 文档渲染和语法高亮
- 任务进度解析和展示
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
- marked (Markdown 渲染)
- highlight.js (代码高亮)
- chokidar (文件监听)

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
│   │   ├── AppHeader.vue      # 顶部工具栏
│   │   ├── Sidebar.vue        # 左侧导航
│   │   ├── TreeNode.vue       # 树节点组件
│   │   ├── ContentPanel.vue   # 内容面板
│   │   └── StatusBar.vue      # 状态栏
│   ├── stores/
│   │   ├── project.ts         # 项目状态
│   │   └── ui.ts              # UI 状态
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
4. 点击文件查看内容
5. 使用搜索框过滤文件
6. 点击右上角按钮切换主题

## 快捷键

- 无（暂未实现）

## 已知问题

- GPU 进程错误：某些系统可能显示 GPU 相关错误，通常不影响功能
- 如果 Electron 安装失败，请使用 `.npmrc` 配置镜像

## 许可证

MIT
