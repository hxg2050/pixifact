# Editor Layout Authoring

## Goal

让 Editor 明确区分 Transform 结果和 frame layout 输入，修复布局节点 Inspector 中修改 `x/y` 无效，以及选中 Group 后点击子节点无法拖动父节点的问题。

## Decisions

- 保持 Runtime 当前 frame layout 优先级，不让 `x/y` 覆盖有效布局约束。
- 有效布局约束控制的 `x/y/width/height` 在 Inspector 中只读；用户通过对应布局字段修改位置和尺寸。
- 画布拖拽继续将移动转换为当前布局属性，并允许命中选中节点的后代时拖动选中节点。
- 不在本次改动中修改外部 `pixi-game` 项目的 `Battle.scene`，临时复现项目继续保留原始冲突数据。

## Non-Goals

- 不新增 Runtime 布局协议或改变布局计算优先级。
- 不自动迁移现有 Scene 中同时存在的 Transform 和 layout 属性。
- 不实现完整的“切换为自由定位”按钮。

## Public API / User-Facing Behavior

- Inspector 中被 layout 控制的 Transform 输入不可编辑，并通过 title 说明应修改布局字段。
- 选中容器节点后，鼠标命中其子节点内容仍可启动该容器的画布拖拽。

## Implementation Scope

- `apps/editor/src/panels/InspectorPanel.vue`
- `apps/editor/src/preview/SceneCanvas.vue`
- `apps/editor/src/preview/sceneCanvasGeometry.ts`
- `tests/editor-vue-ui.test.ts`
- `tests/editor-scene-canvas.test.ts`

## Test Plan

- [ ] 增加布局约束下 Transform 字段只读的 Inspector 测试。
- [ ] 增加父节点及后代命中判断的画布测试。
- [ ] 运行 Editor 相关 Vitest、类型检查和前端构建。

## Verification

```bash
bunx --no-install vitest run tests/editor-scene-canvas.test.ts tests/editor-vue-ui.test.ts
bun run editor:typecheck
bun run editor:frontend:build
```

## Progress

- [x] 创建最简布局复现项目并确认 Runtime 实际几何。
- [x] 完成 Inspector 和画布交互修复。
- [x] 完成测试和 Editor 构建验证。

## Resume Protocol

1. 阅读本文件。
2. 检查 worktree 状态。
3. 运行本文件 Verification 中的最小相关测试。
4. 从 Resume Notes 的 Next 继续。
5. 如果停止时任务未完成，先更新本文件。

## Resume Notes

Last updated: 2026-08-24

Done:
- 已在 `sample-projects/editor-layout-repro` 创建 11 节点最简复现。
- 已确认 `battleArea`、`enemyArea`、`playerArea` 的实际布局位置被约束覆盖。
- Inspector 已将被 frame layout 控制的 `x/y/width/height` 设为只读。
- 画布已允许从选中容器的后代节点命中并拖动选中容器。
- 已通过 47 项 Editor Vitest、`editor:typecheck` 和 `editor:frontend:build`。

Current State:
- Runtime 和现有画布几何转换逻辑保持不变；Editor 前端构建产物已更新。

Currently Failing:
- 无。

Next:
1. 等待用户在实际项目中人工确认布局节点的 Inspector 和画布拖拽体验。
