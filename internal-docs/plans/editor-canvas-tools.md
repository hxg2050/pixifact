# Editor Canvas Tools

Status: Complete

## Goal

在 Editor 画布左上角提供“拖动画布 / 移动节点 / 调整大小”三个图标工具，让移动节点时不显示 resize 手柄，并保留原有 resize 模式中拖动节点与调整尺寸的组合行为。

## Decisions

- 默认选中“调整大小”，保持现有画布交互不变。
- “拖动画布”：左键从画布任意位置拖动以平移视图，不选中或修改节点；空格键和中键平移在全部工具中继续可用。
- “移动节点”：点击选择节点，拖动已选中节点；不显示或响应 resize 手柄。
- “调整大小”：沿用已有的点击选择、拖动已选中节点和八个手柄 resize 行为。
- 切换工具时结束当前平移、取消未提交的节点预览，并更新选择框与光标。
- 三个图标作为独立工具组位于左上角，现有“适应窗口”按钮仍在右上角。

## Non-Goals

- 不改变 `.scene` 几何变换、布局约束或命令提交方式。
- 不改变层级树拖拽、资产投放和 Editor 其他面板。
- 不修改用户未跟踪的 `docs/plans/editor-layout-authoring.md`。

## Public API / User-Facing Behavior

- 左上角三个按钮分别标注“拖动画布”“移动节点”“调整大小”，提供 `title`、`aria-label` 和选中状态。
- 画布上的 Scene 选择保持；切换工具不修改 `.scene`。
- 平移工具左键拖动不产生 Scene 命令；移动与调整大小工具继续通过原有单次 Scene 命令提交位移。

## Implementation Scope

- `apps/editor/src/preview/SceneCanvas.vue`：工具状态、交互路由与按钮。
- `apps/editor/src/styles.css`：左上角工具组、选中状态和光标。
- 测试与本计划记录。

## Test Plan

1. 在真实 Editor 中验证三个工具的按钮状态和光标；平移工具从节点上拖动也只移动视图。
2. 验证移动工具拖动已选中节点但没有 resize 手柄，调整大小工具仍可拖动节点和使用 resize 手柄。
3. 验证空格键／中键平移和“适应窗口”继续可用。
4. 运行 Editor 画布相关测试、类型检查和前端构建。

## Verification

- `bunx --no-install vitest run tests/editor-scene-canvas.test.ts tests/editor-vue-ui.test.ts`：2 个文件、49 项通过。
- `bun run editor:typecheck` 和 `bun run editor:frontend:build` 通过。
- 在临时 320×200 项目中用本机 Chrome 打开真实 Editor：默认工具状态、移动节点、从节点上平移画布、调整大小手柄，以及调整大小模式下继续拖动节点均通过；三工具与右上角适应窗口按钮的实际布局已截图检查。
- `git diff --check` 通过。

## Progress

- [x] 阅读现有交互、布局和用户未跟踪计划。
- [x] 实现工具切换与画布交互。
- [x] 完成真实 Editor 验收和自动化检查。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 检查工作区，保留用户未跟踪文档。
3. 从 `Progress` 与 `Resume Notes` 继续。

## Resume Notes

Last updated: 2026-09-24

Done:
- 现有 SceneCanvas 支持空格／中键平移、选中节点拖动和八个 resize 手柄。
- 工具语义与默认状态已确定。
- 画布左上角三工具、模式交互、选中样式和中英文布局文档已更新。
- Editor 专项 49 项测试、类型检查、前端构建和真实 Chrome 交互验收通过。

Current State:
- 功能完成，已通过验证。

Currently Failing:
- 无。

Next:
- 无。
