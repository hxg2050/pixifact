# AI Gateway Adapter

本目录放真实 AI gateway 接入样例。Gateway 只负责把 `pixifact.aiProposal.v1` 请求转给模型，并返回 `AiProposal`；它不访问 editor runtime，不写文件，也不直接修改 `EditorDocument`。

## 协议

Editor 发送：

```http
POST /proposal
content-type: application/json
authorization: Bearer <optional-token>
```

请求体由 `createAiProposalRequest()` 生成：

```ts
{
    protocol: 'pixifact.aiProposal.v1',
    prompt: string,
    context: {
        prefab,
        prefabSummary,
        componentSchemas,
        selection,
        designTokens,
        actions,
        actionSummary,
        logicGraph,
        logicSummary,
        locks,
        lockedTargets,
        memory,
        memorySummary,
    },
}
```

Gateway 返回：

```ts
{
    proposal: {
        id?: string,
        prompt?: string,
        explanation?: string,
        commands: EditorCommand[],
        annotations?: AiAnnotation[],
        risks?: string[],
    },
}
```

`commands` 是唯一允许改变项目的输出，但仍必须由 editor 执行 validation、Dry Run、Diff Review 和 Apply。

## 鉴权

- 本地 editor 的 AI 服务配置只保留 gateway endpoint / timeout。
- 模型 API key 放在 gateway 的本地配置文件或环境变量里，不进入浏览器。
- Endpoint、timeout、auth header 会保存在浏览器 localStorage；token 不持久化。
- 样例 adapter 使用 `PIXIFACT_AI_GATEWAY_TOKEN` 校验 `Authorization: Bearer <token>`。
- 如果 gateway 放在公网，应在外层再加 HTTPS、rate limit 和日志脱敏。

## 错误码

Gateway 错误响应统一返回：

```ts
{
    error: {
        code: string,
        message: string,
        details?: string[],
    },
}
```

推荐错误码：

- `invalid_request`：请求体不是 `pixifact.aiProposal.v1`。
- `unauthorized`：鉴权失败。
- `gateway_misconfigured`：gateway adapter 没有配置模型调用。
- `upstream_failed`：模型或上游服务失败。
- `invalid_proposal`：模型返回不是合法 `AiProposal`。

## 超时

- Editor Remote provider 默认 timeout 为 `300000ms`，给真实模型留出足够时间。
- Gateway 应设置自己的上游模型超时，建议真实模型使用 `120000ms` 到 `300000ms`。
- 超时必须返回错误，不要返回半截 proposal。

## 本地运行

默认启动：

```bash
bun run editor:gateway
```

Editor 中切到 `Remote`：

- Endpoint: `http://localhost:8788/proposal`
- Timeout: `300000`

如果没有配置上游模型，adapter 会返回空 command 的示例 proposal，方便验证 editor 到 gateway 的通路。

## 接真实模型

`modelAdapter.mjs` 支持 OpenAI-style `Responses` 和 `Chat Completions` 风格的 HTTP 上游。推荐把真实 key 放在本机私有配置文件：

```bash
cp apps/editor/ai-gateway.config.example.json apps/editor/ai-gateway.config.local.json
```

然后编辑 `apps/editor/ai-gateway.config.local.json`：

```json
{
  "gatewayToken": "local-test",
  "upstreamApi": "responses",
  "upstreamUrl": "https://code.ylsagi.com/codex/v1/responses",
  "upstreamToken": "replace-with-api-key",
  "upstreamModel": "gpt-5.5",
  "upstreamTimeoutMs": 300000,
  "upstreamAuthHeader": "authorization",
  "upstreamAuthPrefix": "Bearer",
  "upstreamReasoningEffort": "medium",
  "upstreamServiceTier": "fast",
  "upstreamStore": false
}
```

`*.local` 已被 `.gitignore` 忽略，不会提交到仓库。

也可以使用环境变量，环境变量优先于配置文件：

```bash
OPENAI_API_KEY=your-key bun run editor:gateway
```

支持的主要配置项：

- `upstreamApi`：`responses` 或 `chatCompletions`。
- `upstreamUrl`：上游模型地址。
- `upstreamToken`：真实模型 token；也可以用 `OPENAI_API_KEY`。
- `upstreamModel`：真实模型名。
- `upstreamTimeoutMs`：默认建议 `300000`。
- `upstreamAuthHeader` / `upstreamAuthPrefix`：默认 `authorization` / `Bearer`。
- `upstreamReasoningEffort`、`upstreamServiceTier`、`upstreamStore`：Responses API 相关配置。
- `upstreamTemperature`：Chat Completions 使用；Responses 模式下不主动发送 temperature。

上游响应可以是：

- `AiProposal`。
- `{ proposal: AiProposal }`。
- OpenAI-style `{ choices: [{ message: { content: "<json>" } }] }`，其中 content 必须是 JSON。

模型必须只返回 proposal JSON，不要返回 markdown。即使接了真实模型，editor 仍然负责 validation、Dry Run、Diff Review 和 Apply。
