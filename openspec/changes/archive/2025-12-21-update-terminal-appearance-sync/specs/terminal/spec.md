## 新增需求
### 需求：终端光标与透明度同步
系统必须读取 Windows Terminal 的光标与透明度配置并映射到 xterm 选项。

#### 场景：同步光标样式
- **当** settings.json 提供 cursorShape 或 cursorBlink
- **那么** 终端光标样式与闪烁行为应与配置一致

#### 场景：同步透明度
- **当** settings.json 提供 useAcrylic 或 opacity
- **那么** 终端透明度行为应与配置一致

### 需求：终端字体与粗体规则同步
系统必须同步 Windows Terminal 的字体尺寸与粗体显示规则。

#### 场景：同步字体尺寸
- **当** settings.json 提供 font.size
- **那么** 终端字体大小与 Windows Terminal 实际显示尺寸一致

#### 场景：字号可读性保护
- **当** 同步后的字号过小
- **那么** 终端字体至少提升到可读性阈值

#### 场景：同步粗体规则
- **当** settings.json 的 intenseTextStyle 为 bold
- **那么** 终端使用粗体显示而非亮色替代
