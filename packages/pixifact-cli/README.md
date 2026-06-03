# Pixifact CLI

Pixifact Scene 自动化命令行工具。

本版本 CLI 是 Bun-first 工具。

## 安装

```bash
bun add -d pixifact-cli
```

## 命令

查看 Scene：

```bash
pixifact scene inspect --project-root . --scene src/scenes/Hud.scene
```

校验单个 Scene：

```bash
pixifact scene validate --project-root . --scene src/scenes/Hud.scene
```

校验所有 compiler Scene：

```bash
pixifact scene validate --project-root . --all
```

编译生成 Scene runtime 文件：

```bash
pixifact compile-scenes --project-root .
```

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
