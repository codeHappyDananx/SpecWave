# react-bits（vendor）

来源：`https://github.com/DavidHDev/react-bits`

本目录的代码来自 react-bits 的 `ts-default/Backgrounds/FaultyTerminal`，用于 SpecWave 的 `WelcomePage` 背景动效。

另外，本目录也包含通过 `shadcn add @react-bits/*-JS-CSS` 拉取的背景源码，并统一做了“样式局部化 + 可控参数”的改造，避免污染主工作区。

## 口径

- **只做 vendor，不对外发布组件库**：仅作为本项目应用的一部分使用。
- **做了最小改造**：移除全局 CSS 引用，改为 CSS Modules；去掉全局 `id`/`canvas` 选择器；补 `dpr` 等参数用于性能控制。
- **补齐 WebGL 诊断与兜底**：统一输出 WebGL 渲染器信息/首帧耗时/FPS 采样；在 `CONTEXT_LOST_WEBGL` 时停帧，并广播 `specwave-webgl-context-lost` 事件，供 `WelcomePage` 自动切换到 CSS 背景动效，避免黑屏/低帧率拖垮体验。

## 已 vendor 的背景

- `FaultyTerminal`
- `PrismaticBurst`
- `Hyperspeed`（含 `HyperSpeedPresets`）
- `ColorBends`
- `Prism`

## 许可证

react-bits 使用 `MIT + Commons Clause License Condition v1.0`，详见同目录 `LICENSE.md`。
