# Douyin Image Loading

状态：自动化验证完成，待抖音开发者工具冷启动验收
最后更新：2026-08-12

## Goal

修复抖音小游戏冷启动时 PixiJS `Assets.load()` 可能在平台图片真正完成解码前创建纹理，导致 `texImage2D: bad image data`、图片不显示，而刷新后因缓存时序变化恢复的问题。

## Decisions

- 修复归属 `@pixifact/platform-douyin`，下游游戏继续只使用 PixiJS `Assets.load()` / `Assets.loadBundle()`。
- 抖音 `createApplication()` 注册高于 PixiJS 默认图片 parser 优先级的专用 loader。
- loader 使用 `tt.createImage()`，先绑定 `onload` / `onerror`，再设置 `src`。
- 不读取 `image.complete`；抖音基础库 2.82.0 起不再支持用该字段判断图片加载成功。
- `onload` 后要求 `width` 和 `height` 为有限正数，并以实际像素尺寸和资源 resolution 创建 `ImageSource`。
- 加载错误或尺寸无效时抛出包含资源 URL 的错误，不静默产生无效纹理。
- 第一版不加入轮询、固定延时、重试、并发限制或 fallback；只有新的真机证据证明平台在 `onload` 后仍延迟提供尺寸时再扩展。
- loader 只进入抖音包；Web 和微信产物不改变。

## Non-Goals

- 不修改 PixiJS 源码。
- 不修改下游游戏的资源加载方式或启动时序。
- 不照搬参考项目中的 16ms 尺寸轮询和 10 秒超时。
- 不处理真实 GPU 显存耗尽；当前游戏资源尺寸和刷新后恢复现象均不支持该根因。

## Public API / User-Facing Behavior

无新增公开 API。抖音项目完成 `createApplication()` 后，现有 `Assets.load(url)` 在图片 `load` 事件到达且尺寸有效后才完成。

## Implementation Scope

- `packages/platform-douyin/src/`：增加抖音图片 loader，并在 `createApplication()` 中安装。
- `tests/`：覆盖冷启动时序、事件注册顺序、有效尺寸、无效尺寸和目标 bundle 隔离。
- `/Users/youxia/work/ai-agent-games/dflld`：框架验证通过后重新构建抖音目标，不修改游戏加载代码。

## Test Plan

- [x] `complete: true` 时也必须等待 `onload`，且 loader 不读取 `complete`。
- [x] `onload` / `onerror` 必须在设置 `src` 前注册。
- [x] `onload` 后以有效宽高创建 `Texture` / `ImageSource`。
- [x] `onload` 后宽高为零时明确失败且错误包含 URL。
- [x] 原生图片加载失败时错误包含 URL。
- [x] Web 和微信 bundle 不包含抖音图片 loader。
- [x] 抖音 `createApplication()` 自动安装 loader。

## Verification

```bash
bunx --no-install vitest run tests/douyin-image-assets.test.ts tests/douyin-platform-runtime.test.ts tests/unified-vite-platform.test.ts
bun run test
bun run build
git diff --check
```

下游自动验证：在 `/Users/youxia/work/ai-agent-games/dflld` 运行现有测试、抖音 validate 和 build。

手工验收：清理抖音开发者工具缓存后冷启动，确认首屏和场景图片首次启动即显示，且控制台不再出现 `texImage2D: bad image data` / `invalid image`。

## Progress

- [x] 根据错误、PixiJS 8.18.1 默认 loader、抖音图片 API 文档和参考项目确认根因。
- [x] 确认最小平台修复方案。
- [x] 增加失败测试。
- [x] 实现抖音图片 loader。
- [x] 完成框架和下游自动验证。
- [ ] 完成抖音开发者工具冷启动验收。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 检查 worktree，保留无关用户改动。
3. 运行 Resume Notes 中的最小测试。
4. 从 Next 第一项继续，不重新讨论 Decisions。
5. 未完成时更新 Progress 和 Resume Notes。

## Resume Notes

Last updated: 2026-08-12

Done:
- 已确认默认 PixiJS loader 的 `src -> complete -> handlers` 顺序与抖音 `load` 事件契约冲突。
- 已确认修复只进入 `@pixifact/platform-douyin`，用户加载心智和 Web/微信行为不变。
- 已实现高优先级抖音图片 loader，并由 `createApplication()` 自动安装。
- loader 先注册事件再设置 `src`，不读取 `complete`，只在 `onload` 且宽高有效后创建显式尺寸的 `ImageSource`。
- `bun run test` 通过：25 个测试文件、296 项测试。
- `bun run build` 通过：`pixifact`、`@pixifact/platform-wechat`、`@pixifact/platform-douyin`。
- 三端隔离测试确认只有抖音 bundle 包含 `pixifact-douyin-image` loader。
- 下游 `/Users/youxia/work/ai-agent-games/dflld` 的 6 项游戏测试、TypeScript、抖音 validate/build 均通过；最终主包 1,852,743 bytes。

Current State:
- 框架修复和下游抖音产物已生成，等待开发者工具清缓存后的首次冷启动验收。

Currently Failing:
- 无自动化失败。
- 尚未完成抖音开发者工具和真机的冷启动复验。

Next:
1. 在抖音开发者工具清理缓存并重新导入 `/Users/youxia/work/ai-agent-games/dflld/dist/douyin`。
2. 不先刷新，直接冷启动验证首屏和场景图片均显示。
3. 确认控制台不再出现 `texImage2D: bad image data` 或 `texImage2D: invalid image`。
