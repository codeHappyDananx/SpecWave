import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  recognizeDesktopChatCandidates,
  recognizeDesktopChatSendArtifacts,
  type DesktopChatCandidateRecognitionOutput,
  type DesktopChatSendRecognitionOutput
} from './desktopChatOcr';

export type DesktopAutomationBackend = 'powershell';
export type DesktopAutomationPreferredBrowser = 'default' | 'msedge' | 'chrome';

export type DesktopAutomationConfig = {
  enabled: boolean;
  backend: DesktopAutomationBackend;
  timeoutMs: number;
  preferredBrowser: DesktopAutomationPreferredBrowser;
  dryRun: boolean;
};

export type ChatTargetMode = 'named' | 'recent_index' | 'ambiguous';

export type DesktopIntent =
  | { kind: 'open_app'; appId: DesktopAppId; displayName: string; originalText: string }
  | { kind: 'open_url'; url: string; originalText: string }
  | { kind: 'compose_mail'; to: string; subject?: string; body?: string; originalText: string }
  | {
      kind: 'send_chat_message';
      appId: ChatAppId;
      displayName: string;
      target: string;
      targetMode: ChatTargetMode;
      targetIndex?: number;
      content: string;
      originalText: string;
    }
  | { kind: 'type_active'; text: string; submit: boolean; originalText: string }
  | { kind: 'self_test'; originalText: string };

export type DesktopScriptPayload =
  | { action: 'open-app'; appId: DesktopAppId; displayName: string; preferredBrowser: DesktopAutomationPreferredBrowser }
  | { action: 'open-url'; url: string; preferredBrowser: DesktopAutomationPreferredBrowser }
  | { action: 'compose-mail'; to: string; subject?: string; body?: string }
  | {
      action: 'send-chat-message';
      appId: ChatAppId;
      displayName: string;
      target: string;
      targetMode: ChatTargetMode;
      targetIndex?: number;
      content: string;
    }
  | { action: 'prepare-chat-target'; appId: ChatAppId; displayName: string; target: string }
  | { action: 'send-current-chat-message'; appId: ChatAppId; displayName: string; content: string }
  | { action: 'capture-chat-candidates'; appId: ChatAppId; displayName: string }
  | { action: 'type-active'; text: string; submit: boolean }
  | { action: 'self-test' };

export type DesktopScriptResult = {
  ok: boolean;
  verified: boolean;
  summary: string;
  evidence?: string[];
  diagnostics?: string[];
  screenshotPath?: string;
  titleScreenshotPath?: string;
  chatBeforeScreenshotPath?: string;
  chatAfterScreenshotPath?: string;
};

export type DesktopChatTargetSuggestionResult = {
  ok: boolean;
  verified: boolean;
  summary: string;
  suggestedTarget?: string;
  candidates: string[];
  evidence: string[];
  diagnostics: string[];
};

export type DesktopAutomationExecutionResult = {
  matched: boolean;
  ok: boolean;
  verified: boolean;
  summary: string;
  evidence: string[];
  diagnostics: string[];
  intent?: DesktopIntent;
};

export type DesktopAutomationSelfTestResult = {
  ok: boolean;
  verified: boolean;
  summary: string;
  evidence: string[];
  diagnostics: string[];
};

export interface DesktopAutomation {
  canHandle(text: string): boolean;
  executeText(text: string): Promise<DesktopAutomationExecutionResult>;
  suggestChatTargets(intent: Extract<DesktopIntent, { kind: 'send_chat_message' }>): Promise<DesktopChatTargetSuggestionResult>;
  selfTest(): Promise<DesktopAutomationSelfTestResult>;
}

export type DesktopAutomationRunner = (payload: DesktopScriptPayload, timeoutMs: number) => Promise<DesktopScriptResult>;
export type DesktopChatCandidateRecognizer = (
  input: { screenshotPath: string; targetMode: ChatTargetMode; targetIndex?: number }
) => Promise<DesktopChatCandidateRecognitionOutput>;

export type DesktopChatSendVerifier = (input: {
  appId: ChatAppId;
  displayName: string;
  target: string;
  content: string;
  scriptResult: DesktopScriptResult;
}) => Promise<{
  ok: boolean;
  verified: boolean;
  summary: string;
  evidence: string[];
  diagnostics: string[];
}>;

type DesktopAppId =
  | 'wechat'
  | 'feishu'
  | 'dingtalk'
  | 'qq'
  | 'wecom'
  | 'outlook'
  | 'chrome'
  | 'msedge'
  | 'browser'
  | 'notepad'
  | 'explorer';

type ChatAppId = 'wechat' | 'feishu' | 'dingtalk' | 'qq' | 'wecom';

type AppDescriptor = {
  appId: DesktopAppId;
  displayName: string;
  keywords: string[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRIPT_PATH = path.resolve(__dirname, 'desktopAutomation.ps1');
const URL_PATTERN = /https?:\/\/[^\s<>\"]+/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const APP_DESCRIPTORS: AppDescriptor[] = [
  { appId: 'wechat', displayName: '微信', keywords: ['微信', 'wechat'] },
  { appId: 'wecom', displayName: '企业微信', keywords: ['企业微信', '企微', 'wecom', 'wxwork'] },
  { appId: 'feishu', displayName: '飞书', keywords: ['飞书', 'feishu', 'lark'] },
  { appId: 'dingtalk', displayName: '钉钉', keywords: ['钉钉', 'dingtalk'] },
  { appId: 'qq', displayName: 'QQ', keywords: ['qq', '腾讯qq'] },
  { appId: 'outlook', displayName: 'Outlook', keywords: ['outlook', '邮箱客户端', '邮件客户端'] },
  { appId: 'chrome', displayName: 'Chrome', keywords: ['chrome', '谷歌浏览器'] },
  { appId: 'msedge', displayName: 'Edge', keywords: ['edge', '微软浏览器'] },
  { appId: 'browser', displayName: '浏览器', keywords: ['浏览器', '网页'] },
  { appId: 'notepad', displayName: '记事本', keywords: ['记事本', 'notepad'] },
  { appId: 'explorer', displayName: '文件管理器', keywords: ['资源管理器', '文件管理器', 'explorer'] }
];

const CHAT_APP_IDS = new Set<ChatAppId>(['wechat', 'feishu', 'dingtalk', 'qq', 'wecom']);

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function findAppDescriptor(text: string): AppDescriptor | undefined {
  const lowered = text.toLowerCase();
  return APP_DESCRIPTORS.find((descriptor) => descriptor.keywords.some((keyword) => lowered.includes(keyword.toLowerCase())));
}

function cleanPunctuation(text: string): string {
  return text.replace(/^[\s，。,.:：;；“”\"'`]+|[\s，。,.:：;；“”\"'`]+$/g, '').trim();
}

function cleanupMessageBody(text: string): string {
  return cleanPunctuation(
    text
      .replace(/^(?:发|发送|回|回复|说|告诉)\s*/i, '')
      .replace(/^(?:一条|一句|一段|条|句|段)\s*/, '')
      .replace(/^(?:一个\s*)?(?:消息|信息|话|文字|内容|微信消息|飞书消息|钉钉消息|私信|邮件|邮件内容)\s*/i, '')
  );
}

function parseOrdinalValue(text: string): number | undefined {
  const normalized = cleanPunctuation(text).replace(/第/g, '');
  if (!normalized) return undefined;
  if (/^\d+$/.test(normalized)) {
    const value = Number.parseInt(normalized, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  const digits = new Map<string, number>([
    ['零', 0],
    ['一', 1],
    ['二', 2],
    ['两', 2],
    ['三', 3],
    ['四', 4],
    ['五', 5],
    ['六', 6],
    ['七', 7],
    ['八', 8],
    ['九', 9],
    ['十', 10]
  ]);

  const directValue = digits.get(normalized);
  if (directValue !== undefined) {
    return directValue > 0 ? directValue : undefined;
  }

  const tenPrefix = normalized.match(/^十([一二两三四五六七八九])$/);
  if (tenPrefix?.[1]) {
    return 10 + (digits.get(tenPrefix[1]) ?? 0);
  }

  const tens = normalized.match(/^([二三四五六七八九])十([一二两三四五六七八九])?$/);
  if (!tens?.[1]) return undefined;
  const tensValue = (digits.get(tens[1]) ?? 0) * 10;
  const onesValue = tens[2] ? (digits.get(tens[2]) ?? 0) : 0;
  return tensValue + onesValue;
}

function parseRelativeChatTarget(target: string): { targetMode: 'recent_index'; targetIndex: number; target: string } | undefined {
  const cleaned = cleanPunctuation(target);
  const match = cleaned.match(/^第\s*([\d一二两三四五六七八九十]+)\s*(?:个)?\s*(?:联系人|会话|聊天|对话|好友|朋友)$/);
  const rawIndex = match?.[1];
  if (!rawIndex) return undefined;
  const targetIndex = parseOrdinalValue(rawIndex);
  if (!targetIndex) return undefined;
  return {
    targetMode: 'recent_index',
    targetIndex,
    target: cleaned
  };
}

function isAmbiguousChatTarget(target: string): boolean {
  return /^(某人|某个(?:联系人|人|好友|朋友)|那个人|这个人|那个谁|对方|他|她|它|上一个(?:联系人|会话|聊天)?|前一个(?:联系人|会话|聊天)?|刚才那个(?:人|联系人)?|上面那个(?:人|联系人)?|下面那个(?:人|联系人)?|一个联系人|一个人)$/.test(
    target
  );
}

function parseChatTarget(target: string): Pick<Extract<DesktopIntent, { kind: 'send_chat_message' }>, 'target' | 'targetMode' | 'targetIndex'> | undefined {
  const relativeTarget = parseRelativeChatTarget(target);
  if (relativeTarget) return relativeTarget;
  const cleaned = cleanPunctuation(target);
  if (!cleaned) return undefined;
  if (isAmbiguousChatTarget(cleaned)) {
    return {
      target: cleaned,
      targetMode: 'ambiguous'
    };
  }
  return {
    target: cleaned,
    targetMode: 'named'
  };
}

function stripLeadingContext(text: string, descriptor?: AppDescriptor): string {
  let rest = text;
  if (descriptor) {
    for (const keyword of descriptor.keywords) {
      const reg = new RegExp(keyword, 'ig');
      rest = rest.replace(reg, ' ');
    }
  }
  return rest
    .replace(/帮我|请帮我|麻烦|请|一下|立刻|马上|现在|直接|在|用/gi, ' ')
    .replace(/[里中内]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuotedText(text: string): string | undefined {
  const match = text.match(/[“\"]([^”\"]+)[”\"]/);
  return match?.[1] ? cleanPunctuation(match[1]) : undefined;
}

function parseMailFields(text: string, email: string): { subject?: string; body?: string } {
  const afterEmail = normalizeText(text.slice(text.toLowerCase().indexOf(email.toLowerCase()) + email.length));
  const subjectMatch = afterEmail.match(/主题\s*[:：]\s*([\s\S]+?)(?=\s+(?:内容|正文)\s*[:：]|$)/i);
  const bodyMatch = afterEmail.match(/(?:内容|正文)\s*[:：]\s*([\s\S]+)$/i);
  const quoted = parseQuotedText(afterEmail);
  const subject = cleanPunctuation(subjectMatch?.[1] ?? '');
  const body = cleanPunctuation(
    bodyMatch?.[1] ?? quoted ?? afterEmail.replace(/主题\s*[:：]\s*([\s\S]+?)(?=\s+(?:内容|正文)\s*[:：]|$)/i, '').trim()
  );
  return {
    subject: subject || undefined,
    body: body || undefined
  };
}

function parseChatIntent(text: string, descriptor: AppDescriptor): DesktopIntent | undefined {
  if (!CHAT_APP_IDS.has(descriptor.appId as ChatAppId)) return undefined;
  if (!/(发|发送|回复|说|告诉)/.test(text)) return undefined;
  const stripped = stripLeadingContext(text, descriptor);
  const explicitMatch = stripped.match(/[给向]\s*(.+?)\s*(?:发|发送|回复|说|告诉)\s*(.+)$/);
  const target = parseChatTarget(explicitMatch?.[1] ?? '');
  const content = cleanupMessageBody(explicitMatch?.[2] ?? parseQuotedText(text) ?? '');
  if (!target || !content) return undefined;
  return {
    kind: 'send_chat_message',
    appId: descriptor.appId as ChatAppId,
    displayName: descriptor.displayName,
    target: target.target,
    targetMode: target.targetMode,
    targetIndex: target.targetIndex,
    content,
    originalText: text
  };
}

function parseMailIntent(text: string): DesktopIntent | undefined {
  if (!/(邮件|邮箱|email|mail)/i.test(text)) return undefined;
  const email = text.match(EMAIL_PATTERN)?.[0];
  if (!email) return undefined;
  const { subject, body } = parseMailFields(text, email);
  return {
    kind: 'compose_mail',
    to: email,
    subject,
    body,
    originalText: text
  };
}

function parseOpenUrlIntent(text: string): DesktopIntent | undefined {
  const url = text.match(URL_PATTERN)?.[0];
  if (!url) return undefined;
  if (!/(打开|访问|进入|去|跳到|浏览)/.test(text) && !/^https?:\/\//i.test(text)) return undefined;
  return {
    kind: 'open_url',
    url: cleanPunctuation(url),
    originalText: text
  };
}

function parseOpenAppIntent(text: string): DesktopIntent | undefined {
  if (!/(打开|启动|运行|唤起|切到|切换到)/.test(text)) return undefined;
  const descriptor = findAppDescriptor(text);
  if (!descriptor) return undefined;
  return {
    kind: 'open_app',
    appId: descriptor.appId,
    displayName: descriptor.displayName,
    originalText: text
  };
}

function parseTypeIntent(text: string): DesktopIntent | undefined {
  if (!/(输入|打字|粘贴)/.test(text)) return undefined;
  const quoted = parseQuotedText(text);
  const match = text.match(/(?:输入|打字|粘贴)\s*(.+)$/);
  const content = cleanupMessageBody(quoted ?? cleanPunctuation(match?.[1] ?? ''));
  if (!content) return undefined;
  const submit = /(发送|回车|enter|提交)/i.test(text);
  return {
    kind: 'type_active',
    text: content,
    submit,
    originalText: text
  };
}

export function looksLikeDesktopAutomationIntent(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (normalized.includes('自测桌面执行器')) return true;
  if (parseOpenUrlIntent(normalized)) return true;
  if (parseMailIntent(normalized)) return true;
  if (parseTypeIntent(normalized)) return true;
  const descriptor = findAppDescriptor(normalized);
  if (!descriptor) return false;
  return /(打开|启动|运行|唤起|切到|切换到|发|发送|回复|说|告诉|输入|打字|粘贴)/.test(normalized);
}

export function parseDesktopIntent(text: string): DesktopIntent | undefined {
  const normalized = normalizeText(text);
  if (!normalized) return undefined;
  if (normalized.includes('自测桌面执行器')) {
    return { kind: 'self_test', originalText: normalized };
  }
  const openUrl = parseOpenUrlIntent(normalized);
  if (openUrl) return openUrl;

  const mailIntent = parseMailIntent(normalized);
  if (mailIntent) return mailIntent;

  const descriptor = findAppDescriptor(normalized);
  if (descriptor) {
    const chatIntent = parseChatIntent(normalized, descriptor);
    if (chatIntent) return chatIntent;
  }

  const openApp = parseOpenAppIntent(normalized);
  if (openApp) return openApp;

  const typeIntent = parseTypeIntent(normalized);
  if (typeIntent) return typeIntent;
  return undefined;
}

function toScriptPayload(intent: DesktopIntent, preferredBrowser: DesktopAutomationPreferredBrowser): DesktopScriptPayload {
  switch (intent.kind) {
    case 'open_app':
      return {
        action: 'open-app',
        appId: intent.appId,
        displayName: intent.displayName,
        preferredBrowser
      };
    case 'open_url':
      return {
        action: 'open-url',
        url: intent.url,
        preferredBrowser
      };
    case 'compose_mail':
      return {
        action: 'compose-mail',
        to: intent.to,
        subject: intent.subject,
        body: intent.body
      };
    case 'send_chat_message':
      return {
        action: 'send-chat-message',
        appId: intent.appId,
        displayName: intent.displayName,
        target: intent.target,
        targetMode: intent.targetMode,
        targetIndex: intent.targetIndex,
        content: intent.content
      };
    case 'type_active':
      return {
        action: 'type-active',
        text: intent.text,
        submit: intent.submit
      };
    case 'self_test':
      return { action: 'self-test' };
  }
}

function formatIntentLabel(intent: DesktopIntent): string {
  switch (intent.kind) {
    case 'open_app':
      return `打开 ${intent.displayName}`;
    case 'open_url':
      return `打开链接 ${intent.url}`;
    case 'compose_mail':
      return `发邮件给 ${intent.to}`;
    case 'send_chat_message':
      return intent.targetMode === 'recent_index'
        ? `${intent.displayName} 向 ${intent.target} 发消息`
        : `${intent.displayName} 发消息给 ${intent.target}`;
    case 'type_active':
      return intent.submit ? '向当前窗口输入并提交' : '向当前窗口输入';
    case 'self_test':
      return '桌面执行器自测';
  }
}

function ensureArray(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
}

function ensureString(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

async function runPowerShellRunner(payload: DesktopScriptPayload, timeoutMs: number): Promise<DesktopScriptResult> {
  const payloadPath = path.join(os.tmpdir(), `specwave-desktop-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await fs.writeFile(payloadPath, JSON.stringify(payload), 'utf8');

  try {
    const result = await new Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', DEFAULT_SCRIPT_PATH, '-PayloadPath', payloadPath],
        {
          windowsHide: true,
          stdio: 'pipe'
        }
      );

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          exitCode,
          stdout: Buffer.concat(stdoutChunks).toString('utf8').trim(),
          stderr: Buffer.concat(stderrChunks).toString('utf8').trim(),
          timedOut
        });
      });
    });

    if (result.timedOut) {
      throw new Error('桌面执行超时。');
    }
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `桌面执行器退出码 ${result.exitCode}`);
    }
    const parsed = JSON.parse(result.stdout) as DesktopScriptResult;
    return {
      ok: Boolean(parsed.ok),
      verified: Boolean(parsed.verified),
      summary: typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : '桌面执行已完成。',
      evidence: ensureArray(parsed.evidence),
      diagnostics: ensureArray(parsed.diagnostics),
      screenshotPath: ensureString(parsed.screenshotPath),
      titleScreenshotPath: ensureString(parsed.titleScreenshotPath),
      chatBeforeScreenshotPath: ensureString(parsed.chatBeforeScreenshotPath),
      chatAfterScreenshotPath: ensureString(parsed.chatAfterScreenshotPath)
    };
  } finally {
    await fs.unlink(payloadPath).catch(() => undefined);
  }
}

async function verifyPreparedChatTarget(input: {
  displayName: string;
  target: string;
  scriptResult: DesktopScriptResult;
}): Promise<{
  ok: boolean;
  verified: boolean;
  summary: string;
  evidence: string[];
  diagnostics: string[];
}> {
  const baseEvidence = ensureArray(input.scriptResult.evidence);
  const baseDiagnostics = ensureArray(input.scriptResult.diagnostics);
  const titleScreenshotPath = ensureString(input.scriptResult.titleScreenshotPath);
  const chatBeforeScreenshotPath = ensureString(input.scriptResult.chatBeforeScreenshotPath);

  if (!titleScreenshotPath) {
    return {
      ok: false,
      verified: false,
      summary: `${input.displayName} 没有产出标题截图，先不继续发送。`,
      evidence: [...baseEvidence, ...(chatBeforeScreenshotPath ? [`发送前截图：${chatBeforeScreenshotPath}`] : [])],
      diagnostics: [...baseDiagnostics, '缺少标题截图，无法确认会话是否正确。']
    };
  }

  const recognized = await recognizeDesktopChatSendArtifacts({
    titleScreenshotPath,
    chatBeforeScreenshotPath,
    target: input.target,
    content: ''
  });
  const evidence = [
    ...baseEvidence,
    `标题截图：${titleScreenshotPath}`,
    ...(chatBeforeScreenshotPath ? [`发送前截图：${chatBeforeScreenshotPath}`] : [])
  ];
  if (recognized.titleText.trim()) {
    evidence.push(`标题区识别：${recognized.titleText.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
  }

  if (!recognized.targetMatched) {
    return {
      ok: false,
      verified: false,
      summary: `没有稳定切到 ${input.target} 的会话，这次先不算发出成功。`,
      evidence,
      diagnostics: [...baseDiagnostics, ...recognized.diagnostics.filter((item) => !item.includes('发送后聊天截图'))]
    };
  }

  return {
    ok: true,
    verified: true,
    summary: `已经稳定切到 ${input.target} 的会话，准备发送消息。`,
    evidence,
    diagnostics: [...baseDiagnostics, ...recognized.diagnostics.filter((item) => !item.includes('发送后聊天截图'))]
  };
}

async function verifyDesktopChatSend(input: {
  appId: ChatAppId;
  displayName: string;
  target: string;
  content: string;
  scriptResult: DesktopScriptResult;
}): Promise<{
  ok: boolean;
  verified: boolean;
  summary: string;
  evidence: string[];
  diagnostics: string[];
}> {
  const baseEvidence = ensureArray(input.scriptResult.evidence);
  const baseDiagnostics = ensureArray(input.scriptResult.diagnostics);
  const titleScreenshotPath = ensureString(input.scriptResult.titleScreenshotPath);
  const chatBeforeScreenshotPath = ensureString(input.scriptResult.chatBeforeScreenshotPath);
  const chatAfterScreenshotPath = ensureString(input.scriptResult.chatAfterScreenshotPath);

  if (!titleScreenshotPath || !chatAfterScreenshotPath) {
    return {
      ok: false,
      verified: false,
      summary: `${input.displayName} 发送链路没有产出完整回读截图，先按未发送成功处理。`,
      evidence: [
        ...baseEvidence,
        ...(titleScreenshotPath ? [`标题截图：${titleScreenshotPath}`] : []),
        ...(chatBeforeScreenshotPath ? [`发送前截图：${chatBeforeScreenshotPath}`] : []),
        ...(chatAfterScreenshotPath ? [`发送后截图：${chatAfterScreenshotPath}`] : [])
      ],
      diagnostics: [...baseDiagnostics, '桌面脚本需要同时返回标题截图和发送后聊天截图，才能做强校验。']
    };
  }

  const recognized: DesktopChatSendRecognitionOutput = await recognizeDesktopChatSendArtifacts({
    titleScreenshotPath,
    chatBeforeScreenshotPath,
    chatAfterScreenshotPath,
    target: input.target,
    content: input.content
  });

  const evidence = [
    ...baseEvidence,
    `标题截图：${titleScreenshotPath}`,
    ...(chatBeforeScreenshotPath ? [`发送前截图：${chatBeforeScreenshotPath}`] : []),
    `发送后截图：${chatAfterScreenshotPath}`
  ];
  if (recognized.titleText.trim()) {
    evidence.push(`标题区识别：${recognized.titleText.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
  }
  if (recognized.chatAfterText.trim()) {
    evidence.push(`聊天区识别：${recognized.chatAfterText.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
  }

  if (!recognized.targetMatched) {
    return {
      ok: false,
      verified: false,
      summary: `没有稳定切到 ${input.target} 的会话，这次先不算发出成功。`,
      evidence,
      diagnostics: [...baseDiagnostics, ...recognized.diagnostics]
    };
  }

  if (!recognized.contentMatched) {
    return {
      ok: false,
      verified: false,
      summary: `已经尝试在 ${input.displayName} 打开 ${input.target} 的会话，但没有从聊天区回读到新增消息。`,
      evidence,
      diagnostics: [...baseDiagnostics, ...recognized.diagnostics]
    };
  }

  return {
    ok: true,
    verified: true,
    summary: `已在 ${input.displayName} 向 ${input.target} 发出消息。`,
    evidence,
    diagnostics: [...baseDiagnostics, ...recognized.diagnostics]
  };
}

class DesktopAutomationImpl implements DesktopAutomation {
  constructor(
    private readonly config: DesktopAutomationConfig,
    private readonly runner: DesktopAutomationRunner,
    private readonly candidateRecognizer: DesktopChatCandidateRecognizer,
    private readonly chatSendVerifier: DesktopChatSendVerifier
  ) {}

  canHandle(text: string): boolean {
    return looksLikeDesktopAutomationIntent(text);
  }

  async executeText(text: string): Promise<DesktopAutomationExecutionResult> {
    const normalized = normalizeText(text);
    const intent = parseDesktopIntent(normalized);
    if (!intent) {
      return {
        matched: false,
        ok: false,
        verified: false,
        summary: '我识别到你是在下本机操作指令，但这句还不在当前支持范围。',
        evidence: [],
        diagnostics: [
          '当前支持：打开应用、打开链接、发邮件（mailto）、给微信/飞书/钉钉/QQ 按常用快捷键尝试发消息、向当前窗口输入文字。'
        ]
      };
    }
    if (this.config.dryRun) {
      return {
        matched: true,
        ok: true,
        verified: false,
        summary: `已进入桌面执行干跑模式：${formatIntentLabel(intent)}`,
        evidence: ['dryRun=true，未真正触发鼠标键盘。'],
        diagnostics: [],
        intent
      };
    }

    if (intent.kind === 'send_chat_message' && intent.targetMode === 'named') {
      const prepareResult = await this.runner(
        { action: 'prepare-chat-target', appId: intent.appId, displayName: intent.displayName, target: intent.target },
        this.config.timeoutMs
      );
      if (!prepareResult.ok) {
        return {
          matched: true,
          ok: prepareResult.ok,
          verified: prepareResult.verified,
          summary: prepareResult.summary,
          evidence: ensureArray(prepareResult.evidence),
          diagnostics: ensureArray(prepareResult.diagnostics),
          intent
        };
      }

      const preparedTarget = prepareResult.verified
        ? {
            ok: true,
            verified: true,
            summary: `已经稳定切到 ${intent.target} 的会话，准备发送消息。`,
            evidence: ensureArray(prepareResult.evidence),
            diagnostics: ensureArray(prepareResult.diagnostics)
          }
        : await verifyPreparedChatTarget({
            displayName: intent.displayName,
            target: intent.target,
            scriptResult: prepareResult
          });
      if (!preparedTarget.ok) {
        return {
          matched: true,
          ok: preparedTarget.ok,
          verified: preparedTarget.verified,
          summary: preparedTarget.summary,
          evidence: preparedTarget.evidence,
          diagnostics: preparedTarget.diagnostics,
          intent
        };
      }

      const sendResult = await this.runner(
        { action: 'send-current-chat-message', appId: intent.appId, displayName: intent.displayName, content: intent.content },
        this.config.timeoutMs
      );
      const verifiedResult = await this.chatSendVerifier({
        appId: intent.appId,
        displayName: intent.displayName,
        target: intent.target,
        content: intent.content,
        scriptResult: {
          ...sendResult,
          titleScreenshotPath: sendResult.titleScreenshotPath ?? prepareResult.titleScreenshotPath,
          chatBeforeScreenshotPath: sendResult.chatBeforeScreenshotPath ?? prepareResult.chatBeforeScreenshotPath
        }
      });
      return {
        matched: true,
        ok: verifiedResult.ok,
        verified: verifiedResult.verified,
        summary: verifiedResult.summary,
        evidence: verifiedResult.evidence,
        diagnostics: verifiedResult.diagnostics,
        intent
      };
    }

    const result = await this.runner(toScriptPayload(intent, this.config.preferredBrowser), this.config.timeoutMs);
    return {
      matched: true,
      ok: result.ok,
      verified: result.verified,
      summary: result.summary,
      evidence: ensureArray(result.evidence),
      diagnostics: ensureArray(result.diagnostics),
      intent
    };
  }

  async suggestChatTargets(
    intent: Extract<DesktopIntent, { kind: 'send_chat_message' }>
  ): Promise<DesktopChatTargetSuggestionResult> {
    if (intent.targetMode === 'named') {
      return {
        ok: true,
        verified: true,
        summary: '当前已经拿到明确联系人。',
        suggestedTarget: intent.target,
        candidates: [intent.target],
        evidence: [],
        diagnostics: []
      };
    }
    if (this.config.dryRun) {
      return {
        ok: false,
        verified: false,
        summary: 'dryRun=true，当前不会真的去读取桌面候选联系人。',
        candidates: [],
        evidence: ['dryRun=true，未真正触发桌面截图。'],
        diagnostics: []
      };
    }

    const captureResult = await this.runner(
      { action: 'capture-chat-candidates', appId: intent.appId, displayName: intent.displayName },
      this.config.timeoutMs
    );
    if (!captureResult.ok || !captureResult.screenshotPath) {
      return {
        ok: false,
        verified: captureResult.verified,
        summary: captureResult.summary,
        candidates: [],
        evidence: ensureArray(captureResult.evidence),
        diagnostics: ensureArray(captureResult.diagnostics)
      };
    }

    const recognized = await this.candidateRecognizer({
      screenshotPath: captureResult.screenshotPath,
      targetMode: intent.targetMode,
      targetIndex: intent.targetIndex
    });
    return {
      ok: captureResult.ok && recognized.candidates.length > 0,
      verified: captureResult.verified,
      summary: recognized.candidates.length > 0 ? '已从当前桌面窗口读取到可确认的联系人候选。' : '已读取桌面截图，但没稳定识别出候选联系人。',
      suggestedTarget: recognized.suggestedTarget,
      candidates: recognized.candidates,
      evidence: [...ensureArray(captureResult.evidence), `截图：${captureResult.screenshotPath}`],
      diagnostics: [...ensureArray(captureResult.diagnostics), ...recognized.diagnostics]
    };
  }

  async selfTest(): Promise<DesktopAutomationSelfTestResult> {
    const result = await this.runner({ action: 'self-test' }, this.config.timeoutMs);
    return {
      ok: result.ok,
      verified: result.verified,
      summary: result.summary,
      evidence: ensureArray(result.evidence),
      diagnostics: ensureArray(result.diagnostics)
    };
  }
}

export function formatDesktopAutomationReply(result: DesktopAutomationExecutionResult): string {
  if (!result.matched) {
    const lines = [result.summary];
    if (result.diagnostics.length > 0) lines.push(`说明：${result.diagnostics.join('；')}`);
    return lines.join('\n');
  }
  const lines: string[] = [];
  if (result.ok && result.verified) {
    lines.push(`这次已经执行完了：${result.summary}`);
  } else if (result.ok) {
    lines.push(`这次我已经触发了本机操作：${result.summary}`);
    lines.push('但当前还不能确认界面最终状态，所以先不把它算作真正完成。');
  } else {
    lines.push(`这次没有执行成功：${result.summary}`);
  }
  if (result.evidence.length > 0) lines.push(`证据：${result.evidence.join('；')}`);
  if (result.diagnostics.length > 0) lines.push(`补充：${result.diagnostics.join('；')}`);
  return lines.join('\n');
}

export function createDesktopAutomation(
  config: DesktopAutomationConfig,
  runner: DesktopAutomationRunner = runPowerShellRunner,
  candidateRecognizer: DesktopChatCandidateRecognizer = recognizeDesktopChatCandidates,
  chatSendVerifier: DesktopChatSendVerifier = verifyDesktopChatSend
): DesktopAutomation {
  return new DesktopAutomationImpl(config, runner, candidateRecognizer, chatSendVerifier);
}
