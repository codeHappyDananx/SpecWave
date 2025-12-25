# 项目 上下文

## 目的
OpenSpec Visualizer 是桌面应用，用于浏览和管理 OpenSpec 规范项目，提供三栏浏览、Markdown 渲染、搜索与主题切换，并支持右侧终端执行项目命令。

## 技术栈
- Electron 27（主进程与预加载）
- Vue 3 + TypeScript（渲染进程）
- Vite 5
- Pinia
- marked、highlight.js
- chokidar
- ws
- xterm、xterm-addon-fit
- node-pty（Windows PTY）

## 项目约定

### 代码风格
- Vue SFC + Composition API
- 2 空格缩进
- 组件与文件名使用 PascalCase
- 主进程使用 CommonJS，渲染进程使用 ES 模块
- 避免冗余代码，优先单一实现路径
- 依赖最小化，无明确收益不新增依赖

### 架构模式
- Electron 主进程负责文件系统访问、偏好设置与 IPC
- 预加载脚本通过 contextBridge 暴露受控 API
- 渲染进程使用 Vue + Pinia 组织 UI
- 终端使用 xterm 渲染，PTY 由主进程驱动（计划）

### 规范与任务一致性
- 已有需求必须有对应任务
- 无需求先新增需求再添加任务

### 测试策略
- 当前以手动冒烟为主
- 覆盖点：项目选择、文件树、Markdown 渲染、主题切换、终端启动与输入

### Git工作流
- 当前未强制约定
- 建议使用 main + feature 分支，并通过 PR 合并

## 领域上下文
- OpenSpec 项目包含 changes/ 与 specs/
- 重点文件包括 proposal.md、tasks.md、design.md 与 spec.md
- 需要支持 openspec-cn 相关命令的执行与输出展示

## 重要约束
- 支持 Windows 与 macOS（基础能力）
- 渲染进程禁用 nodeIntegration，启用 contextIsolation
- 终端体验在 Windows 需接近 Windows Terminal；macOS 使用内置主题并提供 zsh/bash
- 统一 Node.js 18 LTS 与随附 npm 9.x，不引入多版本 npm 要求

## 外部依赖
- Node.js 18+（开发）
- openspec-cn CLI
- 构建工具（node-pty 需要原生编译或预编译依赖）
