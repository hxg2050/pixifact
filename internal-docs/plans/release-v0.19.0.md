# Release v0.19.0

Status: In Progress

## Goal

发布五个公开 npm 包的 `0.19.0`，交付基础游戏模板、可替换 PNG 的基础 UI 和更新后的项目级 Pixifact skill。

## Decisions

- 新增 `create-pixifact --template game` 使用 minor Changeset；五个公开包按 fixed group 同版发布为 `0.19.0`。
- 沿用快速发布流程：本地生成并审阅版本、依赖和 changelog，提交后由 tag 触发 GitHub Actions 的完整检查与 Trusted Publishing。
- 发布后核对五包的 npm 版本与 `latest`，创建中文 GitHub Release，并更新发布状态和计划记录。

## Non-Goals

- 不新增 runtime 或 Editor 功能，不改变排列容器的位置语义。
- 不在本地执行 `npm publish` 或重复完整发布检查。

## Public API / User-Facing Behavior

- `bun create pixifact my-game --template game` 创建基础游戏/UI 展示项目。
- 模板提供大中小按钮和点击动画、面板、弹窗、进度条，以及开始、暂停、结算和最高分保存示例。
- 设计分辨率为 `1080 × 1920`，使用 `fixedWidth`；用户可覆盖同名 PNG，九宫格参数在各素材 Scene 中统一调整。
- 项目级 skill 包含九宫格封装和排列容器内单独偏移的最佳实践，以及 Editor 协作和静态截图工作流。

## Implementation Scope

- Changesets 生成五包 manifest、依赖、模板版本和 changelog，同步 lockfile。
- 提交发布变更，推送 `main` / `v0.19.0`，核对 CI、npm registry 与 GitHub Release。
- 更新内部发布状态和计划索引。

## Test Plan

- 本地核对 Changesets 目标版本、五包一致性、模板依赖与 lockfile，并检查 diff。
- 由 tag workflow 运行完整测试、runtime / Editor / 脚手架构建、包内容检查与仓库外安装验收。
- 发布后核对五个 npm 包的目标版本、`latest`，以及 GitHub Release。

## Verification

- 2026-10-12：当前五包版本与 npm `latest` 均为 `0.18.0`，npm 上尚无 `0.19.0`。
- 2026-10-12：工作区干净；本地九个待发布提交包含游戏模板和 skill 更新。
- 2026-10-12：Changesets 已生成五包 `0.19.0`，同步 minimal / game 模板和内部依赖；`bun.lock` 无改动。
- 2026-10-12：五包版本一致性、两套模板依赖、`bun install --frozen-lockfile --dry-run`、8 项脚手架测试与 `git diff --check` 通过。
- 2026-10-12：GitHub API 确认远端 `main` 仍为 `cde4457`；默认 Git 拉取遇到 HTTP/2 framing error，正在临时使用 HTTP/1.1 重试。
- CI 和发布后验证待执行。

## Progress

- [x] 核对当前版本和待发布内容。
- [x] 生成并审阅版本改动，完成本地最小检查。
- [ ] 提交发布变更并推送 tag。
- [ ] 确认 CI 成功与五包 npm 发布。
- [ ] 创建 GitHub Release 并更新发布记录。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md`、本计划和 `internal-docs/releases/NPM_PUBLISHING.md`。
2. 核对工作区、远端 `main` / `v0.19.0`、CI 和 npm registry，避免重复发布。
3. 从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-10-12

Done:
- 确认 `0.19.0` 为本次目标版本，待发布内容和 npm 版本已核对。
- 创建 minor Changeset。
- 已生成并检查五包 `0.19.0`、内部依赖、模板与 changelog，完成本地最小检查。

Current State:
- 版本生成完成，准备提交并推送发布。

Currently Failing:
- 无。

Next:
1. 提交后推送发布 tag，等待 CI 并核对 registry。
2. 创建 GitHub Release，补齐发布记录。
