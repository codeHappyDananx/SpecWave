/**
 * writeDoc Tool - AI-callable document injection
 *
 * THIS IS THE ONLY WAY documents are written in SpecWave.
 * AI does NOT write markdown directly. AI calls this tool with structured JSON data.
 *
 * Flow:
 *   AI analyzes user intent → produces JSON data → calls writeDoc() → code renders markdown → file written
 *
 * Validation:
 *   - Schema validation ensures field types and required fields are correct
 *   - Missing required fields = hard error (retry with corrected data)
 *   - Template rendering is pure code = format never drifts
 */

import type { RequirementSchema } from "../schemas/requirement";
import type { DesignSchema } from "../schemas/design";
import type { TaskSchema } from "../schemas/task";
import { renderRequirement } from "../templates/requirement";
import { renderDesign } from "../templates/design";
import { renderTask } from "../templates/task";

export type DocType = "requirement" | "design" | "task";

interface WriteDocInput {
  /** Document type determines schema and template */
  type: DocType;

  /** Story identifier for file path */
  storyId: string;

  /** Structured data matching the schema for the given type */
  content: RequirementSchema | DesignSchema | TaskSchema;
}

interface WriteDocResult {
  /** Success or failure */
  success: boolean;

  /** File path written */
  filepath: string;

  /** Human-readable summary */
  message: string;

  /** Number of fields written */
  fieldCount: number;

  /** If failed, error details */
  error?: string;
}

/** File name mapping for each doc type */
const DOC_FILENAMES: Record<DocType, string> = {
  requirement: "01-需求.md",
  design: "02-设计.md",
  task: "03-任务.md",
};

/** Required fields for each doc type */
const REQUIRED_FIELDS: Record<DocType, string[]> = {
  requirement: ["storyId", "title", "userIntent", "analysis", "acceptance"],
  design: ["storyId", "overview", "modules", "dataFlow", "decisions"],
  task: ["storyId", "tasks"],
};

/**
 * Validate that content has all required fields for the given doc type.
 * Returns null if valid, error message if invalid.
 */
function validateContent(type: DocType, content: unknown): string | null {
  if (typeof content !== "object" || content === null) {
    return "Content must be an object";
  }

  const c = content as Record<string, unknown>;
  const required = REQUIRED_FIELDS[type];

  for (const field of required) {
    if (!(field in c) || c[field] === undefined || c[field] === null) {
      return `Missing required field: "${field}" for type "${type}"`;
    }

    // Type-specific validation
    if (field === "acceptance" && Array.isArray(c[field]) && c[field].length === 0) {
      return "Field "acceptance" must not be empty";
    }
    if (field === "tasks" && Array.isArray(c[field]) && c[field].length === 0) {
      return "Field "tasks" must not be empty";
    }
    if (field === "modules" && Array.isArray(c[field]) && c[field].length === 0) {
      return "Field "modules" must not be empty";
    }
  }

  return null;
}

/**
 * Render content to markdown using the appropriate template.
 */
function renderContent(type: DocType, content: unknown): string {
  switch (type) {
    case "requirement":
      return renderRequirement(content as RequirementSchema);
    case "design":
      return renderDesign(content as DesignSchema);
    case "task":
      return renderTask(content as TaskSchema);
    default:
      throw new Error(`Unknown doc type: ${type}`);
  }
}

/**
 * Build file path for the given story and doc type.
 */
function buildFilePath(storyId: string, type: DocType): string {
  const filename = DOC_FILENAMES[type];
  return `.specwave/workspace/stories/${storyId}/${filename}`;
}

/**
 * Write a document. This is the ONLY entry point for document creation.
 *
 * @param input.type - Document type (requirement/design/task)
 * @param input.storyId - Story identifier (e.g., STORY-001)
 * @param input.content - Structured JSON data matching the schema
 *
 * @returns WriteDocResult with success status, filepath, and summary
 *
 * @example
 * ```
 * const result = await writeDoc({
 *   type: "requirement",
 *   storyId: "STORY-001",
 *   content: {
 *     storyId: "STORY-001",
 *     title: "UI Modernization",
 *     userIntent: "Upgrade frontend to 2025 style",
 *     analysis: {
 *       coreProblem: "Current design looks dated",
 *       scope: "All CSS and component files",
 *       constraints: ["No runtime deps", "Keep shadcn/ui compat"]
 *     },
 *     acceptance: [
 *       { action: "Build project", expected: "No build errors" }
 *     ]
 *   }
 * });
 * ```
 */
export async function writeDoc(input: WriteDocInput): Promise<WriteDocResult> {
  try {
    // 1. Validate content structure
    const validationError = validateContent(input.type, input.content);
    if (validationError) {
      return {
        success: false,
        filepath: "",
        message: "Validation failed",
        fieldCount: 0,
        error: validationError,
      };
    }

    // 2. Render markdown from template
    const markdown = renderContent(input.type, input.content);

    // 3. Build file path
    const filepath = buildFilePath(input.storyId, input.type);

    // 4. Ensure directory exists
    const dir = filepath.substring(0, filepath.lastIndexOf("/"));
    await ensureDir(dir);

    // 5. Write file
    await fs.writeFile(filepath, markdown, "utf-8");

    // 6. Count fields for reporting
    const fieldCount = countFields(input.content);

    return {
      success: true,
      filepath,
      message: `✅ 已写入 ${filepath} (${input.type})`,
      fieldCount,
    };
  } catch (err) {
    return {
      success: false,
      filepath: "",
      message: "Write failed",
      fieldCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Helpers ---

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore if exists
  }
}

function countFields(obj: unknown): number {
  if (typeof obj !== "object" || obj === null) return 0;
  let count = 0;
  for (const val of Object.values(obj)) {
    count++;
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      count += countFields(val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "object" && item !== null) {
          count += countFields(item);
        }
      }
    }
  }
  return count;
}

// --- File system abstraction (works in both Node and Electron) ---
const fs = {
  async writeFile(path: string, data: string, encoding?: string): Promise<void> {
    if (typeof window !== "undefined" && (window as any).__SPECWAVE_FS__) {
      return (window as any).__SPECWAVE_FS__.writeFile(path, data, encoding);
    }
    // Node.js
    const { writeFile } = await import("fs/promises");
    return writeFile(path, data, encoding as BufferEncoding);
  },

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (typeof window !== "undefined" && (window as any).__SPECWAVE_FS__) {
      return (window as any).__SPECWAVE_FS__.mkdir(path, options);
    }
    const { mkdir } = await import("fs/promises");
    return mkdir(path, options);
  },
};
