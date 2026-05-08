# Pixifact MCP Server

本目录提供本地 stdio MCP server，让 Codex、Claude Desktop、Cursor 等通用 agent 通过受控工具操作 Pixifact 项目。

MCP 只是一层协议适配。真实修改必须继续走 `SceneCommand`、`dryRunProposal()` 和 `SceneDocument.apply()`，不要让外部 agent 直接写项目文件。

当前 server 有两种工作模式：

- Live Editor：编辑器正在运行并连接本机 bridge 时，工具调用会直接操作当前打开的 `SceneDocument`，界面会同步刷新。
- File Fallback：没有编辑器连接时，工具调用会读写 `projectRoot + scenePath` 指定的项目文件。

## 启动

```bash
bun run editor:mcp
```

如果要让 agent 操作正在打开的编辑器，需要同时启动桌面编辑器或开发预览：

```bash
bun run desktop
```

编辑器会自动连接：

```txt
ws://127.0.0.1:8791/pixifact-editor
```

stdio 客户端配置示例：

```json
{
  "mcpServers": {
    "pixifact": {
      "command": "bun",
      "args": [
        "run",
        "editor:mcp"
      ],
      "cwd": "/Users/youxia/work/github/pixif"
    }
  }
}
```

## Tools

- `get_project_summary`：列出项目文件和 Scene。
- `get_scene`：读取 `.scene` 或 `pixifact.aiEditorProject` JSON。
- `inspect_node`：查看指定节点。
- `dry_run_commands`：预演 `SceneCommand[]`，返回 diff，不写文件。
- `apply_commands`：通过 `SceneDocument.apply()` 应用；Live Editor 模式下刷新界面并保存当前 Scene。
- `validate_commands`：按顺序验证命令，不写文件。

所有 tool 都要求传入：

```json
{
  "projectRoot": "/absolute/path/to/project",
  "scenePath": "project-relative/path.scene"
}
```

`scenePath` 必须留在 `projectRoot` 内部。

Live Editor 模式下，`scenePath` 必须是当前打开的 Scene；也可以省略 `scenePath` 来使用当前 Scene。

## 手工探测

```bash
bun run editor:mcp <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
EOF
```

```bash
bun run editor:mcp <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_project_summary","arguments":{"projectRoot":"/Users/youxia/work/github/pixif/sample-projects/basic-game"}}}
EOF
```
