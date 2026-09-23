# Playable Sample and Agent Evaluation

状态：Web 样板、首轮评测、新项目 Runtime 接入、源码定位和 Agent 验证流程完成；统计复测待开展
权威范围：Web 可玩示例与 Agent 游戏开发任务评测
上游文档：[./index.md](./index.md)、[../../AGENTS.md](../../AGENTS.md)

## Goal

新增有开始、操作、胜负和重开闭环的 Web 竖屏小游戏，并提供可复现的 Agent 任务评测，用实际完成率指导后续 Pixifact 能力建设。

## Decisions

- 在 `sample-projects/star-game-demo` 新建独立 Web 示例，保留现有三端示例原样。
- 游戏为九宫格“追星”：点击高亮格得分，点错损失机会；达到目标分数获胜，机会耗尽失败，可重新开始。
- `.scene` 保存全部视觉节点；配对 `Main.ts` 负责 Pixi 事件与界面更新；纯游戏规则单独放入 `gameLogic.ts` 供行为测试。
- 关卡数据由 Web 示例本地资源包的 `level.json` 提供，目标顺序固定，使玩法和测试可复现。
- Agent 评测使用固定任务、独立项目副本、现有 CLI 和明确的验收记录。评测文档不负责启动或编排 Agent。
- 下一阶段先让 `create-pixifact` 的 Web 最小模板默认接入已有开发期 Runtime；Vite 插件只在 serve 时启用，游戏注册仍由 `import.meta.env.DEV` 限定。
- 模板菜单显式暴露按钮是否按过的最小业务状态，作为下游 Agent 扩展 `getState` 的示例；不让 Runtime 猜测游戏语义。
- Runtime 截图应保留 `app.stage` 的视口变换，与 Web 游戏画面一致；发现截图偏差后直接修正已有截图实现。

## Non-Goals

- 不增加内置 AI、Agent 编排、Git 流程、远程资源或新依赖。
- 不扩展 `.scene` 语法；Runtime 仅增加可选的来源观测字段，不添加 mutation 入口。
- 本轮不做 Web 产物构建、小游戏目标或真机验收。

## Public API / User-Facing Behavior

- Web 示例启动后显示中文游戏界面与开始按钮。
- 开始后高亮一个目标格；点击正确得分并切换目标，点击错误减少机会。
- 达到关卡目标分数显示胜利，机会耗尽显示失败；两种结果都可重新开始。
- 示例 README 说明玩法、开发命令与评测入口。
- 新创建的 Web 项目启动开发服务器后，可直接使用 Runtime CLI 获取节点树、截图、菜单状态并点击按钮；点击后状态从未开始变为已开始。

## Implementation Scope

- 新增 Web 示例关卡数据、`Main.scene`、`Main.ts`、启动逻辑与 README。
- 增加纯规则行为测试和示例结构测试。
- 在 `internal-docs/testing/` 增加 Agent 任务评测协议与固定任务，并接入测试文档导航。

## Test Plan

1. 先为开始、正确点击、错误点击、胜负和重开写失败的规则测试。
2. 检查 Web 示例的 Scene 配对与资源读取。
3. 运行 Scene 校验与编译、TypeScript 检查。
4. 人工运行 Web 开发服务，验证完整玩法与布局。
5. 对生成的新项目检查开发期 Runtime 接入，并在真实 Web 页面中用 CLI 验证菜单点击前后的状态和节点观测。

## Verification

```bash
bunx --no-install vitest run tests/sample-game.test.ts tests/sample-projects.test.ts
bun packages/pixifact-cli/src/pixifact-cli.ts scene validate --all --project-root sample-projects/star-game-demo
bun packages/pixifact-cli/src/pixifact-cli.ts compile-scenes --project-root sample-projects/star-game-demo
bunx --no-install tsc --noEmit -p sample-projects/star-game-demo/tsconfig.json
bun run --cwd sample-projects/star-game-demo dev
```

## Progress

- [x] 确定玩法、数据边界和评测范围。
- [x] 行为测试与游戏实现。
- [x] Agent 评测文档。
- [x] Web 验证与人工验收。
- [x] 使用相同基线的独立副本完成 E1–E3 首轮试验和评测人独立验收。
- [ ] 每题至少三次独立重复，并记录耗时、修复轮次和人工介入。
- [x] 让新项目模板默认具有 Web 开发期 Runtime 观测与输入能力。
- [x] 修正 Runtime 截图对视口平移和缩放的遗漏。
- [x] 让 Runtime tree/node 的编译节点指向 `.scene` 来源与 locator。
- [x] 在下游 Agent skill 与 Runtime 文档中明确输入前后状态、截图和增量日志的验证流程。

## Verification Results

- `tests/sample-game.test.ts` 和 `tests/sample-projects.test.ts`：6 项通过。
- `scene validate --all`：Web 示例 1 个 Scene 通过；`compile-scenes` 通过；示例 TypeScript 检查通过。
- `bun run test`：26 个测试文件、321 项测试通过。
- 浏览器开发模式：开始、正确点击、三次错点失败、重开、八次正确点击获胜均通过；`runtime state` 返回胜利状态和 8 分。
- 按用户范围约束，没有运行 Web 发布构建、微信或抖音构建。
- E1–E3 各一次独立 Agent 试验：Scene 校验、编译、TypeScript 检查、最小相关测试及 Web/Runtime 验收全部通过；详细证据见 [Agent 游戏开发评测](../testing/AGENT_GAME_EVAL.md)。
- 新建最小 Web 项目：Scene 校验、编译、TypeScript 检查通过；真实浏览器中 `runtime list/tree/state/input/screenshot` 可用，点击前后 `startPressed` 从 `false` 变为 `true`。
- Runtime 截图修正：在有视口缩放的 Web 示例中，CLI PNG 与浏览器 Canvas 的游戏区域位置和尺寸一致。
- 本轮 `bun run test`：26 个测试文件、322 项通过；核心包与示例项目 TypeScript 检查、下游 skill 校验通过。没有运行发布构建。
- Agent 验证流程：操作前读取业务状态和日志序号，操作后读取新状态、增量日志与截图；不能把 `dispatched: true` 当作成功证据。
- 来源定位：`src/scenes/Main.scene` 的游戏按钮在真实 Web Runtime 中返回 `source.locator: "23:actionButton"`；子 Scene 实例的父子来源由编译与 Runtime 单元测试覆盖。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 检查 worktree 状态。
3. 运行 Verification 中的最小相关失败测试。
4. 从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-24

Done:
- 新增独立 Web 可玩示例、规则测试、Runtime 状态接入和固定 Agent 任务评测文档。
- 用户明确要求先只考虑 Web，构建以后再做；现有三端示例未改动。
- 完成 Scene 校验、编译、类型检查、全量测试和浏览器完整玩法验收。
- 完成 E1–E3 首轮独立 Agent 试验；三个结果留在独立 worktree 提交，没有合入样板基线。
- 新建 Web 项目默认注册开发期 Runtime，并公开菜单的最小业务状态；修正截图忽略视口变换的问题。
- 编译节点现有 `.scene` 来源标记，Runtime tree/node 可返回来源；子 Scene 实例可定位回父 Scene 的放置位置。
- 下游 Agent skill 和 Runtime 文档已写明 Web 输入后的状态、截图、日志验证流程。

Current State:
- 可在 `sample-projects/star-game-demo` 运行 Web 游戏。E1–E3 首轮各一次验收通过，但样本量不足以估计稳定完成率，耗时和修复轮次也未可靠采集。
- 独立 worktree 共享 `node_modules` 时，Vite 默认配置加载受路径影响；首轮 Web 验收使用 `--configLoader runner`。后续评测应固定依赖布局和启动方式。
- 新建项目可直接由 Runtime CLI 观察和操作；截图保留视口变换，编译节点带 `.scene` 来源。输入命令只返回事件已分发，Agent 使用状态、截图和增量日志确认结果。

Currently Failing:
- 无。

Next:
1. 固定可重复的 Web 评测环境，自动保存开始/结束时间、修复轮次、Runtime 状态、截图和最终 diff；E1–E3 各重复到至少三次，并增加从空白 Web 项目创建完整游戏的任务。
2. 根据复测中的实际定位困难，决定是否扩展 CLI 输入返回值。
