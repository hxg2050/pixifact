# Public Docs I18n

## Goal

把对外文档拆成中文和英文两套：`docs/zh/` 和 `docs/en/`，并让根 `docs/index.md` 只负责语言选择。

## Decisions

- `docs/index.md` 是对外文档语言入口。
- 中文对外文档放在 `docs/zh/`。
- 英文对外文档放在 `docs/en/`。
- `README.md` 指向中文对外文档。
- `README.en.md` 指向英文对外文档。
- 内部文档继续放在 `internal-docs/`，并按需要指向中英文对外文档。

## Non-Goals

- 不引入文档站。
- 不重写内部文档内容。
- 不整理 TypeDoc 或 API 参考。

## Implementation Scope

- 移动现有公开文档到语言目录。
- 补齐中文 `agent-scene-authoring.md`。
- 补齐英文 `layout.md`。
- 更新 README、README.en 和内部文档引用。
- 校验 Markdown 相对链接和目录级 index。

## Test Plan

- 检查 `docs/zh/` 和 `docs/en/` 都有 `index.md`、`layout.md`、`agent-scene-authoring.md`。
- 检查 Markdown 相对链接目标存在。
- 检查文档目录都有 `index.md`。
- 文档迁移不运行代码测试。

## Verification

- [x] 公开文档语言目录检查
- [x] Markdown 相对链接检查
- [x] 文档目录级 index 检查

## Progress

- [x] 建立 `docs/zh/` 和 `docs/en/`
- [x] 移动现有公开文档
- [x] 补齐缺失语言版本
- [x] 更新引用
- [x] 验证

## Resume Protocol

继续本任务时：

1. 读取 `AGENTS.md`、`CODEX.md`、本计划和当前 `git status`。
2. 检查 `docs/index.md`、`docs/zh/index.md`、`docs/en/index.md`。
3. 从 `Resume Notes` 的 `Next` 继续。

## Resume Notes

Last updated: 2026-06-24

Done:
- 已决定对外文档按 `docs/zh/` 与 `docs/en/` 拆分。
- 已建立语言目录并补齐核心文档。
- 已更新 README、README.en 和内部文档中的公开文档引用。
- 已通过公开文档语言目录检查、Markdown 相对链接检查和文档目录级 index 检查。

Current State:
- 变更已完成，等待提交。

Next:
1. 提交本次文档拆分变更。
