import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type {
  OrchestratorDingTalkAppbotPayload,
  OrchestratorRequestDetail,
  OrchestratorRiskLevel,
  OrchestratorWebhookPayload
} from '@specwave/contracts';
import type { AgentRuntime } from './agentRuntime';
import { formatDesktopAutomationReply, looksLikeDesktopAutomationIntent, parseDesktopIntent, type DesktopAutomation } from './desktopAutomation';
import { OrchestratorService, OrchestratorServiceError } from './orchestratorService';

export type DingtalkAppbotRuntimeConfig = {
  tenantId: string;
  projectId: string;
  requireAt: boolean;
  signSecret?: string;
  botName?: string;
  agentRuntime?: AgentRuntime;
  desktopAutomation?: DesktopAutomation;
  resolveDownloadUrl?: (input: { downloadCode: string; robotCode: string }) => Promise<string | undefined>;
};

export type DingtalkAppbotProcessResult = {
  handled: boolean;
  action: 'ignored' | 'request' | 'status' | 'acceptance' | 'approval' | 'agent';
  requestId?: string;
  state?: string;
  pendingApprovalId?: string;
  sessionWebhook?: string;
  replyText: string;
};

const STATE_LABELS = {
  INTAKE: '已受理',
  CLARIFY: '需求澄清中',
  SPEC_FREEZE: '需求已冻结',
  PLAN_COMMIT: '计划已提交',
  WAITING_APPROVAL: '等待审批',
  BUILD_RUN: '开发中',
  TEST_RUN: '测试中',
  DELIVERY_DRAFT: '结果包生成中',
  ACCEPTANCE_PENDING: '待验收',
  REMINDER_L1: '一级催办',
  REMINDER_L2: '二级催办',
  ESCALATION_L3: '三级升级',
  PAUSED_BY_NO_RESPONSE: '等待人工处理',
  REWORK: '返工中',
  DONE: '已完成',
  FAILED: '失败'
} as const;

const DELIVERY_STATE_LABELS = {
  draft: '草稿',
  ready: '可验收',
  accepted: '已验收',
  rejected: '已拒绝',
  archived: '已归档'
} as const;

type DingtalkInboundAttachmentType = 'picture' | 'audio' | 'video' | 'file';

type DingtalkInboundAttachment = {
  type: DingtalkInboundAttachmentType;
  downloadCode?: string;
  fileName?: string;
  duration?: number;
  recognition?: string;
};

type DingtalkInboundParsedMessage = {
  text: string;
  attachments: DingtalkInboundAttachment[];
};

type PendingDesktopClarification = {
  appId: 'wechat' | 'feishu' | 'dingtalk' | 'qq' | 'wecom';
  displayName: string;
  content: string;
  originalText: string;
  reason: 'recent_index' | 'ambiguous';
  candidates: string[];
  suggestedTarget?: string;
  createdAt: number;
  expiresAt: number;
};

const PENDING_DESKTOP_CLARIFICATIONS = new Map<string, PendingDesktopClarification>();
const DESKTOP_CLARIFICATION_TTL_MS = 10 * 60 * 1000;

function toText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanMessageContent(content: string, botName?: string): string {
  let text = content.trim();
  if (botName) {
    const reg = new RegExp(`^@${escapeRegExp(botName)}[\\s:：,，-]*`, 'i');
    text = text.replace(reg, '').trim();
  }
  return text;
}

function extractRiskLevel(content: string): { riskLevel?: OrchestratorRiskLevel; message: string } {
  const match = content.match(/(?:^|\s)(?:\[|【|#)?(R[0-3])(?:\]|】)?(?:\s|$)/i);
  if (!match) return { message: content.trim() };
  const level = match[1]?.toUpperCase() as OrchestratorRiskLevel | undefined;
  const message = content.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { riskLevel: level, message: message || content.trim() };
}

function ensurePayload(payload: unknown): OrchestratorDingTalkAppbotPayload {
  if (!payload || typeof payload !== 'object') {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', '钉钉消息体必须是对象。');
  }
  return payload as OrchestratorDingTalkAppbotPayload;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function parseMsgType(source: OrchestratorDingTalkAppbotPayload): string {
  return toText(source.msgtype)?.toLowerCase() ?? 'text';
}

function parseSingleAttachment(type: DingtalkInboundAttachmentType, payload: Record<string, unknown>): DingtalkInboundAttachment {
  const durationRaw = payload.duration;
  const duration = typeof durationRaw === 'number' && Number.isFinite(durationRaw) ? durationRaw : undefined;
  return {
    type,
    downloadCode: toText(payload.downloadCode),
    fileName: toText(payload.fileName),
    duration,
    recognition: toText(payload.recognition)
  };
}

function parseInboundMessage(source: OrchestratorDingTalkAppbotPayload, botName?: string): DingtalkInboundParsedMessage {
  const msgtype = parseMsgType(source);
  const sourceContent = asRecord(source.content);
  const textContent = cleanMessageContent(toText(source.text?.content) ?? '', botName);
  if (msgtype === 'text') {
    return {
      text: textContent,
      attachments: []
    };
  }

  if (msgtype === 'picture') {
    return {
      text: '[用户发送了一张图片]',
      attachments: [parseSingleAttachment('picture', sourceContent)]
    };
  }

  if (msgtype === 'audio') {
    const attachment = parseSingleAttachment('audio', sourceContent);
    const lines = ['[用户发送了一段语音]'];
    if (attachment.recognition) lines.push(`语音识别：${attachment.recognition}`);
    return {
      text: lines.join('\n'),
      attachments: [attachment]
    };
  }

  if (msgtype === 'video') {
    return {
      text: '[用户发送了一个视频]',
      attachments: [parseSingleAttachment('video', sourceContent)]
    };
  }

  if (msgtype === 'file') {
    const attachment = parseSingleAttachment('file', sourceContent);
    const label = attachment.fileName ? `[用户发送了文件：${attachment.fileName}]` : '[用户发送了一个文件]';
    return {
      text: label,
      attachments: [attachment]
    };
  }

  if (msgtype === 'richtext') {
    const richTextRaw = sourceContent.richText;
    const richText = Array.isArray(richTextRaw) ? richTextRaw : [];
    const textParts: string[] = [];
    const attachments: DingtalkInboundAttachment[] = [];
    for (const item of richText) {
      const record = asRecord(item);
      const text = toText(record.text);
      if (text) textParts.push(text);
      const type = toText(record.type)?.toLowerCase();
      const downloadCode = toText(record.downloadCode);
      if (downloadCode || type === 'picture') {
        attachments.push({
          type: 'picture',
          downloadCode
        });
      }
    }
    const text = textParts.join('\n').trim();
    return {
      text: text || (attachments.length > 0 ? '[用户发送了富文本（含图片）]' : '[用户发送了富文本消息]'),
      attachments
    };
  }

  return {
    text: textContent || `[用户发送了${msgtype}消息]`,
    attachments: []
  };
}

async function enrichMessageWithAttachmentContext(
  source: OrchestratorDingTalkAppbotPayload,
  parsed: DingtalkInboundParsedMessage,
  config: DingtalkAppbotRuntimeConfig
): Promise<string> {
  if (parsed.attachments.length === 0) return parsed.text;
  const robotCode = toText(source.robotCode);
  const lines = [parsed.text, '', '[多媒体上下文]'];
  for (let index = 0; index < parsed.attachments.length; index += 1) {
    const attachment = parsed.attachments[index]!;
    const titleBase = `附件${index + 1}（${attachment.type}）`;
    const extras: string[] = [];
    if (attachment.fileName) extras.push(`文件名：${attachment.fileName}`);
    if (typeof attachment.duration === 'number') extras.push(`时长：${attachment.duration}ms`);
    if (attachment.recognition) extras.push(`识别：${attachment.recognition}`);
    if (attachment.downloadCode && robotCode && config.resolveDownloadUrl) {
      try {
        const downloadUrl = await config.resolveDownloadUrl({
          downloadCode: attachment.downloadCode,
          robotCode
        });
        if (downloadUrl) extras.push(`下载链接：${downloadUrl}`);
      } catch {
        // 下载链接获取失败不阻断主流程，仍保留其他上下文。
      }
    }
    if (extras.length === 0 && attachment.downloadCode) {
      const preview =
        attachment.downloadCode.length > 36 ? `${attachment.downloadCode.slice(0, 36)}...` : attachment.downloadCode;
      extras.push(`downloadCode：${preview}`);
    }
    if (extras.length === 0) {
      lines.push(`- ${titleBase}`);
      continue;
    }
    lines.push(`- ${titleBase}，${extras.join('；')}`);
  }
  return lines.join('\n').trim();
}

export function verifyDingtalkAppbotSignature(headers: IncomingHttpHeaders, secret?: string): boolean {
  if (!secret) return true;
  const timestamp = toText(headers['timestamp']) ?? toText(headers['x-dingtalk-timestamp']);
  const signHeader = toText(headers['sign']) ?? toText(headers['x-dingtalk-sign']);
  if (!timestamp || !signHeader) return false;

  const incomingSign = decodeURIComponent(signHeader);
  const stringToSign = `${timestamp}\n${secret}`;
  const expectSign = createHmac('sha256', secret).update(stringToSign).digest('base64');
  const incomingBuffer = Buffer.from(incomingSign, 'utf8');
  const expectBuffer = Buffer.from(expectSign, 'utf8');
  if (incomingBuffer.length !== expectBuffer.length) return false;
  return timingSafeEqual(incomingBuffer, expectBuffer);
}

function buildCreatePayload(
  source: OrchestratorDingTalkAppbotPayload,
  content: string,
  config: DingtalkAppbotRuntimeConfig
): OrchestratorWebhookPayload {
  const msgId = toText(source.msgId);
  const conversationId = toText(source.conversationId);
  const sender = toText(source.senderStaffId) ?? toText(source.senderId);
  if (!msgId || !conversationId || !sender) {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', '钉钉消息缺少 conversationId/msgId/sender。');
  }
  const extracted = extractRiskLevel(content);
  return {
    externalChatId: conversationId,
    threadId: msgId,
    userId: sender,
    userName: toText(source.senderNick),
    message: extracted.message,
    tenantId: config.tenantId,
    projectId: config.projectId,
    idempotencyKey: `dingtalk-appbot:${msgId}`,
    riskLevel: extracted.riskLevel
  };
}

function summarizeDetail(detail: OrchestratorRequestDetail): string {
  const request = detail.request;
  const stateLabel = STATE_LABELS[request.state] ?? request.state;
  const lines = [`工单：${request.id}`, `当前进度：${stateLabel}`];
  if (detail.pendingApprovals.length > 0) {
    lines.push(`待审批：${detail.pendingApprovals[0]!.id}`);
  }
  if (detail.delivery) {
    const releaseState = DELIVERY_STATE_LABELS[detail.delivery.releaseState] ?? detail.delivery.releaseState;
    lines.push(`交付版本：v${detail.delivery.version}（${releaseState}）`);
  }
  return lines.join('\n');
}

function makeCommandHelp(requestId?: string, pendingApprovalId?: string): string {
  const lines = ['你可以直接这样回复我：'];
  lines.push(`- 状态 ${requestId ?? '<requestId>'}（查看当前进度）`);
  lines.push(`- 通过 ${requestId ?? '<requestId>'} 可以上线（确认验收）`);
  lines.push(`- 拒绝 ${requestId ?? '<requestId>'} 需要返工（打回重做）`);
  if (pendingApprovalId) {
    lines.push(`- 审批 ${pendingApprovalId} 通过`);
    lines.push(`- 审批 ${pendingApprovalId} 拒绝`);
  } else {
    lines.push('- 审批 <approvalId> 通过/拒绝');
  }
  return lines.join('\n');
}

function isSmallTalk(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？!?、,:：~～]/g, '');
  const exactMatches = new Set([
    '在吗',
    '在不在',
    '有人吗',
    '你好',
    '您好',
    '嗨',
    'hi',
    'hello',
    '收到吗',
    '在'
  ]);
  return exactMatches.has(normalized);
}

function parseCommand(text: string):
  | { type: 'status'; requestId: string }
  | { type: 'approve'; requestId: string; comment?: string }
  | { type: 'reject'; requestId: string; comment?: string }
  | { type: 'approval'; approvalId: string; decision: 'approved' | 'rejected'; comment?: string }
  | { type: 'request'; intent: string } {
  const statusMatch = text.match(/^状态\s+([^\s]+)$/);
  if (statusMatch) return { type: 'status', requestId: statusMatch[1]! };

  const approveMatch = text.match(/^(通过|验收通过)\s+([^\s]+)(?:\s+(.+))?$/);
  if (approveMatch) return { type: 'approve', requestId: approveMatch[2]!, comment: toText(approveMatch[3]) };

  const rejectMatch = text.match(/^(拒绝|驳回|验收拒绝)\s+([^\s]+)(?:\s+(.+))?$/);
  if (rejectMatch) return { type: 'reject', requestId: rejectMatch[2]!, comment: toText(rejectMatch[3]) };

  const approvalMatch = text.match(/^审批\s+([^\s]+)\s+(通过|拒绝)(?:\s+(.+))?$/);
  if (approvalMatch) {
    return {
      type: 'approval',
      approvalId: approvalMatch[1]!,
      decision: approvalMatch[2] === '通过' ? 'approved' : 'rejected',
      comment: toText(approvalMatch[3])
    };
  }
  return { type: 'request', intent: text };
}

function buildDesktopClarificationKey(conversationId: string, senderId: string): string {
  return `${conversationId}::${senderId}`;
}

function getPendingDesktopClarification(conversationId: string, senderId: string): PendingDesktopClarification | undefined {
  const key = buildDesktopClarificationKey(conversationId, senderId);
  const pending = PENDING_DESKTOP_CLARIFICATIONS.get(key);
  if (!pending) return undefined;
  if (pending.expiresAt > Date.now()) return pending;
  PENDING_DESKTOP_CLARIFICATIONS.delete(key);
  return undefined;
}

function setPendingDesktopClarification(conversationId: string, senderId: string, pending: PendingDesktopClarification): void {
  const key = buildDesktopClarificationKey(conversationId, senderId);
  PENDING_DESKTOP_CLARIFICATIONS.set(key, pending);
}

function clearPendingDesktopClarification(conversationId: string, senderId: string): void {
  PENDING_DESKTOP_CLARIFICATIONS.delete(buildDesktopClarificationKey(conversationId, senderId));
}

function isCancelText(text: string): boolean {
  return /^(取消|不用了|算了|停止|终止|先别发了)$/i.test(text.trim());
}

function isAffirmText(text: string): boolean {
  return /^(是|对|对的|没错|就这个|好|好的|确认|确认发送)$/i.test(text.trim());
}

function isRejectClarificationText(text: string): boolean {
  return /^(不是|不对|都不是|换一个|换个联系人)$/i.test(text.trim());
}

function parseClarificationCandidateChoice(text: string, pending: PendingDesktopClarification): string | undefined {
  const normalized = text.trim();
  const match = normalized.match(/^(?:第\s*)?(\d{1,2})(?:\s*个)?$/);
  if (!match?.[1]) return undefined;
  const index = Number.parseInt(match[1], 10);
  if (!Number.isFinite(index) || index <= 0) return undefined;
  return pending.candidates[index - 1];
}

function isAmbiguousClarifiedTarget(text: string): boolean {
  return /^(某人|某个(?:联系人|人|好友|朋友)|那个人|这个人|那个谁|对方|他|她|它|第\s*[\d一二两三四五六七八九十]+\s*(?:个)?\s*(?:联系人|会话|聊天|对话|好友|朋友)|上一个(?:联系人|会话|聊天)?|前一个(?:联系人|会话|聊天)?|刚才那个(?:人|联系人)?|上面那个(?:人|联系人)?|下面那个(?:人|联系人)?|一个联系人|一个人)$/i.test(
    text.trim()
  );
}

function normalizeClarifiedContactName(text: string): string | undefined {
  let normalized = text.trim();
  normalized = normalized.replace(/^(?:是|就是|叫|名字是|联系人是|联系人名是|改成|改为|发给|给)\s*/i, '');
  normalized = normalized.replace(/^(?:联系人|名字|联系人名)\s*[:：]?\s*/i, '');
  normalized = normalized.replace(/[，。！？.!?]+$/g, '').trim();
  if (!normalized) return undefined;
  if (isAmbiguousClarifiedTarget(normalized)) return undefined;
  return normalized;
}

function buildDesktopClarificationPrompt(pending: PendingDesktopClarification): string {
  const lines: string[] = [];
  if (pending.reason === 'recent_index') {
    lines.push(`我去看了下你桌面上的 ${pending.displayName}。`);
    if (pending.suggestedTarget) {
      lines.push(`按当前可见列表来看，你说的那个联系人大概率是「${pending.suggestedTarget}」。`);
    } else {
      lines.push(`我已经读了当前可见列表，但“第几个联系人”这件事还是需要你再确认一下。`);
    }
  } else {
    lines.push(`我去看了下你桌面上的 ${pending.displayName}。你这句里的联系人还比较模糊，我先把当前可见候选读出来给你确认。`);
  }
  if (pending.candidates.length > 0) {
    lines.push('我当前读到的候选有：');
    pending.candidates.slice(0, 5).forEach((candidate, index) => {
      lines.push(`${index + 1}. ${candidate}`);
    });
  }
  if (pending.suggestedTarget) {
    lines.push('如果就是它，直接回复“是”就行；也可以回复序号，或者直接发联系人名。');
  } else {
    lines.push('你可以直接回复序号，或者直接发联系人名。');
  }
  lines.push(`我准备继续发送这句：${pending.content}`);
  lines.push('回复“取消”可终止这次发送。');
  lines.push('说明：我读到的是当前可见列表，识别可能会有一点误差。');
  return lines.join('\n');
}

function buildDesktopClarificationExecuteText(pending: PendingDesktopClarification, target: string): string {
  return `帮我在${pending.displayName}里给${target}发一句“${pending.content}”`;
}

function shouldIgnoreByAtRule(payload: OrchestratorDingTalkAppbotPayload, config: DingtalkAppbotRuntimeConfig): boolean {
  if (!config.requireAt) return false;
  const conversationType = toText(payload.conversationType);
  if (conversationType === '2') return false;
  if (payload.isInAtList === true) return false;
  if (Array.isArray(payload.atUsers) && payload.atUsers.length > 0) return false;
  return true;
}

export async function handleDingtalkAppbotInbound(
  service: OrchestratorService,
  body: unknown,
  config: DingtalkAppbotRuntimeConfig
): Promise<DingtalkAppbotProcessResult> {
  const source = ensurePayload(body);
  if (shouldIgnoreByAtRule(source, config)) {
    return {
      handled: false,
      action: 'ignored',
      sessionWebhook: toText(source.sessionWebhook),
      replyText: '请先 @机器人 再发送诉求。'
    };
  }

  const parsedMessage = parseInboundMessage(source, config.botName);
  const message = await enrichMessageWithAttachmentContext(source, parsedMessage, config);
  if (!message) {
    return {
      handled: false,
      action: 'ignored',
      sessionWebhook: toText(source.sessionWebhook),
      replyText: '我收到了空消息。你可以直接告诉我你的诉求，我会自动推进需求、开发和测试。'
    };
  }
  if (!config.agentRuntime && isSmallTalk(message)) {
    return {
      handled: false,
      action: 'ignored',
      sessionWebhook: toText(source.sessionWebhook),
      replyText: '我在。你可以直接说你的诉求，我会开始自动推进。\n例如：请帮我做一个自动验收提醒流程。'
    };
  }

  const senderId = toText(source.senderStaffId) ?? toText(source.senderId) ?? 'dingtalk-user';
  const senderName = toText(source.senderNick);
  const conversationId = toText(source.conversationId) ?? senderId;
  const sessionWebhook = toText(source.sessionWebhook);
  const command = parseCommand(message);
  const pendingDesktopClarification = getPendingDesktopClarification(conversationId, senderId);

  if (pendingDesktopClarification && command.type === 'request' && !looksLikeDesktopAutomationIntent(message)) {
    if (isCancelText(message)) {
      clearPendingDesktopClarification(conversationId, senderId);
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: '这次桌面发送我先取消了。你下次直接告诉我联系人名和内容，我再继续。'
      };
    }

    let clarifiedTarget: string | undefined;
    if (isAffirmText(message) && pendingDesktopClarification.suggestedTarget) {
      clarifiedTarget = pendingDesktopClarification.suggestedTarget;
    } else {
      clarifiedTarget = parseClarificationCandidateChoice(message, pendingDesktopClarification);
    }
    if (!clarifiedTarget) {
      clarifiedTarget = normalizeClarifiedContactName(message);
    }
    if (!clarifiedTarget) {
      const prefix = isRejectClarificationText(message) ? '那你换一个也行，我继续等你点名。' : '我还没拿到可发送的联系人名。';
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: `${prefix}\n${buildDesktopClarificationPrompt(pendingDesktopClarification)}`
      };
    }

    clearPendingDesktopClarification(conversationId, senderId);
    if (!config.desktopAutomation) {
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: '联系人我已经记下了，但当前机器人还没接入本机桌面执行器，所以这次不会真的发送。'
      };
    }

    try {
      const desktopResult = await config.desktopAutomation.executeText(
        buildDesktopClarificationExecuteText(pendingDesktopClarification, clarifiedTarget)
      );
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: formatDesktopAutomationReply(desktopResult)
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: `补全联系人后执行失败：${messageText.slice(0, 180)}`
      };
    }
  }

  if (pendingDesktopClarification && command.type === 'request' && looksLikeDesktopAutomationIntent(message)) {
    clearPendingDesktopClarification(conversationId, senderId);
  }

  const desktopIntent = parseDesktopIntent(message);
  if (desktopIntent?.kind === 'send_chat_message' && desktopIntent.targetMode !== 'named') {
    const now = Date.now();
    let pending: PendingDesktopClarification = {
      appId: desktopIntent.appId,
      displayName: desktopIntent.displayName,
      content: desktopIntent.content,
      originalText: desktopIntent.originalText,
      reason: desktopIntent.targetMode === 'recent_index' ? 'recent_index' : 'ambiguous',
      candidates: [],
      createdAt: now,
      expiresAt: now + DESKTOP_CLARIFICATION_TTL_MS
    };

    if (config.desktopAutomation) {
      try {
        const suggestion = await config.desktopAutomation.suggestChatTargets(desktopIntent);
        pending = {
          ...pending,
          candidates: suggestion.candidates,
          suggestedTarget: suggestion.suggestedTarget
        };
      } catch {
        // 桌面候选提取失败时，退回纯文本追问，不中断主流程。
      }
    }

    setPendingDesktopClarification(conversationId, senderId, pending);
    return {
      handled: true,
      action: 'agent',
      sessionWebhook,
      replyText: buildDesktopClarificationPrompt(pending)
    };
  }

  if (looksLikeDesktopAutomationIntent(message)) {
    if (!config.desktopAutomation) {
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText:
          '这条“桌面操作”指令没有执行。当前机器人只接入了对话 Agent，还没接入本机桌面执行器，所以不会真的帮你点开应用并操作。'
      };
    }
    try {
      const desktopResult = await config.desktopAutomation.executeText(message);
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: formatDesktopAutomationReply(desktopResult)
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: `本机桌面执行器调用失败：${messageText.slice(0, 180)}`
      };
    }
  }

  if (config.agentRuntime) {
    try {
      const response = await config.agentRuntime.ask({
        channel: 'dingtalk',
        tenantId: config.tenantId,
        projectId: config.projectId,
        conversationId,
        userId: senderId,
        userName: senderName,
        text: message
      });
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: response.text
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return {
        handled: true,
        action: 'agent',
        sessionWebhook,
        replyText: `我调用本机 Agent 时失败了：${messageText.slice(0, 180)}`
      };
    }
  }

  if (command.type === 'status') {
    const detail = await service.getRequestDetail(command.requestId);
    return {
      handled: true,
      action: 'status',
      requestId: detail.request.id,
      state: detail.request.state,
      pendingApprovalId: detail.pendingApprovals[0]?.id,
      sessionWebhook,
      replyText: `我查到的进度如下：\n${summarizeDetail(detail)}\n\n${makeCommandHelp(detail.request.id, detail.pendingApprovals[0]?.id)}`
    };
  }

  if (command.type === 'approve' || command.type === 'reject') {
    const detail = await service.submitAcceptance(command.requestId, {
      action: command.type === 'approve' ? 'approve' : 'reject',
      actorId: senderId,
      actorName: senderName,
      comment: command.comment
    });
    return {
      handled: true,
      action: 'acceptance',
      requestId: detail.request.id,
      state: detail.request.state,
      pendingApprovalId: detail.pendingApprovals[0]?.id,
      sessionWebhook,
      replyText: `验收结果已记录，我已更新工单：\n${summarizeDetail(detail)}\n\n${makeCommandHelp(detail.request.id, detail.pendingApprovals[0]?.id)}`
    };
  }

  if (command.type === 'approval') {
    const detail = await service.submitApproval({
      approvalId: command.approvalId,
      decision: command.decision,
      actorId: senderId,
      actorName: senderName,
      comment: command.comment
    });
    return {
      handled: true,
      action: 'approval',
      requestId: detail.request.id,
      state: detail.request.state,
      pendingApprovalId: detail.pendingApprovals[0]?.id,
      sessionWebhook,
      replyText: `审批处理完成，当前工单如下：\n${summarizeDetail(detail)}\n\n${makeCommandHelp(detail.request.id, detail.pendingApprovals[0]?.id)}`
    };
  }

  const webhookPayload = buildCreatePayload(source, command.intent, config);
  const created = await service.receiveWebhook('dingtalk', webhookPayload);
  const detail = await service.getRequestDetail(created.requestId);
  const pendingApprovalId = detail.pendingApprovals[0]?.id;
  return {
    handled: true,
    action: 'request',
    requestId: created.requestId,
    state: created.state,
    pendingApprovalId,
    sessionWebhook,
    replyText: `诉求已接收，我已经开始自动执行。\n${summarizeDetail(detail)}\n\n${makeCommandHelp(created.requestId, pendingApprovalId)}`
  };
}

export async function sendDingtalkSessionWebhook(sessionWebhook: string, text: string): Promise<void> {
  const normalizedText = text.replace(/`(https?:\/\/[^`\s]+)`/g, '$1').trim();
  const imagePayload = await buildSessionMarkdownImagePayload(normalizedText);
  if (imagePayload) {
    try {
      await postDingtalkSessionWebhook(sessionWebhook, imagePayload);
      return;
    } catch {
      // markdown 图片消息失败时，降级为纯文本，避免完全无回复。
    }
  }
  await postDingtalkSessionWebhook(sessionWebhook, {
    msgtype: 'text',
    text: {
      content: text
    }
  });
}

type SessionWebhookResponse = {
  errcode?: number;
  errmsg?: string;
};

type SessionWebhookTextPayload = {
  msgtype: 'text';
  text: {
    content: string;
  };
};

type SessionWebhookMarkdownPayload = {
  msgtype: 'markdown';
  markdown: {
    title: string;
    text: string;
  };
};

type SessionWebhookPayload = SessionWebhookTextPayload | SessionWebhookMarkdownPayload;

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  return matches.map((url) => url.replace(/[.,;!?]+$/, ''));
}

function isLikelyImageUrl(url: string, fullText: string): boolean {
  const loweredUrl = url.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(loweredUrl)) return true;
  if (loweredUrl.includes('picsum.photos')) return true;
  if (loweredUrl.includes('images.unsplash.com')) return true;
  if (/(图片|照片|壁纸|表情包|动图|image|photo|img)/i.test(fullText)) return true;
  return false;
}

async function resolveImageUrlForMarkdown(url: string): Promise<string> {
  try {
    const headResponse = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(4000)
    });
    if (headResponse.ok) {
      return headResponse.url || url;
    }
  } catch {
    // HEAD 可能被目标服务拒绝，下面回退 GET。
  }
  try {
    const getResponse = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000)
    });
    getResponse.body?.cancel().catch(() => undefined);
    return getResponse.url || url;
  } catch {
    return url;
  }
}

async function buildSessionMarkdownImagePayload(text: string): Promise<SessionWebhookMarkdownPayload | null> {
  const urls = extractUrls(text);
  if (urls.length === 0) return null;
  const imageCandidates = urls.filter((url) => isLikelyImageUrl(url, text));
  const imageUrl = imageCandidates[0];
  if (!imageUrl) return null;
  const resolvedImageUrl = await resolveImageUrlForMarkdown(imageUrl);
  const title = '图片回复';
  let caption = text;
  for (const url of imageCandidates) {
    caption = caption.split(url).join(' ');
  }
  caption = caption
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[`]/g, '')
    .replace(/点开就能看[:：]?/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const markdownText = `${caption || '给你一张图片。'}\n\n![](${resolvedImageUrl})`;
  return {
    msgtype: 'markdown',
    markdown: {
      title,
      text: markdownText
    }
  };
}

async function postDingtalkSessionWebhook(sessionWebhook: string, payload: SessionWebhookPayload): Promise<void> {
  const response = await fetch(sessionWebhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(`sessionWebhook HTTP ${response.status} ${raw.slice(0, 120)}`);
  }
  const body = (await response.json().catch(() => ({}))) as SessionWebhookResponse;
  if (typeof body.errcode === 'number' && body.errcode !== 0) {
    throw new Error(`sessionWebhook errcode=${body.errcode} errmsg=${body.errmsg ?? ''}`.trim());
  }
}
