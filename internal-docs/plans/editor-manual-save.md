# Editor 手动保存与自动保存设置

## Goal

默认手动保存 Scene，支持顶部保存按钮和 Ctrl/Cmd+S；左侧栏底部提供可持久化的自动保存设置。

## Decisions

- 自动保存是项目本地 Editor UI 设置，默认关闭，存入 `.pixifact/editor/ui-state.json`。
- 编辑、撤销和重做先更新内存中的 Scene；手动保存统一写入 `.scene`，开启自动保存后沿用同一写入路径。
- 明确显示未保存状态。未保存或写入未完成时阻止切换 Scene、刷新和被其他标签页接管，避免丢失修改。
- Ctrl/Cmd+S 在 Inspector 输入框内也生效，先提交当前输入再保存。
- 设置按钮放在左侧栏底部，展开后展示自动保存开关。

## Non-Goals

- 不增加草稿文件或跨页面恢复功能。
- 不改变 `.scene` 格式和 Agent 直接编辑文件的路径。

## Public API / User-Facing Behavior

- `SceneDocument.open` 可指定 `autoSave`，默认为 `false`；提供 `save()` 和 `setAutoSave()`。
- Editor UI state 包含 `autoSave: boolean`。
- 顶部保存按钮、Ctrl/Cmd+S、左下角设置入口与未保存提示。

## Implementation Scope

- SceneDocument 保存队列、状态与写入竞争处理。
- EditorApp 保存交互、设置持久化与导航保护。
- Editor UI state 服务端读写、session context 状态校验。
- 相关单测和 README 文案。

## Test Plan

- 默认编辑不写盘、手动保存、自动保存开关、撤销/重做、保存进行时再次编辑、版本冲突。
- 设置默认值与持久化、按钮和快捷键、未保存导航保护。
- Editor 类型检查、前端构建及相关测试。

## Verification

- `bun run test`：26 个测试文件、328 个测试通过。
- `bun run editor:typecheck` 与 `bun run editor:frontend:build` 通过。
- 本地 Bun Editor + Google Chrome 实测：默认关闭自动保存、手动 Ctrl+S 写盘、开启后自动写盘、设置刷新后保留；检查了左下角设置面板位置。

## Progress

实现、文档和验证已完成。

## Resume Protocol

继续前读 AGENTS.md、CODEX.md、本计划和相关源码；先运行 Resume Notes 指定的最小验证。

## Resume Notes

Last updated: 2026-09-24

Done:
- 默认手动保存、保存按钮与 Ctrl/Cmd+S、左下角设置面板和项目级持久化。
- 未保存状态、导航和刷新保护、保存中继续编辑的写盘队列处理。
- 单测、全量测试、类型检查、构建和浏览器实测通过。

Current State:
- 已完成并验证。

Next:
- 无。
