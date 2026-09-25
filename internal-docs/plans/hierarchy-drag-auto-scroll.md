# 层级拖动边缘自动滚动

## Goal
拖动层级节点到当前可视范围之外时，通过顶部或底部边缘自动滚动到目标，不依赖鼠标滚轮。

## Decisions
- 只在层级节点拖动期间启用；拖到层级列表顶部或底部约 32px 区域时，连续滚动该列表，靠近边缘速度更快。
- 顶部工具栏不属于滚动热区；指针离开层级面板、松手、Esc 取消或窗口失焦时停止滚动。
- 滚动中持续根据静止指针下的节点刷新 before/inside/after 落点；无有效目标时不移动节点。
- 保留现有节点移动命令与一次撤销行为，不改变资产拖放或多选语义。

## Non-Goals
- 搜索目标移动、折叠节点悬停自动展开、触控板手势模拟、跨面板拖动。

## Public API / User-Facing Behavior
不更改 Compiler/CLI API；只增强 Editor 层级拖动交互。

## Implementation Scope
层级行目标位置计算、层级面板拖动状态和滚动循环。

## Test Plan
按用户先前要求，UI 交互由用户手动验收。完成前运行 Editor 类型检查和前端构建。

## Verification
- `bun run editor:typecheck` 通过。
- `bun run editor:frontend:build` 通过。
- `git diff --check` 通过。
- 按用户要求，UI 交互留给用户手动验收。

## Progress
功能已实现并提交（`ed5793d`），待用户手动验收。

## Resume Protocol
读取本计划及当前 diff，继续未完成步骤。

## Resume Notes
Last updated: 2026-09-25

Current State:
- 已复用节点落点计算，并在层级拖动时按指针靠近顶部或底部的距离滚动列表。
- 滚动中以静止指针重新命中行；松手前再刷新一次落点。
- 类型检查、前端构建和 diff 检查通过；UI 交互按用户要求由其手动验收。

Next:
1. 用户手动检查长层级列表的上下边缘滚动、静止指针落点与取消拖动。
