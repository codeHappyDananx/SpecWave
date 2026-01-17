import { clipboard } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export type TerminalPasteImageOptions = {
  cwd?: string | null;
  prefix?: string;
};

export type TerminalPasteImageResult =
  | { ok: true; fileName: string; filePath: string }
  | {
      ok: false;
      error: string;
      code: 'clipboard-no-image' | 'clipboard-image-empty' | 'create-paste-dir-failed' | 'write-failed';
    };

const PASTE_IMAGE_DIR = '.terminal-paste';
const PASTE_IMAGE_PREFIX = 'img-';
const PASTE_IMAGE_EXT = '.png';

function normalizeImagePrefix(prefix?: string) {
  const raw = String(prefix || PASTE_IMAGE_PREFIX);
  const cleaned = raw.replace(/[^a-zA-Z0-9-_]/g, '');
  if (!cleaned) return PASTE_IMAGE_PREFIX;
  return cleaned.endsWith('-') ? cleaned : `${cleaned}-`;
}
function padNumber(value: number, width: number) {
  return String(value).padStart(width, '0');
}

function formatTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1, 2);
  const day = padNumber(date.getDate(), 2);
  const hours = padNumber(date.getHours(), 2);
  const minutes = padNumber(date.getMinutes(), 2);
  const seconds = padNumber(date.getSeconds(), 2);
  const millis = padNumber(date.getMilliseconds(), 3);
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${millis}`;
}

function createUniqueImageName(dirPath: string, prefix: string) {
  const stamp = formatTimestamp(new Date());
  let fileName = `${prefix}${stamp}${PASTE_IMAGE_EXT}`;
  let filePath = path.join(dirPath, fileName);
  let counter = 1;
  while (fs.existsSync(filePath)) {
    fileName = `${prefix}${stamp}-${counter}${PASTE_IMAGE_EXT}`;
    filePath = path.join(dirPath, fileName);
    counter += 1;
  }
  return { fileName, filePath };
}
function isGitRepoRoot(cwd: string) {
  const gitDir = path.join(cwd, '.git');
  try {
    return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
  } catch {
    return false;
  }
}

function ensureGitignoreLine(cwd: string, pattern: string) {
  const gitignorePath = path.join(cwd, '.gitignore');
  let content = '';
  try {
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
    }
  } catch {
    return;
  }
  if (content.includes(pattern)) return;
  const next = content.length === 0 || content.endsWith('\n') ? content : `${content}\n`;
  try {
    fs.writeFileSync(gitignorePath, `${next}${pattern}\n`);
  } catch {
    return;
  }
}

function hideWindowsFile(targetPath: string) {
  if (process.platform !== 'win32') return;
  try {
    spawnSync('attrib', ['+h', targetPath], { windowsHide: true });
  } catch {
    return;
  }
}

function ensurePasteDirectory(cwd: string) {
  const dirPath = path.join(cwd, PASTE_IMAGE_DIR);
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch {
    return null;
  }
  hideWindowsFile(dirPath);
  return dirPath;
}
function resolveCwd(cwd?: string | null) {
  if (!cwd) return process.cwd();
  try {
    if (fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
      return cwd;
    }
  } catch {
    return process.cwd();
  }
  return process.cwd();
}

export function saveClipboardImage(options: TerminalPasteImageOptions): TerminalPasteImageResult {
  const resolvedCwd = resolveCwd(options?.cwd ?? null);
  const image = clipboard.readImage();
  if (!image || image.isEmpty()) {
    return { ok: false, error: 'clipboard-no-image', code: 'clipboard-no-image' };
  }

  const buffer = image.toPNG();
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: 'clipboard-image-empty', code: 'clipboard-image-empty' };
  }

  const safePrefix = normalizeImagePrefix(options?.prefix);
  const pasteDir = ensurePasteDirectory(resolvedCwd);
  if (!pasteDir) {
    return { ok: false, error: 'create-paste-dir-failed', code: 'create-paste-dir-failed' };
  }

  const { fileName, filePath } = createUniqueImageName(pasteDir, safePrefix);
  try {
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, code: 'write-failed' };
  }

  hideWindowsFile(filePath);

  if (isGitRepoRoot(resolvedCwd)) {
    ensureGitignoreLine(resolvedCwd, `${PASTE_IMAGE_DIR}/`);
  }

  return { ok: true, fileName, filePath };
}
