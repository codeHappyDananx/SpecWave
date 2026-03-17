# SpecWave

这是一个“规范 + AI 工作区”的桌面端新仓库（重构版）。

## 目标（第一阶段）

- 先把三段工作区壳跑起来：左区 / 中区 / 右区
- UI 与业务彻底解耦：UI 只发 `UIIntent`、只读 `ViewModel`
- 视觉口径固定：Light Mode + Flat（无阴影、无模糊）
- 字体离线内置：Outfit + JetBrains Mono

## 开发

- 安装依赖：`pnpm install`
- 启动开发：`pnpm dev`（Windows 推荐直接双击/运行 `start.bat`，它会自动 `cd` 到仓库根目录，并默认清理残留进程）
- 启动编排服务：`pnpm start:orchestrator`（结果导向自动交付 API）
- 类型检查：`pnpm typecheck`

### 编排服务（MVP）

- 目录：`apps/orchestrator`
- 目标：甲方提诉求后，自动完成澄清 → 计划 → 开发 → 测试 → 结果包交付
- 关键能力：审批闸门、超时提醒（24h/48h/72h）、升级后暂停、恢复运行、通知队列、渠道 webhook 归一化

## 打包（Windows）

- 生成构建产物（`dist-electron`）：`pnpm build`
- 生成安装包（NSIS Setup.exe）+ 免安装版（portable.exe）：`pnpm -C apps/desktop dist:win`
- 打包输出目录：`apps/desktop/release/`

### 代码签名（Windows）

本项目用 `electron-builder` 的默认签名逻辑：通过环境变量提供证书，不把证书落进仓库。

- `CSC_LINK`：`.pfx` 证书路径（也可以是 base64 字符串）
- `CSC_KEY_PASSWORD`：证书密码

说明：
- 如果机器上没有 `signtool.exe`（Windows SDK / Visual Studio Build Tools 提供），会导致签名失败；你也可以先不设置 `CSC_LINK`/`CSC_KEY_PASSWORD` 生成未签名安装包用于自测。
- PowerShell 示例：`$env:CSC_LINK='C:\\path\\to\\SpecWave.pfx'; $env:CSC_KEY_PASSWORD='******'; pnpm -C apps/desktop dist:win`

### WelcomePage 背景动效（WebGL）排查

如果你在 Windows 上遇到 `GPU process exited unexpectedly` 或 WelcomePage 动效黑屏/卡顿，优先尝试切换 ANGLE：  
- 开发模式默认使用 `warp`（软件 D3D11，更稳且能提供 WebGL2；避免随机背景里 three.js 直接黑屏）；需要手动指定时按下面方式覆盖即可。  
- 直接用启动脚本参数：`start.bat d3d9` / `start.bat warp` / `start.bat swiftshader` / `start.bat nogpu`  
- PowerShell：`$env:SPECWAVE_ANGLE='d3d9'; .\start.bat`  
- 仍不行：`$env:SPECWAVE_ANGLE='warp'; .\start.bat`  
- 仍不行（软件 WebGL）：`$env:SPECWAVE_USE_GL='swiftshader-webgl'; .\start.bat`  
- 彻底禁用 GPU 排查：`$env:SPECWAVE_DISABLE_GPU='1'; .\start.bat`

备注：
- `start.bat` 会把开发环境的 `userData` 指到仓库内的 `.tmp-specwave-userdata/`，它是可回收的（删掉即可重置）。
- 生产模式下，GPU 自救结果会写入 `userData/gpu-preferences.json`，后续启动会沿用稳定配置；如需重置，可删除该文件或设置 `SPECWAVE_RESET_GPU_PREFS=1` 再启动一次。

## 快捷键（MVP）

- `Ctrl+S`：保存（示意）
- `Ctrl+F`：查找（示意）
- `Ctrl+Alt+1`：切到右区“终端”（并自动显示右区）
- `Ctrl+Alt+2`：切到右区“对话”（并自动显示右区）

## 目录约定（简述）

- `apps`：可运行的应用（先做桌面端）
- `packages`：可复用的模块（contracts / ui-next 等）

## 许可证与开源保护

- 本项目代码采用 `AGPL-3.0-or-later` 开源，见 [LICENSE](./LICENSE)
- 如果你修改本项目并通过网络向用户提供服务，需要按许可证要求提供对应源码
- `SpecWave` 名称、Logo、应用图标与其他品牌标识不随代码许可证一并授权，见 [TRADEMARKS.md](./TRADEMARKS.md)

## 贡献与安全

- 提交贡献前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)
- 本项目要求提交带 `DCO` 签名：`git commit -s`
- 安全漏洞请不要公开披露，流程见 [SECURITY.md](./SECURITY.md)
