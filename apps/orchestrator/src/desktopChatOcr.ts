import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OCR_ROOT = path.resolve(__dirname, '..', '..', '..', '.specwave', 'orchestrator-ocr');
const DEFAULT_OCR_LANG_DIR = path.join(OCR_ROOT, 'lang');
const OCR_CACHE_DIR = path.join(OCR_ROOT, 'cache');
const OCR_LANG_CANDIDATE_DIRS = [path.resolve(__dirname, '..', '.ocr'), DEFAULT_OCR_LANG_DIR];
const gzipAsync = promisify(gzip);

const OCR_LANG_SOURCES = {
  chi_sim: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/chi_sim.traineddata',
  eng: 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata'
} as const;

const NOISE_TOKENS = new Set([
  'a',
  'ah',
  'alt',
  'am',
  'aun',
  'ba',
  'be',
  'bea',
  'ex',
  'fee',
  'ge',
  'gpt',
  'hae',
  'i',
  'ir',
  'je',
  'mem',
  'mine',
  'ny',
  'oe',
  're',
  'se',
  'ses',
  'ss',
  'w',
  'ww',
  'ye'
]);

export type DesktopChatCandidateRecognitionInput = {
  screenshotPath: string;
  targetMode: 'named' | 'ambiguous' | 'recent_index';
  targetIndex?: number;
};

export type DesktopChatCandidateRecognitionOutput = {
  rawText: string;
  candidates: string[];
  suggestedTarget?: string;
  diagnostics: string[];
};

export type DesktopChatSendRecognitionInput = {
  titleScreenshotPath?: string;
  chatBeforeScreenshotPath?: string;
  chatAfterScreenshotPath?: string;
  target: string;
  content: string;
};

export type DesktopChatSendRecognitionOutput = {
  titleText: string;
  chatBeforeText: string;
  chatAfterText: string;
  targetMatched: boolean;
  contentMatched: boolean;
  diagnostics: string[];
};

type TesseractModule = {
  createWorker: (...args: any[]) => Promise<any>;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveOcrLangDir(): Promise<string> {
  for (const dir of OCR_LANG_CANDIDATE_DIRS) {
    const chiSimExists = await fileExists(path.join(dir, 'chi_sim.traineddata.gz'));
    const engExists = await fileExists(path.join(dir, 'eng.traineddata.gz'));
    if (chiSimExists && engExists) return dir;
  }
  await fs.mkdir(DEFAULT_OCR_LANG_DIR, { recursive: true });
  return DEFAULT_OCR_LANG_DIR;
}

async function ensureOcrLanguageFile(langDir: string, lang: keyof typeof OCR_LANG_SOURCES): Promise<void> {
  const outputPath = path.join(langDir, `${lang}.traineddata.gz`);
  if (await fileExists(outputPath)) return;
  await fs.mkdir(langDir, { recursive: true });
  const response = await fetch(OCR_LANG_SOURCES[lang]);
  if (!response.ok) {
    throw new Error(`下载 OCR 语言包失败：${lang} ${response.status}`);
  }
  const raw = Buffer.from(await response.arrayBuffer());
  const compressed = await gzipAsync(raw);
  await fs.writeFile(outputPath, compressed);
}

async function getTesseractModule(): Promise<TesseractModule> {
  const module = (await import('tesseract.js')) as { default?: TesseractModule } & Partial<TesseractModule>;
  const api = module.default ?? module;
  if (typeof api.createWorker !== 'function') {
    throw new Error('未找到可用的 Tesseract.createWorker。');
  }
  return api as TesseractModule;
}

function hasHan(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

function normalizeCandidateToken(token: string): string {
  return token
    .replace(/[©®*@|_=“”‘’'`{}\[\]()<>]+/gu, ' ')
    .replace(/[，。,.:：;；!?！？]+/gu, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/^\d+$/g, '')
    .replace(/^\d+(?=\p{Script=Han}|[A-Za-z])/u, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/^[^\p{Script=Han}A-Za-z0-9]+/gu, '')
    .replace(/[^\p{Script=Han}A-Za-z0-9]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoiseToken(token: string): boolean {
  const compact = token.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return compact.length > 0 && compact.length <= 3 && NOISE_TOKENS.has(compact);
}

function looksLikeCandidate(text: string): boolean {
  if (!text || text.length < 2 || text.length > 24) return false;
  if (/^(昨天|今天|上午|下午|晚上|刚刚|图片和视频)$/u.test(text)) return false;
  if (/^\d+$/.test(text)) return false;
  const hanCount = [...text].filter((char) => hasHan(char)).length;
  const latinCount = [...text].filter((char) => /[A-Za-z]/.test(char)).length;
  if (hanCount === 0 && latinCount < 4) return false;
  if (hanCount === 0) {
    const words = text.split(' ').filter(Boolean);
    const shortWordCount = words.filter((word) => word.replace(/[^A-Za-z0-9]/g, '').length <= 3).length;
    if (shortWordCount >= 2) return false;
    if (words.length > 1 && words[0] && words[0].replace(/[^A-Za-z0-9]/g, '').length <= 1) return false;
  }
  return true;
}

function scoreCandidate(text: string): number {
  const hanCount = [...text].filter((char) => hasHan(char)).length;
  const latinCount = [...text].filter((char) => /[A-Za-z]/.test(char)).length;
  let score = 0;
  if (hanCount > 0) score += 6;
  if (latinCount >= 4) score += 3;
  if (text.length >= 2 && text.length <= 14) score += 2;
  if (/群|老师|交流|游戏/u.test(text)) score += 3;
  if (/Link/i.test(text)) score += 2;
  if (text.includes(' ')) score += 1;
  if (text.split(' ').filter(Boolean).length >= 3) score += 2;
  if (/^[A-Za-z]{1,3}\s+/u.test(text) && hasHan(text)) score -= 2;
  return score;
}

function normalizeCandidateTokens(tokens: string[]): string {
  const current = tokens.map(normalizeCandidateToken).filter((token) => token.length > 0);
  if (current.length === 0) return '';
  while (current.length > 1 && isNoiseToken(current[0]!)) current.shift();
  while (current.length > 1 && isNoiseToken(current[current.length - 1]!)) current.pop();
  return current.join(' ').replace(/\s+/g, ' ').trim();
}

function extractBestCandidateFromLine(line: string): string | undefined {
  const normalized = line
    .replace(/[©®*@|_=“”‘’'`{}\[\]()<>]+/gu, ' ')
    .replace(/[，。,.:：;；!?！？]+/gu, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .trim();
  if (!normalized) return undefined;
  const tokens = normalized.split(/\s+/).map(normalizeCandidateToken).filter(Boolean);
  if (tokens.length === 0) return undefined;

  let bestCandidate: string | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let start = 0; start < tokens.length; start += 1) {
    for (let end = start; end < Math.min(tokens.length, start + 4); end += 1) {
      const candidate = normalizeCandidateTokens(tokens.slice(start, end + 1));
      if (!looksLikeCandidate(candidate)) continue;
      const score = scoreCandidate(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }
  }
  return bestCandidate;
}

function candidateKey(text: string): string {
  return text.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '').toLowerCase();
}

function normalizeOcrMatchText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。,.:：;；!?！？"'`“”‘’\-—_()（）\[\]{}<>《》、]/gu, '')
    .toLowerCase();
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf(needle, start);
    if (index === -1) break;
    count += 1;
    start = index + needle.length;
  }
  return count;
}

function buildContentNeedles(content: string): string[] {
  const normalized = normalizeOcrMatchText(content);
  const needles = new Set<string>();
  if (normalized.length >= 2) needles.add(normalized);
  if (normalized.length >= 4) needles.add(normalized.slice(0, Math.min(8, normalized.length)));
  if (normalized.length >= 8) needles.add(normalized.slice(-6));
  return [...needles].filter((item) => item.length >= 2);
}

export function extractChatCandidatesFromOcrText(rawText: string): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const candidate = extractBestCandidateFromLine(line);
    if (!candidate) continue;
    const key = candidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

export async function recognizeDesktopChatCandidates(
  input: DesktopChatCandidateRecognitionInput
): Promise<DesktopChatCandidateRecognitionOutput> {
  await fs.mkdir(OCR_CACHE_DIR, { recursive: true });
  const langDir = await resolveOcrLangDir();
  await Promise.all([ensureOcrLanguageFile(langDir, 'chi_sim'), ensureOcrLanguageFile(langDir, 'eng')]);
  const tesseract = await getTesseractModule();
  const worker = await tesseract.createWorker('chi_sim+eng', 1, {
    langPath: langDir,
    cachePath: OCR_CACHE_DIR,
    logger: () => undefined
  });

  try {
    const { data } = await worker.recognize(input.screenshotPath);
    const rawText = typeof data?.text === 'string' ? data.text : '';
    const candidates = extractChatCandidatesFromOcrText(rawText).slice(0, 6);
    const suggestedTarget =
      input.targetMode === 'recent_index' && input.targetIndex ? candidates[input.targetIndex - 1] : undefined;
    const diagnostics: string[] = [];
    if (candidates.length === 0) {
      diagnostics.push('OCR 已运行，但这次没提取出稳定的联系人候选。');
    } else if (input.targetMode === 'recent_index' && !suggestedTarget) {
      diagnostics.push('已读取当前可见列表，但没能稳定锁定你说的那个序号联系人。');
    }
    return {
      rawText,
      candidates,
      suggestedTarget,
      diagnostics
    };
  } finally {
    await worker.terminate();
  }
}

export async function recognizeDesktopChatSendArtifacts(
  input: DesktopChatSendRecognitionInput
): Promise<DesktopChatSendRecognitionOutput> {
  await fs.mkdir(OCR_CACHE_DIR, { recursive: true });
  const langDir = await resolveOcrLangDir();
  await Promise.all([ensureOcrLanguageFile(langDir, 'chi_sim'), ensureOcrLanguageFile(langDir, 'eng')]);
  const tesseract = await getTesseractModule();
  const worker = await tesseract.createWorker('chi_sim+eng', 1, {
    langPath: langDir,
    cachePath: OCR_CACHE_DIR,
    logger: () => undefined
  });

  try {
    const recognizePath = async (screenshotPath?: string): Promise<string> => {
      if (!screenshotPath) return '';
      const { data } = await worker.recognize(screenshotPath);
      return typeof data?.text === 'string' ? data.text : '';
    };

    const [titleText, chatBeforeText, chatAfterText] = await Promise.all([
      recognizePath(input.titleScreenshotPath),
      recognizePath(input.chatBeforeScreenshotPath),
      recognizePath(input.chatAfterScreenshotPath)
    ]);

    const diagnostics: string[] = [];
    const normalizedTarget = normalizeOcrMatchText(input.target);
    const normalizedTitle = normalizeOcrMatchText(titleText);
    const targetMatched = normalizedTarget.length >= 2 && normalizedTitle.includes(normalizedTarget);
    if (!input.titleScreenshotPath) {
      diagnostics.push('桌面侧没有返回标题截图，无法确认是否真的切到目标会话。');
    } else if (!targetMatched) {
      diagnostics.push('标题区 OCR 没有稳定识别到目标联系人，可能没有真正切到对应会话。');
    }

    const contentNeedles = buildContentNeedles(input.content);
    if (!input.chatAfterScreenshotPath) {
      diagnostics.push('桌面侧没有返回发送后聊天截图，无法确认消息是否进入聊天记录。');
    } else if (contentNeedles.length === 0) {
      diagnostics.push('消息内容过短或无有效文字，暂时无法通过 OCR 做稳定回读。');
    }

    const normalizedBefore = normalizeOcrMatchText(chatBeforeText);
    const normalizedAfter = normalizeOcrMatchText(chatAfterText);
    let contentMatched = false;
    for (const needle of contentNeedles) {
      const beforeCount = countOccurrences(normalizedBefore, needle);
      const afterCount = countOccurrences(normalizedAfter, needle);
      if (afterCount > beforeCount && afterCount > 0) {
        contentMatched = true;
        break;
      }
      if (!input.chatBeforeScreenshotPath && needle.length >= 4 && afterCount > 0) {
        contentMatched = true;
        break;
      }
    }
    if (contentNeedles.length > 0 && !contentMatched) {
      diagnostics.push('聊天区回读里没有看到新增的消息内容，先按未发送成功处理。');
    }

    return {
      titleText,
      chatBeforeText,
      chatAfterText,
      targetMatched,
      contentMatched,
      diagnostics
    };
  } finally {
    await worker.terminate();
  }
}
