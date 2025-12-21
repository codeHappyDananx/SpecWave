# OpenSpec Visualizer 快速启动指南

## 前置要求

- Node.js 18+ 
- npm 或 yarn
- Windows 系统需要 PowerShell
- Python (用于 node-pty 编译)

## 安装步骤

### 1. 安装依赖

```bash
cd openspec-visualizer
npm install
```

如果 `node-pty` 安装失败，可以尝试：

```bash
npm install --ignore-scripts
```

### 2. 开发模式运行

```bash
npm run electron:dev
```

这会：
1. 启动 Vite 开发服务器（端口 5173）
2. 等待服务器就绪
3. 启动 Electron 应用

### 3. 构建生产版本

```bash
npm run electron:build
```

构建完成后，可执行文件在 `dist-electron` 目录。

## 功能说明

### 左侧边栏
- **Changes**: 显示所有活动变更
  - 点击文件夹展开/折叠
  - 点击文件查看内容
  - 进度徽章显示任务完成度
- **Specs**: 显示所有规范文档

### 中间内容区
- Markdown 渲染
- 代码语法高亮
- 复制按钮

### 右侧终端（可选）
- 点击右上角终端图标打开
- 支持多会话页签，点击“+”新建会话并选择 PowerShell/CMD
- 可执行 openspec-cn 命令
- 图片粘贴会保存到 `.terminal-paste/` 并向终端输入绝对路径

### 顶部工具栏
- 搜索框：过滤文件
- 主题切换：亮色/暗色
- 终端开关

## 故障排除

### node-pty 安装失败

Windows 用户需要安装构建工具：

```bash
npm install --global windows-build-tools
```

或者使用预编译版本：

```bash
npm install node-pty-prebuilt-multiarch
```

然后修改 `electron/main.js` 中的导入：

```javascript
const pty = require('node-pty-prebuilt-multiarch')
```

### Electron 启动失败

确保端口 5173 未被占用：

```bash
netstat -ano | findstr :5173
```

### 文件读取失败

确保应用在 OpenSpec 项目根目录运行，或修改 `electron/main.js` 中的路径配置。

## 开发提示

### 热重载

修改 Vue 组件会自动热重载，无需重启应用。

### 调试

开发模式下会自动打开 DevTools，可以查看控制台日志。

### 添加新功能

1. 在 `src/components/` 添加新组件
2. 在 `src/types/` 添加类型定义
3. 在 `electron/main.js` 添加主进程逻辑

## 项目结构

```
openspec-visualizer/
├── electron/              # Electron 主进程
│   ├── main.js           # 主进程入口（文件系统、终端）
│   └── preload.js        # 预加载脚本（IPC 桥接）
├── src/
│   ├── components/       # Vue 组件
│   │   ├── AppHeader.vue      # 顶部工具栏
│   │   ├── Sidebar.vue        # 左侧导航
│   │   ├── TreeNode.vue       # 树节点组件
│   │   ├── ContentPanel.vue   # 内容显示
│   │   └── TerminalPanel.vue  # 终端面板
│   ├── types/           # TypeScript 类型
│   ├── App.vue          # 根组件
│   ├── main.ts          # 应用入口
│   └── style.css        # 全局样式
├── index.html           # HTML 模板
├── package.json         # 项目配置
├── vite.config.ts       # Vite 配置
└── tsconfig.json        # TypeScript 配置
```

## 下一步

- [ ] 实现真实的文件系统读取
- [ ] 添加任务进度计算
- [ ] 实现文件监听自动刷新
- [ ] 添加更多 OpenSpec CLI 集成
- [ ] 优化性能和用户体验
