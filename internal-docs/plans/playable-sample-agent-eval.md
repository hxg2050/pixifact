# Playable Sample and Agent Evaluation

状态：完成；固定任务尚未运行外部 Agent 试验
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

## Non-Goals

- 不增加内置 AI、Agent 编排、Git 流程、远程资源或新依赖。
- 不扩展 `.scene` 语法或 Runtime 公共 API。
- 本轮不做 Web 产物构建、小游戏目标或真机验收。

## Public API / User-Facing Behavior

- Web 示例启动后显示中文游戏界面与开始按钮。
- 开始后高亮一个目标格；点击正确得分并切换目标，点击错误减少机会。
- 达到关卡目标分数显示胜利，机会耗尽显示失败；两种结果都可重新开始。
- 示例 README 说明玩法、开发命令与评测入口。

## Implementation Scope

- 新增 Web 示例关卡数据、`Main.scene`、`Main.ts`、启动逻辑与 README。
- 增加纯规则行为测试和示例结构测试。
- 在 `internal-docs/testing/` 增加 Agent 任务评测协议与固定任务，并接入测试文档导航。

## Test Plan

1. 先为开始、正确点击、错误点击、胜负和重开写失败的规则测试。
2. 检查 Web 示例的 Scene 配对与资源读取。
3. 运行 Scene 校验与编译、TypeScript 检查。
4. 人工运行 Web 开发服务，验证完整玩法与布局。

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

## Verification Results

- `tests/sample-game.test.ts` 和 `tests/sample-projects.test.ts`：6 项通过。
- `scene validate --all`：Web 示例 1 个 Scene 通过；`compile-scenes` 通过；示例 TypeScript 检查通过。
- `bun run test`：26 个测试文件、321 项测试通过。
- 浏览器开发模式：开始、正确点击、三次错点失败、重开、八次正确点击获胜均通过；`runtime state` 返回胜利状态和 8 分。
- 按用户范围约束，没有运行 Web 发布构建、微信或抖音构建。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 检查 worktree 状态。
3. 运行 Verification 中的最小相关失败测试。
4. 从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-23

Done:
- 新增独立 Web 可玩示例、规则测试、Runtime 状态接入和固定 Agent 任务评测文档。
- 用户明确要求先只考虑 Web，构建以后再做；现有三端示例未改动。
- 完成 Scene 校验、编译、类型检查、全量测试和浏览器完整玩法验收。

Current State:
- 可在 `sample-projects/star-game-demo` 运行 Web 游戏。E1–E3 评测任务已固定，但未运行外部 Agent，也没有完成率数据。

Currently Failing:
- 无。

Next:
1. 使用相同基线的独立副本运行 E1–E3 外部 Agent 试验并填写结果表。
2. 根据重复失败证据选择下一项 Pixifact 能力改进。
