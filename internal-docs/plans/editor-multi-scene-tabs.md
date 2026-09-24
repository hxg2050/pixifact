# Editor 多 Scene 标签

## Goal

在同一浏览器 Editor 中同时打开多个 Scene，以标签切换并保留每个 Scene 的草稿、Undo / Redo、选择和画布视图。

## Decisions

- 一个 Scene 路径只对应一个标签和一个 `SceneDocument`；再次打开只激活已有标签。
- 各标签独立维护文档、同步状态、选择和画布视图；Pixi Canvas 只保留一个，显示当前标签。
- 未保存的 Scene 可以切换。关闭未保存标签提供保存、放弃、取消；关闭或刷新页面沿用浏览器未保存提示。
- 项目 UI 状态保存标签路径顺序和活动路径；页面重新打开时从磁盘重建文档，不持久化未保存草稿。
- 外部文件改动：干净标签更新基线；脏标签保留草稿，保存时发现版本冲突才提示比较、覆盖或放弃草稿。不做自动合并。
- 冲突后自动保存暂停该文档，直到用户明确处理。覆盖仍携带用户比较过的磁盘版本，避免覆盖更新的版本。
- Editor context 报告全部打开标签及同步状态；只要有标签未同步，就拒绝另一浏览器接管。截图仍只针对当前活动且同步的 Scene。

## Non-Goals

- 不实现独立浏览器窗口、自由停靠、跨页面草稿备份或 Scene 语义合并。
- 不改变 Agent 直接编辑 `.scene` 或截图针对活动 Scene 的协议。

## Public API / User-Facing Behavior

- Editor 顶部显示 Scene 标签，点击切换，关闭标签可以处理草稿。
- `pixifact editor context` 增加 `openScenes`，列出路径及同步状态。
- Editor UI state 增加 `openScenePaths` 和 `activeScenePath`。

## Implementation Scope

- `EditorApp` 的标签生命周期、导航、文件通知、保存及冲突交互。
- `SceneDocument` 的显式冲突覆盖及自动保存暂停。
- Editor UI state 和 Host session context。
- 相关测试与 UI 样式。

## Test Plan

- 标签切换保留草稿、选择、Undo / Redo 和视图；同路径不重复打开；关闭脏标签三种选择。
- 背景标签外部更新、脏标签保存冲突、显式覆盖和放弃草稿。
- UI state 恢复、context 多标签状态、背景脏标签阻止接管。
- Editor 类型检查、相关测试与构建。

## Verification

- `bun run test`：26 个测试文件、333 个测试通过。
- `bun run editor:typecheck`、`bun run editor:frontend:build`、`git diff --check` 通过。
- 本地浏览器实测：打开第二个 Scene 后同页出现两个标签；未保存修改显示标签标记；关闭脏标签出现保存、放弃、取消确认框。

## Progress

实现与验证已完成。

## Resume Protocol

继续前读 `AGENTS.md`、`CODEX.md`、本计划及相关源码；从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-24

Done:
- 多标签文档、切换与关闭、状态恢复、背景文件更新及冲突对比交互已实现。
- Editor context 列出全部标签状态，并在背景标签未同步时阻止其他浏览器接管。
- 相关测试、类型检查、构建和浏览器布局检查通过。

Current State:
- 已完成并验证。

Next:
- 无。
