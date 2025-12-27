## 0. 技术评审与纠偏结论（执行约束）

这部分不是“想法”，而是本变更的**强约束**。后续实现必须按这些结论落地，否则会走回头路。

### 0.1 技术选型结论（性能 / 可用 / 稳定 / 迭代 / 完美）
- Markdown 编辑核心：**CodeMirror 6**（源文本为真相 + decorations），承载渲染观感、就地编辑、撤销栈与查找面板。
- 不选：Milkdown/ProseMirror 系 WYSIWYG 作为主路径（存在 Markdown 解析与序列化回写链路，容易触发全局重排，与“最小改动面保存”方向冲突）。
- Monaco：保留为“非 Markdown 的代码/纯文本编辑器兜底”，不承担 Typora 风格主路径。
- 语义选区：用增量语法树驱动（Lezer Markdown 思路），双击选中语义单元；失败必须按 design.md 的降级策略退回行编辑/块编辑/全文源码编辑。
- 行号（纠偏）：**不做 DOM data-line 锚点映射**；统一用 CodeMirror 的 gutter 行号能力（lineNumbers）作为主方案。
- 查找：Ctrl+F 必须打开内容区查找面板；滚动策略必须可控，避免横向滚动条被强行拉动（只有命中不可见时才允许调整）。
- 撤销重做：必须支持 Ctrl+Z 撤销；Ctrl+Y 与 Ctrl+Shift+Z 重做（终端除外）。

### 0.2 接手入口（从哪段代码开始）
- 默认内容模式：ContentPanel.vue:244（目前 Markdown 默认 editor，后续需改为 view）
- 任务看板写回：ContentPanel.vue:844（当前正则替换存在误命中风险，后续必须改为“范围锚点 + 指纹副键 + 降级回退”）
- 文件读取元信息注入：project.ts:597（encoding、bom、eol 已进入 FileContent）
- 文件保存保持：main.js:633（BOM 与换行探测/写回），main.js:919（save-file IPC）
- Monaco 兜底编辑器：FileEditor.vue:131（编辑器内 Ctrl+F 查找），FileEditor.vue:158（Ctrl+S 保存）

### 0.3 验收口径（写代码前必须对齐）
- “最小改动面”不是格式化：任何序列化重排都视为失败（spec.md:40）
- tasks 看板编辑必须同源、可撤销，且写回不得依赖“任务文本唯一”假设（design.md:133）
- 行号必须与源文本行号一致，折行不重复（spec.md:83）
- 查找高亮：当前命中蓝色、候选黄色；焦点不离开输入框；纵向滚动可跟随命中，横向滚动仅在命中不可见时才调整

## 1. 需求与设计
- [x] 1.1 补齐 visualizer-core 增量规范（默认渲染、语义双击、必要时显语法、tasks 同源）
- [x] 1.2 输出“语义单元定义表”（段落/标题/列表项/链接/强调/任务项/代码块/表格单元）与降级策略
- [x] 1.3 定义“必要时显示语法”的规则（触发条件、显示范围、退出条件）
- [x] 1.4 定义 tasks.md 看板与源文本的映射规则（最小 patch 方式 + 可撤销）
- [x] 1.5 增加“渲染视图行号”需求与交互约束（可选开关 + 不影响编辑/选区）

## 2. 实施（P0：文本为真相）
- [x] 2.1 引入 CodeMirror 6（仅 Markdown 通道），建立 MarkdownSurface 骨架
  - 诉求：Markdown 默认“渲染观感 + 就地编辑”，替代 v-html 与 Monaco 的 Markdown 主路径（spec.md:6）
  - 入口：ContentPanel.vue:244（默认模式），ContentPanel.vue:255（模式切换触发渲染）
  - 技术：EditorView + extensions（history、search、decorations、gutter）
  - 实现：新增 MarkdownSurface；在 view 模式用 decorations 隐藏/弱化语法并保持可编辑；需要时降级到源码编辑
- [x] 2.2 接入 FilePersistence：读取保留 encoding/BOM/EOL；保存按原风格输出；只做最小改动面
  - 诉求：保存保持 BOM 与换行风格；不做全局格式化重排（spec.md:40）
  - 入口：project.ts:626（FileContent 元信息），preload.js:14（saveFile 桥接），main.js:919（save-file IPC）
  - 实现：MarkdownSurface 保存时传入 encoding、bom、eol；未提供时由主进程探测兜底；写回必须保持最小改动面
- [x] 2.3 查找能力：Ctrl+F 打开内容搜索面板；支持 next/prev；不乱改横向滚动条
  - 诉求：Ctrl+F 只作用于内容区；当前命中蓝色、候选黄色；焦点不丢；横向滚动仅在命中不可见时才调整
  - 入口：ContentPanel.vue:16（现有 find-bar），ContentPanel.vue:414（openFind 入口），FileEditor.vue:131（Monaco openFind 兜底）
  - 技术：search 面板 + searchKeymap；用 scrollToMatch 控制滚动策略
  - 实现：MarkdownSurface 内统一实现查找与高亮（view 与编辑共用一套），移除重复实现与状态分叉
- [x] 2.4 行号实现纠偏：MarkdownSurface 使用 gutter 行号（lineNumbers）；支持开关与持久化；不影响选区与复制
  - 诉求：渲染视图可选显示行号；与源文本行号对齐；折行不重复（spec.md:83）
  - 入口：design.md:200（行号约束），main.js:21（偏好存储），main.js:1323（偏好读写 IPC）
  - 技术：lineNumbers gutter；通过扩展开关控制；CSS 固定 gutter 列宽
  - 实现：MarkdownSurface 增加“显示行号”开关；状态持久化到 preferences；不再推进 DOM data-line 映射
## 3. 实施（P1：语义编辑）
- [x] 3.1 双击语义选区：实现语义扩展算法（链接/强调/列表项文本优先级）
  - 诉求：双击选中语义单元（链接文本、强调文本优先），而不是简单选词（spec.md:18）
  - 依据：design.md:34（语义单元表），design.md:55（降级策略）
  - 实现：基于增量语法树定位 from-to 并生成 selection；无法安全定位时必须降级到行/块/全文编辑
- [x] 3.2 就地编辑：编辑在同一视图完成；必要时显语法（光标行/风险区）
  - 诉求：默认好读；编辑时只暴露最小必要语法，避免结构被破坏（spec.md:29）
  - 依据：design.md:75（触发条件/显示范围/退出条件）
  - 实现：用 decorations 控制语法显隐；编辑结束恢复渲染观感；语义定位失败时走降级提示
- [x] 3.3 渲染投影：用 decorations 渲染标题/列表/checkbox 的“Typora 观感”
  - 诉求：Typora 风格观感，但源文本仍为真相，不做全局重排（design.md:13）
  - 实现：标题/列表 marker/checkbox 用 replace 或 widget 呈现；必要时显语法时回退为可见源码片段

## 4. 实施（P2：tasks 同源）
- [x] 4.1 TaskBoard 改造为结构视图：数据来自 MarkdownSurface 的解析结果
  - 诉求：tasks 看板只是结构视图；源文本唯一（design.md:19）
  - 入口：ContentPanel.vue:50（现有看板渲染），project.ts:689（parseTaskList）
  - 实现：看板只消费 MarkdownSurface 的结构化结果（章节、任务行、描述块、源范围），不再自行维护 content
- [x] 4.2 看板操作映射为最小 patch（勾选/改标题/改描述），并接入统一撤销栈
  - 诉求：勾选/改标题/改描述都必须是可撤销的“文本事务”，写回最小范围（design.md:166）
  - 入口：ContentPanel.vue:844（toggleTask），ContentPanel.vue:887（saveTaskEdit）
  - 实现：由 MarkdownSurface 提供 applyPatch 接口（基于范围）；看板事件只发起 patch，不直接正则替换全文
- [x] 4.3 任务进度徽章与自动刷新保持一致，不引入闪烁/抖动
  - 诉求：进度统计与展示必须基于同一份源文本；刷新不闪（design.md:189）
  - 入口：project.ts:659（parseTaskProgress），ContentPanel.vue:806（taskProgress）
  - 实现：统一从 MarkdownSurface 文本状态派生进度；更新节流，避免“内容抖动”

## 4.4 快捷键
- [x] 4.4.1 撤销/重做快捷键：Ctrl+Z 撤销；Ctrl+Y / Ctrl+Shift+Z 重做（终端除外）
  - 诉求：符合市面习惯（spec.md:58）
  - 实现：MarkdownSurface 使用 history + keymap；必要时提高优先级以覆盖默认绑定；终端保持独立逻辑

## 5. 验证
- [x] 5.1 冒烟：Markdown 默认渲染；双击编辑；必要时显语法；保存不破坏 BOM/EOL
  - 覆盖点：语义双击、降级编辑、保存风格保持、行号开关不影响选区/复制
- [x] 5.2 冒烟：tasks.md 默认看板；双击/看板改动都能保存且一致；撤销/重做可用
  - 覆盖点：勾选/改标题/改描述的最小 patch、撤销栈一致性、进度徽章刷新无闪烁
- [x] 5.3 运行 openspec-cn validate add-inline-semantic-editing --strict
  - 注意：当前环境可能无法执行 openspec-cn.ps1；必要时用 node 直接执行 openspec.js 进行验证
- [x] 5.4 更新 README.md：同步最新功能描述与使用路径（安装、运行、快捷键、行号开关、编辑方式）
  - 诉求：避免新功能落地但文档入口过期；README 必须可作为“新手第一天”使用指引

## 6. 补充修复（表格/行号/稳定性）
- [x] 6.1 修复 Markdown 打开即崩溃：decorations 构建不满足 sorted 约束（RangeSetBuilder）
  - 现象：打开 .md 报 “Ranges must be added sorted by from position and startSide”
  - 实现：改为基于 ranges 构建并交给 CodeMirror 排序，避免手写排序与 startSide 偏差
- [x] 6.2 表格渲染：不再“点击表格回到源码”，保持表格观感且源文本可编辑
  - 实现：表格行用 line + mark decorations 做 grid 投影；pipe 与边缘空白隐藏；分隔线用 divider 投影（非 block），避免点击回源码
  - 交互：点击/双击单元格可直接编辑 cell；空 cell 也保留可点击的占位区域
- [x] 6.4 表格细节对齐（Typora 风格）：列宽自适应、header/body 连贯、code span 内 `|` 不切列
  - 诉求：列宽跟内容一起“看起来合理”，不再固定 180px；表头与内容行不出现断层；`a|b` 这类行内代码不应被当作分隔符
  - 实现：每张表计算 templateColumns，并写到行级 style（统一 header/body/divider 的 grid-template-columns）；divider 变成单线分隔；表格行扫描 split 基于 code span 规则跳过 `|`
- [x] 6.3 行号 gutter 观感：贴左、不透明、横向滚动不覆盖内容
  - 实现：gutter 背景与内容区拉开层级；行号右对齐；保持 sticky 左侧定位
