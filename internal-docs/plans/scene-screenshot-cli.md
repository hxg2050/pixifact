# Scene Screenshot CLI

状态：完成
权威范围：无需活动 Editor 的 Web Authoring Scene 截图
上游文档：[./index.md](./index.md)、[../../AGENTS.md](../../AGENTS.md)

## Goal

外部 Agent 从项目根目录指定任意 `.scene`，直接得到设计尺寸的静态 PNG，不要求用户启动 Editor、打开目标 Scene 或运行游戏。

## Decisions

- 新增 `pixifact scene screenshot --scene <project-relative.scene> --output <png-path>`；`--project-root` 沿用其他 Scene 命令。输出文件仅在截图成功后写入。
- 截图读取磁盘上的 `.scene` 和配对脚本接口，复用现有 Authoring Preview 构建器与 PixiJS 截图逻辑；不执行项目脚本，不更改 Scene。
- CLI 启动短时、仅 loopback、只读的项目资源服务和无界面 Chromium。该服务不创建 Editor session descriptor，不打开 Editor UI，也不接管已有 Editor。
- 使用 Playwright 操作本机 Chrome 的独立无界面浏览器上下文；不实现自定义 CDP 或第二套 Scene renderer。
- 截图固定为 Scene 设计尺寸与 1 倍分辨率，不包含 Editor 选择框、画布缩放和平移。
- 保留现有 `editor screenshot` 的“当前人类工作上下文”语义；新命令按路径读取磁盘文件。两者用途不同。
- 错误需明确返回，缺失资源或预览失败不生成 PNG；静态 Authoring Preview 与运行时游戏画面是不同的观测对象。

## Non-Goals

- 不截图项目 TypeScript 脚本产生的动态游戏状态；运行状态继续由 `runtime screenshot` 提供。
- 不做批量截图、watch、持续服务器、微信或抖音目标。
- 不新增 Editor 内的 Agent 编排或修改入口。

## Public API / User-Facing Behavior

```bash
pixifact scene screenshot --scene src/scenes/Menu.scene --output /tmp/menu.png
pixifact scene screenshot --scene src/scenes/Menu.scene --output /tmp/menu.png --project-root /path/to/game
```

成功返回 Scene 路径、revision、PNG 宽高、字节数和输出绝对路径。需要本机安装 Google Chrome；缺失文件、校验失败、资源错误、浏览器缺失或截图失败时返回明确错误，且不写输出文件。

## Implementation Scope

- `apps/editor/src/preview/`：抽出当前 Authoring Preview PNG 提取逻辑供 Editor 和独立截图入口共用。
- `apps/editor/` 与根 Vite 配置：新增最小浏览器截图入口并随 Editor 静态资源打包。
- `packages/pixifact-cli/src/`：临时项目服务、Playwright 截图驱动、CLI 命令和错误输出。
- 文档和下游 skill：说明命令、静态预览边界和 AI 视觉验证流程。

## Test Plan

1. 先写 CLI 行为测试：指定非当前 Scene、结果元数据、失败不写文件、参数错误和帮助输出。
2. 验证独立截图页复用 Authoring Preview，能读取嵌套 Scene 和图片资源。
3. 在无 Editor session 的真实 Web 示例运行命令，检查 PNG 尺寸与可见内容；在 Editor 打开另一个 Scene 时重复，确认当前 Editor 上下文不变。
4. 运行相关测试、Editor TypeScript 检查和前端静态资源构建；不运行游戏发布构建。

## Verification

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts tests/editor-server.test.ts
bun run editor:typecheck
bun run editor:frontend:build
bun run test
```

## Progress

- [x] 核对现有 Editor 截图与 Authoring Preview 数据流。
- [x] 写失败测试并实现独立 Scene 截图。
- [x] 完成真实 Web 项目截图与 Editor 不受影响的验收。
- [x] 更新文档并通过验证。

## Verification Results

- CLI 测试先红后绿；全量 `bun run test`：26 个测试文件、325 项通过。
- `bun run editor:typecheck`、`bun run editor:frontend:build`、下游 skill 校验及 `git diff --check` 通过。
- 无活动 Editor Host 时，`star-game-demo` 的 `Main.scene` 输出 750×1334 PNG；另一个临时项目的 `Main.scene` 输出 320×200 PNG，子 `Card.scene` 和 SVG 资源显示正确。
- 临时项目中无界面 Editor 保持 `Card.scene` 打开：现有 `editor screenshot` 仍能返回 PNG；独立命令截图 `Main.scene` 后 Editor 上下文仍为 `Card.scene`。
- 没有运行游戏发布构建。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 检查 worktree，保留用户未跟踪文档。
3. 从 `Progress` 和 `Resume Notes` 继续，先运行最小相关测试。

## Resume Notes

Last updated: 2026-09-24

Done:
- 现有 `editor screenshot` 依赖活动 Editor 当前 Scene 和 ready 的 Authoring Preview。
- Authoring Preview 构建器可从项目文件服务读取 `.scene`、脚本接口和资源，Pixi 提取结果已按设计尺寸独立于画布缩放。
- 新命令、短时只读 loopback 服务、无界面 Chrome 截图页和共用 Pixi PNG 提取逻辑已实现。
- 命令文档与下游 Agent skill 已更新；真实 Web、嵌套 Scene、SVG 资源和现有 Editor 隔离验收通过。

Current State:
- 功能完成。`scene screenshot` 读取磁盘文件，现有 `editor screenshot` 继续代表当前活动 Editor Scene。

Currently Failing:
- 正式测试和 Editor typecheck 无失败。额外对尚无独立 typecheck 脚本的 CLI 临时运行严格 `tsc` 时，发现 `automation.ts` 和 `runtimeSession.ts` 的 3 项既有类型错误，均不在本次新增代码中。

Next:
1. 无本任务待办；后续可用 Agent 视觉任务验证截图对迭代效率的帮助。
