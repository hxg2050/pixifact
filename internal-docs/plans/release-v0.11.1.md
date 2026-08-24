# Release v0.11.1

Status: Complete

## Goal

发布包含 Editor 布局节点属性编辑和画布拖拽修复的五个公开 npm 包 `0.11.1`。

## Decisions

- Editor 功能由 `pixifact-cli` 分发，因此使用 `pixifact-cli` patch Changeset；五个公开包处于 fixed group，最终统一发布为 `0.11.1`。
- 完成 `release:check` 后，仅通过 `v0.11.1` tag 触发 GitHub Actions Trusted Publishing，不在本地执行 `npm publish`。
- 发布顺序保持 `pixifact`、两个平台包、`pixifact-cli`、`create-pixifact`，由发布 workflow 负责。

## Non-Goals

- 不修改本次 Editor 修复之外的产品行为。
- 不覆盖、重发或修改已经发布的 npm 版本和 Git tag。
- 不使用本地 npm token 发布。
- 不纳入发布前已存在的工作区用户改动。

## Public API / User-Facing Behavior

- `pixifact-cli` 的 Editor 修复以 patch 版本发布；其余 fixed group 包同步版本，不新增公开 API。

## Implementation Scope

- 消费 `.changeset/fix-editor-layout-drag.md`，生成五个公开包的 `0.11.1` manifest 与 changelog。
- 同步 `create-pixifact` 模板和示例项目依赖版本。
- 运行发布前检查，提交 release commit，推送 `v0.11.1` tag，并验证 GitHub Actions 与 npm registry。
- 发布完成后更新发布记录和本计划状态。

## Test Plan

- `bun run release:check` 通过。
- tag 发布后，GitHub Actions Trusted Publishing 通过，npm registry 五个包均为 `0.11.1`。
- 完成一次真实 npm registry 安装冒烟和生成 GitHub Release。

## Verification

- `bun run release:check` 已通过：25 个测试文件、320 项测试，五包构建与内容检查，以及 Web / 微信 / 抖音仓库外 tarball 安装和 Editor 启动冒烟。

## Progress

- [x] 确认当前 npm registry 和 Git tag 的最新版本为 `0.11.0`。
- [x] 创建 patch Changeset 并生成五包统一 `0.11.1` 版本。
- [x] 运行完整发布前检查。
- [x] 提交 `Release v0.11.1`。
- [x] 推送 `v0.11.1` 并验证 GitHub Actions 与 npm 发布。
- [x] 创建 GitHub Release 并完成发布记录。

## Resume Protocol

1. 检查 worktree、远端 `main`、`v0.11.1` tag 和 npm registry 状态。
2. 若版本尚未生成，运行 `bun run release:status` 并确认 fixed group 预期为五包 `0.11.1`；若已生成，审阅版本与 changelog 后继续，不要再次运行 `release:version`。
3. 从未完成的 Progress 项继续，避免重复创建 tag 或发布同一版本。

## Resume Notes

Last updated: 2026-08-24

Done:

- 已将发布前用户未提交改动保存到本地 stash，未纳入本次发布。
- 已完成版本生成和 changelog 更新。
- 已完成完整 `release:check`。
- 已提交 `e895e65 Release v0.11.1`，并推送 `main` 与 `v0.11.1`。
- GitHub Actions [Publish npm packages](https://github.com/hxg2050/pixifact/actions/runs/32733071678) 已成功完成 Trusted Publishing。
- npm registry 五个公开包均已确认版本 `0.11.1`。
- 已从 npm registry 创建项目并使用 Bun `1.3.13` 完成安装和 Web production build。
- GitHub Release 已创建：[v0.11.1](https://github.com/hxg2050/pixifact/releases/tag/v0.11.1)。

Current State:

- 五个公开包 manifest 均为 `0.11.1`，发布、registry 验证和 GitHub Release 均已完成。

Currently Failing:

- 无。

Next:

1. 无。
