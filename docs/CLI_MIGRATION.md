# Pixifact CLI

Pixifact 已经从 stdio MCP server 迁移到本地 CLI。CLI 是外部 Agent 操作 Pixifact 项目的主入口，只负责参数解析、JSON 输入输出和调用受控能力；真实修改继续走 `SceneCommand`、`dryRunProposal()` 和 `SceneDocument.apply()`。

## 1. 当前状态

- 主入口：`bun run pixifact -- ...`
- CLI 包：`packages/pixifact-cli/`
- Editor live bridge：`apps/editor/src/agent/`
- 文件模式：直接读写 `projectRoot + scenePath` 指定的 `.scene` 或 `pixifact.aiEditorProject`。
- Live mode：通过 `ws://127.0.0.1:8791/pixifact-agent` 操作当前打开的 editor `SceneDocument`。
- 手动验证：已通过外部 Agent 使用 live CLI 在已启动 editor 中创建登录界面，并确认 editor 可预览修改结果。
- 旧 MCP server 已删除，不保留旧协议兼容层、别名或 deprecation shim。

## 2. 文件模式

文件模式不要求启动 editor。所有路径都必须留在 `projectRoot` 内部。

```bash
bun run pixifact -- summary --project-root /path/to/project

bun run pixifact -- scene create \
  --project-root /path/to/project \
  --scene scenes/Login.scene \
  --name Login

bun run pixifact -- scene get \
  --project-root /path/to/project \
  --scene scenes/main.scene

bun run pixifact -- node inspect \
  --project-root /path/to/project \
  --scene scenes/main.scene \
  --node heroTitle

bun run pixifact -- commands dry-run \
  --project-root /path/to/project \
  --scene scenes/main.scene \
  --commands commands.json

bun run pixifact -- commands apply \
  --project-root /path/to/project \
  --scene scenes/main.scene \
  --commands commands.json

bun run pixifact -- commands validate \
  --project-root /path/to/project \
  --scene scenes/main.scene \
  --commands commands.json

bun run pixifact -- template add dry-run \
  --project-root /path/to/project \
  --scene scenes/Login.scene \
  --kind loginForm \
  --parent root \
  --key login

bun run pixifact -- template add apply \
  --project-root /path/to/project \
  --scene scenes/Login.scene \
  --kind button \
  --parent root \
  --key submit \
  --label 登录
```

`--commands -` 表示从 stdin 读取 `SceneCommand[]`：

```bash
cat commands.json | bun run pixifact -- commands dry-run \
  --project-root /path/to/project \
  --scene scenes/main.scene \
  --commands -
```

## 3. Live Mode

Live mode 要求桌面 editor 已启动，并且已打开项目 / Scene。

```bash
bun run desktop
```

然后在另一个终端执行：

```bash
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node heroTitle
bun run pixifact -- live commands dry-run --commands commands.json
bun run pixifact -- live commands apply --commands commands.json
bun run pixifact -- live commands validate --commands commands.json
```

Live mode 会操作当前打开的 `SceneDocument`，刷新 editor preview，并在 apply 成功后保存当前 Scene。

## 4. Command Payload

`commands.json` 必须是 `SceneCommand[]`。示例：

```json
[
  {
    "op": "setNodeData",
    "node": "submitButtonLabel",
    "field": "text",
    "prop": "value",
    "value": "Continue"
  }
]
```

CLI 不接受自由文本修改请求。Agent 必须先把意图转换成结构化 `SceneCommand[]`。

## 5. Template / Macro

`template add` 是 AI 友好的薄封装，用短参数生成 `SceneCommand[]`，再走同一套 dry-run / apply 语义。它不是新的修改通道。

第一版支持：

- `button`
- `progressBar`
- `scrollView`
- `loginForm`

命令形态：

```bash
bun run pixifact -- template add dry-run \
  --project-root /path/to/project \
  --scene scenes/Login.scene \
  --kind loginForm \
  --parent root \
  --key login

bun run pixifact -- template add apply \
  --project-root /path/to/project \
  --scene scenes/Login.scene \
  --kind button \
  --parent root \
  --key submit \
  --label 登录
```

规则：

- `dry-run` 不写文件，只返回展开后的 `commands`、`diffs` 和预演 Scene。
- `apply` 会先 dry-run，成功后通过 `SceneDocument.apply()` 写回 `.scene`。
- 模板失败时使用和 `commands` 一致的错误 JSON：`ok: false`、`error`、`commandIndex`、`op`、`node`、`target`、`hint`。
- 模板参数只负责生成结构化命令，不允许自由文本直接改 Scene。

## 6. 输出和错误

- 成功时 stdout 输出 JSON，exit code 为 0。
- 失败时 stderr 输出错误 JSON，exit code 非 0。
- `commands dry-run`、`commands validate`、`commands apply` 失败时错误 JSON 会尽量包含 `commandIndex`、`op`、`node`、`target`、`hint`，文件模式和 live mode 保持一致，用于 Agent 自动修正命令。
- `template add dry-run`、`template add apply` 复用同一套错误 JSON。
- `scene create` 会创建标准 `.scene`，root 是 `container`，不会覆盖已有文件。
- dry-run 不写文件，也不修改 editor 当前 Scene。
- apply 会先执行同一批命令的 dry-run；dry-run 失败则不写文件。
- path guard 会拒绝 `projectRoot` 外的 scene 路径。

## 7. Agent 约束

Agent 使用 CLI 时必须遵守：

- 先读上下文，再写命令：`summary` -> `scene get` -> 必要时 `node inspect`。
- 只生成 `SceneCommand[]`，不直接编辑 `.scene` JSON。
- 先 `commands dry-run`，确认 `ok: true` 后再 `commands apply`。
- 创建常见 UI 时优先使用 `template add dry-run/apply`，不要手写大量重复 `createNode` JSON。
- 使用稳定 locator：节点用 `key` / `id`，组件用 `id`，文件用 project-relative path。
- 对 live editor 的修改只通过 `bun run pixifact -- live ...`。

更完整的 Agent 操作流程见 [AGENT_CLI_WORKFLOW.md](./AGENT_CLI_WORKFLOW.md)。

## 8. 验证

CLI 相关最小验证：

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts
```

跨 editor live bridge 或 UI 文案时：

```bash
bunx --no-install vitest run tests/project-file-tree.test.ts tests/pixifact-cli.test.ts
bun run editor:frontend:build
```

完整验证：

```bash
bun run test
```
