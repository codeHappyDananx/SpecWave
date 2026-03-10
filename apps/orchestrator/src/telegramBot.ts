import type { OrchestratorRequestDetail, OrchestratorRiskLevel, OrchestratorWebhookPayload } from '@specwave/contracts';
import type { AgentRuntime } from './agentRuntime';
import type { TelegramConnectorConfig } from './connectorConfig';
import { OrchestratorService, OrchestratorServiceError } from './orchestratorService';
import type { TelegramMessage, TelegramUpdate } from './telegramApi';

export type TelegramInboundRuntimeConfig = Pick<
  TelegramConnectorConfig,
  'tenantId' | 'projectId' | 'requireMention' | 'botUsername' | 'allowedChatIds'
> & {
  agentRuntime?: AgentRuntime;
};

export type TelegramBotProcessResult = {
  handled: boolean;
  action: 'ignored' | 'request' | 'status' | 'acceptance' | 'approval' | 'agent';
  requestId?: string;
  state?: string;
  pendingApprovalId?: string;
  updateId: number;
  chatId: string;
  replyToMessageId?: number;
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

function toText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanMessageContent(content: string, botUsername?: string): string {
  let text = content.trim();
  if (botUsername) {
    const reg = new RegExp(`^@${escapeRegExp(botUsername)}[\\s:：,，-]*`, 'i');
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

function ensureUpdate(payload: unknown): TelegramUpdate {
  if (!payload || typeof payload !== 'object') {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', 'telegram update 必须是对象。');
  }
  const source = payload as Partial<TelegramUpdate>;
  if (typeof source.update_id !== 'number') {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', 'telegram update_id 缺失。');
  }
  return source as TelegramUpdate;
}

function ensureMessage(update: TelegramUpdate): TelegramMessage {
  const message = update.message ?? update.edited_message;
  if (!message || typeof message !== 'object') {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', 'telegram update 缺少 message。');
  }
  const chatId = message.chat?.id;
  if (typeof chatId !== 'string' && typeof chatId !== 'number') {
    throw new OrchestratorServiceError(400, 'INVALID_WEBHOOK_PAYLOAD', 'telegram message.chat.id 缺失。');
  }
  return message;
}

function summarizeDetail(detail: OrchestratorRequestDetail): string {
  const request = detail.request;
  const stateLabel = STATE_LABELS[request.state] ?? request.state;
  const lines = [
    `工单：${request.id}`,
    `状态：${stateLabel}（${request.state}）`
  ];
  if (detail.pendingApprovals.length > 0) {
    lines.push(`待审批：${detail.pendingApprovals[0]!.id}`);
  }
  if (detail.delivery) {
    lines.push(`交付版本：v${detail.delivery.version}（${detail.delivery.releaseState}）`);
  }
  return lines.join('\n');
}

function makeCommandHelp(requestId?: string, pendingApprovalId?: string): string {
  const lines = ['可用命令：'];
  lines.push(`状态 ${requestId ?? '<requestId>'}`);
  lines.push(`通过 ${requestId ?? '<requestId>'} 验收意见`);
  lines.push(`拒绝 ${requestId ?? '<requestId>'} 返工意见`);
  if (pendingApprovalId) {
    lines.push(`审批 ${pendingApprovalId} 通过`);
    lines.push(`审批 ${pendingApprovalId} 拒绝`);
  } else {
    lines.push('审批 <approvalId> 通过|拒绝');
  }
  return lines.join('\n');
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

function shouldIgnoreByAtRule(message: TelegramMessage, config: TelegramInboundRuntimeConfig): boolean {
  if (!config.requireMention) return false;
  const chatType = message.chat?.type;
  if (chatType === 'private') return false;
  if (!config.botUsername) return false;
  const text = toText(message.text);
  if (!text) return true;
  const reg = new RegExp(`(^|\\s)@${escapeRegExp(config.botUsername)}(?:\\s|$|[,:：，])`, 'i');
  return !reg.test(text);
}

function isChatAllowed(chatId: string, config: TelegramInboundRuntimeConfig): boolean {
  const allowed = config.allowedChatIds;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(chatId);
}

function buildSenderName(message: TelegramMessage): string | undefined {
  const from = message.from;
  if (!from) return undefined;
  const firstName = toText(from.first_name);
  const lastName = toText(from.last_name);
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return displayName || toText(from.username);
}

function buildCreatePayload(
  update: TelegramUpdate,
  message: TelegramMessage,
  content: string,
  config: TelegramInboundRuntimeConfig
): OrchestratorWebhookPayload {
  const chatId = String(message.chat.id);
  const extracted = extractRiskLevel(content);
  return {
    externalChatId: `tg:${chatId}`,
    threadId: typeof message.message_id === 'number' ? String(message.message_id) : undefined,
    userId: `tg-chat:${chatId}`,
    userName: buildSenderName(message),
    message: extracted.message,
    tenantId: config.tenantId,
    projectId: config.projectId,
    idempotencyKey: `telegram:${update.update_id}`,
    riskLevel: extracted.riskLevel
  };
}

export async function handleTelegramBotInbound(
  service: OrchestratorService,
  body: unknown,
  config: TelegramInboundRuntimeConfig
): Promise<TelegramBotProcessResult> {
  const update = ensureUpdate(body);
  const message = ensureMessage(update);
  const chatId = String(message.chat.id);
  const replyToMessageId = typeof message.message_id === 'number' ? message.message_id : undefined;

  if (!isChatAllowed(chatId, config)) {
    return {
      handled: false,
      action: 'ignored',
      updateId: update.update_id,
      chatId,
      replyToMessageId,
      replyText: '当前会话未授权使用该机器人。'
    };
  }

  if (shouldIgnoreByAtRule(message, config)) {
    return {
      handled: false,
      action: 'ignored',
      updateId: update.update_id,
      chatId,
      replyToMessageId,
      replyText: '群聊请先 @机器人 再发送诉求。'
    };
  }

  const messageRaw = toText(message.text);
  if (!messageRaw) {
    return {
      handled: false,
      action: 'ignored',
      updateId: update.update_id,
      chatId,
      replyToMessageId,
      replyText: '仅支持文本消息，请发送文本诉求。'
    };
  }
  const messageText = cleanMessageContent(messageRaw, config.botUsername);
  if (!messageText) {
    return {
      handled: false,
      action: 'ignored',
      updateId: update.update_id,
      chatId,
      replyToMessageId,
      replyText: '请发送有效文本。'
    };
  }

  const senderId = `tg-user:${String(message.from?.id ?? message.chat.id)}`;
  const senderName = buildSenderName(message);
  if (config.agentRuntime) {
    try {
      const response = await config.agentRuntime.ask({
        channel: 'telegram',
        tenantId: config.tenantId,
        projectId: config.projectId,
        conversationId: chatId,
        userId: senderId,
        userName: senderName,
        text: messageText
      });
      return {
        handled: true,
        action: 'agent',
        updateId: update.update_id,
        chatId,
        replyToMessageId,
        replyText: response.text
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return {
        handled: true,
        action: 'agent',
        updateId: update.update_id,
        chatId,
        replyToMessageId,
        replyText: `我调用本机 Agent 时失败了：${messageText.slice(0, 180)}`
      };
    }
  }

  const command = parseCommand(messageText);

  if (command.type === 'status') {
    const detail = await service.getRequestDetail(command.requestId);
    return {
      handled: true,
      action: 'status',
      requestId: detail.request.id,
      state: detail.request.state,
      pendingApprovalId: detail.pendingApprovals[0]?.id,
      updateId: update.update_id,
      chatId,
      replyToMessageId,
      replyText: `当前进度：\n${summarizeDetail(detail)}\n\n${makeCommandHelp(detail.request.id, detail.pendingApprovals[0]?.id)}`
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
      updateId: update.update_id,
      chatId,
      replyToMessageId,
      replyText: `验收结果已记录：\n${summarizeDetail(detail)}\n\n${makeCommandHelp(detail.request.id, detail.pendingApprovals[0]?.id)}`
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
      updateId: update.update_id,
      chatId,
      replyToMessageId,
      replyText: `审批处理完成：\n${summarizeDetail(detail)}\n\n${makeCommandHelp(detail.request.id, detail.pendingApprovals[0]?.id)}`
    };
  }

  const webhookPayload = buildCreatePayload(update, message, command.intent, config);
  const created = await service.receiveWebhook('telegram', webhookPayload);
  const detail = await service.getRequestDetail(created.requestId);
  const pendingApprovalId = detail.pendingApprovals[0]?.id;
  return {
    handled: true,
    action: 'request',
    requestId: created.requestId,
    state: created.state,
    pendingApprovalId,
    updateId: update.update_id,
    chatId,
    replyToMessageId,
    replyText: `诉求已接收，AI乙方开始执行。\n${summarizeDetail(detail)}\n\n${makeCommandHelp(created.requestId, pendingApprovalId)}`
  };
}
