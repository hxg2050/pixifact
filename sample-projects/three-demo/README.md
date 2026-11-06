# Three.js 三端示例

同一入口构建 Web、微信、抖音。Three 世界使用普通 glTF，Pixifact `.scene` 显示 HUD；拖动旋转、滚轮/双指缩放、点击模型变色，HUD 按钮暂停/恢复旋转。

在仓库根运行 `bun install && bun run build`，再进入本目录：

```bash
bun run dev
bun run build:web
bun run build:wechat
bun run build:douyin
```

Web 地址为 `http://127.0.0.1:5181`。小游戏产物为 `dist/wechat` / `dist/douyin`，实际预览前在对应 mode env 填入自己的 AppID。

`src/main.ts` 创建 Application、资源 manifest 和 HUD；动态导入 `src/game.ts`。Three 和插件 runtime 位于 `game` 代码分包，`resources/models/gem.gltf` 位于 `models` 资源分包。Vite 配置仅组合 `pixifact()`、`three()` 和开发 Runtime transport。

Web 开发可在本目录执行 `pixifact runtime state`、`pixifact runtime screenshot`，截图同时包含模型和 UI。该示例不依赖 WASM。

[插件接口与资源规则](../../docs/zh/three.md)
