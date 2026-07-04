# Pixifact CLI

Pixifact Scene 自动化命令行工具。

本版本 CLI 是 Bun-first 工具。

## 安装

```bash
bun add -d pixifact-cli
```

## AI 主路径

AI 修改 `.scene` 时优先只记这条路径：

```bash
pixifact summary --project-root .
pixifact scene inspect --project-root . --scene src/scenes/Hud.scene
pixifact scene validate --project-root . --scene src/scenes/Hud.scene
pixifact compile-scenes --project-root .
```

如果多个 Scene 可能变化，把单文件校验换成：

```bash
pixifact scene validate --project-root . --all
```

其他命令是辅助入口：`scene create` 用于新建 Scene，`node inspect` 用于已知 locator 的节点详情，`live ...` 只在 Editor 运行时读取上下文。

## Agent 工作流

Codex、Claude Code 和其他 coding agent 应直接编辑 `.scene` 文件，然后运行：

```bash
pixifact scene validate --project-root . --all
pixifact compile-scenes --project-root .
bun run build
```

不要编辑 `.pixifact/generated/**` 下的生成文件。

## 环境要求

- Bun
- 目标项目已安装 `pixifact`
