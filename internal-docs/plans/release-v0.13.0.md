# Release v0.13.0

Status: In Progress

## Goal

发布五个公开 npm 包的 `0.13.0`，交付浏览器 Editor 的画布工具、手动保存和多 Scene 标签。

## Decisions

- Editor 工作流能力使用 minor changeset；五个公开包按 fixed group 同版发布。
- 沿用快速发布流程：本地生成版本并提交，推送 `main` 和 `v0.13.0`，由 GitHub Actions 完成发布检查与 Trusted Publishing。
- 保留用户未跟踪的 `docs/plans/editor-layout-authoring.md`；在干净的临时 worktree 中触发发布脚本。

## Non-Goals

- 不修改已经实现的 Editor 交互或 Scene 文件协议。
- 不执行本地 npm 发布。

## Public API / User-Facing Behavior

- 画布提供“拖动画布”“移动节点”“调整大小”三种工具。
- Editor 默认手动保存，可点击保存或按 Ctrl/Cmd+S；设置中可启用自动保存。
- 同一 Editor 可打开多个 Scene 标签；各标签保留未保存草稿，外部文件变化通过保存冲突交互处理。

## Implementation Scope

- 更新 CLI README 中的 Editor 保存行为说明。
- 生成五个公开包的版本、内部依赖、模板版本、lockfile 和 changelog。
- 更新发布状态与版本记录；提交发布变更，推送 `main` 和 tag；核对 CI、npm registry 和 GitHub Release。

## Test Plan

- 核对 Changesets 目标版本与五包版本一致。
- 运行本地最小相关检查；完整测试、构建、包内容与安装冒烟由 tag workflow 执行。
- 发布后核对五个 npm 包版本及 GitHub Release。

## Verification

- `bun run release:status` 在消费 changeset 前确认五包目标均为 `0.13.0`。
- `bun run release:version` 已生成五包版本、模板依赖和 changelog；`bun.lock` 无变动。
- `bun install --frozen-lockfile --dry-run`、`bun run editor:typecheck`、`git diff --check` 通过。
- `bun run test`：26 个测试文件、333 项测试通过。
- GitHub Actions、npm registry 和 GitHub Release 待发布后核对。

## Progress

- [x] 核对本地、远端和 npm 当前版本；目标 `0.13.0` 未被占用。
- [x] 生成并审阅版本改动。
- [x] 本地最小验证。
- [ ] 发布提交。
- [ ] 推送 tag，确认 CI 与 npm 发布。
- [ ] 创建 GitHub Release 并补齐记录。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md`、本计划和 `internal-docs/releases/NPM_PUBLISHING.md`。
2. 检查工作区、`main`/`v0.13.0` 远端状态、CI 和 npm registry，避免重复发布。
3. 从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-24

Done:
- 确认当前五包和 npm 最新版本均为 `0.12.0`，远端没有 `v0.13.0`。
- 已提交的 Editor 改动包含画布工具、保存设置和多 Scene 标签。
- minor changeset 已消费，生成五包 `0.13.0`；模板依赖同步，lockfile 无变动。
- 本地类型检查、lockfile dry-run 和全量 333 项测试通过。

Current State:
- 准备发布提交。

Currently Failing:
- 无。

Next:
1. 提交版本文件及发布说明。
2. 从干净 worktree 推送 `main` 和 `v0.13.0`，核对 CI 与 npm 发布。
