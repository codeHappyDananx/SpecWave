import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { AgentRuntime } from './agentRuntime';
import type { DesktopAutomation } from './desktopAutomation';
import type { OrchestratorStateSnapshot, OrchestratorStateStore } from './orchestratorService';
import { OrchestratorService } from './orchestratorService';
import { handleDingtalkAppbotInbound, sendDingtalkSessionWebhook, verifyDingtalkAppbotSignature } from './dingtalkAppbot';

class MemoryStore implements OrchestratorStateStore {
  snapshot: OrchestratorStateSnapshot | null = null;

  async load(): Promise<OrchestratorStateSnapshot | null> {
    return this.snapshot;
  }

  async save(snapshot: OrchestratorStateSnapshot): Promise<void> {
    this.snapshot = JSON.parse(JSON.stringify(snapshot)) as OrchestratorStateSnapshot;
  }
}

function makeService() {
  const store = new MemoryStore();
  let seq = 0;
  const service = new OrchestratorService(store, {
    now: () => new Date('2026-03-04T00:00:00.000Z'),
    idFactory: () => `id-${String(++seq).padStart(4, '0')}`
  });
  return { service };
}

describe('dingtalkAppbot', () => {
  it('可以校验钉钉入站签名', () => {
    const secret = 'SEC-sign-test';
    const timestamp = '1760000000000';
    const sign = createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64');
    const ok = verifyDingtalkAppbotSignature(
      {
        timestamp,
        sign: encodeURIComponent(sign)
      },
      secret
    );
    expect(ok).toBe(true);
  });

  it('收到普通文本后会创建请求并返回会话回复文本', async () => {
    const { service } = makeService();
    await service.initialize();
    const result = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-1',
        msgId: 'msg-1',
        senderStaffId: 'staff-1',
        senderNick: '张三',
        conversationType: '2',
        text: { content: '请帮我做一个结果导向交付流程' },
        sessionWebhook: 'http://example.com/session'
      },
      {
        tenantId: 'tenant-a',
        projectId: 'proj-a',
        requireAt: true
      }
    );
    expect(result.handled).toBe(true);
    expect(result.action).toBe('request');
    expect(result.requestId).toBeTruthy();
    expect(result.replyText).toContain('诉求已接收');
    expect(result.replyText).toContain('工单：');
  });

  it('支持状态查询命令与@规则忽略', async () => {
    const { service } = makeService();
    await service.initialize();
    const created = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-2',
        msgId: 'msg-2',
        senderStaffId: 'staff-2',
        senderNick: '李四',
        conversationType: '2',
        text: { content: '我要自动开发自动测试' }
      },
      {
        tenantId: 'tenant-b',
        projectId: 'proj-b',
        requireAt: true
      }
    );
    const ignored = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-group',
        msgId: 'msg-group',
        senderStaffId: 'staff-2',
        conversationType: '1',
        isInAtList: false,
        text: { content: '状态 req_xxx' }
      },
      {
        tenantId: 'tenant-b',
        projectId: 'proj-b',
        requireAt: true
      }
    );
    expect(ignored.handled).toBe(false);
    expect(ignored.action).toBe('ignored');

    const query = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-2',
        msgId: 'msg-3',
        senderStaffId: 'staff-2',
        senderNick: '李四',
        conversationType: '2',
        text: { content: `状态 ${created.requestId}` }
      },
      {
        tenantId: 'tenant-b',
        projectId: 'proj-b',
        requireAt: true
      }
    );
    expect(query.action).toBe('status');
    expect(query.replyText).toContain(created.requestId!);
  });

  it('启用 agentRuntime 后会转发本机 agent 回复', async () => {
    const { service } = makeService();
    await service.initialize();
    const runtime: AgentRuntime = {
      ask: async (message) => {
        expect(message.channel).toBe('dingtalk');
        expect(message.text).toBe('帮我做一个发布提醒机器人');
        return {
          text: '好的，我先整理需求，再给你可确认的计划。',
          backend: 'codex',
          durationMs: 5
        };
      }
    };

    const result = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-1',
        msgId: 'msg-agent-1',
        senderStaffId: 'staff-9',
        senderNick: '王五',
        conversationType: '2',
        text: { content: '帮我做一个发布提醒机器人' }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime
      }
    );

    expect(result.handled).toBe(true);
    expect(result.action).toBe('agent');
    expect(result.replyText).toContain('先整理需求');

    const metrics = await service.getMetricsSummary();
    expect(metrics.totalRequests).toBe(0);
  });

  it('启用 agentRuntime 时在吗也会走 agent（不走固定话术）', async () => {
    const { service } = makeService();
    await service.initialize();
    const runtime: AgentRuntime = {
      ask: async (message) => ({
        text: `agent:${message.text}`,
        backend: 'claude',
        durationMs: 3
      })
    };

    const result = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-2',
        msgId: 'msg-agent-2',
        senderStaffId: 'staff-10',
        senderNick: '小李',
        conversationType: '2',
        text: { content: '在吗' }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime
      }
    );

    expect(result.action).toBe('agent');
    expect(result.replyText).toBe('agent:在吗');
  });

  it('支持 picture 消息并可附带下载链接上下文给 agent', async () => {
    const { service } = makeService();
    await service.initialize();
    let capturedText = '';
    const runtime: AgentRuntime = {
      ask: async (message) => {
        capturedText = message.text;
        return {
          text: '已收到图片。',
          backend: 'codex',
          durationMs: 3
        };
      }
    };

    const result = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-picture',
        msgId: 'msg-agent-picture',
        conversationType: '2',
        senderStaffId: 'staff-88',
        senderNick: '图文用户',
        robotCode: 'ding-bot-code',
        msgtype: 'picture',
        content: {
          downloadCode: 'download-code-001'
        }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime,
        resolveDownloadUrl: async ({ downloadCode, robotCode }) => {
          expect(downloadCode).toBe('download-code-001');
          expect(robotCode).toBe('ding-bot-code');
          return 'https://download.example.com/file1.png';
        }
      }
    );

    expect(result.action).toBe('agent');
    expect(result.replyText).toContain('已收到图片');
    expect(capturedText).toContain('用户发送了一张图片');
    expect(capturedText).toContain('下载链接：https://download.example.com/file1.png');
  });

  it('支持 richText 消息（文本 + 图片）并保持 emoji 文本', async () => {
    const { service } = makeService();
    await service.initialize();
    let capturedText = '';
    const runtime: AgentRuntime = {
      ask: async (message) => {
        capturedText = message.text;
        return {
          text: '富文本已处理。',
          backend: 'claude',
          durationMs: 2
        };
      }
    };

    const result = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-rich',
        msgId: 'msg-agent-rich',
        conversationType: '2',
        senderStaffId: 'staff-89',
        senderNick: '富文本用户',
        robotCode: 'ding-bot-code',
        msgtype: 'richText',
        content: {
          richText: [
            { text: '今天不错 😄' },
            { type: 'picture', downloadCode: 'download-code-002' }
          ]
        }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime,
        resolveDownloadUrl: async () => 'https://download.example.com/file2.png'
      }
    );

    expect(result.action).toBe('agent');
    expect(result.replyText).toContain('富文本已处理');
    expect(capturedText).toContain('今天不错 😄');
    expect(capturedText).toContain('附件1（picture）');
    expect(capturedText).toContain('https://download.example.com/file2.png');
  });

  it('桌面自动化诉求在未接执行器时会明确提示未执行', async () => {
    const { service } = makeService();
    await service.initialize();
    let runtimeCalled = false;
    const runtime: AgentRuntime = {
      ask: async () => {
        runtimeCalled = true;
        return {
          text: '假装执行成功',
          backend: 'codex',
          durationMs: 1
        };
      }
    };

    const result = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-desktop',
        msgId: 'msg-agent-desktop',
        conversationType: '2',
        senderStaffId: 'staff-90',
        senderNick: '自动化用户',
        text: { content: '帮我打开微信窗口并给黄雨瑶发你好' }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime
      }
    );

    expect(result.action).toBe('agent');
    expect(result.replyText).toContain('没有执行');
    expect(runtimeCalled).toBe(false);
  });

  it('模糊联系人时会先追问联系人名而不是直接执行', async () => {
    const { service } = makeService();
    await service.initialize();
    let runtimeCalled = false;
    let desktopCalled = false;
    const runtime: AgentRuntime = {
      ask: async () => {
        runtimeCalled = true;
        return {
          text: '不应该走到这里',
          backend: 'codex',
          durationMs: 1
        };
      }
    };
    const desktopAutomation: DesktopAutomation = {
      canHandle: () => true,
      executeText: async () => {
        desktopCalled = true;
        return {
          matched: true,
          ok: true,
          verified: true,
          summary: '不应该执行',
          evidence: [],
          diagnostics: []
        };
      },
      suggestChatTargets: async () => ({
        ok: true,
        verified: true,
        summary: '已读取候选',
        suggestedTarget: undefined,
        candidates: ['小黄老师', 'OC统计群', 'Code Link VIP'],
        evidence: ['窗口：微信'],
        diagnostics: []
      }),
      selfTest: async () => ({
        ok: true,
        verified: true,
        summary: '自测通过',
        evidence: [],
        diagnostics: []
      })
    };

    const result = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-desktop-clarify',
        msgId: 'msg-agent-desktop-clarify-1',
        conversationType: '2',
        senderStaffId: 'staff-190',
        senderNick: '自动化用户',
        text: { content: '帮我在微信里给某人发一句你好' }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime,
        desktopAutomation
      }
    );

    expect(result.action).toBe('agent');
    expect(result.replyText).toContain('我当前读到的候选有');
    expect(result.replyText).toContain('1. 小黄老师');
    expect(result.replyText).toContain('你好');
    expect(runtimeCalled).toBe(false);
    expect(desktopCalled).toBe(false);
  });

  it('补全联系人名后会继续执行上一条桌面发送诉求', async () => {
    const { service } = makeService();
    await service.initialize();
    let runtimeCalled = false;
    const desktopCalls: string[] = [];
    const runtime: AgentRuntime = {
      ask: async () => {
        runtimeCalled = true;
        return {
          text: '不应该走到这里',
          backend: 'codex',
          durationMs: 1
        };
      }
    };
    const desktopAutomation: DesktopAutomation = {
      canHandle: () => true,
      executeText: async (text) => {
        desktopCalls.push(text);
        return {
          matched: true,
          ok: true,
          verified: true,
          summary: `已打开微信并执行：${text}`,
          evidence: ['窗口：微信'],
          diagnostics: []
        };
      },
      suggestChatTargets: async () => ({
        ok: true,
        verified: true,
        summary: '已读取候选',
        suggestedTarget: '小黄老师',
        candidates: ['小黄老师', 'OC统计群', 'Code Link VIP'],
        evidence: ['窗口：微信'],
        diagnostics: []
      }),
      selfTest: async () => ({
        ok: true,
        verified: true,
        summary: '自测通过',
        evidence: [],
        diagnostics: []
      })
    };

    const firstReply = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-desktop-follow',
        msgId: 'msg-agent-desktop-follow-1',
        conversationType: '2',
        senderStaffId: 'staff-191',
        senderNick: '自动化用户',
        text: { content: '打开微信给第一个联系人发一个信息 你好早上好' }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime,
        desktopAutomation
      }
    );
    expect(firstReply.replyText).toContain('大概率是「小黄老师」');
    expect(firstReply.replyText).toContain('1. 小黄老师');
    expect(desktopCalls).toHaveLength(0);

    const secondReply = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-desktop-follow',
        msgId: 'msg-agent-desktop-follow-2',
        conversationType: '2',
        senderStaffId: 'staff-191',
        senderNick: '自动化用户',
        text: { content: '是' }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime,
        desktopAutomation
      }
    );

    expect(desktopCalls).toEqual(['帮我在微信里给小黄老师发一句“你好早上好”']);
    expect(secondReply.replyText).toContain('已经执行完了');
    expect(secondReply.replyText).toContain('窗口：微信');
    expect(runtimeCalled).toBe(false);
  });

  it('桌面自动化诉求接入执行器后会真实走本机执行链路', async () => {
    const { service } = makeService();
    await service.initialize();
    let runtimeCalled = false;
    const runtime: AgentRuntime = {
      ask: async () => {
        runtimeCalled = true;
        return {
          text: '不应该走到这里',
          backend: 'codex',
          durationMs: 1
        };
      }
    };
    const desktopAutomation: DesktopAutomation = {
      canHandle: () => true,
      executeText: async (text) => ({
        matched: true,
        ok: true,
        verified: true,
        summary: `已打开微信并执行：${text}`,
        evidence: ['窗口：微信'],
        diagnostics: []
      }),
      suggestChatTargets: async () => ({
        ok: true,
        verified: true,
        summary: '已读取候选',
        suggestedTarget: undefined,
        candidates: [],
        evidence: [],
        diagnostics: []
      }),
      selfTest: async () => ({
        ok: true,
        verified: true,
        summary: '自测通过',
        evidence: [],
        diagnostics: []
      })
    };

    const result = await handleDingtalkAppbotInbound(
      service,
      {
        conversationId: 'cid-agent-desktop-ok',
        msgId: 'msg-agent-desktop-ok',
        conversationType: '2',
        senderStaffId: 'staff-91',
        senderNick: '自动化用户',
        text: { content: '帮我打开微信' }
      },
      {
        tenantId: 'tenant-z',
        projectId: 'proj-z',
        requireAt: true,
        agentRuntime: runtime,
        desktopAutomation
      }
    );

    expect(result.action).toBe('agent');
    expect(result.replyText).toContain('已经执行完了');
    expect(result.replyText).toContain('窗口：微信');
    expect(runtimeCalled).toBe(false);
  });

  it('发送图片链接时会下发 markdown 图片消息', async () => {
    const requests: string[] = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      requests.push(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errcode: 0, errmsg: 'ok' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await sendDingtalkSessionWebhook(
        `http://127.0.0.1:${port}/session`,
        '好的，给你一张随机图片，点开就能看：https://picsum.photos/1200/800'
      );
      expect(requests.length).toBe(1);
      expect(requests[0]).toContain('"msgtype":"markdown"');
      expect(requests[0]).toContain('![](');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('普通文本仍使用 text 消息发送', async () => {
    let payload = '';
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      payload = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errcode: 0, errmsg: 'ok' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await sendDingtalkSessionWebhook(`http://127.0.0.1:${port}/session`, '这是普通文本回复');
      expect(payload).toContain('"msgtype":"text"');
      expect(payload).toContain('这是普通文本回复');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('图片链接为重定向地址时会解析为最终直链', async () => {
    let sessionPayload = '';
    const server = createServer(async (req, res) => {
      if (req.url === '/redirect-img') {
        res.writeHead(302, { Location: '/final-img.jpg' });
        res.end();
        return;
      }
      if (req.url === '/final-img.jpg') {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end('fake-image-bytes');
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      sessionPayload = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errcode: 0, errmsg: 'ok' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await sendDingtalkSessionWebhook(
        `http://127.0.0.1:${port}/session`,
        `给我来一张图：http://127.0.0.1:${port}/redirect-img`
      );
      expect(sessionPayload).toContain('"msgtype":"markdown"');
      expect(sessionPayload).toContain(`![](http://127.0.0.1:${port}/final-img.jpg)`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
