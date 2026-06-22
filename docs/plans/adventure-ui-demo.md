# Adventure UI Demo Plan

## Goal

新增一个唯一的示例项目 `sample-projects/adventure-ui-demo`，展示 Pixifact 在竖屏移动端游戏 UI 中的 `.scene` 工作流、设计分辨率和基础运行时节点组合。

## Decisions

- 示例项目设计分辨率固定为 `750x1334`。
- 示例主题为竖屏移动端冒险/RPG UI，不做完整游戏逻辑。
- 示例项目放在 `sample-projects/adventure-ui-demo`，仓库内暂只保留这一套 sample。
- 第一版 Scene 列表：
  - `Main.scene`
  - `Hud.scene`
  - `BottomMenu.scene`
  - `InventoryPanel.scene`
  - `Button.scene`
  - `ItemSlot.scene`
- 每个 `.scene` 必须有同名 `.ts` 脚本配对。
- Scene 脚本保持薄层，只展示 `@scene`、`@part`、`@prop`、`@event`、`@slot` 等公开契约。
- Demo 优先使用 Pixifact runtime 节点：`Rect`、`Image`、`NineImage`、`TileImage`、`HBoxContainer`、`VBoxContainer`。
- 需要图片效果时使用本地示例资源，避免依赖远程资源。

## Non-Goals

- 不实现完整背包数据系统、战斗系统或存档。
- 不实现 `GridContainer`。
- 不新增运行时 API。
- 不改 `create-pixifact` 默认模板。
- 不引入新的第三方依赖。

## Implementation Scope

- 新增 `sample-projects/adventure-ui-demo` 项目骨架。
- 新增项目本地 assets，用于背景、九宫格面板、平铺纹理和图标示例。
- 新增示例 `.scene` 与 `.ts` 文件。
- 新增样例项目测试，验证项目结构、分辨率、Scene 配对、校验和编译。

## Test Plan

- 先写失败测试：
  - 验证 `sample-projects/adventure-ui-demo/pixifact.project.json` 存在。
  - 验证项目分辨率为 `750x1334`。
  - 验证目标 Scene 都有 `.scene/.ts` 配对。
  - 验证所有 `.scene` 可以通过 `validateSceneContent`。
  - 验证 `compileScenes({ projectRoot })` 能生成 registry。
- 实现后运行：
  - `rtk bunx --no-install vitest run tests/sample-projects.test.ts`
  - `rtk bun run pixifact -- scene validate --project-root sample-projects/adventure-ui-demo --all`
  - `rtk bun run pixifact -- compile-scenes --project-root sample-projects/adventure-ui-demo`
  - `rtk bun run test`

## Verification

- 2026-06-22 通过 `rtk bunx --no-install vitest run tests/sample-projects.test.ts`。
- 2026-06-22 通过 `rtk bun run pixifact -- scene validate --project-root sample-projects/adventure-ui-demo --all`。
- 2026-06-22 通过 `rtk bun run pixifact -- compile-scenes --project-root sample-projects/adventure-ui-demo`。
- 2026-06-22 通过 `rtk bun run --cwd sample-projects/adventure-ui-demo build`。
- 2026-06-22 通过 `rtk bun run build`。
- 2026-06-22 通过 `rtk bun run test`。

## Progress

- [x] 确定 demo 主题、分辨率和 Scene 列表。
- [x] 添加 sample 项目测试。
- [x] 实现 sample 项目。
- [x] 运行验证并修复问题。

## Resume Protocol

继续本任务时：

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 查看 `git status --short`。
3. 运行 `rtk bunx --no-install vitest run tests/sample-projects.test.ts`。
4. 从 `Resume Notes` 的 `Next` 继续。

## Resume Notes

Last updated: 2026-06-22

Done:
- 已确定 `adventure-ui-demo` 的主题、分辨率和 Scene 范围。
- 已创建计划文档。
- 已新增 `sample-projects/adventure-ui-demo`，包含 6 个 `.scene/.ts` 配对场景和本地 SVG 资源。
- 已新增 `tests/sample-projects.test.ts`。
- 已把 `sample-projects/*` 加入 workspace。

Current State:
- 本轮计划已完成，验证命令全部通过。

Currently Failing:
- 无。

Next:
1. 如需继续增强 demo，可再讨论是否增加交互状态、真实图片资源或更多布局组件。
