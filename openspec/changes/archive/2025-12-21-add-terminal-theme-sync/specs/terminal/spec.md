## 新增需求
### 需求：终端皮肤与 Windows Terminal 同步
系统必须读取 Windows Terminal 的 settings.json，并将配色与字体应用到内置终端。

#### 场景：配置可读取
- **当** 系统发现并成功解析 settings.json
- **那么** 终端主题与字体应与 Windows Terminal 当前配置保持一致

#### 场景：配置不可读取
- **当** settings.json 不存在或解析失败
- **那么** 终端必须回退到内置默认主题与字体

### 需求：终端主题映射规则
系统必须支持将 Windows Terminal color scheme 映射到 xterm 主题字段。

#### 场景：应用配色方案
- **当** color scheme 中提供 foreground/background/cursor/16 色
- **那么** xterm 的 theme 必须使用对应字段

### 需求：字体与字号同步
系统必须同步 Windows Terminal 的字体与字号配置。

#### 场景：配置字体
- **当** settings.json 提供 fontFace/fontSize
- **那么** 终端必须使用相同字体与字号