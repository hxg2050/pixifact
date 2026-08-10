# Pixifact 微信小游戏示例

此项目使用同一份 `.scene` 和游戏启动逻辑构建 Web、微信小游戏与抖音小游戏。示例覆盖普通中文 `Text`、`Graphics`、`ScrollContainer`、小游戏触摸事件和资源分包。

```bash
bun run dev
bun run build:web
bun run validate:wx
bun run build:wx
bun run dev:wx
bun run validate:dy
bun run build:dy
bun run dev:dy
```

Web 构建产物位于 `dist/web`。微信构建产物位于 `dist/wechat`，抖音构建产物位于 `dist/douyin`，两个小游戏目标互不清理。正式项目应将 `platforms/wechat/project.config.json` 中的 `touristappid` 和 `platforms/douyin/project.config.json` 中的 `appid` 替换为自己的 AppID。

`resources/demo-level` 是三个目标共享的资源包源目录。Web 通过 Vite `publicDir` 提供该目录，小游戏 target builder 将它复制到 `subpackages/demo-level`，并在缺少入口时生成资源分包所需的空 `game.js`。

Pixifact 只生成可导入目录，不负责上传、体验版、审核或发布。微信配置见 [微信小游戏构建](../../docs/zh/wechat-minigame.md)，抖音配置见 [抖音小游戏构建](../../docs/zh/douyin-minigame.md)。
