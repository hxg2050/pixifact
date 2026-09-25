# Editor Canvas Tools

Status: Complete

## Goal

在 Editor 画布左上角提供“拖动画布 / 移动节点 / 调整大小”三个图标工具，让移动节点时不显示 resize 手柄，并保留原有 resize 模式中拖动节点与调整尺寸的组合行为。

## Decisions

- 默认选中“调整大小”，保持现有画布交互不变。
- “拖动画布”：左键从画布任意位置拖动以平移视图，不选中或修改节点；空格键、中键和右键按住拖动在全部工具中可用，滚轮继续缩放。
- “移动节点”：点击选择节点，拖动已选中节点；不显示或响应 resize 手柄。
- “调整大小”：沿用已有的点击选择、拖动已选中节点和八个手柄 resize 行为。
- 切换工具时结束当前平移、取消未提交的节点预览，并更新选择框与光标。
- 三个图标作为独立工具组位于左上角，现有“适应窗口”按钮仍在右上角。
- 移动模式选中节点后，在变换原点显示屏幕尺寸固定的 X/Y 移动手柄：红色向右箭头只移动 X，绿色向上箭头只移动 Y，交点方块同时移动 X/Y。
- 手柄只对可编辑的轴出现；拖动沿用现有预览与单次 Scene 命令提交，不改变 `.scene` 几何字段语义。选中节点本体仍可自由拖动。
- 触控板双指按压映射为系统右键时，画布使用现有 pointer 平移流程，并阻止画布上的浏览器右键菜单。

## Non-Goals

- 不改变 `.scene` 几何变换、布局约束或命令提交方式。
- 不改变层级树拖拽、资产投放和 Editor 其他面板。
- 不修改用户未跟踪的 `docs/plans/editor-layout-authoring.md`。

## Public API / User-Facing Behavior

- 左上角三个按钮分别标注“拖动画布”“移动节点”“调整大小”，提供 `title`、`aria-label` 和选中状态。
- 画布上的 Scene 选择保持；切换工具不修改 `.scene`。
- 平移工具左键拖动不产生 Scene 命令；移动与调整大小工具继续通过原有单次 Scene 命令提交位移。
- 任何工具下都可右键按住拖动画布；节点不会因此移动，滚轮缩放保持原行为。
- 移动模式的轴手柄按本地 Scene 坐标轴约束移动，中心方块自由移动；缩放画布时手柄保持可点击的屏幕尺寸。

## Implementation Scope

- `apps/editor/src/preview/SceneCanvas.vue`：工具状态、交互路由与按钮。
- `apps/editor/src/preview/sceneCanvasGeometry.ts`：移动轴约束。
- `apps/editor/src/styles.css`：左上角工具组、选中状态和光标。
- 测试与本计划记录。

## Test Plan

1. 在真实 Editor 中验证三个工具的按钮状态和光标；平移工具从节点上拖动也只移动视图。
2. 验证移动工具拖动已选中节点但没有 resize 手柄，调整大小工具仍可拖动节点和使用 resize 手柄。
3. 验证空格键／中键平移和“适应窗口”继续可用。
4. 运行 Editor 画布相关测试、类型检查和前端构建。
5. 验证 X/Y 箭头与交点方块的方向约束、拖动预览、Undo / Redo，以及缩放与非可移动节点的显示状态。
6. 在笔记本触控板上双指按下并拖动，确认画布平移、不弹出右键菜单、不移动节点；单独滚轮/双指滑动仍缩放。

## Verification

- `bunx --no-install vitest run tests/editor-scene-canvas.test.ts tests/editor-vue-ui.test.ts`：2 个文件、49 项通过。
- `bun run editor:typecheck` 和 `bun run editor:frontend:build` 通过。
- 在临时 320×200 项目中用本机 Chrome 打开真实 Editor：默认工具状态、移动节点、从节点上平移画布、调整大小手柄，以及调整大小模式下继续拖动节点均通过；三工具与右上角适应窗口按钮的实际布局已截图检查。
- `git diff --check` 通过。
- 移动轴迭代：`tests/editor-scene-canvas.test.ts` 20 项、全量 26 个文件 335 项通过；`bun run editor:typecheck`、`bun run editor:frontend:build`、`git diff --check` 通过。
- 临时项目中用 Chrome 验收：X 箭头拖动只改变 X，Y 箭头只改变 Y，中心方块改变两轴；Undo / Redo 恢复位置。缩放后手柄仍保持屏幕尺寸；临时 `.scene` 源文件未写入。
- 右键按住拖动画布迭代：`bun run editor:typecheck`、`bun run editor:frontend:build`、`git diff --check` 通过；触控板双指按压交互由用户实机验收。

## Progress

- [x] 阅读现有交互、布局和用户未跟踪计划。
- [x] 实现工具切换与画布交互。
- [x] 完成真实 Editor 验收和自动化检查。
- [x] 实现移动模式的 X/Y 箭头与交点方块。
- [x] 完成轴约束测试、类型检查、构建与交互验收。
- [x] 在所有工具中接入右键按住拖动画布，并保留滚轮缩放。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 检查工作区，保留用户未跟踪文档。
3. 从 `Progress` 与 `Resume Notes` 继续。

## Resume Notes

Last updated: 2026-09-25

Done:
- 现有 SceneCanvas 支持空格／中键平移、选中节点拖动和八个 resize 手柄。
- 工具语义与默认状态已确定。
- 画布左上角三工具、模式交互、选中样式和中英文布局文档已更新。
- Editor 专项 49 项测试、类型检查、前端构建和真实 Chrome 交互验收通过。
- 移动模式已加入固定屏幕尺寸的 X/Y 轴箭头与自由移动方块，按可编辑轴显示。
- 轴约束测试、全量 335 项测试、类型检查、构建和真实 Chrome 拖动／撤销验收通过。
- 右键平移复用现有 pointer 流程，并阻止画布上的系统右键菜单；类型检查和构建通过。

Current State:
- 右键平移实现完成，待用户在笔记本触控板上实机验收。

Currently Failing:
- 无。

Next:
- 用户双指按住触控板拖动，确认系统将手势映射为右键拖动且画布平移。
