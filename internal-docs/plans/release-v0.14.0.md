# Release v0.14.0

Status: In Progress

## Goal

发布五个公开 npm 包的 `0.14.0`，交付 `v0.13.0` 之后完成并验收的 Editor 交互改进。

## Decisions

- 新增 Editor 功能由 `pixifact-cli` 分发，使用 minor Changeset；五个公开包按 fixed group 同版发布。
- 沿用快速发布流程：本地生成版本并提交，由 `v0.14.0` tag 触发 GitHub Actions 的完整检查和 Trusted Publishing。
- 保留现有未跟踪计划文件；从干净临时 worktree 运行要求工作区干净的发布脚本。

## Non-Goals

- 不修改已验收的 Editor 实现。
- 不在本地执行 `npm publish`。

## Public API / User-Facing Behavior

- Editor 提供 macOS 风格界面、默认深色及手动/系统主题选择。
- 层级支持右键菜单、多选与批量操作、十二种快捷布局、拖动边缘自动滚动。
- 右侧检查器底部可预览选中的图片资产，并显示路径、分辨率和文件大小。

## Implementation Scope

- 生成五包版本、内部依赖、模板版本、lockfile 和 changelog。
- 提交发布变更，推送 `main` 和 tag，核对 CI、npm registry 和 GitHub Release。
- 更新内部发布状态与版本记录。

## Test Plan

- 核对 Changesets 目标版本及五包版本一致。
- 运行本地最小检查；完整测试、构建、包内容和安装冒烟由 tag workflow 执行。
- 发布后核对五个 npm 包版本与 GitHub Release。

## Verification

- 当前五包和 npm 最新版本均为 `0.13.0`；远端没有 `v0.14.0`。
- `bun run release:status` 确认五包目标均为 `0.14.0`；`release:version` 已生成五包 manifest、依赖和 changelog，`bun.lock` 无改动。
- `bun install --frozen-lockfile --dry-run`、`bun run editor:typecheck`、`git diff --check` 通过。
- 本地 `bun run test`：26 个文件、335 项测试通过。旧 UI 测试已经同步多选接口与 pointer drop 模拟，提交为 `f62722a`。
- tag workflow 和 npm 发布待完成。

## Progress

- [x] 核对当前版本和待发布提交。
- [x] 生成并审阅版本改动。
- [ ] 提交发布变更。
- [ ] 推送 tag，确认 CI 与 npm 发布。
- [ ] 创建 GitHub Release 并补齐记录。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md`、本计划和 `internal-docs/releases/NPM_PUBLISHING.md`。
2. 核对远端 `main`/`v0.14.0`、CI 和 npm registry，避免重复发布。
3. 从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-25

Done:
- 已确认 `v0.13.0` 是当前最新 tag，五个 npm 包的 manifest 均为 `0.13.0`，npm 最新版本也为 `0.13.0`。
- 已确认远端 `main` 仍在 `v0.13.0` 发布记录提交，本地有十二项待发布 Editor 提交，`v0.14.0` 尚不存在。
- `pixifact-cli` minor Changeset 已消费，五包 manifest 和 changelog 已生成 `0.14.0`；模板依赖同步，lockfile 无变动。
- 修复旧 Editor 测试的多选和 pointer drop 挂载方式；本地全量 335 项测试、类型检查和 lockfile dry-run 通过。

Current State:
- 待提交 release commit 并触发 tag workflow。

Currently Failing:
- 无。

Next:
1. 只暂存本次发布相关文件并提交。
2. 从干净 worktree 运行 `bun run release:publish`，确认 `main` 和 tag 已推送。
3. 等待 GitHub Actions，核对五包 npm registry 与 GitHub Release。
