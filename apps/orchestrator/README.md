# SpecWave Orchestrator（结果导向自动交付服务）

## 定位

`@specwave/orchestrator` 是一个结果导向的编排服务：

1. 甲方只提诉求。
2. 系统自动完成澄清、计划、实现、测试、结果包生成。
3. 甲方只在“结果验收”阶段确认。
4. 超时会按 24h / 48h / 72h 自动提醒与升级，升级后仍无响应会暂停。

## 启动

```bash
pnpm -C apps/orchestrator start
```

默认配置：

1. 服务地址：`http://127.0.0.1:8787`
2. 状态文件：`.specwave/orchestrator-state.json`
3. 调度周期：`60000ms`

可选环境变量：

1. `SPECWAVE_ORCHESTRATOR_PORT`
2. `SPECWAVE_ORCHESTRATOR_HOST`
3. `SPECWAVE_ORCHESTRATOR_STATE`
4. `SPECWAVE_ORCHESTRATOR_TICK_MS`
5. `SPECWAVE_ORCHESTRATOR_APPROVAL_RISK_LEVELS`（逗号分隔，默认 `R3`）
6. `SPECWAVE_DINGTALK_ROBOT_WEBHOOK`（钉钉机器人 webhook 地址）
7. `SPECWAVE_DINGTALK_ROBOT_SECRET`（可选，若机器人开启签名必填）
8. `SPECWAVE_DINGTALK_ROBOT_KEYWORD`（可选，机器人关键词校验时填写）
9. `SPECWAVE_DINGTALK_APPBOT_TENANT_ID`（钉钉应用机器人入站默认租户）
10. `SPECWAVE_DINGTALK_APPBOT_PROJECT_ID`（钉钉应用机器人入站默认项目）
11. `SPECWAVE_DINGTALK_APPBOT_REQUIRE_AT`（默认 `true`，群聊里要求 @机器人）
12. `SPECWAVE_DINGTALK_APPBOT_SIGN_SECRET`（可选，钉钉入站签名密钥）
13. `SPECWAVE_DINGTALK_APPBOT_BOT_NAME`（可选，自动去掉消息前缀 `@机器人名`）
14. `SPECWAVE_DINGTALK_STREAM_CLIENT_ID`（Stream 模式应用 `ClientID/AppKey`）
15. `SPECWAVE_DINGTALK_STREAM_CLIENT_SECRET`（Stream 模式应用 `ClientSecret/AppSecret`）
16. `SPECWAVE_DINGTALK_STREAM_TENANT_ID`（Stream 模式默认租户）
17. `SPECWAVE_DINGTALK_STREAM_PROJECT_ID`（Stream 模式默认项目）
18. `SPECWAVE_DINGTALK_STREAM_REQUIRE_AT`（默认 `true`，群聊里要求 @机器人）
19. `SPECWAVE_DINGTALK_STREAM_BOT_NAME`（可选，自动去掉 `@机器人名` 前缀）
20. `SPECWAVE_ORCHESTRATOR_CONNECTORS_FILE`（可选，本地连接器配置文件路径）
21. `SPECWAVE_TELEGRAM_BOT_TOKEN`（Telegram Bot Token）
22. `SPECWAVE_TELEGRAM_TENANT_ID`（Telegram 入站默认租户）
23. `SPECWAVE_TELEGRAM_PROJECT_ID`（Telegram 入站默认项目）
24. `SPECWAVE_TELEGRAM_MODE`（`polling` 或 `webhook`，默认 `polling`）
25. `SPECWAVE_TELEGRAM_REQUIRE_MENTION`（默认 `false`，群聊里是否要求 @机器人）
26. `SPECWAVE_TELEGRAM_BOT_USERNAME`（可选，用于群聊 @ 识别，不含 `@`）
27. `SPECWAVE_TELEGRAM_ALLOWED_CHAT_IDS`（可选，逗号分隔 chatId 白名单）
28. `SPECWAVE_TELEGRAM_WEBHOOK_SECRET_TOKEN`（webhook 模式可选签名）
29. `SPECWAVE_TELEGRAM_API_BASE_URL`（默认 `https://api.telegram.org`）
30. `SPECWAVE_TELEGRAM_POLLING_TIMEOUT_SEC`（轮询超时秒数，默认 `20`）
31. `SPECWAVE_TELEGRAM_POLLING_BACKOFF_MS`（轮询异常退避毫秒，默认 `1500`）
32. `SPECWAVE_AGENT_BRIDGE_ENABLED`（是否启用本机 Agent 直连，默认 `true`）
33. `SPECWAVE_AGENT_BRIDGE_BACKEND`（`codex|claude|command|http`，默认 `codex`）
34. `SPECWAVE_AGENT_BRIDGE_TIMEOUT_MS`（Agent 执行超时，默认 `180000`）
35. `SPECWAVE_AGENT_BRIDGE_WORKDIR`（Agent 工作目录）
36. `SPECWAVE_AGENT_BRIDGE_HISTORY_LIMIT`（每会话保留历史轮次，默认 `8`）
37. `SPECWAVE_AGENT_BRIDGE_MODEL`（可选，指定模型）
38. `SPECWAVE_AGENT_BRIDGE_COMMAND`（backend=command 时必填）
39. `SPECWAVE_AGENT_BRIDGE_COMMAND_ARGS`（backend=command 时可选，逗号分隔）
40. `SPECWAVE_AGENT_BRIDGE_ENDPOINT`（backend=http 时必填）
41. `SPECWAVE_AGENT_BRIDGE_SKILLS_ROOT`（skills 根目录，默认 `.specwave`）
42. `SPECWAVE_AGENT_BRIDGE_ROLES`（逗号分隔角色模板名）
43. `SPECWAVE_AGENT_BRIDGE_PROMPTS`（逗号分隔提示卡名）
44. `SPECWAVE_AGENT_BRIDGE_EXTRA_FILES`（逗号分隔附加模板文件）
45. `SPECWAVE_AGENT_BRIDGE_STYLE_MODE`（`natural|hybrid|formal`）
46. `SPECWAVE_AGENT_BRIDGE_CHAT_PARTICLES`（逗号分隔语气词）
47. `SPECWAVE_AGENT_BRIDGE_FORMAL_KEYWORDS`（命中后切换方案化输出）
48. `SPECWAVE_AGENT_BRIDGE_WORK_INTENT_KEYWORDS`（命中后切换执行诉求沟通）
49. `SPECWAVE_DINGTALK_STREAM_DEDUP_TTL_MS`（消息去重窗口毫秒，默认 `300000`）
50. `SPECWAVE_PROACTIVE_GREETING_ENABLED`（是否启用随机主动问候）
51. `SPECWAVE_PROACTIVE_GREETING_MIN_INTERVAL_MINUTES`（最小间隔分钟）
52. `SPECWAVE_PROACTIVE_GREETING_MAX_INTERVAL_MINUTES`（最大间隔分钟）
53. `SPECWAVE_PROACTIVE_GREETING_DAILY_MAX`（每日最大发送条数）
54. `SPECWAVE_PROACTIVE_GREETING_CHECK_INTERVAL_SECONDS`（检查周期秒）
55. `SPECWAVE_PROACTIVE_GREETING_QUIET_START_HOUR`（免打扰开始小时 0-23）
56. `SPECWAVE_PROACTIVE_GREETING_QUIET_END_HOUR`（免打扰结束小时 0-23）
57. `SPECWAVE_PROACTIVE_GREETING_TEMPLATES`（逗号分隔问候文案）

## 主要 API

1. `POST /api/v1/requests`：创建诉求请求
2. `GET /api/v1/requests/{requestId}`：查询请求详情
3. `POST /api/v1/requests/{requestId}/acceptance`：结果验收（通过/驳回）
4. `POST /api/v1/approvals`：审批高风险动作
5. `POST /api/v1/runs/{runId}/resume`：恢复暂停运行
6. `POST /api/v1/channels/{channel}/webhook`：渠道消息入口
7. `GET /api/v1/deliveries/{deliveryId}/result-card`：获取业务验收卡
8. `GET /api/v1/deliveries/{deliveryId}/demo-link`：获取演示链接
9. `POST /api/v1/system/tick`：手动触发调度（测试/调试）
10. `GET /api/v1/requests/{requestId}/notifications`：查询指定请求通知
11. `GET /api/v1/notifications?status=pending`：查询通知队列
12. `POST /api/v1/notifications/{notificationId}/ack`：确认通知
13. `GET /api/v1/metrics/summary`：获取运行指标
14. `POST /api/v1/channels/dingtalk/appbot/inbound`：钉钉应用机器人消息入站
15. `POST /api/v1/channels/telegram/bot/inbound`：Telegram Bot webhook 入站

## 渠道 webhook 入参

`POST /api/v1/channels/{channel}/webhook` 已内置归一化，支持：

1. `webchat`：`chatId + user + text + tenantId + projectId + idempotencyKey`
2. `dingtalk`：`conversationId + msgId + senderUserId + text.content + tenantId + projectId`
3. `wecom`：`conversationId + msgid + from + content + tenantId + projectId`
4. `telegram`：`update_id + message + tenantId + projectId`

## 钉钉机器人接入

推荐两种方式（二选一）：

1. 直接用环境变量（适合容器/CI）
2. 使用本地文件 `.specwave/orchestrator-connectors.local.json`（适合本机开发，已默认忽略）

环境变量示例：

```bash
SPECWAVE_DINGTALK_ROBOT_WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=***"
SPECWAVE_DINGTALK_ROBOT_SECRET=""
SPECWAVE_DINGTALK_ROBOT_KEYWORD=""
```

本地文件示例：

```json
{
  "dingtalk": {
    "webhook": "https://oapi.dingtalk.com/robot/send?access_token=***",
    "secret": "",
    "keyword": ""
  }
}
```

完成后，通知会在 `delivery_ready / reminder / escalation / paused / approval` 场景自动推送钉钉 `text` 消息。

## 钉钉应用机器人对话接入

用于“人在钉钉里发消息 -> AI 自动推进流程 -> 机器人回消息”的场景。

1. 在钉钉开放平台创建企业内部应用机器人，并开启“接收消息”
2. 选择 HTTP 模式时，将消息接收地址配置为：
   `POST /api/v1/channels/dingtalk/appbot/inbound`
3. 在服务侧配置默认归属：
   - `SPECWAVE_DINGTALK_APPBOT_TENANT_ID`
   - `SPECWAVE_DINGTALK_APPBOT_PROJECT_ID`
4. 若启用了签名校验，将密钥写到 `SPECWAVE_DINGTALK_APPBOT_SIGN_SECRET`

本地文件配置示例（与 dingtalk 发送配置可并存）：

```json
{
  "dingtalk": {
    "webhook": "https://oapi.dingtalk.com/robot/send?access_token=***",
    "secret": "",
    "keyword": ""
  },
  "dingtalkAppbot": {
    "tenantId": "tenant-a",
    "projectId": "proj-a",
    "requireAt": true,
    "signSecret": "",
    "botName": "SpecWave助手"
  }
}
```

机器人支持命令：

1. 直接输入诉求：自动创建工单并推进
2. `状态 <requestId>`：查询工单进度
3. `通过 <requestId> 验收意见`：确认验收
4. `拒绝 <requestId> 返工意见`：驳回并返工
5. `审批 <approvalId> 通过|拒绝`：处理高风险审批

若启用了 `agentBridge`，以上命令分支将被直连 Agent 模式接管，
由 Agent 根据 skills 提示词自行决定对话与执行流程。

## 钉钉 Stream 模式（推荐本机战场）

适合“本机直接接入，不依赖公网回调地址”的模式。配置后，服务会主动连钉钉 Stream 网关收消息，再把回复通过 `sessionWebhook` 发回会话。

环境变量示例：

```bash
SPECWAVE_DINGTALK_STREAM_CLIENT_ID="dingxxxx"
SPECWAVE_DINGTALK_STREAM_CLIENT_SECRET="xxxx"
SPECWAVE_DINGTALK_STREAM_TENANT_ID="tenant-a"
SPECWAVE_DINGTALK_STREAM_PROJECT_ID="proj-a"
SPECWAVE_DINGTALK_STREAM_REQUIRE_AT="true"
SPECWAVE_DINGTALK_STREAM_BOT_NAME="SpecWave助手"
SPECWAVE_DINGTALK_STREAM_API_BASE_URL="https://api.dingtalk.com"
SPECWAVE_DINGTALK_STREAM_CARD_ENABLED="true"
SPECWAVE_DINGTALK_STREAM_CARD_TEMPLATE_ID="tpl_xxx"
SPECWAVE_DINGTALK_STREAM_CARD_STREAM_KEY="content"
SPECWAVE_DINGTALK_STREAM_CARD_CHUNK_SIZE="28"
SPECWAVE_DINGTALK_STREAM_CARD_CHUNK_DELAY_MS="200"
SPECWAVE_DINGTALK_STREAM_MEDIA_RESOLVE_DOWNLOAD_URL="true"
```

本地文件示例：

```json
{
  "dingtalkStream": {
    "clientId": "dingxxxx",
    "clientSecret": "xxxx",
    "tenantId": "tenant-a",
    "projectId": "proj-a",
    "requireAt": true,
    "botName": "SpecWave助手",
    "apiBaseUrl": "https://api.dingtalk.com",
    "card": {
      "enabled": true,
      "cardTemplateId": "tpl_xxx",
      "streamKey": "content",
      "initialContent": "正在整理回复，请稍等…",
      "chunkSize": 28,
      "chunkDelayMs": 200,
      "callbackType": "STREAM",
      "fallbackToSessionWebhook": true
    },
    "media": {
      "resolveDownloadUrl": true
    }
  }
}
```

说明：

1. `card.enabled=true` 时，机器人将优先走 `AI 卡片流式更新`，失败后按 `fallbackToSessionWebhook` 决定是否降级文本。
2. `cardTemplateId` 需在钉钉卡片平台创建并发布 AI 卡片模板后获取。
3. `media.resolveDownloadUrl=true` 时，收到 `picture/richText` 会自动调用 `下载机器人接收消息的文件内容` 接口，把下载链接附加到 Agent 上下文。

## 本机 AGENTS 直连（去写死回复）

当 `agentBridge.enabled=true` 时，钉钉/Telegram 入站会直接调用本机 Agent，
并把 Agent 返回文本原样回复给用户，不再使用内置命令式回复模板。

可通过 `.specwave/roles/*.md` 与 `.specwave/prompts/*.md` 管理提示词编排。

本地文件示例：

```json
{
  "agentBridge": {
    "enabled": true,
    "backend": "codex",
    "model": "gpt-5.3-codex",
    "timeoutMs": 240000,
    "workdir": "F:/AI",
    "historyLimit": 8,
    "skillsRoot": "F:/AI/SpecWave/.specwave",
    "skills": {
      "roles": ["需求分析师", "开发执行者"],
      "prompts": ["新建需求", "开始执行"]
    },
    "style": {
      "mode": "hybrid",
      "chatParticles": ["好的", "收到", "我来处理"],
      "formalKeywords": ["方案", "计划", "spec", "需求文档", "技术方案"],
      "workIntentKeywords": ["帮我做", "做一个", "实现", "开发", "接入", "部署", "测试"]
    }
  }
}
```

风格策略说明：

1. `natural`：始终自然聊天口吻
2. `hybrid`：默认自然聊天；命中 `workIntentKeywords` 进入执行沟通，命中 `formalKeywords` 才输出标准方案
3. `formal`：始终结构化方案口径

## 随机主动问候（可配置）

可在无用户消息时，按随机间隔主动发一条轻问候（默认走钉钉机器人 webhook）。

本地文件示例：

```json
{
  "proactiveGreeting": {
    "enabled": true,
    "minIntervalMinutes": 90,
    "maxIntervalMinutes": 210,
    "dailyMax": 3,
    "checkIntervalSeconds": 30,
    "quietStartHour": 23,
    "quietEndHour": 8,
    "templates": [
      "路过来打个招呼，今天过得还顺吗？",
      "我在呢，忙完记得喝口水，别太累啦。"
    ]
  }
}
```

`backend` 说明：

1. `codex`：调用本机 `codex exec`
2. `claude`：调用本机 `claude -p`
3. `command`：调用自定义命令（stdin 输入 JSON，stdout 输出 reply/text）
4. `http`：调用本地/远端 HTTP Agent 网关（POST JSON，返回 reply/text）

## Telegram Bot 对话接入（纸飞机）

推荐两种方式：

1. `polling`（推荐本机战场）：服务主动轮询 Telegram，不依赖公网回调地址
2. `webhook`：Telegram 主动回调 `POST /api/v1/channels/telegram/bot/inbound`

### 1) 本机推荐：polling 模式

```bash
SPECWAVE_TELEGRAM_BOT_TOKEN="123456:ABCDEF..."
SPECWAVE_TELEGRAM_TENANT_ID="tenant-a"
SPECWAVE_TELEGRAM_PROJECT_ID="proj-a"
SPECWAVE_TELEGRAM_MODE="polling"
SPECWAVE_TELEGRAM_REQUIRE_MENTION="false"
SPECWAVE_TELEGRAM_BOT_USERNAME="specwave_bot"
```

本地文件配置示例：

```json
{
  "telegram": {
    "botToken": "123456:ABCDEF...",
    "tenantId": "tenant-a",
    "projectId": "proj-a",
    "mode": "polling",
    "requireMention": false,
    "botUsername": "specwave_bot",
    "allowedChatIds": ["123456789"],
    "apiBaseUrl": "https://api.telegram.org",
    "pollingTimeoutSec": 20,
    "pollingBackoffMs": 1500
  }
}
```

### 2) webhook 模式

当 `SPECWAVE_TELEGRAM_MODE=webhook` 时，配置 Telegram 回调到：

`POST /api/v1/channels/telegram/bot/inbound`

如需校验 secret token，配置 `SPECWAVE_TELEGRAM_WEBHOOK_SECRET_TOKEN`，
并在 Telegram webhook 设置同一值。

### 3) 机器人命令

1. 直接输入诉求：自动创建工单并推进
2. `状态 <requestId>`：查询工单进度
3. `通过 <requestId> 验收意见`：确认验收
4. `拒绝 <requestId> 返工意见`：驳回并返工
5. `审批 <approvalId> 通过|拒绝`：处理高风险审批

## Docker 私有化部署

```bash
docker compose -f apps/orchestrator/docker-compose.yml up -d --build
```

服务默认对外暴露 `8787` 端口，状态文件持久化到 `apps/orchestrator/data/orchestrator-state.json`。

## 健康检查

```bash
curl http://127.0.0.1:8787/healthz
```

## 手机对话页面（H5）

启动后直接访问：

```bash
http://127.0.0.1:8787/webchat
```

可在手机浏览器打开该地址（同网段）直接提交诉求并实时查看结果状态。

## 测试

```bash
pnpm -C apps/orchestrator test
```
