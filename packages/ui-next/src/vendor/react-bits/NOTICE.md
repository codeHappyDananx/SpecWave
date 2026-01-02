# react-bits（vendor）

来源：`https://github.com/DavidHDev/react-bits`

本目录的代码来自 react-bits 的 `ts-default/Backgrounds/FaultyTerminal`，用于 SpecWave 的 `WelcomePage` 背景动效。

## 口径

- **只做 vendor，不对外发布组件库**：仅作为本项目应用的一部分使用。
- **做了最小改造**：移除全局 CSS 引用，改为 CSS Modules；调整导出方式与默认参数，避免无意义重建 WebGL。

## 许可证

react-bits 使用 `MIT + Commons Clause License Condition v1.0`，详见同目录 `LICENSE.md`。

