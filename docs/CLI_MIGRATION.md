# Pixifact CLI Migration

本文档定义从 MCP 入口迁移到 Pixifact CLI 的目标形态、迁移步骤和验证边界。

CLI 是外部 Agent 操作 Pixifact 项目的主入口。它只负责参数解析、输入输出和调用受控能力；真实项目修改必须继续走 `SceneCommand`、`dryRunProposal()` 和 `SceneDocument.apply()`。

## 1. 目标

- 用本地 CLI 替换 stdio MCP server。
- CLI 默认输出 JSON，便于 Codex、Claude Code 和脚本消费。
- 文件模式直接操作 `projectRoot + scenePath` 指定的 `.scene` 或 `pixifact.aiEditorProject`。
- Live Editor 模式通过本机 websocket bridge 操作当前打开的 `SceneDocument`。
- 不为旧 MCP 协议新增兼容层、别名或 deprecation shim。

## 2. 目标命令

```bash
bun run pixifact -- summary --project-root /path/to/project

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
```

`--commands -` 表示从 stdin 读取 `SceneCommand[]`。

Live Editor 命令：

```bash
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node heroTitle
bun run pixifact -- live commands dry-run --commands commands.json
bun run pixifact -- live commands apply --commands commands.json
bun run pixifact -- live commands validate --commands commands.json
```

失败时 CLI 输出错误 JSON，并返回非 0 exit code。

## 3. 模块迁移

第一步先改名和抽离共享能力：

```txt
packages/pixifact-cli/
  src/automation.ts
  src/liveBridge.ts
  src/liveBridgeServer.ts
  src/pixifact-cli.ts
```

迁移来源：

- `packages/pixifact-mcp/src/editorAutomation.ts` -> `packages/pixifact-cli/src/automation.ts`
- `packages/pixifact-mcp/src/liveBridge.ts` -> `packages/pixifact-cli/src/liveBridge.ts`
- `packages/pixifact-mcp/src/liveBridgeServer.ts` -> `packages/pixifact-cli/src/liveBridgeServer.ts`

`automation.ts` 保留以下能力：

- `getProjectSummary`
- `getScene`
- `inspectNode`
- `dryRunCommands`
- `applyCommands`
- `validateCommands`

CLI 入口只调用这些方法，不直接读写 Scene 节点字段。

## 4. Editor 迁移

Editor 侧目录从 MCP 心智迁移到 Agent / CLI 心智：

```txt
apps/editor/src/mcp/ -> apps/editor/src/agent/
```

目标：

- `liveEditorClient.ts` 继续接收 live bridge 请求。
- 请求名称保持与 CLI action 对齐，例如 `scene.get`、`commands.apply`。
- 当前打开的 Scene 只能通过 `SceneDocument` 修改。
- UI 文案从 “MCP tools” 改为 “CLI / Agent commands”。

## 5. Package Scripts

新增根脚本：

```json
{
  "pixifact": "bun packages/pixifact-cli/src/pixifact-cli.ts"
}
```

MCP 入口完成迁移后删除：

```json
{
  "editor:mcp": "bun packages/pixifact-mcp/src/pixifact-mcp-server.ts"
}
```

## 6. TDD 顺序

1. 新增 `tests/pixifact-cli.test.ts`，先覆盖文件模式。
2. 实现 `summary`、`scene get`、`node inspect`。
3. 实现 `commands dry-run`、`commands apply`、`commands validate`。
4. 覆盖 path guard、stdin commands、错误 JSON 和 exit code。
5. 迁移 live bridge routing 测试。
6. 删除 MCP server 测试和旧协议文档引用。

最小验证：

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts
```

跨 editor 文案或 live bridge 改动后再运行：

```bash
bunx --no-install vitest run tests/editor.test.ts tests/project-file-tree.test.ts tests/pixifact-cli.test.ts
bun run editor:frontend:build
```

## 7. Definition of Done

- CLI 覆盖 MCP 现有工具的等价行为。
- dry-run 不写文件，apply 才写回 `.scene`。
- `projectRoot` path guard 保持有效。
- Live Editor 模式能操作当前打开的 `SceneDocument` 并刷新 editor。
- 文档、BDD 和 TDD 不再把 MCP 作为 Agent 主入口。
- 旧 MCP server 代码和脚本被删除。
