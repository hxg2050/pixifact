# Release v0.9.0

Status: In Progress

## Goal

发布包含简化 Scene 创建命令和 Editor 资产树展开状态持久化的五个公开 npm 包 `0.9.0`。

## Decisions

- `pixifact scene create` 和浏览器 Editor 都由 `pixifact-cli` 分发，因此将其记为 minor Changeset；五个公开包处于 fixed group，最终统一发布为 `0.9.0`。
- 这次发布包含既有提交 `a68339e` 与 `d2867bf`，不改写其实现或提交历史。
- 完成 `release:check` 后，仅通过 `v0.9.0` tag 触发 GitHub Actions Trusted Publishing，不在本地执行 `npm publish`。

## Non-Goals

- 不修改 Scene 创建或 Editor 资产树之外的产品行为。
- 不覆盖、重发或修改已经发布的 `0.8.0` npm 版本和 tag。
- 不使用本地 npm token 发布。

## Implementation Scope

- 已消费的 `.changeset/release-v0.9.0.md`：记录 `pixifact-cli` minor 变更。
- 五个公开包的 manifest、changelog、模板依赖版本与 `bun.lock`：由 `release:version` 生成。
- 发布前检查、release commit、`v0.9.0` tag、GitHub Actions 和 npm registry 验证。
- 发布完成后更新发布记录与本计划状态。

## Test Plan

- `rtk bun run release:status` 显示五个公开包将统一升至 `0.9.0`。
- `rtk bun run release:check` 通过。
- tag 发布后，GitHub Actions Trusted Publishing 通过，npm registry 五个包均为 `0.9.0`。

## Verification

- 待执行。

## Progress

- [x] 确认远端 `main`、`v0.8.0` tag 和 npm registry 当前均为 `0.8.0`。
- [x] 确认本地 `main` 仅比远端多 `a68339e` 与 `d2867bf` 两项待发布功能提交。
- [x] 创建 `pixifact-cli` minor Changeset，确定 fixed group 版本为 `0.9.0`。
- [x] 生成五个包的 `0.9.0` 版本、changelog 和模板依赖版本。
- [ ] 提交 release commit。
- [ ] 运行完整发布前检查。
- [ ] 推送 `v0.9.0` 并验证 GitHub Actions 与 npm 发布。

## Resume Protocol

1. 检查 worktree、远端 `main`、`v0.8.0` / `v0.9.0` tag 和 npm registry 状态。
2. 若版本尚未生成，运行 `rtk bun run release:status`，确认待消费 Changeset 预期为五包 `0.9.0`。
3. 若版本尚未生成，运行 `rtk bun run release:version`；若已生成，审阅版本与 changelog 后继续，不要再次运行 `release:status`。
4. 从未完成的 Progress 项继续，避免重复创建 tag 或发布同一版本。

## Resume Notes

Last updated: 2026-08-17

Done:
- 已确认工作区干净，远端 `main` 与本地已知基线一致。
- GitHub 凭据有效，npm registry 五个公开包和本地 manifest 当前均为 `0.8.0`。
- 已建立并消费 `pixifact-cli` minor Changeset；fixed group 已生成统一的 `0.9.0` 版本与 changelog。

Current State:
- `release:version` 已完成；未创建 `v0.9.0` tag，也没有本地 npm 发布。

Currently Failing:
- 无。

Next:
1. 审阅版本与 changelog，提交 release commit。
2. 运行 `rtk bun run release:check`，通过后推送 tag 并验证发布。
