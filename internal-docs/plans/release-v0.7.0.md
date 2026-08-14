# Release v0.7.0 Preparation

Status: Complete

## Goal

完成五个公开 npm 包的 `0.7.0` 发布准备，并验证正式 tarball 可被下游项目安装和使用。

## Decisions

- 目标版本固定为 `0.7.0`：本地五个公开包已经完成该版本的 Changesets version，npm registry 中既有包仍为 `0.6.1`，本地没有 `v0.7.0` tag。
- `@pixifact/platform-wechat` 与 `@pixifact/platform-douyin` 尚未存在于 npm registry；发布时须先手动发布这两个 scoped 包并配置 Trusted Publisher，再推送 `v0.7.0` tag。
- 不再运行 `release:version` 或创建新 Changeset，避免将尚未发布的 `0.7.0` 错误提升为 `0.7.1`。
- 为 version commit 后归入 `0.7.0` 的修复保留空 Changeset，满足 Changesets 状态检查而不生成新的版本号。
- 版本提交后的实际代码修复直接补入对应包的 `0.7.0` changelog。
- 发布检查暴露的跨平台构建、CLI 输出和 Editor 监听缺陷必须在发布前修复；仅对依赖 POSIX 语义的断言放宽测试平台条件。
- release install smoke 必须以当前 Bun 二进制运行，并将其目录传给下游 CLI 子进程，不能依赖 Windows 的命令包装器解析 shebang。
- CLI 主模块判断必须使用 `pathToFileURL`，以兼容 Windows 绝对路径。
- Windows release smoke 必须强制终止它创建的 Editor Bun 子进程，避免 watcher 锁定临时安装目录。
- 本任务只准备和验证发布，不创建 tag、不推送远程、不触发 npm 发布。

## Non-Goals

- 不修改公开 API 或包版本。
- 不创建 GitHub Release。
- 不执行 npm publish。

## Public API / User-Facing Behavior

`0.7.0` 包含统一 Vite 平台构建能力，以及小游戏资源 URL、PixiJS 运行时去重和抖音图片加载时序修复。

## Implementation Scope

- 更新 `pixifact` 与 `@pixifact/platform-douyin` 的 `0.7.0` changelog。
- 修复发布前检查发现的跨平台问题。
- 修复 Windows 包装器环境中的下游 Bun CLI 安装验收。
- 修复 Windows 下从 package bin 运行 CLI 时静默退出的问题。
- 修复 Windows release smoke 清理 Editor 临时目录时的 `EBUSY`。
- 运行仓库发布前完整检查。
- 提交发布准备记录。
- 记录两个 scoped 平台包的首次发布前置条件。

## Test Plan

- 运行 `bun run release:check`。
- 检查五个包版本一致、Changesets 无待消费条目、工作区干净且没有本地 `v0.7.0` tag。

## Verification

- 2026-08-14 通过 `bun run release:check`：25 个测试文件、297 项测试，以及 runtime、平台包、Editor、`create-pixifact` 构建、五包内容检查和真实 tarball 安装验收均通过。
- 2026-08-14 `bun run release:status` 通过，确认没有会生成 `0.7.1` 的待消费 Changeset。
- 2026-08-14 `git diff --check` 通过，五个公开包版本均为 `0.7.0`，本地没有 `v0.7.0` tag。

## Progress

- [x] 确认 npm registry 和本地版本状态。
- [x] 确定发布目标为尚未发布的 `0.7.0`。
- [x] 将版本提交后的代码修复补入 changelog。
- [x] 定位发布前检查的跨平台阻塞项。
- [x] 修复相对构建输出目录、CLI 路径和 Editor 文件监听的跨平台问题。
- [x] 完成发布前完整检查。
- [x] 完成发布准备变更。

## Resume Protocol

发布前必须先检查工作区干净。首次发布两个 scoped 平台包后配置 Trusted Publisher，再运行 `bun run release:publish`；不要重新运行 `release:version`。

## Resume Notes

Last updated: 2026-08-14

Done:
- 已确认现有 `0.7.0` version commit 尚未通过 tag 发布。
- 已确认两个 `@pixifact/platform-*` 包尚未发布。
- 已补齐版本提交之后三项代码修复的 changelog。
- 已修复首次发布检查发现的跨平台阻塞项。

Current State:
- `0.7.0` 已通过发布前检查，尚未创建 tag 或发布 npm 包。

Currently Failing:
- 无。

Next:
1. 手动发布 `@pixifact/platform-wechat@0.7.0` 和 `@pixifact/platform-douyin@0.7.0`。
2. 为两个平台包配置 `publish.yml` 的 npm Trusted Publisher。
3. 确认工作区干净后运行 `bun run release:publish` 推送 `v0.7.0`。
