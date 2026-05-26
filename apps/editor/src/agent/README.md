# Pixifact Agent Bridge

本目录提供 editor 内的 live agent bridge，让 Pixifact CLI 读取当前 editor 上下文。

live bridge 是能力增强，不是项目修改通道。外部 Agent 即使没有 Editor，也可以直接编辑 `.scene` 文件并运行 `scene validate` / `compile-scenes` 完成开发；有 Editor 时，可以额外读取当前打开 Scene、选中节点、项目文件列表和预览状态。

## 模式

- File mode：`bun run pixifact -- ...` 直接读取项目文件，验证或应用 `.scene proposal`。
- Live mode：`bun run pixifact -- live ...` 通过本机 bridge 读取当前 Editor 上下文。

## Live Bridge

编辑器启动后会自动连接：

```txt
ws://127.0.0.1:8791/pixifact-agent
```

## CLI

文件模式：

```bash
bun run pixifact -- summary --project-root /path/to/project
bun run pixifact -- scene inspect --project-root /path/to/project --scene scenes/main.scene
bun run pixifact -- scene validate --project-root /path/to/project --scene scenes/main.scene
bun run pixifact -- compile-scenes --project-root /path/to/project
```

Live mode：

```bash
bun run pixifact -- live summary
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node 0:content/0:label
```

live mode 不提供 `commands apply`、`template add` 或其他 mutation action。
