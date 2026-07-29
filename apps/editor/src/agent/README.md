# Pixifact Agent Bridge

本目录是旧 Editor 的 live agent bridge 实现。vNext 第一条浏览器闭环尚未挂载这里的连接逻辑；当前外部 Agent 继续直接编辑 `.scene` 并运行 CLI 校验。

live bridge 是能力增强，不是项目修改通道。外部 Agent 即使没有 Editor，也可以直接编辑 `.scene` 文件并运行 `scene validate` / `compile-scenes` 完成开发；有 Editor 时，可以额外读取当前打开 Scene、选中节点、项目文件列表和预览状态。

## 模式

- File mode：外部 Agent 直接编辑 `.scene`，再用 `bun run pixifact -- ...` inspect / validate / compile 项目文件。
- Live mode：`bun run pixifact -- live ...` 通过本机 bridge 只读当前 Editor 上下文。

## Live Bridge

旧实现使用：

```txt
ws://127.0.0.1:8791/pixifact-agent
```

## CLI

文件模式：

```bash
pixifact summary
pixifact scene inspect --scene src/scenes/Main.scene
pixifact scene validate --scene src/scenes/Main.scene
pixifact compile-scenes
```

默认项目根目录是当前工作目录；不在项目根目录运行时再加 `--project-root <path>`。Scene 脚本由同目录同名 `.ts` 自动配对，例如 `src/scenes/Main.scene` 和 `src/scenes/Main.ts`。不要在 `.scene` 中写 `script="..."`，也不要编辑 `.pixifact/generated`。

Live mode：

```bash
bun run pixifact -- live summary
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node 0:content/0:label
```

浏览器 Editor 重新接通 read-only live context 后，`live scene get` 应返回当前打开 Scene、当前选中节点和最近一次外部 `.scene` 刷新 / 校验结果。该迁移完成前，不要把旧 bridge 当作 `pixifact editor` 的现有行为。

live mode 只提供上下文读取，不提供 mutation action。Git diff、commit、PR、CI 和任务编排由外部工具负责，不属于 Pixifact live bridge。
