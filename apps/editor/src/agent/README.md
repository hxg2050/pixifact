# Pixifact Agent Bridge

本目录提供 editor 内的 live agent bridge，让 Pixifact CLI 读取当前 editor 上下文。

live bridge 是能力增强，不是项目修改通道。外部 Agent 即使没有 Editor，也可以直接编辑 `.scene` 文件并运行 `scene validate` / `compile-scenes` 完成开发；有 Editor 时，可以额外读取当前打开 Scene、选中节点、项目文件列表和预览状态。

## 模式

- File mode：外部 Agent 直接编辑 `.scene`，再用 `bun run pixifact -- ...` inspect / validate / compile 项目文件。
- Live mode：`bun run pixifact -- live ...` 通过本机 bridge 只读当前 Editor 上下文。

## Live Bridge

编辑器启动后会自动连接：

```txt
ws://127.0.0.1:8791/pixifact-agent
```

## CLI

文件模式：

```bash
bun run pixifact -- summary --project-root /path/to/project
bun run pixifact -- scene inspect --project-root /path/to/project --scene src/scenes/Main.scene
bun run pixifact -- scene validate --project-root /path/to/project --scene src/scenes/Main.scene
bun run pixifact -- compile-scenes --project-root /path/to/project
```

Scene 脚本由同目录同名 `.ts` 自动配对，例如 `src/scenes/Main.scene` 和 `src/scenes/Main.ts`。不要在 `.scene` 中写 `script="..."`，也不要编辑 `.pixifact/generated`。

Live mode：

```bash
bun run pixifact -- live summary
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node 0:content/0:label
```

`live scene get` 可返回当前打开 Scene、当前选中节点、dirty / revision 状态，以及最近一次外部 `.scene` 刷新或校验结果。Agent 用这些信息判断直接编辑是否需要修复。

live mode 不提供 `commands apply`、`template add` 或其他 mutation action。Git diff、commit、PR、CI 和任务编排由外部工具负责，不属于 Pixifact live bridge。
