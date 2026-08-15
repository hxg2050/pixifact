# Release v0.8.0

Status: Complete

## Goal

发布包含 Runtime Canvas 截图和默认截图输出路径的五个公开 npm 包 `0.8.0`。

## Decisions

- `0.7.0` 已在 npm registry 和远端 `v0.7.0` tag 发布，当前两项 Runtime 截图提交必须进入新版本。
- Runtime 截图是新增 CLI 能力，因此 `pixifact-cli` 记为 minor；`pixifact` 的 runtime transport 支持记为 patch。五个公开包处于 Changesets fixed group，最终统一发布为 `0.8.0`。
- Vite target 和 Pixifact Vite plugin 都使用 `realpath` 规范化项目根目录，避免 macOS `/var` 与 `/private/var` 的同一目录被 Vite 8 当作不同路径。
- 完成发布前检查后，通过 `v0.8.0` tag 触发 GitHub Actions Trusted Publishing；不使用本地 npm token。

## Non-Goals

- 不重新发布或覆盖已存在的 `0.7.0` npm 版本。
- 不修改 Runtime 截图的 Canvas-only 语义、格式或默认路径。
- 不手动发布 npm 包，除非 Trusted Publishing 已实际失败。

## Implementation Scope

- `packages/pixifact-cli/src/viteTarget.ts`：规范化 CLI Vite target 的项目根路径。
- `packages/pixifact/src/compiler-node/vite.ts`：规范化 plugin 的项目根路径。
- `.changeset/`、五个公开包 manifest/changelog、版本同步文件和发布记录。
- 发布前验证、远端 tag 推送和 npm registry 验证。

## Test Plan

- 现有 `tests/pixifact-cli.test.ts` 的临时项目 Vite 构建用例在 macOS 路径别名下通过。
- `bun run release:status` 显示 `0.8.0` 的预期版本变更。
- `bun run release:check` 通过。
- tag 发布后，五个包的 npm registry 版本均为 `0.8.0`。

## Verification

- `rtk bunx --no-install vitest run tests/pixifact-cli.test.ts -t 'uses production by default and passes arbitrary Vite modes through'` 通过。
- `rtk bunx --no-install vitest run tests/pixifact-cli.test.ts` 通过，55 项测试。
- `rtk bunx --no-install vitest run tests/unified-vite-platform.test.ts` 通过，6 项测试。
- `rtk bun run release:check` 通过：25 个测试文件、305 项测试，以及五包构建、打包检查、仓库外安装冒烟。
- `rtk gh run watch 31890542973 --exit-status` 通过，GitHub Actions Publish npm packages 在 1m32s 内完成。
- npm registry 五个包的 `0.8.0` 版本均已确认。

## Progress

- [x] 确认 `0.7.0` 已发布，不能复用该版本号。
- [x] 确定 `0.8.0` 版本策略。
- [x] 修复 Vite 8 临时目录构建门禁。
- [x] 创建并消费 Changeset。
- [x] 完成 release check。
- [x] 推送 `v0.8.0` 并验证 npm 发布。

## Resume Protocol

1. 检查 worktree、远端 `main` 和 npm registry 的 `0.8.0` 状态。
2. 先运行 `tests/pixifact-cli.test.ts` 中的 Vite target 用例。
3. 从本文件的未完成 Progress 项继续，避免重跑 `release:version`。
4. 发布前确认工作区干净、五个包版本一致，并记录 workflow 与 registry 结果。

## Resume Notes

Last updated: 2026-08-15

Done:
- 确认 `pixifact`、`pixifact-cli`、`create-pixifact` 和两个平台包均已发布 `0.7.0`。
- 修复 macOS 临时目录下 Vite 8 因 `/var` 与 `/private/var` 路径不一致导致的构建失败。
- 完成 `0.8.0` Changeset、version、Release commit 和 `release:check`。

Current State:
- `main` 与 `v0.8.0` 已推送，GitHub Actions Trusted Publishing 已成功发布五个 npm 包，npm registry 均可见 `0.8.0`。

Currently Failing:
- 无。

Next:
1. 无。
