/**
 * Task Schema - Structured Output Contract
 * AI produces JSON matching this schema.
 * The template (templates/task.ts) renders the final markdown.
 */

export interface TaskSchema {
  /** Story identifier */
  storyId: string;

  /** Task items */
  tasks: Array<{
    /** Task number (auto-generated) */
    no: number;

    /** Task description */
    desc: string;

    /** Acceptance criteria */
    acceptance: string;

    /** Estimated effort: small / medium / large */
    effort: "small" | "medium" | "large";

    /** Dependencies (task numbers this task depends on) */
    dependsOn?: number[];
  }>;

  /** Execution order notes */
  executionNotes?: string;
}

export const TaskFieldDescriptions: Record<string, string> = {
  storyId: "Story编号",
  "tasks[].no": "任务序号（从1开始）",
  "tasks[].desc": "任务描述",
  "tasks[].acceptance": "验收口径",
  "tasks[].effort": "工作量估算：small/medium/large",
  "tasks[].dependsOn": "依赖的任务序号",
  executionNotes: "执行顺序说明",
};
