/**
 * Requirement Schema - Structured Output Contract
 * This file defines the exact shape of data that AI must produce.
 * AI does NOT write markdown directly. AI produces JSON matching this schema.
 * The template (templates/requirement.ts) renders the final markdown.
 */

export interface RequirementSchema {
  /** Story identifier, e.g. STORY-001 */
  storyId: string;

  /** One-line title */
  title: string;

  /** User's original request (verbatim or summarized) */
  userIntent: string;

  /** Problem analysis */
  analysis: {
    /** Core problem being solved */
    coreProblem: string;

    /** Scope of impact */
    scope: string;

    /** Constraints and limitations */
    constraints: string[];
  };

  /** Acceptance criteria list */
  acceptance: Array<{
    /** Operation/action */
    action: string;

    /** Expected result */
    expected: string;
  }>;

  /** Reference resources (URLs, docs, etc.) */
  resources?: string[];
}

/** Field descriptions for AI tool calling */
export const RequirementFieldDescriptions: Record<string, string> = {
  storyId: "Story编号，如 STORY-001",
  title: "一句话标题",
  userIntent: "用户原话诉求",
  "analysis.coreProblem": "核心问题是什么",
  "analysis.scope": "影响范围",
  "analysis.constraints": "约束条件列表",
  "acceptance[].action": "操作",
  "acceptance[].expected": "预期结果",
  "resources": "参考资源列表",
};
