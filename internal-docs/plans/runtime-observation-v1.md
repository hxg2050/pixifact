# Runtime Observation v1

## Goal

为 Vite Web 开发模式中的真实 PixiJS 游戏提供一条不依赖浏览器自动化工具的 Agent 运行时闭环：外部 Agent 可以发现当前游戏、读取 PixiJS 节点树与业务状态、读取日志，并通过等同玩家的指针和键盘输入操作游戏。

## Decisions

- `app.stage` 是唯一运行时节点树数据源；Scene 在运行时只是一棵普通 `Container` 子树，不建立 Scene Instance 树或 Compiler 映射。
- 游戏通过一次 `registerPixiRuntime(app, { getState? })` 注册当前页面唯一的 PixiJS `Application`；不提供独立 `registerRuntimeState`。
- `getState` 是可选同步回调，只在 `runtime state` 请求到达时执行并返回 JSON 快照。它可以通过正常的 JavaScript 作用域访问闭包或类内部状态，但 Runtime 不遍历 JavaScript 堆。
- `tree` 与 `node` 每次请求都现场遍历 `app.stage`，不缓存、不订阅、不维护节点树副本。
- 节点身份直接复用 PixiJS `uid`。`tree` 保留 `children` 原始顺序与 child index；不创建 Pixifact runtime node ID 或 locator。
- `tree` 返回轻量层级、transform、显示与交互字段，不为所有节点计算 bounds。
- `node <uid>` 返回详细 transform、尺寸、local/global bounds、显示与交互字段，以及 Sprite、Text、BitmapText 的有限类型信息。Graphics 不序列化绘制指令。
- 开发客户端自动捕获既有 `console.debug/log/info/warn/error`、`window.error` 和 `unhandledrejection`，保留最近 500 条内存日志；不要求游戏注册日志 provider。
- 日志使用单调递增 `seq`；CLI 支持按 `after` 与 `level` 获取快照，不实现持久化或 follow 长连接。
- Runtime 输入只模拟用户可执行的 pointer 与 keyboard 输入，不提供节点方法调用、业务方法调用、eval、节点属性修改或业务状态修改。
- 点击坐标使用 Pixi renderer screen 坐标，浏览器 Runtime 根据 Canvas DOM bounds 换算 client 坐标后分发正常事件序列；不提供 `node <uid> click`。
- Transport 由 `pixifactRuntimePlugin` 复用 Vite 开发服务器和现有 HMR WebSocket，不启动额外 Runtime Host 或固定端口。
- Vite 插件在系统临时目录登记项目级 `{ projectRoot, origin, token }` descriptor；CLI 按当前项目发现，所有 HTTP 请求限制为 loopback origin 并携带私有 token。
- 一个 Vite 页面只允许一个注册的 `Application`。多个打开页面以每页生成的 `runtimeId` 区分；只有一个时 CLI 自动选择，多个时要求 `--runtime <runtime-id>`。
- `runtime tree` 默认输出终端 JSON；传入 `--output <json-path>` 时，CLI 保存带有 `schemaVersion`、`capturedAt`、`runtimeId` 和 `root` 的一次性节点树快照。快照不是项目数据源，页面刷新后必须重新生成。
- `runtime screenshot` 默认将 PNG 保存到项目根下 `.pixifact/runtime/frame.png`；传入 `--output <png-path>` 时覆盖默认路径。截图只捕获已注册 Application 的 `app.stage`。
- 第一版只支持 Vite Web 开发模式；不接入 Editor Authoring Preview、微信小游戏或 production build。

## Non-Goals

- 不执行项目任意 JavaScript，不遍历 JavaScript 堆，不提供远程调试器。
- 不建立 Scene Instance runtime 模型，不返回 Scene 路径、Compiler locator、Props 或 Binding。
- 不提供节点树 Diff、状态订阅、历史记录、日志持久化或日志 follow。
- 不提供 Scenario、断言、任务编排、自动等待条件或 Agent 专用业务动作。
- 不提供节点 mutation、业务状态 mutation、直接节点 click 或方法调用。
- 不提供网络抓包、性能分析、游戏手柄、多指触摸或微信小游戏 transport。

## Public API / User-Facing Behavior

Vite 配置启用开发 transport：

```ts
import { pixifactRuntimePlugin } from 'pixifact/compiler-node';

export default defineConfig({
  plugins: [pixifactRuntimePlugin()],
});
```

游戏启动完成后注册一次：

```ts
if (import.meta.env.DEV) {
  const { registerPixiRuntime } = await import('pixifact/runtime-dev');
  registerPixiRuntime(app, {
    getState: () => ({
      phase: game.phase,
      player: { hp: player.hp },
    }),
  });
}
```

CLI 第一版命令：

```bash
pixifact runtime list
pixifact runtime tree [--output <json-path>] [--runtime <runtime-id>]
pixifact runtime screenshot [--output <png-path>] [--runtime <runtime-id>]
pixifact runtime node <pixi-uid> [--runtime <runtime-id>]
pixifact runtime state [--runtime <runtime-id>]
pixifact runtime logs [--after <seq>] [--level <level>] [--runtime <runtime-id>]
pixifact runtime input click --x <x> --y <y> [--runtime <runtime-id>]
pixifact runtime input move --x <x> --y <y> [--runtime <runtime-id>]
pixifact runtime input key <key> [--runtime <runtime-id>]
pixifact runtime input keydown <key> [--runtime <runtime-id>]
pixifact runtime input keyup <key> [--runtime <runtime-id>]
```

`runtime input` 成功只表示事件已经分发，不表示动画、异步加载或游戏流程已经稳定。外部 Agent 通过重复查询 `state`、`tree` 和 `logs --after` 判断结果，超时与轮询由外部 Agent 控制。

## Implementation Scope

- `packages/pixifact/src/runtime-dev/`：浏览器开发客户端、`registerPixiRuntime`、Pixi tree/node 序列化、状态快照、日志环形缓冲和输入分发。
- `packages/pixifact/src/compiler-node/`：Vite Runtime plugin、项目级 session descriptor、HMR 请求路由和 loopback HTTP 入口。
- `packages/pixifact-cli/src/`：Runtime session 查询与 CLI 参数/输出。
- `tests/`：浏览器 Runtime 单元测试、transport/session 测试、CLI 行为测试和示例项目接入验证。
- `sample-projects/adventure-ui-demo/`：启用 Vite plugin、注册 Application 和最小业务状态，作为真实 Web 验收入口。
- `README.md`、`README.en.md`、`docs/zh/`、`docs/en/`：记录下游接入方式、命令与安全边界。

## Test Plan

- [x] 浏览器 Runtime：现场遍历 stage、保持 children 顺序、按 Pixi uid 查询详情、类型字段与动态增删节点。
- [x] 浏览器 Runtime：`getState` 按请求执行、未注册 state 时返回明确结果、非法快照返回结构化失败。
- [x] 浏览器 Runtime：自动日志捕获、Error stack、seq、after/level 过滤、500 条上限和不影响原 console 输出。
- [x] 浏览器 Runtime：renderer 坐标到 client 坐标换算、click/move/key/keydown/keyup 事件序列。
- [x] Transport：项目 descriptor 创建/移除、token 校验、runtime announce/disconnect、多页面选择和请求响应/超时。
- [x] CLI：list、单 runtime 自动选择、多 runtime 强制选择、tree/node/state/logs/input 参数与失败输出。
- [x] CLI：按需将完整 Runtime 节点树保存为可搜索的 JSON 快照，失败时不创建文件。
- [x] CLI：Runtime screenshot 默认路径、显式输出路径和失败时不创建文件。
- [x] 示例项目：Vite production build 不包含启动中的 Runtime 注册；开发模式可由 CLI 完成 tree/state/logs/input 查询。

## Verification

```bash
rtk bunx --no-install vitest run tests/runtime-client.test.ts
rtk bunx --no-install vitest run tests/runtime-session.test.ts tests/pixifact-cli.test.ts
rtk bun run build
rtk bun run --cwd sample-projects/adventure-ui-demo build
rtk bun run test -- --maxWorkers=1
```

真实验收：启动 `sample-projects/adventure-ui-demo` 的 Vite dev server，在浏览器打开游戏后，仅通过 `pixifact runtime ...` CLI 完成 runtime 发现、节点读取、状态读取、日志增量读取和按钮点击验证。

## Progress

- [x] 完成产品边界与第一版命令讨论。
- [x] 建立实现计划与 BDD。
- [x] 完成浏览器 Runtime 客户端。
- [x] 完成 Vite transport 与项目 session discovery。
- [x] 完成 Runtime CLI。
- [x] 完成示例项目与对外文档。
- [x] 完成自动化和真实端到端验证。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md`、本文件和 `internal-docs/testing/TESTING.md`。
2. 检查 worktree，不覆盖无关用户改动。
3. 运行 `Resume Notes` 中的最小相关失败测试。
4. 从 `Next` 继续，不重新打开 `Decisions` 中已经确定的产品边界。
5. 如果停止时任务未完成，先更新本文件的 Progress 与 Resume Notes。

## Resume Notes

Last updated: 2026-08-15

Done:
- 已完成 Runtime v1 产品讨论和实现计划。
- 已实现 `pixifact/runtime-dev`、Vite Runtime plugin、项目 descriptor、CLI runtime 命令和示例项目接入。
- Runtime client 已通过全局 Symbol 在模块热更新后复用，公开入口只保留 `registerPixiRuntime`。
- 已通过 19 个测试文件、269 项单 worker 全量测试、核心包构建、Editor 类型检查、Editor 前端构建和示例生产构建。
- 已在真实 Vite 页面中通过 CLI 完成 runtime list、tree、node、state、logs 和坐标 click；已验证双页面必须显式选择 `--runtime`。
- 已完成 `runtime tree --output <json-path>`，快照包含采集元数据和当前 `app.stage`，适合 Agent 在文件中搜索，且不写入 `.scene`。
- Runtime screenshot 省略 `--output` 时写入项目根下 `.pixifact/runtime/frame.png`，显式路径仍可覆盖。

Current State:
- Runtime v1 实现和验证完成，当前示例开发服务器可在 `http://127.0.0.1:5178/` 使用。

Currently Failing:
- 无目标测试失败。并行运行核心包构建与示例构建时会因核心 dist 清理产生竞争；已改为串行验证并通过。

Next:
1. 后续真实游戏接入后，再根据实际 Agent 工作流评估是否需要扩展拖拽或等待。
