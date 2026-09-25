# Editor 快捷布局

## Goal
为多选节点提供 6 项对齐、6 项按边缘或中心线分布、2 项真正等间距操作。

## Decisions
- 在画布左上角现有工具旁增加快捷布局菜单，按对齐、分布、等间距分组。图标按钮提供中文 title 和 aria-label。
- 对齐使用选区画布边界框的上/中/下或左/中/右作为基准。按线分布将各节点对应边缘或中心线等距排列，首尾节点保持原位。等间距按节点外边界计算空白间距，首尾节点保持原位。
- 父子同时选中只操作最上层选中节点；跨父节点通过画布坐标计算，再转换回各自父节点的局部坐标。
- 对齐至少 2 个有效节点，分布和等间距至少 3 个。无法预览、位置由容器布局接管或该方向无法移动时，整项操作不可用并给出原因，不部分修改选区。
- 每次操作写入 `.scene` 属性并使用一条 Compiler batch 命令，形成一条撤销记录；不引入持续布局约束。

## Non-Goals
- 新 CLI mutation 入口、跨 Scene 排版、自动吸附、等宽等高、整组选区居中到 Scene。

## Public API / User-Facing Behavior
只增加 Editor 操作，不变更 Compiler / CLI 公共 API。

## Implementation Scope
画布几何计算、画布快捷布局菜单、最小 CSS。

## Test Plan
按用户先前要求，用户手动验证 UI。完成前运行类型检查和前端构建，刷新当前 Editor 服务供用户查看。

## Verification
- `bun run editor:typecheck` 通过。
- `bun run editor:frontend:build` 通过；UI 交互按用户要求留给手动验收。
- `git diff --cached --check` 通过；功能代码已提交为 `67cbc02`。

## Progress
14 项操作、菜单和批量撤销已实现并提交。

## Resume Protocol
读取本计划和当前 diff，从未完成的实现继续。

## Resume Notes
Last updated: 2026-09-25

Current State:
- 已完成几何计算和画布菜单，类型检查与构建通过，代码已提交。

Next:
1. 用户手动验收画布中的 14 项操作。
