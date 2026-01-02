# SPECWAVE UI STYLE (LIGHT / FLAT)

> 这份文档是 SpecWave 的**唯一视觉口径**。新增组件、调整样式、补交互细节时，必须以本文件为准（避免“改一处连锁崩”）。

## 1. 风格原则（Flat）

1) **禁止立体感**  
   - 禁止阴影（`box-shadow: none`）  
   - 禁止毛玻璃/模糊（`backdrop-filter` / `filter: blur`）  
   - 禁止拟物渐变按钮（按钮/卡片不使用彩色渐变）

2) **层级靠平面要素建立**  
   - 用字号/字重/色块/留白做层级  
   - 分组用背景色块，而不是细线分隔（必要时才用粗边框）

3) **几何纯粹**  
   - 以矩形/圆为主，圆角统一（6px/8px）

4) **交互反馈要“明显且直接”**  
   - Hover 通过颜色变化 + 轻微缩放（不靠阴影）  
   - 动效快、干脆（`~200ms`）

## 2. Light Palette（单一 Light Mode）

- Background: `#FFFFFF`
- Foreground: `#111827`
- Primary: `#3B82F6`
- Secondary: `#10B981`
- Accent: `#F59E0B`
- Muted: `#F3F4F6`
- Border: `#E5E7EB`（少用、用粗不用品质感）

## 3. 字体（离线内置）

- UI 字体：`Outfit`（几何无衬线）
- 代码/终端：`JetBrains Mono`

要求：
- UI 正文不要过大（以桌面工作效率优先）。
- 终端/代码区域只用 `JetBrains Mono`，保持等宽对齐。

## 4. 圆角 / 边框

- Radius：6px（md）/ 8px（lg）
- Borders：一般不画细线；需要结构时使用 `border-2` 实线。

## 5. 阴影 / 渐变 / Blur

- Shadows：一律禁止
- Gradients：只允许用于背景装饰（灰阶或低对比），不允许用于按钮/卡片主体
- Blur：一律禁止

## 6. 组件口径（UI 形态）

### 6.1 Buttons

- Primary：`bg Primary` + 白字，hover 变深 + scale
- Secondary：`bg Muted` + 深色字，hover 变深 + scale
- Outline：`border-4` + 透明底，hover 填充色块

### 6.2 Cards

- 纯色块卡片：无阴影、无细边框、padding 充足（`p-6/p-8`）
- hover：轻微 scale（`~1.02`）+ 色块加深

### 6.3 Inputs

- Normal：`bg Muted`、无边框
- Focus：白底 + `border-2` Primary（不使用 glow）

## 7. 布局与分区（5 区域）

SpecWave 的桌面工作区分为：
- 顶部：项目 tabs + 搜索 + 功能图标
- 左区：文件/导航
- 中区：内容工作区（默认目标：占窗口宽度的 70% 的内容展示口径）
- 右区：终端/对话
- 底部：状态条

## 8. 滚动条（Flat / Light）

目标：滚动条必须和整体 Flat 风格一致，不要出现系统默认的“厚重/立体”外观。

口径：
- 颜色来自 tokens（Muted/Border/Foreground）
- 不使用阴影
- Hover 仅做颜色加深（不做发光）

实现提示：
- Chromium/Electron：使用 `::-webkit-scrollbar*`
- Firefox：使用 `scrollbar-color` / `scrollbar-width`

## 9. WelcomePage 特例（允许突破，但必须“只影响自己”）

WelcomePage 允许更“炫酷”的视觉（暗色背景、渐变、blur、WebGL 动效等），用于拉开“欢迎页”和“工作区”的层级体验。

硬约束：
- 样式只能写在 `packages/ui-next/src/shell/WelcomePage.module.css`（CSS Modules），禁止把欢迎页样式写进 `packages/ui-next/src/styles.css`。
- WelcomePage 的动效/第三方源码只能在 WelcomePage 内引用（例如 `packages/ui-next/src/vendor/react-bits/*`），禁止扩散到主工作区三栏。
- WelcomePage 的任何调整都不应改变 TopBar/LayoutGrid/StatusBar/panels 的视觉口径。
