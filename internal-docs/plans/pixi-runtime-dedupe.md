# Pixi Runtime Dedupe

状态：自动化验证完成，待抖音开发者工具复验
最后更新：2026-08-12

## Goal

确保 Pixifact 的统一 Vite 构建始终从下游项目解析唯一一份 `pixi.js`，避免本地 `file:`、workspace 或 symlink 依赖生成多个 PixiJS 运行时实例。

## Decisions

- 在 Pixifact Vite plugin 中加入 `resolve.dedupe: ['pixi.js']`，对 Web、微信和抖音共同生效。
- 保留用户已有的 `resolve.dedupe`，不覆盖其他依赖去重配置。
- 不修改 PixiJS、抖音 Canvas adapter 或游戏文字样式来掩盖重复运行时。
- `pixifact` 本身不加入 dedupe；当前故障由 PixiJS 单例身份断裂导致，额外约束没有已证明的需要。

## Non-Goals

- 不处理不同 PixiJS 版本的兼容。
- 不修改平台包 peer dependency 范围。
- 不改变小游戏 Canvas、文字或资源加载 API。

## Public API / User-Facing Behavior

无新增 API。下游项目继续使用现有 `pixifact()` Vite plugin；本地包和正式 npm 包都应生成单一 PixiJS 运行时。

## Implementation Scope

- 更新 `packages/pixifact/src/compiler-node/vite.ts` 的共享 Vite 配置。
- 扩展 `tests/unified-vite-platform.test.ts`，覆盖三个 target 和用户 dedupe 合并。
- 使用 `/Users/youxia/work/ai-agent-games/dflld` 的本地 `file:` 依赖构建做真实验收。

## Test Plan

- 先证明当前三个 target 的 resolved config 缺少 `pixi.js` dedupe。
- 修复后运行统一 Vite 平台测试和小游戏相关测试。
- 运行全量测试与框架构建。
- 重建真实抖音游戏，确认 bundle 仅包含一份 PixiJS `Texture` 模块和一次 `Texture.WHITE` 初始化。

## Verification

- Red：统一 Vite 平台测试确认三个 target 的 resolved config 均缺少 `pixi.js` dedupe，用户配置只保留 `user-runtime`。
- `bunx --no-install vitest run tests/unified-vite-platform.test.ts` 通过：6 tests。
- `bunx --no-install vitest run tests/unified-vite-platform.test.ts tests/wechat-target.test.ts tests/douyin-target.test.ts` 通过：12 tests。
- `bun run test` 通过：23 files、292 tests。
- `bun run build` 通过：`pixifact`、`@pixifact/platform-wechat`、`@pixifact/platform-douyin`。
- 真实项目 `/Users/youxia/work/ai-agent-games/dflld` 的 TypeScript、Web validate/build、抖音 validate/build 和 6 项游戏测试通过。
- 真实抖音主包从 2,217,973 bytes 降至 1,851,842 bytes。
- 真实未压缩 bundle 只有一个 PixiJS `Texture.mjs` 来源、一次 `Texture.WHITE` 初始化、一套 `getCanvasFillStyle` 和 `handleColorLike`。
- 正式压缩 bundle 不含 Web runtime、微信 adapter、`localStorage` 或绝对 Scene 资源路径；最小 `tt` 启动检查通过。
- 尚待用户在抖音开发者工具复验文字 Canvas texture 渲染。

## Progress

- [x] 通过抖音开发者工具堆栈和未压缩 bundle 确认重复 PixiJS 根因。
- [x] 增加失败测试。
- [x] 实施共享 dedupe 配置。
- [x] 完成框架与真实游戏自动化验证。
- [ ] 完成抖音开发者工具和真机复验。

## Resume Protocol

读取本文件、`AGENTS.md` 和 `CODEX.md`，检查 worktree 后，从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-08-12

Done:
- 未压缩抖音 bundle 同时包含项目 `node_modules/pixi.js` 与 Pixifact 仓库 `node_modules/.bun/pixi.js@8.18.1`。
- 已确认两份 `Texture.WHITE` 破坏纯色文字 fill 的身份比较，并导致错误调用 `createPattern(Uint8Array, 'repeat')`。
- Pixifact 的共享 Vite config 已强制 dedupe `pixi.js`，并保留用户已有 dedupe 配置且不产生重复项。
- 框架相关测试、全量测试、包构建和真实游戏 Web/抖音构建均通过。
- 真实抖音 bundle 已确认只包含一份 PixiJS runtime。

Current State:
- 自动化修复完成，`/Users/youxia/work/ai-agent-games/dflld/dist/douyin` 已重新生成，使用临时验证 AppID。

Currently Failing:
- 无自动化失败；等待开发者工具确认原 `createPattern` 错误消失。

Next:
1. 用户清理抖音开发者工具缓存并重新导入最新 `dist/douyin`。
2. 验证启动、文字、图片、触摸和 Scene 切换。
3. 获得真实 AppID 后生成最终发布产物并完成真机验收。
