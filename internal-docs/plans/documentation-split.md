# Documentation Split

## Goal

把 Pixifact 文档分成对外文档和内部维护文档两部分：`docs/` 面向用户和下游 Agent，`internal-docs/` 面向 Pixifact 仓库维护。

## Decisions

- `docs/` 只保留对外文档，例如 `index.md`、`LAYOUT.md`、`AI_SCENE_AUTHORING.md`。
- `internal-docs/` 承接内部计划、测试、发布、规格和历史归档。
- README 的用户入口指向 `docs/`，维护者入口指向 `internal-docs/`。
- `AGENTS.md` 作为仓库 Agent 入口，同时指向对外和内部文档。
- 不保留旧路径兼容入口；当前仓库仍处于开发阶段，直接迁移引用。

## Non-Goals

- 不改文档正文的业务结论。
- 不整理英文 README。
- 不引入文档站或 TypeDoc。
- 不迁移源码、测试或 package 配置。

## Implementation Scope

- 移动内部文档到 `internal-docs/`。
- 更新 `docs/index.md` 为对外入口。
- 新增 `internal-docs/index.md` 和目录级索引。
- 修复 README、AGENTS、skill 和 Markdown 相对链接。
- 删除失效的 `docs/releases`、`docs/superpowers` 入口文件。

## Test Plan

- 检查 `docs/` 下只剩对外文档。
- 检查 `internal-docs/` 每个目录都有 `index.md`。
- 检查 Markdown 相对链接目标存在。
- 文档迁移不运行代码测试。

## Verification

- [x] `docs/` 对外文档检查
- [x] `internal-docs/` 目录级 `index.md` 检查
- [x] Markdown 相对链接检查

## Progress

- [x] 内部文档迁移到 `internal-docs/`
- [x] 对外文档入口收窄
- [x] 内部文档入口新增
- [x] 链接和目录检查

## Resume Protocol

继续本任务时：

1. 读取 `AGENTS.md`、`CODEX.md`、本计划和当前 `git status`。
2. 检查 `docs/index.md` 和 `internal-docs/index.md`。
3. 从 `Resume Notes` 的 `Next` 继续。

## Resume Notes

Last updated: 2026-06-23

Done:
- 已决定 `docs/` 作为对外文档，`internal-docs/` 作为内部文档。
- 已移动内部文档并新增内部入口。
- 已更新 README、AGENTS、对外 docs 入口和内部索引。
- 已修复 Markdown 相对链接。

Current State:
- 文档迁移和验证完成。
- 自动提交被当前环境阻塞：`git add` 需要创建 `.git/index.lock`，但本会话对 `.git` 只有读权限，报错 `Operation not permitted`。

Next:
1. 在具备 `.git` 写权限的环境中提交文档变更。
