# Pixifact Adventure UI Demo

这是 Pixifact 仓库内的竖屏移动端示例项目，设计分辨率为 `750x1334`。
项目使用 `viewport.mode = "fixedWidth"`：设计宽度固定为 `750`，逻辑高度随真实屏幕比例变化。
示例只使用 npm 包公开入口，可以复制到仓库外独立安装和运行。

它展示：

- `.scene` 与同名 `.ts` 脚本配对。
- `Rect`、`Image`、`NineImage`、`TileImage` 的基础用法。
- `GridContainer`、`HBoxContainer`、`VBoxContainer`、`ScrollContainer` 的简单组合布局。
- Scene instance 的 props、events 和 slots 契约。

常用命令：

```bash
bun install
bun run compile:scenes
bun run dev
bun run build
pixifact editor
```
