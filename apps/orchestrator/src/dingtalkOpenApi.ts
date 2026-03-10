export type DingtalkCardCallbackType = 'STREAM' | 'HTTP';

export type DingtalkCreateCardInput = {
  cardTemplateId: string;
  outTrackId: string;
  streamKey: string;
  initialContent: string;
  conversationType?: string;
  conversationId: string;
  robotCode: string;
  senderStaffId?: string;
  senderUnionId?: string;
  senderId?: string;
  callbackType: DingtalkCardCallbackType;
  callbackRouteKey?: string;
};

export type DingtalkUpdateCardInput = {
  outTrackId: string;
  key: string;
  content: string;
  guid: string;
  isFull: boolean;
  isFinalize: boolean;
  isError?: boolean;
};

export type DingtalkSendGroupImageInput = {
  openConversationId: string;
  robotCode: string;
  imageUrl: string;
};

type AccessTokenCache = {
  accessToken: string;
  expireAt: number;
};

type OpenApiResultBody = {
  code?: unknown;
  message?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
  success?: unknown;
  result?: unknown;
  accessToken?: unknown;
  expireIn?: unknown;
  downloadUrl?: unknown;
};

function toText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function extensionFromContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('image/png')) return 'png';
  if (normalized.includes('image/webp')) return 'webp';
  if (normalized.includes('image/gif')) return 'gif';
  if (normalized.includes('image/bmp')) return 'bmp';
  if (normalized.includes('image/svg')) return 'svg';
  return 'jpg';
}

export class DingtalkOpenApiClient {
  private readonly baseUrl: string;
  private readonly oapiBaseUrl: string;
  private tokenCache?: AccessTokenCache;

  constructor(
    private readonly appKey: string,
    private readonly appSecret: string,
    apiBaseUrl: string,
    private readonly timeoutMs: number = 12000
  ) {
    this.baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
    this.oapiBaseUrl = this.baseUrl.includes('api.dingtalk.com')
      ? this.baseUrl.replace('api.dingtalk.com', 'oapi.dingtalk.com')
      : 'https://oapi.dingtalk.com';
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.tokenCache && now < this.tokenCache.expireAt - 60_000) {
      return this.tokenCache.accessToken;
    }
    const response = await fetch(`${this.baseUrl}/v1.0/oauth2/accessToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appKey: this.appKey,
        appSecret: this.appSecret
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    const body = await this.readBody(response);
    if (!response.ok) {
      throw new Error(`dingtalk accessToken HTTP ${response.status} ${this.describeError(body).slice(0, 240)}`);
    }
    const accessToken = toText(body.accessToken);
    if (!accessToken) {
      throw new Error(`dingtalk accessToken 响应缺少 accessToken：${JSON.stringify(body).slice(0, 240)}`);
    }
    const expireInRaw = body.expireIn;
    const expireIn = typeof expireInRaw === 'number' && Number.isFinite(expireInRaw) ? expireInRaw : 7200;
    this.tokenCache = {
      accessToken,
      expireAt: now + Math.max(60, expireIn) * 1000
    };
    return accessToken;
  }

  async createAndDeliverCard(input: DingtalkCreateCardInput): Promise<string> {
    const isGroup = input.conversationType === '2';
    const spaceType = isGroup ? 'IM_GROUP' : 'IM_ROBOT';
    const spaceId = isGroup ? input.conversationId : input.senderStaffId ?? input.senderUnionId ?? input.senderId;
    if (!spaceId) {
      throw new Error('创建 AI 卡片失败：单聊场景缺少 senderStaffId/senderUnionId/senderId。');
    }
    const cardParamMap: Record<string, string> = {
      [input.streamKey]: input.initialContent
    };
    const payload: Record<string, unknown> = {
      cardTemplateId: input.cardTemplateId,
      outTrackId: input.outTrackId,
      callbackType: input.callbackType,
      cardData: { cardParamMap },
      openSpaceId: `dtv1.card//${spaceType}.${spaceId}`
    };
    if (input.callbackType === 'HTTP' && input.callbackRouteKey) {
      payload.callbackRouteKey = input.callbackRouteKey;
    }
    if (input.senderStaffId) {
      payload.userId = input.senderStaffId;
    }
    if (isGroup) {
      payload.imGroupOpenDeliverModel = { robotCode: input.robotCode };
    } else {
      payload.imRobotOpenDeliverModel = {
        robotCode: input.robotCode,
        spaceType: 'IM_ROBOT'
      };
    }

    const body = await this.callOpenApi('POST', '/v1.0/card/instances/createAndDeliver', payload);
    const success = body.success;
    if (typeof success === 'boolean' && !success) {
      throw new Error(`创建 AI 卡片失败：${this.describeError(body)}`);
    }
    const result = toRecord(body.result);
    return toText(result.outTrackId) ?? input.outTrackId;
  }

  async updateCardStreaming(input: DingtalkUpdateCardInput): Promise<void> {
    const body = await this.callOpenApi('PUT', '/v1.0/card/streaming', {
      outTrackId: input.outTrackId,
      guid: input.guid,
      key: input.key,
      content: input.content,
      isFull: input.isFull,
      isFinalize: input.isFinalize,
      isError: input.isError ?? false
    });
    const success = body.success;
    const result = body.result;
    if ((typeof success === 'boolean' && !success) || (typeof result === 'boolean' && !result)) {
      throw new Error(`AI 卡片流式更新失败：${this.describeError(body)}`);
    }
  }

  async downloadMessageFile(downloadCode: string, robotCode: string): Promise<string | undefined> {
    const body = await this.callOpenApi('POST', '/v1.0/robot/messageFiles/download', {
      downloadCode,
      robotCode
    });
    return toText(body.downloadUrl);
  }

  async sendGroupImageByUrl(input: DingtalkSendGroupImageInput): Promise<void> {
    const downloaded = await this.downloadImageBytes(input.imageUrl);
    const mediaId = await this.uploadImageMedia(downloaded.bytes, downloaded.contentType);
    await this.callOpenApi('POST', '/v1.0/robot/groupMessages/send', {
      msgKey: 'sampleImageMsg',
      msgParam: JSON.stringify({
        photoURL: mediaId
      }),
      openConversationId: input.openConversationId,
      robotCode: input.robotCode
    });
  }

  private async callOpenApi(method: 'POST' | 'PUT', path: string, payload: Record<string, unknown>): Promise<OpenApiResultBody> {
    const first = await this.callWithToken(method, path, payload, false);
    const tokenInvalid = first.status === 401 || first.status === 403 || this.isTokenInvalid(first.body);
    if (tokenInvalid) {
      const second = await this.callWithToken(method, path, payload, true);
      if (!second.response.ok) {
        throw new Error(`dingtalk api ${path} HTTP ${second.status} ${this.describeError(second.body).slice(0, 240)}`);
      }
      return second.body;
    }
    if (!first.response.ok) {
      throw new Error(`dingtalk api ${path} HTTP ${first.status} ${this.describeError(first.body).slice(0, 240)}`);
    }
    return first.body;
  }

  private async callWithToken(
    method: 'POST' | 'PUT',
    path: string,
    payload: Record<string, unknown>,
    forceRefreshToken: boolean
  ): Promise<{ response: Response; status: number; body: OpenApiResultBody }> {
    const accessToken = await this.getAccessToken(forceRefreshToken);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': accessToken
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    const body = await this.readBody(response);
    return {
      response,
      status: response.status,
      body
    };
  }

  private async downloadImageBytes(imageUrl: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    const response = await fetch(imageUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(Math.max(this.timeoutMs, 15000))
    });
    if (!response.ok) {
      throw new Error(`下载图片失败 HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`下载内容不是图片：${contentType}`);
    }
    const data = await response.arrayBuffer();
    if (data.byteLength === 0) {
      throw new Error('下载图片为空内容。');
    }
    if (data.byteLength > 20 * 1024 * 1024) {
      throw new Error('图片超过钉钉 20MB 限制。');
    }
    return {
      bytes: data,
      contentType
    };
  }

  private async uploadImageMedia(bytes: ArrayBuffer, contentType: string): Promise<string> {
    const accessToken = await this.getAccessToken(false);
    const form = new FormData();
    form.set('type', 'image');
    form.set('media', new Blob([bytes], { type: contentType }), `reply.${extensionFromContentType(contentType)}`);
    const response = await fetch(`${this.oapiBaseUrl}/media/upload?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(Math.max(this.timeoutMs, 15000))
    });
    const body = (await response.json().catch(() => ({}))) as {
      errcode?: number;
      errmsg?: string;
      media_id?: string;
    };
    if (!response.ok) {
      throw new Error(`上传媒体失败 HTTP ${response.status} ${(body.errmsg ?? '').toString().slice(0, 180)}`.trim());
    }
    if (typeof body.errcode === 'number' && body.errcode !== 0) {
      throw new Error(`上传媒体失败 errcode=${body.errcode} errmsg=${body.errmsg ?? ''}`.trim());
    }
    const mediaId = toText(body.media_id);
    if (!mediaId) {
      throw new Error('上传媒体失败：响应缺少 media_id。');
    }
    return mediaId;
  }

  private isTokenInvalid(body: OpenApiResultBody): boolean {
    const code = toText(body.code) ?? (typeof body.errcode === 'number' ? String(body.errcode) : undefined);
    const message = (toText(body.message) ?? toText(body.errmsg) ?? '').toLowerCase();
    if (!code && !message) return false;
    return code?.toLowerCase().includes('token') === true || message.includes('token');
  }

  private describeError(body: OpenApiResultBody): string {
    const code = toText(body.code) ?? (typeof body.errcode === 'number' ? String(body.errcode) : undefined);
    const message = toText(body.message) ?? toText(body.errmsg);
    if (code && message) return `${code} ${message}`;
    if (code) return code;
    if (message) return message;
    return JSON.stringify(body);
  }

  private async readBody(response: Response): Promise<OpenApiResultBody> {
    const raw = await response.text().catch(() => '');
    if (!raw) return {};
    try {
      return JSON.parse(raw) as OpenApiResultBody;
    } catch {
      return {
        message: raw
      };
    }
  }
}
