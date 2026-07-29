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
pixifact summary
pixifact scene inspect --scene src/scenes/Hud.scene
pixifact scene validate --scene src/scenes/Hud.scene
pixifact compile-scenes
```

如果多个 Scene 可能变化，把单文件校验换成：

```bash
pixifact scene validate --all
```

默认使用当前工作目录作为项目根目录；不在项目根目录运行时再加 `--project-root <path>`。

其他命令是辅助入口：`scene create` 用于新建 Scene，`node inspect` 用于已知 locator 的节点详情，`live ...` 只在 Editor 运行时读取上下文。不要使用 `scene get`，file mode 只保留 `scene inspect`。

## 浏览器 Editor

在目标项目根目录运行：

```bash
pixifact editor
```

CLI 会启动只绑定 `127.0.0.1` 的本地 Bun 服务并打开系统浏览器。Editor 从项目内现有 `.scene` 建立层级、Pixi 预览和 Inspector；属性输入实时更新预览，失焦或 Enter 后自动保存，Undo / Redo 也会写回文件。Scene 写入携带当前文件版本，版本不一致时返回冲突而不是覆盖外部 Agent 的修改。

图片必须由用户或外部 Agent 放入项目；Editor 只索引现有图片，不提供导入、移动、重命名或删除源资源。

## Agent 工作流

Codex、Claude Code 和其他 coding agent 应直接编辑 `.scene` 文件，然后运行：

```bash
pixifact scene validate --all
pixifact compile-scenes
bun run build
```

不要编辑 `.pixifact/generated/**` 下的生成文件。

## 微信小游戏 target

项目在 `pixifact.project.json` 声明 `targets.wechat` 后，可运行：

```bash
pixifact validate --target wechat
pixifact build --target wechat
pixifact build --target wechat --mode development
pixifact dev --target wechat
```

`build` 默认使用 production mode，压缩 `game.js`；development mode 额外输出 source map。`dev` 固定使用 development mode，并在 Scene、脚本、平台配置或资源变化时重建。

输出目录由 `targets.wechat.outDir` 决定，可直接导入微信开发者工具。CLI 负责 target 校验、Scene 编译、主包资源 hash、资源分包 / HTTPS 远程资源映射、原生配置复制和 4 MiB 主包 / 20 MiB 总包检查，不负责上传、体验版、审核或发布。

完整配置和支持矩阵见 [微信小游戏构建](https://github.com/hxg2050/pixifact/blob/main/docs/zh/wechat-minigame.md)，可运行示例见 [wechat-minigame-demo](https://github.com/hxg2050/pixifact/tree/main/sample-projects/wechat-minigame-demo)。

## 环境要求

- Bun
- 目标项目已安装 `pixifact`
