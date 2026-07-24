# Pixifact 微信小游戏示例

此项目使用同一份 `.scene` 和游戏启动逻辑构建 Web 与微信小游戏。示例覆盖普通中文 `Text`、`Graphics`、`ScrollContainer`、微信触摸事件和资源分包。

```bash
bun run dev
bun run build:web
bun run validate:wx
bun run build:wx
bun run dev:wx
```

Web 构建产物位于 `dist/web`。微信构建产物位于 `dist/wechat`，可直接作为小游戏项目导入微信开发者工具；两个目标互不清理。正式项目应将 `platforms/wechat/project.config.json` 中的 `touristappid` 替换为自己的 AppID。

`resources/demo-level` 是 Web 与微信共享的资源包源目录。Web 通过 Vite `publicDir` 提供该目录，微信 target builder 将它复制到 `subpackages/demo-level`，并在缺少入口时生成资源分包所需的空 `game.js`。

Pixifact 只生成可导入目录，不负责上传、体验版、审核或发布。完整配置和支持矩阵见 [微信小游戏构建](../../docs/zh/wechat-minigame.md)。
