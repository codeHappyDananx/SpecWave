# 交互契约：codex 能力视图（v1）

> Story：STORY-000017(MCP 与技能禁用展示)
> 版本：v1
> 目标：定义“能力视图”的数据来源、探测口径、失败语义与脱敏规则，确保实现不靠猜。

## 1. 触发点与意图

### UIIntent：左区切换

- `LEFT_PANEL_TAB_SET`
  - 触发：用户点击左区常驻切换条图标
  - 入参：`tab: "workbench" | "codexCapabilities"`
  - 语义：切换左区主体内容；不触发探测也可，但进入 `codexCapabilities` 时建议自动触发一次探测

### UIIntent：刷新探测

- `CODEX_CAPABILITIES_REFRESH`
  - 触发：用户在能力视图点击“刷新”
  - 入参：无
  - 语义：重新获取快照，并刷新每项状态

### UIIntent：安装 MCP（JSON 输入）

- `CODEX_MCP_INSTALL_FROM_JSON`
  - 触发：用户点击“安装 MCP”，在弹窗粘贴 `JSON` 并确认
  - 入参：
    ```json
    {
      "rawJson": "{...}"
    }
    ```
  - 语义：将输入 `JSON` 转换为 `codex` 官方 `MCP` 配置口径，并通过官方 `CLI`：命令行界面 安装

### UIIntent：安装 skills（zip 或 md/目录）

- `CODEX_SKILL_INSTALL`
  - 触发：用户点击“安装技能”，选择 `zip` 或 `md`（或包含 `SKILL.md` 的目录）并确认
  - 入参：
    ```json
    {
      "source": {
        "kind": "zip" | "md" | "dir",
        "path": "C:\\\\path\\\\to\\\\file-or-dir"
      },
      "targetScope": "user" | "project"
    }
    ```
  - 语义：按官方技能发现机制，将内容落盘到目标技能目录，并在安装后刷新能力列表

## 2. 运行时接口（preload）

### API：获取与探测（一次性返回快照）

- 方法名：`window.specwave.codexCapabilitiesProbe`
- 入参：
  ```json
  {
    "includeConnectivityProbe": true
  }
  ```
  - `includeConnectivityProbe`
    - `true`：对每个 `MCP` 做连通性探测（最小握手）
    - `false`：仅返回配置快照（不启动外部进程）

- 成功响应：
  ```json
  {
    "checkedAt": "2026-01-24T12:34:56.000Z",
    "mcpServers": [
      {
        "name": "mcp_router",
        "enabled": true,
        "transportType": "stdio",
        "authStatus": "unsupported",
        "disabledReason": null,
        "health": { "state": "ok", "message": "握手成功" },
        "safeConfig": {
          "command": "npx",
          "args": ["-y", "@mcp_router/cli@latest", "connect"],
          "cwd": null,
          "envKeys": ["MCPR_TOKEN"]
        }
      }
    ],
    "skills": [
      {
        "id": "specwave-router",
        "name": "specwave-router",
        "description": "在 SpecWave 项目中自动路由角色，优先遵守会话锁定",
        "location": "user",
        "health": { "state": "ok", "message": "结构完整" },
        "safeMeta": { "hasSkillMd": true, "hasValidFrontMatter": true }
      }
    ]
  }
  ```

- 失败响应（整体失败）：
  ```json
  {
    "error": {
      "code": "CODEX_CAPABILITIES_PROBE_FAILED",
      "message": "能力探测失败",
      "hint": "请检查 codex 是否可执行，以及是否有读取 ~/.codex 的权限"
    }
  }
  ```

## 3. 状态机与失败语义

### 3.1 `MCP`：模型上下文协议服务 探测

探测分两层：

1) 配置层：通过 `codex mcp list --json` 获取（必须）
- 失败：`health.state = "error"`，`message` 给出可理解原因

2) 连通性层：通过官方 `MCP`：模型上下文协议 `SDK` 做最小握手（可选）
- 判定成功：按官方生命周期完成握手（`initialize`：初始化请求 → `initialized`：初始化完成通知），可选再调用 `tools/list`
- 失败：按错误类型映射 `message`，并确保子进程回收

### 3.2 `skills`：技能 探测

探测以结构完整性为准：
- `hasSkillMd=false` → `health.state="error"`，提示缺少 `SKILL.md`
- `hasValidFrontMatter=false` → `health.state="error"`，提示元数据不可解析
- 其余 → `health.state="ok"`，提示结构完整

## 4. 脱敏与展示规则（强制）

- 任何 `env`：环境变量 的值不得返回到渲染进程与 UI。
- `safeConfig.envKeys` 的来源优先级：
  1) `codex mcp list/get --json` 返回的 `env_vars`
  2) 若仅存在 `env`，只能取其键名，值一律丢弃
- 报错信息不得包含可直接复用的口令、令牌、密钥或完整命令输出；必要时只保留摘要与建议。

## 5. 回归清单

- 成功：进入能力视图 → `MCP` 与 `skills` 均有列表与状态
- 失败：故意让 `codex` 不可执行 → 能力视图仍可渲染，并给出明确提示
- 脱敏：`codex mcp list --json` 含密钥字段 → UI 不出现明文
- 刷新：点击“刷新” → 状态先进入“检测中”，随后更新
- 安装 MCP：粘贴 `JSON` → 执行官方 `codex mcp add` → 列表出现新条目 → 刷新后可探测状态
- 安装 skills：选择 `zip`/`md`/目录 → 内容落到官方技能目录 → 列表出现新条目

## 6. 输入 JSON 口径（MCP 安装）

输入 `JSON` 只作为用户输入载体，最终必须转换为官方 `codex mcp add` 的参数。

### 6.1 输入示例（stdio）

```json
{
  "name": "mcp_router",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@mcp_router/cli@latest", "connect"],
    "env": { "MCPR_TOKEN": "******" }
  }
}
```

### 6.2 输入示例（http）

```json
{
  "name": "example_http",
  "transport": {
    "type": "http",
    "url": "https://example.com/mcp"
  }
}
```

### 6.3 转换规则（到官方命令）

- `transport.type="stdio"` → `codex mcp add <name> --env KEY=VALUE ... -- <command> <args...>`
- `transport.type="http"` → `codex mcp add <name> --url <url> [--bearer-token-env-var ENV_VAR]`
- 当 `<name>` 已存在：提示用户选择“覆盖安装”，实现为 `codex mcp remove <name>` + `codex mcp add ...`

## 7. skills 安装口径（官方发现目录）

### 7.1 目标目录（官方）

- 用户级：`~/.codex/skills/<skill-id>/`
- 项目级：`$CWD/.codex/skills/<skill-id>/`

### 7.2 源类型处理

- `zip`：解压后要求包含 `SKILL.md`；若解压根目录不是技能目录，需要在安装时归一化（以设计实现为准）
- `md`：如果选的是单文件，则创建 `<skill-id>/SKILL.md` 并写入；如果选的是目录内 `SKILL.md`，则复制其所在目录全部内容
- `dir`：要求目录内存在 `SKILL.md`，否则报错并提示

## 8. 官方参考（实现必须对齐）

- `Codex`：终端客户端 `MCP`：模型上下文协议 命令：`codex mcp add/list/get/remove/login/logout`
  - https://developers.openai.com/codex/cli/reference/
  - https://developers.openai.com/codex/mcp/
- `Codex`：终端客户端 `skills`：技能 发现机制与目录
  - https://developers.openai.com/codex/skills/
- `MCP`：模型上下文协议 生命周期（握手流程）
  - https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
