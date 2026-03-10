import type { CapabilityPackManifest } from '../../../packages/contracts/src/orchestrator';

export const BUILTIN_CAPABILITY_PACKS: CapabilityPackManifest[] = [
  {
    id: 'general-office',
    name: '通用办公',
    description: '覆盖会议纪要、周报、邮件草稿、待办整理等日常办公协作。',
    defaultTools: ['文件系统', '浏览器', '知识库检索', '邮件/日历连接器'],
    exampleRequests: ['整理今天的会议纪要', '帮我写一封跟进邮件', '把这周待办归档成周报'],
    defaultPrompt: '优先给出可直接发送或落盘的办公产物，保持表达清晰、节奏自然。',
    outputTemplate: '摘要 + 待办/结论 + 可直接使用的正文',
    acceptanceTemplate: '内容完整、措辞得体、可直接发送或复用',
    riskHints: ['外发前确认收件对象', '批量分发前确认范围']
  },
  {
    id: 'software-dev',
    name: '开发',
    description: '覆盖代码阅读、需求实现、测试验证、变更说明等开发任务。',
    defaultTools: ['终端', '代码搜索', '测试命令', '浏览器调试'],
    exampleRequests: ['帮我熟悉这个仓库', '实现一个新功能', '跑测试并总结失败原因'],
    defaultPrompt: '遵循现有代码风格，优先给出证据、改动摘要和测试结果。',
    outputTemplate: '目标 + 影响范围 + 实施/验证结果',
    acceptanceTemplate: '功能可用、测试通过、风险说明充分',
    riskHints: ['生产发布前确认', '破坏性命令必须审批']
  },
  {
    id: 'finance-analysis',
    name: '金融分析',
    description: '覆盖数据清洗、报表分析、研究摘要与图表输出。',
    defaultTools: ['Python 数据分析', '表格读取', '数据库查询', '图表生成'],
    exampleRequests: ['分析这份持仓报表', '做一份同比环比结论', '生成图表并给投资摘要'],
    defaultPrompt: '结论先行，明确口径、时间范围、假设条件与异常值。',
    outputTemplate: '核心结论 + 指标拆解 + 图表/风险提示',
    acceptanceTemplate: '口径清晰、结论可复核、图表和摘要一致',
    riskHints: ['对外披露前确认数据口径', '生产库写操作必须审批']
  },
  {
    id: 'product-requirement',
    name: '产品需求',
    description: '覆盖诉求澄清、需求文档、验收标准、流程梳理。',
    defaultTools: ['模板库', '文档输出', '流程图', '审批节点'],
    exampleRequests: ['把这段诉求整理成 PRD', '拆成验收标准', '画出流程和边界'],
    defaultPrompt: '先澄清再固化，输出要覆盖目标、边界、流程和验收口径。',
    outputTemplate: '背景 + 目标 + 范围 + 规则 + 验收',
    acceptanceTemplate: '需求边界明确、无关键歧义、验收可执行',
    riskHints: ['涉及跨团队承诺前先确认范围']
  },
  {
    id: 'research-consulting',
    name: '研究咨询',
    description: '覆盖调研、竞品分析、资料汇总与建议输出。',
    defaultTools: ['联网检索', '知识库', '表格', '文档模板'],
    exampleRequests: ['调研这个产品方向', '做竞品对比', '整理一份咨询建议'],
    defaultPrompt: '区分事实、推断和建议，引用来源，避免无根据结论。',
    outputTemplate: '结论摘要 + 证据来源 + 对比/建议',
    acceptanceTemplate: '来源可信、分析结构化、建议可执行',
    riskHints: ['引用外部结论时注明来源和时间']
  },
  {
    id: 'desktop-execution',
    name: '桌面执行',
    description: '覆盖本机软件打开、窗口切换、表单填写、下载整理等桌面动作。',
    defaultTools: ['本地命令', '浏览器自动化', '桌面自动化', '截图/OCR 回读'],
    exampleRequests: ['打开本机软件', '帮我整理下载目录', '在网页里填一个表单'],
    defaultPrompt: '只对可验证、可回读、可留证据的动作自动执行；高风险动作先确认。',
    outputTemplate: '动作计划 + 执行证据 + 结果/失败点',
    acceptanceTemplate: '动作真实执行、证据充分、失败可定位',
    riskHints: ['外发消息、删除覆盖、生产写操作必须确认', '没有证据不报成功']
  }
];

export function getCapabilityPackById(id: string): CapabilityPackManifest | undefined {
  return BUILTIN_CAPABILITY_PACKS.find((item) => item.id === id);
}
