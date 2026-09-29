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
- 标签右键菜单以被右键点击的标签为基准，提供关闭当前、关闭其它、关闭左边、关闭右边；右键不切换活动 Scene。范围为空或包含正在保存的标签时禁用对应操作。
- 批量关闭按标签顺序执行，未保存内容逐个确认；取消、保存失败或同步冲突停止剩余关闭，保留尚未关闭的标签。
- 标签栏使用细、低对比度的原生横向滚动条，避免遮挡标签文字，沿用项目明暗主题。

## Non-Goals

- 不实现独立浏览器窗口、自由停靠、跨页面草稿备份或 Scene 语义合并。
- 不改变 Agent 直接编辑 `.scene` 或截图针对活动 Scene 的协议。

## Public API / User-Facing Behavior

- Editor 顶部显示 Scene 标签，点击切换，关闭标签可以处理草稿。
- 标签右键可关闭当前、其它、左边或右边标签。
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
- 右键四种关闭范围、边缘菜单禁用、非活动标签与活动标签衔接、批量未保存确认和取消/失败停止；浏览器检查溢出标签栏滚动与菜单定位。

## Verification

- 原始多标签验证（2026-09-24）：`bun run test`，26 个测试文件、333 个测试通过。
- 右键菜单回归（2026-09-29）：`bunx --no-install vitest run tests/editor-vue-ui.test.ts tests/editor-external-sync.test.ts tests/editor-scene-document.test.ts`，3 个测试文件、70 个测试通过，包含 12 项右键菜单用例。
- `bun run editor:typecheck`、`bun run editor:frontend:build`、`git diff --check` 通过。
- 本地浏览器实测：打开第二个 Scene 后同页出现两个标签；未保存修改显示标签标记；关闭脏标签出现保存、放弃、取消确认框。
- 浏览器检查 12 个溢出标签：滚动条高 4px，标签文字无遮挡，无垂直溢出，最右侧标签可达；右键后台标签不改变活动 Scene，左右关闭范围及活动页衔接正确，Esc 收起菜单。明暗主题均已检查。

## Progress

多标签、右键批量关闭及细滚动条均已实现，相关测试和浏览器检查完成。

## Resume Protocol

继续前读 `AGENTS.md`、`CODEX.md`、本计划及相关源码；从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-29

Done:
- 多标签文档、切换与关闭、状态恢复、背景文件更新及冲突对比交互已实现。
- Editor context 列出全部标签状态，并在背景标签未同步时阻止其他浏览器接管。
- 相关测试、类型检查、构建和浏览器布局检查通过。
- 右键四种关闭范围、禁用状态、逐个确认未保存内容、取消/失败/冲突中止以及保存中取消的保护已实现并通过回归测试。
- 标签栏采用明暗主题适配的细滚动条，已在 12 标签溢出布局中检查。

Current State:
- 功能及回归验证已完成。

Next:
- 无。
