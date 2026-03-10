import { describe, expect, it } from 'vitest';
import {
  createDesktopAutomation,
  formatDesktopAutomationReply,
  looksLikeDesktopAutomationIntent,
  parseDesktopIntent,
  type DesktopScriptPayload
} from './desktopAutomation';
import { extractChatCandidatesFromOcrText } from './desktopChatOcr';

describe('desktopAutomation', () => {
  it('可以识别打开应用诉求', () => {
    const intent = parseDesktopIntent('帮我打开微信');
    expect(intent?.kind).toBe('open_app');
    if (!intent || intent.kind !== 'open_app') {
      throw new Error('intent mismatch');
    }
    expect(intent.appId).toBe('wechat');
  });

  it('可以识别聊天软件发消息诉求', () => {
    const intent = parseDesktopIntent('帮我在微信里给黄雨瑶发一句今晚晚点回去');
    expect(intent?.kind).toBe('send_chat_message');
    if (!intent || intent.kind !== 'send_chat_message') {
      throw new Error('intent mismatch');
    }
    expect(intent.appId).toBe('wechat');
    expect(intent.target).toBe('黄雨瑶');
    expect(intent.targetMode).toBe('named');
    expect(intent.content).toBe('今晚晚点回去');
  });

  it('可以识别相对联系人诉求并避免把它当成搜索词', () => {
    const intent = parseDesktopIntent('打开微信给第一个联系人发一个信息 你好早上好');
    expect(intent?.kind).toBe('send_chat_message');
    if (!intent || intent.kind !== 'send_chat_message') {
      throw new Error('intent mismatch');
    }
    expect(intent.appId).toBe('wechat');
    expect(intent.target).toBe('第一个联系人');
    expect(intent.targetMode).toBe('recent_index');
    expect(intent.targetIndex).toBe(1);
    expect(intent.content).toBe('你好早上好');
  });

  it('会清理消息动作里的冗余口令', () => {
    const intent = parseDesktopIntent('帮我在微信里给黄雨瑶发一条消息 你好');
    expect(intent?.kind).toBe('send_chat_message');
    if (!intent || intent.kind !== 'send_chat_message') {
      throw new Error('intent mismatch');
    }
    expect(intent.content).toBe('你好');
  });

  it('可以识别模糊联系人并标记为待补全', () => {
    const intent = parseDesktopIntent('帮我在微信里给某人发一条消息 你好');
    expect(intent?.kind).toBe('send_chat_message');
    if (!intent || intent.kind !== 'send_chat_message') {
      throw new Error('intent mismatch');
    }
    expect(intent.target).toBe('某人');
    expect(intent.targetMode).toBe('ambiguous');
    expect(intent.content).toBe('你好');
  });

  it('可以识别邮件诉求', () => {
    const intent = parseDesktopIntent('给 test@example.com 发邮件 主题: 周报 内容: 今天已完成联调');
    expect(intent?.kind).toBe('compose_mail');
    if (!intent || intent.kind !== 'compose_mail') {
      throw new Error('intent mismatch');
    }
    expect(intent.to).toBe('test@example.com');
    expect(intent.subject).toBe('周报');
    expect(intent.body).toContain('今天已完成联调');
  });

  it('会把自然语言转换成脚本动作并执行', async () => {
    let payload: DesktopScriptPayload | undefined;
    const automation = createDesktopAutomation(
      {
        enabled: true,
        backend: 'powershell',
        timeoutMs: 5000,
        preferredBrowser: 'default',
        dryRun: false
      },
      async (input) => {
        payload = input;
        return {
          ok: true,
          verified: true,
          summary: '已执行',
          evidence: ['窗口：微信'],
          diagnostics: []
        };
      }
    );

    const result = await automation.executeText('帮我打开微信');
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(payload).toEqual({
      action: 'open-app',
      appId: 'wechat',
      displayName: '微信',
      preferredBrowser: 'default'
    });
  });

  it('会把相对联系人模式透传给脚本执行器', async () => {
    let payload: DesktopScriptPayload | undefined;
    const automation = createDesktopAutomation(
      {
        enabled: true,
        backend: 'powershell',
        timeoutMs: 5000,
        preferredBrowser: 'default',
        dryRun: false
      },
      async (input) => {
        payload = input;
        return {
          ok: false,
          verified: false,
          summary: '已安全拦截',
          evidence: [],
          diagnostics: []
        };
      }
    );

    await automation.executeText('打开微信给第一个联系人发一个信息 你好早上好');
    expect(payload).toEqual({
      action: 'send-chat-message',
      appId: 'wechat',
      displayName: '微信',
      target: '第一个联系人',
      targetMode: 'recent_index',
      targetIndex: 1,
      content: '你好早上好'
    });
  });

  it('会从桌面截图识别候选联系人并给出建议目标', async () => {
    let payload: DesktopScriptPayload | undefined;
    const automation = createDesktopAutomation(
      {
        enabled: true,
        backend: 'powershell',
        timeoutMs: 5000,
        preferredBrowser: 'default',
        dryRun: false
      },
      async (input) => {
        payload = input;
        return {
          ok: true,
          verified: true,
          summary: '已抓图',
          evidence: ['窗口：微信'],
          diagnostics: [],
          screenshotPath: 'F:/fake/wechat.png'
        };
      },
      async () => ({
        rawText: '小黄老师\nOC统计群\nCode Link VIP',
        candidates: ['小黄老师', 'OC统计群', 'Code Link VIP'],
        suggestedTarget: '小黄老师',
        diagnostics: []
      })
    );

    const intent = parseDesktopIntent('打开微信给第一个联系人发一个信息 你好早上好');
    if (!intent || intent.kind !== 'send_chat_message') {
      throw new Error('intent mismatch');
    }
    const result = await automation.suggestChatTargets(intent);
    expect(payload).toEqual({
      action: 'capture-chat-candidates',
      appId: 'wechat',
      displayName: '微信'
    });
    expect(result.suggestedTarget).toBe('小黄老师');
    expect(result.candidates).toEqual(['小黄老师', 'OC统计群', 'Code Link VIP']);
  });

  it('会对不支持的桌面诉求给出明确提示', async () => {
    const automation = createDesktopAutomation(
      {
        enabled: true,
        backend: 'powershell',
        timeoutMs: 5000,
        preferredBrowser: 'default',
        dryRun: false
      },
      async () => {
        throw new Error('不应该执行');
      }
    );

    const result = await automation.executeText('帮我点一下那个按钮');
    expect(result.matched).toBe(false);
    expect(result.summary).toContain('还不在当前支持范围');
  });

  it('聊天发送只有回读到新增消息才算成功', async () => {
    const automation = createDesktopAutomation(
      {
        enabled: true,
        backend: 'powershell',
        timeoutMs: 5000,
        preferredBrowser: 'default',
        dryRun: false
      },
      async (payload) => {
        if (payload.action === 'prepare-chat-target') {
          return {
            ok: true,
            verified: true,
            summary: '已切到目标会话。',
            evidence: ['窗口：微信', '联系人：黄雨瑶'],
            diagnostics: []
          };
        }
        return {
          ok: true,
          verified: false,
          summary: '已触发微信发送流程，等待界面回读校验。',
          evidence: ['窗口：微信'],
          diagnostics: ['已生成发送后截图'],
          chatAfterScreenshotPath: 'F:/fake/after.png'
        };
      },
      async () => ({
        rawText: '',
        candidates: [],
        diagnostics: []
      }),
      async () => ({
        ok: false,
        verified: false,
        summary: '已经尝试在 微信 打开 黄雨瑶 的会话，但没有从聊天区回读到新增消息。',
        evidence: ['窗口：微信', '发送后截图：F:/fake/after.png'],
        diagnostics: ['聊天区回读里没有看到新增的消息内容，先按未发送成功处理。']
      })
    );

    const result = await automation.executeText('帮我在微信里给黄雨瑶发一句你好早上好');
    expect(result.ok).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.summary).toContain('没有从聊天区回读到新增消息');
  });

  it('聊天发送回读成功后才返回真正完成', async () => {
    const automation = createDesktopAutomation(
      {
        enabled: true,
        backend: 'powershell',
        timeoutMs: 5000,
        preferredBrowser: 'default',
        dryRun: false
      },
      async (payload) => {
        if (payload.action === 'prepare-chat-target') {
          return {
            ok: true,
            verified: true,
            summary: '已切到目标会话。',
            evidence: ['窗口：微信', '联系人：黄雨瑶'],
            diagnostics: []
          };
        }
        return {
          ok: true,
          verified: false,
          summary: '已触发微信发送流程，等待界面回读校验。',
          evidence: ['窗口：微信'],
          diagnostics: ['已生成发送后截图'],
          chatAfterScreenshotPath: 'F:/fake/after.png'
        };
      },
      async () => ({
        rawText: '',
        candidates: [],
        diagnostics: []
      }),
      async () => ({
        ok: true,
        verified: true,
        summary: '已在 微信 向 黄雨瑶 发出消息。',
        evidence: ['窗口：微信', '发送后截图：F:/fake/after.png'],
        diagnostics: []
      })
    );

    const result = await automation.executeText('帮我在微信里给黄雨瑶发一句你好早上好');
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.summary).toContain('已在 微信 向 黄雨瑶 发出消息');
  });

  it('会把未确认最终状态的执行结果格式化给用户', () => {
    const text = formatDesktopAutomationReply({
      matched: true,
      ok: true,
      verified: false,
      summary: '已触发发送流程。',
      evidence: ['窗口：微信'],
      diagnostics: ['等待 OCR 回读']
    });
    expect(text).toContain('还不能确认界面最终状态');
    expect(text).toContain('窗口：微信');
  });

  it('会识别桌面自动化意图', () => {
    expect(looksLikeDesktopAutomationIntent('帮我打开飞书')).toBe(true);
    expect(looksLikeDesktopAutomationIntent('今天天气不错')).toBe(false);
  });

  it('会从 OCR 文本里提取联系人候选', () => {
    const candidates = extractChatCandidatesFromOcrText(`HAE 周六不行.。 ©:\n2  小黄老师\nOC统计群         ny!\nBe? Code Link VIP\nye codex交流10..\nBea’ JAVA 交流\n} 微信游戏`);
    expect(candidates).toContain('周六不行');
    expect(candidates).toContain('小黄老师');
    expect(candidates).toContain('OC统计群');
    expect(candidates).toContain('Code Link VIP');
  });
});
