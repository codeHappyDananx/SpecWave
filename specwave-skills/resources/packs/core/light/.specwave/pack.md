# SpecWave Core Pack v0.4.0 — Tool-Driven Document Injection

> **架构升级**：从 Prompt-Driven 写作模式升级为 Tool-Driven 结构化注入模式。
> AI 不再自由写作文档，而是通过调用 `writeDoc` 工具注入结构化 JSON 数据，由代码模板渲染最终 Markdown。

## 核心设计

```
用户诉求
   ↓
AI 分析 → 产出结构化 JSON 数据
   ↓
调用 writeDoc(type, storyId, content) 工具
   ↓
Schema 校验 + 模板渲染（代码执行）
   ↓
Markdown 文件落盘
```

**关键优势**：
- 模板是代码常量，不存在上下文压缩导致格式跑偏
- Schema 强类型校验，字段缺失立即报错
- AI 只负责内容分析，格式由代码 100% 保证

## 文件结构

```
.specwave/
├── schemas/          # Zod Schema 定义（数据结构契约）
│   ├── requirement.ts
│   ├── design.ts
│   ├── task.ts
│   └── index.ts
├── templates/        # 代码模板渲染（格式保证）
│   ├── requirement.ts
│   ├── design.ts
│   ├── task.ts
│   └── index.ts
├── tools/            # AI 可调用工具
│   └── writeDoc.ts   # 唯一文档写入入口
├── roles/            # 角色定义
│   ├── 需求分析师.md
│   └── 开发执行者.md
├── prompts/          # 交互提示词
│   ├── 新建需求.md
│   ├── 开始执行.md
│   └── 归档需求.md
├── settings.json     # 配置
└── pack.md           # 本文档
```

## 使用方式

### 1. AI 调用 writeDoc 工具

```typescript
// AI 不直接写 markdown，而是调用工具
const result = await writeDoc({
  type: "requirement",
  storyId: "STORY-001",
  content: {
    storyId: "STORY-001",
    title: "UI Modernization",
    userIntent: "Upgrade frontend to 2025 style",
    analysis: {
      coreProblem: "Current design looks dated",
      scope: "All CSS and component files",
      constraints: ["No runtime deps"]
    },
    acceptance: [
      { action: "Build project", expected: "No errors" }
    ]
  }
});
```

### 2. 工具内部流程

```
writeDoc(input)
  → validateContent()     # Schema 校验
  → renderContent()       # 模板渲染
  → fs.writeFile()        # 文件落盘
  → return result         # 返回确认
```

### 3. 失败处理

- **校验失败**：返回具体错误（如 "Missing field: analysis.coreProblem"），AI 修正后重试
- **写入失败**：返回错误信息，AI 上报用户
- **格式问题**：不存在——模板是代码，格式永远正确

## 版本历史

- v0.4.0 (2026-04) Tool-Driven 重构：Schema + Template + writeDoc 工具
- v0.3.x (2026-01) 自然表达优化 + 闭环验证
- v0.2.x 会话锁定 + 阶段流转
