# Release v0.11.0

Status: In Progress

## Goal

发布包含 Editor 素材定位和预览节点选择交互改进的五个公开 npm 包 `0.11.0`。

## Decisions

- Editor 功能由 `pixifact-cli` 分发，因此使用 `pixifact-cli` minor Changeset；五个公开包处于 fixed group，最终统一发布为 `0.11.0`。
- 完成 `release:check` 后，仅通过 `v0.11.0` tag 触发 GitHub Actions Trusted Publishing，不在本地执行 `npm publish`。
- 发布顺序保持 `pixifact`、两个平台包、`pixifact-cli`、`create-pixifact`，由发布 workflow 负责。

## Non-Goals

- 不修改本次 Editor 功能之外的产品行为。
- 不覆盖、重发或修改已经发布的 npm 版本和 Git tag。
- 不使用本地 npm token 发布。

## Implementation Scope

- 已消费的 `.changeset/editor-asset-location.md`：记录 `pixifact-cli` minor 变更。
- 五个公开包的 manifest、changelog、模板依赖版本和示例依赖版本：由 `release:version` 生成。
- 发布前检查、release commit、`v0.11.0` tag、GitHub Actions 和 npm registry 验证。
- 发布完成后更新发布记录、npm 发布状态和本计划状态。

## Test Plan

- `bun run release:check` 通过。
- tag 发布后，GitHub Actions Trusted Publishing 通过，npm registry 五个包均为 `0.11.0`。

## Verification

- `bun run release:check` 已通过：25 个测试文件、318 项测试，五包构建与内容检查，以及 Web / 微信 / 抖音仓库外 tarball 安装和构建冒烟。
- 待完成：推送 `v0.11.0`、等待 Trusted Publishing、验证 npm registry 和创建 GitHub Release。

## Progress

- [x] 确认当前 `main` 比远端多一个 Editor 功能提交。
- [x] 创建并消费 `pixifact-cli` minor Changeset，生成五包统一 `0.11.0` 版本。
- [x] 运行完整发布前检查。
- [ ] 提交 `Release v0.11.0`。
- [ ] 推送 `v0.11.0` 并验证 GitHub Actions 与 npm 发布。
- [ ] 创建 GitHub Release 并完成发布记录。

## Resume Protocol

1. 检查 worktree、远端 `main`、`v0.11.0` tag 和 npm registry 状态。
2. 若版本尚未生成，运行 `bun run release:status` 并确认 fixed group 预期为五包 `0.11.0`；若已生成，审阅版本与 changelog 后继续，不要再次运行 `release:version`。
3. 从未完成的 Progress 项继续，避免重复创建 tag 或发布同一版本。

## Resume Notes

Last updated: 2026-08-22

Done:

- 已完成版本生成和完整 `release:check`。

Current State:

- 工作区包含待提交的 `0.11.0` 发布文件，尚未创建 release commit、tag 或 GitHub Release。

Currently Failing:

- 无。

Next:

1. 提交并推送 release commit。
2. 等待 workflow，验证 npm registry，然后创建 GitHub Release。
