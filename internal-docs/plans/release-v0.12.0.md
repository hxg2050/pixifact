# Release v0.12.0

Status: Complete

## Goal

发布五个公开 npm 包的 `0.12.0`，交付 Web Agent Runtime 接入、Scene 来源定位和任意 Scene 静态截图。

## Decisions

- 三项新增能力使用 minor changeset；五个公开包按 fixed group 同版发布。
- 沿用仓库快速发布流程：本地生成版本并提交，推送 `main` 和 `v0.12.0`，由 GitHub Actions 完成完整发布检查与 Trusted Publishing。
- 截图继续使用本机 Google Chrome；本次不管理 Chromium。
- 保留未跟踪的 `docs/plans/editor-layout-authoring.md`，不纳入发布提交。

## Non-Goals

- 不增加新的截图实现或浏览器安装策略。
- 不执行本地 npm 发布。

## Public API / User-Facing Behavior

- 新建 Web 项目默认可通过 Runtime CLI 观察与输入开发期游戏。
- Runtime 节点包含 `.scene` 来源定位。
- `pixifact scene screenshot --scene <path> --output <png>` 从磁盘截取指定 Scene 的静态预览；需要本机 Google Chrome。

## Implementation Scope

- 生成五个公开包版本、依赖约束、模板版本、lockfile 和 changelog。
- 更新发布状态与版本记录。
- 提交发布变更，推送 `main` 和 tag；核对 CI、npm registry 和 GitHub Release。

## Test Plan

- 核对 Changesets 目标版本与版本文件一致。
- 运行本地最小相关检查；完整测试、构建、包内容和安装冒烟由 tag workflow 执行。
- 发布后核对五个 npm 包版本和 GitHub Release。

## Verification

- `bun run release:status` 在消费 changeset 前确认五包目标均为 `0.12.0`。
- `bun run release:version` 已生成五包版本、模板依赖和 changelog；`bun.lock` 无变动。
- `bun install --frozen-lockfile --dry-run` 通过。
- `bun run editor:typecheck` 通过。
- `bun run test` 在允许文件监听的环境通过：26 个测试文件、325 项测试。受限沙箱中 FSEvent 曾返回 `EMFILE`，两个文件监听测试超时；在正常环境专项重跑 12 项及全量重跑均通过。
- `git diff --check` 通过。
- 已推送 `main` 和 `v0.12.0`；[GitHub Actions](https://github.com/hxg2050/pixifact/actions/runs/35897778515) 完成测试、构建、包内容检查、下游安装冒烟和五包 Trusted Publishing。
- npm registry 已确认五个包均为 `0.12.0`；[GitHub Release](https://github.com/hxg2050/pixifact/releases/tag/v0.12.0) 已创建。

## Progress

- [x] 核对本地、远端和 npm 当前版本；目标 `0.12.0` 未被占用。
- [x] 生成并审阅版本改动。
- [x] 本地最小验证。
- [x] 发布提交。
- [x] 推送 tag，确认 CI 与 npm 发布。
- [x] 创建 GitHub Release 并补齐记录。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md`、本计划和 `internal-docs/releases/NPM_PUBLISHING.md`。
2. 检查工作区、`main`/`v0.12.0` 远端状态、CI 和 npm registry，避免重复发布。
3. 从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-24

Done:
- 确认五包原版本和 npm 最新版本均为 `0.11.2`，远端没有 `v0.12.0`。
- minor changeset 已消费，生成五包 `0.12.0`；lockfile 无改动，用户未跟踪文档保持原样。
- 本地类型检查、lockfile dry-run 和全量 325 项测试通过。
- `44232f1 Release v0.12.0` 已推送到远端 `main`，tag `v0.12.0` 指向该提交。
- GitHub Actions 发布成功，五个 npm 包版本均为 `0.12.0`，GitHub Release 已创建。

Current State:
- 发布完成。

Currently Failing:
- 无。

Next:
- 无；不要重新创建 tag 或重复发布同一版本。
