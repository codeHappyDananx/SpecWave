import { describe, expect, it } from 'vitest';
import { normalizeChannelWebhook } from './channelAdapters';

describe('normalizeChannelWebhook', () => {
  it('支持 webchat 归一化', () => {
    const normalized = normalizeChannelWebhook('webchat', {
      chatId: 'chat-1',
      user: { id: 'u-1', name: '张三' },
      text: '我要一个自动交付系统',
      tenantId: 'tenant-a',
      projectId: 'proj-a',
      idempotencyKey: 'idem-web-1'
    });

    expect(normalized.externalChatId).toBe('chat-1');
    expect(normalized.userId).toBe('u-1');
    expect(normalized.message).toContain('自动交付');
  });

  it('支持钉钉归一化', () => {
    const normalized = normalizeChannelWebhook('dingtalk', {
      conversationId: 'conv-1',
      msgId: 'msg-1',
      senderUserId: 'ding-u-1',
      senderNick: '李四',
      text: { content: '请推进结果交付' },
      tenantId: 'tenant-a',
      projectId: 'proj-a'
    });

    expect(normalized.externalChatId).toBe('conv-1');
    expect(normalized.idempotencyKey).toBe('dingtalk:msg-1');
    expect(normalized.userName).toBe('李四');
  });

  it('支持企微归一化', () => {
    const normalized = normalizeChannelWebhook('wecom', {
      conversationId: 'w-conv-1',
      msgid: 'w-msg-1',
      from: 'wecom-u-1',
      fromName: '王五',
      content: '我要看结果卡',
      tenantId: 'tenant-a',
      projectId: 'proj-a'
    });

    expect(normalized.idempotencyKey).toBe('wecom:w-msg-1');
    expect(normalized.message).toBe('我要看结果卡');
  });

  it('支持 Telegram 归一化', () => {
    const normalized = normalizeChannelWebhook('telegram', {
      update_id: 123,
      message: {
        message_id: 456,
        chat: { id: 9999 },
        from: { id: 8888, first_name: 'Alice', username: 'alice' },
        text: 'Please deliver final result'
      },
      tenantId: 'tenant-a',
      projectId: 'proj-a'
    });

    expect(normalized.externalChatId).toBe('tg:9999');
    expect(normalized.idempotencyKey).toBe('telegram:123');
  });
});
