# AI UI 设计参考（Exa 调研摘要）

> 目标：给“任务列表 + 详情抽屉 + 终端联动”提供可落地的交互与视觉原则，避免凭感觉堆样式。

## 关键原则（落到 SpecWave 任务区）

- 渐进披露：列表只展示“状态 + 标题 + 快捷动作”，详情再展开全部内容与编辑能力，降低认知负担。
- 操作确认：涉及“会对外部系统产生影响”的动作（比如在终端里执行命令），先给清晰反馈与可撤销机会，默认不自动执行。
- IDE 布局一致：任务区属于“中区内容”，详情用抽屉/侧边面板更贴合编辑器范式，避免频繁的全屏弹窗打断。
- 可访问性：抽屉/弹层需要 focus 管理；快捷操作需要明确的 hover/focus 状态，键盘可达。

## 参考来源（链接）

- React Bits（卡片交互参考）：https://reactbits.dev/components/card-nav
- React Bits（Tilted Card，任务卡片动效参考）：https://shadcnregistry.com/react-bits/tiltedcard-js-tw
- shadcn/ui Drawer（抽屉/底部面板）文档：https://ui.shadcn.com/docs/components/drawer
- shadcn/ui Dialog（弹层）文档：https://ui.shadcn.com/docs/components/dialog
- VS Code UX 指南（容器/面板/侧栏范式）：https://vscode.js.cn/api/ux-guidelines/overview
- AI UX Design Patterns：Progressive Disclosure（渐进披露）：https://www.aiuxdesign.guide/patterns/progressive-disclosure
- Google Assistant Conversation Design：Confirmations（确认与反馈）：https://developers.google.com/assistant/conversation-design/confirmations
- Conversational AI Assistant UX/UI Best Practices（对话式 AI 助手实践）：https://www.willowtreeapps.com/insights/willowtrees-7-ux-ui-rules-for-designing-a-conversational-ai-assistant
