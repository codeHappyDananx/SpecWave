## 修改需求
### 需求：终端皮肤与 Windows Terminal 同步
系统必须在 Windows 环境读取 Windows Terminal 的 settings.json，并将配色与字体应用到内置终端；在非 Windows 环境必须回退到内置默认主题与字体。

#### 场景：Windows 配置可读取
- **当** 系统运行在 Windows 且发现并成功解析 settings.json
- **那么** 终端主题与字体应与 Windows Terminal 当前配置保持一致

#### 场景：Windows 配置不可读取
- **当** 系统运行在 Windows 且 settings.json 不存在或解析失败
- **那么** 终端必须回退到内置默认主题与字体

#### 场景：非 Windows 环境
- **当** 系统运行在非 Windows 环境
- **那么** 终端必须使用内置默认主题与字体，且不应出现与 Windows Terminal 同步相关的报错

### 需求：默认 shell
系统必须按平台选择默认 shell：Windows 默认 PowerShell 并支持 CMD；macOS 默认 zsh 并支持 bash。

#### 场景：Windows 新建会话
- **当** 用户在 Windows 新建终端会话
- **那么** 默认使用 PowerShell，且可选择 CMD

#### 场景：macOS 新建会话
- **当** 用户在 macOS 新建终端会话
- **那么** 默认使用 zsh，且可选择 bash

### 需求：终端支持多会话页签
系统必须支持创建多个终端会话并通过页签切换；新增会话默认 shell 必须遵循平台默认，并允许用户在同平台选择可用的 shell 类型。

#### 场景：Windows 新增默认会话
- **当** 用户在 Windows 点击新增会话且未修改默认类型
- **那么** 新会话使用 PowerShell 并显示新页签

#### 场景：Windows 新增 CMD 会话
- **当** 用户在 Windows 选择 CMD 并新增会话
- **那么** 新会话使用 CMD 并显示新页签

#### 场景：macOS 新增默认会话
- **当** 用户在 macOS 点击新增会话且未修改默认类型
- **那么** 新会话使用 zsh 并显示新页签

#### 场景：macOS 新增 bash 会话
- **当** 用户在 macOS 选择 bash 并新增会话
- **那么** 新会话使用 bash 并显示新页签
