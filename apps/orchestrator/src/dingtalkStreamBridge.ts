import { randomUUID } from 'node:crypto';
import type { AgentRuntime } from './agentRuntime';
import type { DingtalkStreamCardConfig, DingtalkStreamConnectorConfig } from './connectorConfig';
import { handleDingtalkAppbotInbound, sendDingtalkSessionWebhook } from './dingtalkAppbot';
import type { DesktopAutomation } from './desktopAutomation';
import { DingtalkOpenApiClient } from './dingtalkOpenApi';
import type { OrchestratorService } from './orchestratorService';
import {
  DWClient,
  EventAck,
  TOPIC_AI_GRAPH_API,
  TOPIC_CARD,
  TOPIC_ROBOT,
  type DWClientDownStream,
  type EventAckData
} from 'dingtalk-stream';

type RunningBridge = {
  close: () => void;
};

type MessageDeduplicator = {
  isDuplicate: (key: string, now: number) => boolean;
  mark: (key: string, now: number) => void;
  unmark: (key: string) => void;
};

type DingtalkRobotPayload = {
  msgId?: string;
  conversationId?: string;
  conversationType?: string;
  senderStaffId?: string;
  senderUnionId?: string;
  senderId?: string;
  msgtype?: string;
  sessionWebhook?: string;
  robotCode?: string;
  [key: string]: unknown;
};

function toText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createMessageDeduplicator(ttlMs: number): MessageDeduplicator {
  const seen = new Map<string, number>();
  return {
    isDuplicate: (key, now) => {
      const last = seen.get(key);
      if (typeof last !== 'number') return false;
      return now - last < ttlMs;
    },
    mark: (key, now) => {
      seen.set(key, now);
      if (seen.size > 5000) {
        for (const [msgKey, ts] of seen) {
          if (now - ts >= ttlMs) seen.delete(msgKey);
        }
      }
    },
    unmark: (key) => {
      seen.delete(key);
    }
  };
}

function parseRobotMessage(message: DWClientDownStream): DingtalkRobotPayload | null {
  if (!message?.data) return null;
  try {
    const parsed = JSON.parse(message.data) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as DingtalkRobotPayload;
  } catch {
    return null;
  }
}

function splitForStreaming(text: string, chunkSize: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized) return ['（空回复）'];
  if (normalized.length <= chunkSize) return [normalized];
  const chunks: string[] = [];
  let current = '';
  const hardLimit = Math.max(chunkSize + 8, Math.round(chunkSize * 1.4));
  for (const char of normalized) {
    current += char;
    const hitSoftLimit = current.length >= chunkSize && /[，。！？!?；;\n]/.test(char);
    const hitHardLimit = current.length >= hardLimit;
    if (hitSoftLimit || hitHardLimit) {
      chunks.push(current);
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function makeOutTrackId(robotMessage: DingtalkRobotPayload): string {
  const msgId = toText(robotMessage.msgId)?.replace(/[^a-zA-Z0-9_-]/g, '') ?? 'msg';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return `specwave_${msgId.slice(0, 30)}_${suffix}`;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  return matches.map((url) => url.replace(/[.,;!?]+$/, ''));
}

function isLikelyImageUrl(url: string, fullText: string): boolean {
  const lowered = url.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(lowered)) return true;
  if (lowered.includes('picsum.photos')) return true;
  if (lowered.includes('pollinations.ai')) return true;
  if (lowered.includes('images.unsplash.com')) return true;
  if (/(图片|照片|壁纸|表情包|动图|image|photo|img)/i.test(fullText)) return true;
  return false;
}

function findFirstImageUrl(text: string): string | undefined {
  return extractUrls(text).find((url) => isLikelyImageUrl(url, text));
}

function stripImageUrls(text: string): string {
  const urls = extractUrls(text);
  let stripped = text;
  for (const url of urls) {
    if (isLikelyImageUrl(url, text)) {
      stripped = stripped.split(url).join(' ');
    }
  }
  return stripped
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractInboundText(robotMessage: DingtalkRobotPayload): string {
  const msgType = toText(robotMessage.msgtype)?.toLowerCase() ?? 'text';
  if (msgType === 'text') {
    const text = (robotMessage.text as { content?: unknown } | undefined)?.content;
    return toText(text) ?? '';
  }
  if (msgType === 'richtext') {
    const content = robotMessage.content as { richText?: Array<{ text?: unknown }> } | undefined;
    const richList = Array.isArray(content?.richText) ? content.richText : [];
    return richList
      .map((item) => toText(item.text))
      .filter((item): item is string => Boolean(item))
      .join('\n')
      .trim();
  }
  return '';
}

function hasImageGenerationIntent(text: string): boolean {
  if (!text) return false;
  return /(生图|画图|绘图|生成图片|生成一张图|给我一张图|来一张图|猫图|猫咪图|壁纸)/i.test(text);
}

function buildFallbackImageUrl(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  const finalPrompt = cleaned || '一只可爱的猫咪，插画风，高清';
  const seed = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&seed=${seed}&nologo=true`;
}

async function sendAiCardReply(
  openApiClient: DingtalkOpenApiClient,
  cardConfig: DingtalkStreamCardConfig,
  robotMessage: DingtalkRobotPayload,
  replyText: string
): Promise<void> {
  const robotCode = toText(robotMessage.robotCode);
  const conversationId = toText(robotMessage.conversationId);
  if (!robotCode || !conversationId) {
    throw new Error('消息缺少 robotCode 或 conversationId，无法投放 AI 卡片。');
  }
  const outTrackId = makeOutTrackId(robotMessage);
  const trackId = await openApiClient.createAndDeliverCard({
    cardTemplateId: cardConfig.cardTemplateId,
    outTrackId,
    streamKey: cardConfig.streamKey,
    initialContent: cardConfig.initialContent,
    conversationType: toText(robotMessage.conversationType),
    conversationId,
    robotCode,
    senderStaffId: toText(robotMessage.senderStaffId),
    senderUnionId: toText(robotMessage.senderUnionId),
    senderId: toText(robotMessage.senderId),
    callbackType: cardConfig.callbackType,
    callbackRouteKey: cardConfig.callbackRouteKey
  });

  const chunks = splitForStreaming(replyText, cardConfig.chunkSize);
  let fullText = '';
  for (let index = 0; index < chunks.length; index += 1) {
    fullText += chunks[index]!;
    const isLast = index === chunks.length - 1;
    await openApiClient.updateCardStreaming({
      outTrackId: trackId,
      key: cardConfig.streamKey,
      content: fullText,
      guid: randomUUID(),
      isFull: true,
      isFinalize: isLast,
      isError: false
    });
    if (!isLast) await sleep(cardConfig.chunkDelayMs);
  }
}

async function handleReplyDelivery(
  config: DingtalkStreamConnectorConfig,
  openApiClient: DingtalkOpenApiClient,
  robotMessage: DingtalkRobotPayload,
  replyText: string,
  sessionWebhook?: string
): Promise<'card' | 'image' | 'text' | 'skipped'> {
  const imageUrl = findFirstImageUrl(replyText);
  const robotCode = toText(robotMessage.robotCode);
  const conversationId = toText(robotMessage.conversationId);
  const isGroupConversation = toText(robotMessage.conversationType) === '2';
  if (imageUrl && robotCode && conversationId && isGroupConversation) {
    try {
      await openApiClient.sendGroupImageByUrl({
        openConversationId: conversationId,
        robotCode,
        imageUrl
      });
      const caption = stripImageUrls(replyText);
      if (caption && sessionWebhook) {
        await sendDingtalkSessionWebhook(sessionWebhook, caption);
      }
      return 'image';
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      console.error(`[orchestrator] dingtalk image send failed: ${messageText}`);
    }
  }

  const cardConfig = config.card;
  if (cardConfig?.enabled) {
    try {
      await sendAiCardReply(openApiClient, cardConfig, robotMessage, replyText);
      return 'card';
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      console.error(`[orchestrator] dingtalk ai-card send failed: ${messageText}`);
      if (!cardConfig.fallbackToSessionWebhook) {
        throw error;
      }
    }
  }
  if (sessionWebhook) {
    await sendDingtalkSessionWebhook(sessionWebhook, replyText);
    return 'text';
  }
  return 'skipped';
}

function handleRobotCallback(
  service: OrchestratorService,
  config: DingtalkStreamConnectorConfig,
  agentRuntime: AgentRuntime | undefined,
  desktopAutomation: DesktopAutomation | undefined,
  deduplicator: MessageDeduplicator,
  openApiClient: DingtalkOpenApiClient,
  message: DWClientDownStream
): void {
  const robotMessage = parseRobotMessage(message);
  if (!robotMessage) {
    console.log('[orchestrator] dingtalk stream robot payload ignored: invalid json');
    return;
  }
  console.log(
    `[orchestrator] dingtalk stream robot message msgId=${toText(robotMessage.msgId) ?? 'unknown'} conversationId=${toText(
      robotMessage.conversationId
    ) ?? 'unknown'} msgtype=${toText(robotMessage.msgtype) ?? 'unknown'}`
  );
  const messageKey =
    toText(robotMessage.msgId) && toText(robotMessage.conversationId)
      ? `${toText(robotMessage.conversationId)!}:${toText(robotMessage.msgId)!}`
      : undefined;
  const now = Date.now();
  if (messageKey && deduplicator.isDuplicate(messageKey, now)) {
    console.log(`[orchestrator] dingtalk stream duplicate message ignored key=${messageKey}`);
    return;
  }
  if (messageKey) deduplicator.mark(messageKey, now);

  void (async () => {
    try {
      const result = await handleDingtalkAppbotInbound(service, robotMessage, {
        tenantId: config.tenantId,
        projectId: config.projectId,
        requireAt: config.requireAt,
        botName: config.botName,
        agentRuntime,
        desktopAutomation,
        resolveDownloadUrl:
          config.media.resolveDownloadUrl === false
            ? undefined
            : async ({ downloadCode, robotCode }) => {
                return await openApiClient.downloadMessageFile(downloadCode, robotCode);
              }
      });

      const inboundText = extractInboundText(robotMessage);
      const shouldFallbackGenerateImage = hasImageGenerationIntent(inboundText) && !findFirstImageUrl(result.replyText);
      const replyText = shouldFallbackGenerateImage
        ? `${result.replyText.trim()}\n\n${buildFallbackImageUrl(inboundText)}`
        : result.replyText;

      const deliveredBy = await handleReplyDelivery(
        config,
        openApiClient,
        robotMessage,
        replyText,
        result.sessionWebhook
      );
      console.log(
        `[orchestrator] dingtalk stream handled action=${result.action} requestId=${result.requestId ?? 'n/a'} handled=${
          result.handled
        } deliveredBy=${deliveredBy}`
      );
    } catch (error) {
      if (messageKey) deduplicator.unmark(messageKey);
      const messageText = error instanceof Error ? error.message : String(error);
      console.error(`[orchestrator] dingtalk stream message handle failed: ${messageText}`);
    }
  })();
}

export async function startDingtalkStreamBridge(
  service: OrchestratorService,
  config: DingtalkStreamConnectorConfig,
  agentRuntime?: AgentRuntime,
  desktopAutomation?: DesktopAutomation
): Promise<RunningBridge> {
  const enableDebug = process.env.SPECWAVE_DINGTALK_STREAM_DEBUG === 'true';
  const dedupeTtlMs = Number(process.env.SPECWAVE_DINGTALK_STREAM_DEDUP_TTL_MS ?? '300000');
  const deduplicator = createMessageDeduplicator(Number.isFinite(dedupeTtlMs) && dedupeTtlMs > 0 ? dedupeTtlMs : 300000);
  const openApiClient = new DingtalkOpenApiClient(config.clientId, config.clientSecret, config.apiBaseUrl);
  const client = new DWClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    debug: enableDebug,
    keepAlive: true
  });

  client.registerAllEventListener((message): EventAckData => {
    console.log(`[orchestrator] dingtalk stream EVENT topic=${message.headers.topic}`);
    return { status: EventAck.SUCCESS };
  });

  client.registerCallbackListener(TOPIC_ROBOT, (message): void => {
    console.log(`[orchestrator] dingtalk stream CALLBACK topic=${message.headers.topic}`);
    handleRobotCallback(service, config, agentRuntime, desktopAutomation, deduplicator, openApiClient, message);
  });

  client.registerCallbackListener(TOPIC_CARD, (message): void => {
    console.log(`[orchestrator] dingtalk stream CALLBACK topic=${message.headers.topic} (card)`); // 便于识别卡片回调是否已到达
  });

  client.registerCallbackListener(TOPIC_AI_GRAPH_API, (message): void => {
    console.log(`[orchestrator] dingtalk stream CALLBACK topic=${message.headers.topic} (ai-graph)`); // 便于识别 AI 应用消息是否走图 API 回调
  });

  await client.connect();
  console.log('[orchestrator] dingtalk stream bridge connected');

  return {
    close: () => {
      client.disconnect();
    }
  };
}
