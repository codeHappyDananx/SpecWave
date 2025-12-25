## 上下文
- 大型项目打开时存在卡顿，需要先完成静态排查与风险归类
- 当前阶段仅输出排查与优化清单，不直接改动逻辑

## 初步排查结论（静态）
- 目录遍历为同步递归，且未限制深度/数量，打开大项目时会触发大量 I/O：main.js:448、main.js:471
- 目录读取入口直接返回全量树，易导致主进程阻塞：main.js:521、main.js:529
- 初始化会同时读取 changes/specs/root，并追加任务扫描，存在叠加 I/O：project.ts:139
- 文件监听回调注册在 loadProject 内，存在重复注册风险，且每次变更触发全量重载：project.ts:160、project.ts:163
- 任务进度扫描为全量遍历并逐个读 tasks.md：project.ts:280
- 搜索过滤递归重建树，且对多个分组重复计算：Sidebar.vue:227、Sidebar.vue:252
- 树渲染未虚拟化，节点多时 DOM 压力显著：Sidebar.vue:31、Sidebar.vue:53
- Markdown 渲染与高亮在内容变化时全量计算：ContentPanel.vue:185、ContentPanel.vue:190

## 风险点清单
- 高优先级：全量目录递归与全量重载策略（主线程阻塞）
- 中优先级：任务进度全量扫描与无并发限制的文件读取
- 中优先级：树过滤多次递归与非虚拟化渲染
- 低优先级：Markdown 渲染与高亮对大文件的计算成本

## 优化清单（分层）
### P0
- 合并文件变更触发，避免每次变更全量重载；并确保监听回调只注册一次
  - 预期收益：减少重复 loadProject 调用次数
  - 验证方法：统计同一批变更触发的 loadProject 次数
- 将目录树构建改为按需加载或限制递归深度
  - 预期收益：降低初次加载 I/O 与主进程阻塞
  - 验证方法：对比首次加载耗时与主进程 CPU 占用

### P1
- 任务进度按需读取与并发限速
  - 预期收益：降低 tasks.md 读取峰值
  - 验证方法：记录 tasks.md 读取耗时与峰值并发
- 搜索过滤增加防抖与缓存，避免多次全量递归
  - 预期收益：降低搜索响应时间
  - 验证方法：记录每次搜索响应耗时
- 树渲染引入虚拟滚动或分页
  - 预期收益：减少节点渲染开销
  - 验证方法：记录渲染帧率与 DOM 节点数

### P2
- Markdown 渲染按需高亮（例如进入视图再高亮）
  - 预期收益：降低打开大文件时的计算量
  - 验证方法：对比打开大 Markdown 的渲染耗时

## 日志方案
- 开关：环境变量 OPENSPEC_PERF_LOG=1
- 输出：用户数据目录下 perf-logs/perf.jsonl
- 记录字段：ts、event、source、durationMs（可选）
- 记录事件：
  - read-directory（主进程目录读取）
  - project.load（项目加载）
  - tasks.load（任务进度扫描）
  - sidebar.filter（搜索过滤）
  - markdown.render（Markdown 渲染）
  - code.highlight（代码高亮）

## 基线测量方案（未执行）
- 口径：大型项目为文件数 >= 10000 或目录深度 >= 8
- 关键指标：
  - 首次加载完成时间（选择目录到树稳定渲染）
  - 搜索过滤响应时间（输入到渲染完成）
  - 任务进度扫描耗时（读取 tasks.md 的总耗时）
  - 文件变更触发频率（单位时间内 loadProject 次数）
- 建议测量方法：
  - 在渲染进程以 performance.mark/performance.measure 记录阶段耗时
  - 在主进程记录 readDirectoryTree 与 loadAllTaskProgress 的执行耗时
  - 使用开发者工具 Performance 录制一次完整加载链路
  - 输出基线报告：平均值、P95、最大值

## 基线测量结果（无界面）
- 测量路径：E:\\code\\UF30GIT\\gitSecuUdsCrt
- 过滤规则：跳过 dotfiles 与 node_modules（对齐 main.js 逻辑）
- 目录扫描：
  - 文件数：13356
  - 目录数：1825
  - 最大深度：18
  - 全量树扫描耗时：0.228s
- tasks.md：
  - 文件数：4
  - 扫描耗时：0.389s
  - 读取耗时：0.010s
  - 读取字节：29642
- 未覆盖：树渲染、搜索过滤渲染耗时、Markdown 渲染与高亮耗时

## 待验证
- 当前卡顿最显著的入口（首次加载、搜索过滤、变更监听）需要实际基线测试确认
