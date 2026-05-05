# AI Gateway Adapter

本目录放真实 AI gateway 接入样例。Gateway 只负责把 `pixif.aiProposal.v1` 请求转给模型，并返回 `AiProposal`；它不访问 editor runtime，不写文件，也不直接修改 `EditorDocument`。

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
    protocol: 'pixif.aiProposal.v1',
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
    model?: {
        api?: 'chatCompletions' | 'responses',
        endpoint?: string,
        token?: string,
        envKey?: string,
        model?: string,
        timeoutMs?: number,
        authHeader?: string,
        authPrefix?: string,
        temperature?: number,
        reasoningEffort?: string,
        serviceTier?: string,
        store?: boolean,
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

- 本地 editor 的 Remote 配置支持 gateway 和 model 两组 endpoint / auth / timeout。
- Token 只存在 Zustand UI state，不写入 `.ai-editor.json`，也不写入 localStorage。
- Endpoint、timeout、auth header、model name 和 temperature 会保存在浏览器 localStorage；token 不持久化。
- 样例 adapter 使用 `PIXIF_AI_GATEWAY_TOKEN` 校验 `Authorization: Bearer <token>`。
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

- `invalid_request`：请求体不是 `pixif.aiProposal.v1`。
- `unauthorized`：鉴权失败。
- `gateway_misconfigured`：gateway adapter 没有配置模型调用。
- `upstream_failed`：模型或上游服务失败。
- `invalid_proposal`：模型返回不是合法 `AiProposal`。

## 超时

- Editor Remote provider 默认 timeout 为 `300000ms`，给真实模型留出足够时间。
- Gateway 应设置自己的上游模型超时，建议真实模型使用 `120000ms` 到 `300000ms`。
- 超时必须返回错误，不要返回半截 proposal。

## 本地运行

```bash
PIXIF_AI_GATEWAY_TOKEN=local-test node apps/editor/src/gateway/ai-gateway-adapter.mjs
```

也可以用 Bun：

```bash
PIXIF_AI_GATEWAY_TOKEN=local-test bun apps/editor/src/gateway/ai-gateway-adapter.mjs
```

Editor 中切到 `Remote`：

- Endpoint: `http://localhost:8788/proposal`
- Timeout: `300000`
- Auth header: `Authorization`
- Auth token: `Bearer local-test`

如果没有配置 Model endpoint，adapter 会返回空 command 的示例 proposal，方便验证 editor 到 gateway 的通路。

## 接真实模型

`modelAdapter.mjs` 支持 OpenAI-compatible `Responses` 和 `Chat Completions` 风格的 HTTP 上游。先启动本地 gateway：

```bash
pnpm editor:gateway
```

或：

```bash
bun run bun:editor:gateway
```

然后在 editor 的 `AI` tab 切到 `Remote`，在 `Model` 区域填写：

- API：`Responses` 或 `Chat Completions`。
- Model endpoint：例如 `https://code.ylsagi.com/codex/v1/responses`。
- Model：真实模型名。
- Model token：真实模型 token。
- Model timeout：默认 `300000`。
- Auth header：默认 `authorization`。
- Auth prefix：默认 `Bearer`；留空可直接发送 token。
- Reasoning：Responses API 的 reasoning effort，默认 `medium`；`xhigh` 更慢。
- Service tier：例如 `fast`。
- Store：是否允许上游保存 response，默认 `false`。
- Temperature：Chat Completions 默认 `1`；Responses 模式下不主动发送 temperature，以兼容 `ylscode`。

Model token 只保存在当前页面状态，不会写入 localStorage 或 `.ai-editor.json`。Gateway 转发给模型的 prompt 会移除 `request.model`，避免把 token 放进模型上下文。

如果启动 gateway 的终端里已经有 `OPENAI_API_KEY`，可以不填 `Model token`；editor 会随请求传 `envKey: OPENAI_API_KEY`，gateway 会从自己的环境变量读取 token。

当前 editor 默认预设为：

```txt
API: Responses
Model endpoint: https://code.ylsagi.com/codex/v1/responses
Model: gpt-5.5
Reasoning: medium
Service tier: fast
Store: false
Auth header: authorization
Auth prefix: Bearer
```

上游响应可以是：

- `AiProposal`。
- `{ proposal: AiProposal }`。
- OpenAI-compatible `{ choices: [{ message: { content: "<json>" } }] }`，其中 content 必须是 JSON。

模型必须只返回 proposal JSON，不要返回 markdown。即使接了真实模型，editor 仍然负责 validation、Dry Run、Diff Review 和 Apply。
