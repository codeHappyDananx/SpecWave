# Work（任务清单）

## 任务列表
- [x] STORY-DRAFT::T-001：落定导出链路与后端落点
  - 关联：REQ=STORY-DRAFT::REQ-001 / AC=STORY-DRAFT::AC-001
  - 实现路径概述：
    - 后端新增导出接口：`/uf30/broker-pbs/exportAuditbusindataJour`（二进制下载 `.xlsx`）。
    - 数据来源：后端内部调用 `pbs.getAuditbusindataJour`（日期范围条件一致）。
    - 导出条件：只按日期范围生效；忽略页面“其他条件”的本地筛选。
  - 验证方式：确认接口返回 `Content-Disposition`，浏览器下载栏出现 Excel。
  - 失败回滚：回滚导出接口与前端按钮，不影响查询接口。

- [x] STORY-DRAFT::T-002：前端增加导出按钮（异步下载）
  - 关联：REQ=STORY-DRAFT::REQ-005 / AC=STORY-DRAFT::AC-005
  - 实现路径概述：在 `formInfoJour/jourTabPane.vue` 查询按钮同区域新增“导出”；点击后触发下载并提示“已开始导出”。
  - 验证方式：点击导出后页面不阻塞，可继续点查询/切换页签；导出完成后出现下载文件。
- [x] STORY-DRAFT::T-003：前端组装导出入参（日期一致 + 列头映射）
  - 关联：REQ=STORY-DRAFT::REQ-001 / AC=STORY-DRAFT::AC-001
  - 实现路径概述：
    - `queryParam`：仅包含 `resource_id/begin_date/end_date`（与查询相同来源与默认值）。
    - `exportField`：从页面 `columns` 生成 `key:title` 列表（英文 key 映射中文列头），并保持导出列顺序与页面一致。
      - 关键口径：导出字段 `key` 一律使用“原始字段 key”（避免 `_xxx_formatted/_xxx_text` 这类前端预处理字段导致后端取不到值）。
      - 表头兜底：当列的 `title` 为空或等于 key 时，使用 `generateFieldLabel(key)` 生成中文列头。
    - 明确不上传/不处理“其他条件”本地筛选。
  - 验证方式：
    - 设置日期范围，查询后导出；核对导出数据覆盖该日期范围。
    - 在页面加“其他条件”本地筛选让页面条数变少，导出结果不受影响。

- [x] STORY-DRAFT::T-004：后端实现操作流水导出服务（仅按日期范围取数）
  - 关联：REQ=STORY-DRAFT::REQ-004 / AC=STORY-DRAFT::AC-004
  - 实现路径概述：
    - 接收 `queryParam` 并解析 `resource_id/begin_date/end_date`；调用 `pbs.getAuditbusindataJour` 查询全量数据。
    - 将查询结果按导出列顺序落到 Excel；设置 `Content-Disposition` 触发下载。
    - 关键口径：导出取值不直接从 DTO 顶层字段拿“业务字段”，而是解析 `param_data` 并按“数组=行”规则扁平化后再取值（与页面渲染口径一致），避免出现“列有表头但全为空”的问题。
  - 验证方式：日期范围命中多页数据时，导出文件仍包含全量。

- [x] STORY-DRAFT::T-005：后端按“页面展示值”口径导出
  - 关联：REQ=STORY-DRAFT::REQ-006 / AC=STORY-DRAFT::AC-006
  - 实现路径概述：
    - 字典字段：按页面显示的中文值导出（需要明确字典来源与翻译方式）。
    - 日期/时间/百分比：按页面显示格式导出。
    - 对齐策略：优先由前端透传列的 `type/formatType/options/dictList` 等必要信息，后端按该信息格式化。
    - 取值口径：业务字段优先从 `param_data` 的 `newVal` 取；当 `_action=delete` 且只有 `oldVal` 时取 `oldVal`（与页面“操作流水”展示一致）。
  - 验证方式：抽查 1 个字典字段、1 个日期/时间字段、1 个百分比字段，Excel 单元格与页面一致。

- [ ] STORY-DRAFT::T-006：权限与提示文案对齐
  - 关联：REQ=STORY-DRAFT::REQ-003 / AC=STORY-DRAFT::AC-003
  - 实现路径概述：无权限时不展示/禁用导出按钮；提示文案明确，不出现“接口错误/无菜单授权”类误导信息。
  - 验证方式：切换无权限账号验证按钮与提示。

- [ ] STORY-DRAFT::T-007：梳理并统一“操作流水”两种渲染口径（小数据 vs 大数据）
  - 关联：REQ=STORY-DRAFT::REQ-008 / AC=STORY-DRAFT::AC-008
  - 实现路径概述：
    - 小数据模式（param-view）与大数据模式（虚拟滚动/或 datagrid 虚拟化）复用同一套：行模型（param_data 展开）、取值优先级（newVal/delete-oldVal/_params）、格式化（dict/date/time/percent）。
    - 明确并消除两条链路的字段错位风险（列 key 与取值口径一致）。
  - 验证方式：同一条业务样本在两种模式下显示值一致（抽查字段）。
  - 失败回滚：仅回滚大数据模式，保留小数据模式不受影响。

- [ ] STORY-DRAFT::T-008：确定阈值选择依据与切换策略（以“展开后的展示行数”为准）
  - 关联：REQ=STORY-DRAFT::REQ-012 / AC=STORY-DRAFT::AC-012
  - 实现路径概述：
    - 统计“实际展示行数”（param_data 中数组项展开后的行数），并以此决定是否进入大数据模式。
    - 阈值支持配置（默认值 + 临时调试开关），并在页面提示当前模式与命中条数。
  - 验证方式：构造“task 行数小、展开行数大”的场景仍能正确切换。

- [ ] STORY-DRAFT::T-009：评估并优化 `param-view → u-ag-datagrid` 的大数据承载能力
  - 关联：REQ=STORY-DRAFT::REQ-010 / AC=STORY-DRAFT::AC-010
  - 实现路径概述：
    - 重点排查 `autoHeight` 等配置是否导致整表撑高、一次性渲染全部行（万级时卡顿）。
    - 若组件支持行虚拟化：切换为固定高度 + 内部滚动；必要时对比模式（compareMode）采用“按需展开”减少 DOM。
  - 验证方式：约 1.1 万条数据下可滚动、可继续查询/导出，不出现页面无响应。
