/**
 * Design Schema - Structured Output Contract
 * AI produces JSON matching this schema.
 * The template (templates/design.ts) renders the final markdown.
 */

export interface DesignSchema {
  /** Story identifier */
  storyId: string;

  /** Design overview */
  overview: string;

  /** Module/component breakdown */
  modules: Array<{
    /** Module name */
    name: string;

    /** Module responsibility */
    responsibility: string;

    /** Interface definition (function signatures, types) */
    interfaces: string[];

    /** Dependencies on other modules */
    dependencies: string[];
  }>;

  /** Data flow description */
  dataFlow: string;

  /** Key decisions and rationale */
  decisions: Array<{
    /** Decision made */
    decision: string;

    /** Why this choice */
    rationale: string;
  }>;

  /** Open questions or risks */
  openQuestions?: string[];
}

export const DesignFieldDescriptions: Record<string, string> = {
  storyId: "Story编号",
  overview: "设计方案概述",
  "modules[].name": "模块名称",
  "modules[].responsibility": "模块职责",
  "modules[].interfaces": "接口定义列表",
  "modules[].dependencies": "依赖模块列表",
  dataFlow: "数据流描述",
  "decisions[].decision": "决策内容",
  "decisions[].rationale": "决策理由",
  "openQuestions": "遗留问题或风险",
};
