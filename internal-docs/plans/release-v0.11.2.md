# Release v0.11.2

Status: Ready to publish

## Goal

发布修复 Editor 画布覆盖层拖拽问题的五个公开 npm 包 `0.11.2`。

## Decisions

- 变更属于 `pixifact-cli` 的 Editor 修复，使用 `pixifact-cli` patch changeset。
- 五个公开包处于 fixed group，统一发布为 `0.11.2`。
- 通过 `v0.11.2` tag 触发 GitHub Actions Trusted Publishing，不在本地执行 `npm publish`。

## Non-Goals

- 不纳入当前工作区中与本次 Editor 修复无关的游戏示例、临时复现项目和文档改动。
- 不修改 `Battle.scene` 或运行时输入行为。

## Implementation Scope

- 发布 Editor 画布拖拽命中修复及回归测试。
- 生成五个公开包的 `0.11.2` 版本和 changelog。
- 运行发布前检查，提交 release commit，并推送 `main` 与 `v0.11.2` tag。

## Test Plan

- 画布专项测试通过。
- Editor 类型检查和前端构建通过。
- `release:check` 在干净工作区通过。

## Verification

- `bun run release:check` 已通过：25 个测试文件、322 项测试，五个公开包构建与内容检查，以及 Web / 微信 / 抖音示例 tarball 安装和构建冒烟。

## Progress

- [x] 创建 `pixifact-cli` patch changeset。
- [x] 生成 `0.11.2` 版本文件。
- [x] 完成发布前检查。
- [ ] 提交 release commit 并推送 tag。
- [ ] 验证 GitHub Actions、npm registry 和 GitHub Release。

## Resume Notes

Last updated: 2026-08-24

Current State:

- Editor 修复和回归测试已在工作区，用户已完成人工验收。
- 五个公开包版本已统一为 `0.11.2`，发布前检查已通过。

## Resume Protocol

1. 检查 `main`、`v0.11.2` tag、远端和 npm registry 状态。
2. 若 release commit 尚未提交，从 `Next` 的第一项继续；若 tag 已推送，不要重复创建 tag。
3. 发布后补充 GitHub Actions、npm registry 和 GitHub Release 验证结果。

Next:

1. 提交 release commit。
2. 推送 `main` 和 `v0.11.2` tag。
3. 验证 GitHub Actions、npm registry 和 GitHub Release。
