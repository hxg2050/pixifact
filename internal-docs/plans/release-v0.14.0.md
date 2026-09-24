# Release v0.14.0

Status: Complete

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
- `563ddf8 Release v0.14.0` 与 `v0.14.0` 已推送。[发布工作流](https://github.com/hxg2050/pixifact/actions/runs/36037349244) 完成测试、构建、包内容检查、下游安装冒烟和五包 Trusted Publishing。
- npm registry 已确认五包版本与 `latest` 均为 `0.14.0`；[GitHub Release](https://github.com/hxg2050/pixifact/releases/tag/v0.14.0) 已创建。

## Progress

- [x] 核对当前版本和待发布提交。
- [x] 生成并审阅版本改动。
- [x] 提交发布变更。
- [x] 推送 tag，确认 CI 与 npm 发布。
- [x] 核对 npm registry 五包均可见，补齐发布记录。

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
- `563ddf8 Release v0.14.0` 和 tag 已推送，发布工作流成功；五个 npm 包的 `latest` 都是 `0.14.0`，GitHub Release 已创建。

Current State:
- 发布完成。

Currently Failing:
- 无。

Next:
- 无；不要重新创建 tag 或重复发布同一版本。
