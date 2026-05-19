# Pixifact Agent Bridge

本目录提供 editor 内的 live agent bridge，让 Pixifact CLI 可以操作当前打开的 `SceneDocument`。

CLI 只是外部入口。真实修改必须继续走 `SceneCommand`、`dryRunProposal()` 和 `SceneDocument.apply()`，不要让外部 agent 直接写项目文件或绕过 editor 校验。

## 模式

- File mode：`bun run pixifact -- ...` 直接读写 `projectRoot + scenePath` 指定的项目文件。
- Live mode：`bun run pixifact -- live ...` 通过本机 bridge 操作当前打开的 `SceneDocument`，界面会同步刷新。

## Live Bridge

编辑器启动后会自动连接：

```txt
ws://127.0.0.1:8791/pixifact-agent
```

## CLI

文件模式：

```bash
bun run pixifact -- summary --project-root /path/to/project
bun run pixifact -- scene get --project-root /path/to/project --scene scenes/main.scene
bun run pixifact -- commands dry-run --project-root /path/to/project --scene scenes/main.scene --commands commands.json
bun run pixifact -- commands apply --project-root /path/to/project --scene scenes/main.scene --commands commands.json
```

Live mode：

```bash
bun run pixifact -- live scene get
bun run pixifact -- live commands dry-run --commands commands.json
bun run pixifact -- live commands apply --commands commands.json
```

`--commands -` 表示从 stdin 读取 `SceneCommand[]`。
