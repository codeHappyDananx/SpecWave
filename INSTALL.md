# 安装指南

## 问题诊断

你遇到的问题可能是：
1. PowerShell 执行策略限制
2. npm 证书问题
3. 网络连接问题
4. 文件被占用

## 解决方案

### 方案 1：修复 PowerShell 执行策略（推荐）

以管理员身份打开 PowerShell，执行：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

然后重新尝试安装：

```bash
cd openspec-visualizer
npm install
```

### 方案 2：使用 CMD 安装

打开 CMD（不是 PowerShell），执行：

```cmd
cd openspec-visualizer
npm install
```

### 方案 3：使用淘宝镜像

如果是网络问题，使用国内镜像：

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### 方案 4：分步安装（最稳妥）

如果上述方法都失败，手动分步安装：

```bash
# 1. 清理
rd /s /q node_modules
del package-lock.json

# 2. 安装核心依赖
npm install vue@3.4.0
npm install pinia@2.1.0
npm install marked@11.0.0
npm install highlight.js@11.9.0

# 3. 安装开发依赖
npm install --save-dev @vitejs/plugin-vue@5.0.0
npm install --save-dev vite@5.0.0
npm install --save-dev typescript@5.3.0
npm install --save-dev vue-tsc@1.8.0

# 4. 安装 Electron（可选，如果需要桌面版）
npm install --save-dev electron@28.0.0
npm install --save-dev electron-builder@24.9.0
npm install --save-dev concurrently@8.2.0
npm install --save-dev wait-on@7.2.0

# 5. 安装可选依赖（终端功能）
npm install chokidar@3.5.3
```

### 方案 5：使用 Web 版本（无需 Electron）

如果只想快速体验，可以先运行 Web 版本：

```bash
# 复制简化的 package.json
copy package-simple.json package.json

# 安装依赖
npm install

# 运行
npm run dev
```

然后在浏览器打开 http://localhost:5173

## 验证安装

安装成功后，运行：

```bash
npm run dev
```

应该看到：

```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

## 常见错误

### 错误 1: "cannot be loaded"

**原因**: PowerShell 执行策略限制

**解决**: 使用方案 1 或方案 2

### 错误 2: "ECONNRESET" 或 "network timeout"

**原因**: 网络连接问题

**解决**: 使用方案 3（淘宝镜像）

### 错误 3: "EBUSY" 或 "EPERM"

**原因**: 文件被占用或权限问题

**解决**: 
1. 关闭所有编辑器和终端
2. 删除 node_modules 文件夹
3. 重新安装

### 错误 4: "Cannot find module 'debug'"

**原因**: Electron 安装不完整

**解决**: 使用方案 4 分步安装，或使用方案 5 跳过 Electron

## 推荐流程

1. 先尝试方案 1（修复执行策略）
2. 如果失败，尝试方案 3（使用镜像）
3. 如果还是失败，使用方案 5（Web 版本）
4. 最后才考虑方案 4（分步安装）

## 需要帮助？

如果以上方法都不行，请提供：
1. 错误信息截图
2. Node.js 版本：`node --version`
3. npm 版本：`npm --version`
4. 操作系统版本
