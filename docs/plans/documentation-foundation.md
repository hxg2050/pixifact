# Documentation Foundation

## Goal

把 Pixifact 当前核心能力沉淀到可入口化的中文文档中，让 README、布局说明和 Agent authoring 规则不再停留在旧实现状态。

## Decisions

- `docs/index.md` 是文档总入口，只做导航、权威归属和查找路线。
- `docs/LAYOUT.md` 是布局协议、设计分辨率、视口模式、布局容器和 Editor 布局编辑行为的当前权威文档。
- `docs/FLEX_SCENE_LAYOUT.md` 是旧名称，迁移到 `docs/LAYOUT.md` 后删除，不保留兼容入口。
- README 保持产品入口，不扩展成完整 API 手册。
- Runtime 详细 API 以后可以通过 TypeDoc 或独立 runtime 文档补充。

## Non-Goals

- 不改 runtime、compiler、editor 行为。
- 不重写所有历史计划文档。
- 不整理英文 README。
- 不新增文档站点或 TypeDoc 配置。

## Implementation Scope

- 更新 `README.md`。
- 新增 `docs/index.md`。
- 新增目录级索引：`docs/plans/index.md`、`docs/releases/index.md`、`docs/superpowers/index.md`、`docs/superpowers/plans/index.md`、`docs/superpowers/specs/index.md`。
- 新增 `docs/LAYOUT.md`。
- 删除旧 `docs/FLEX_SCENE_LAYOUT.md`。
- 更新 `docs/AI_SCENE_AUTHORING.md` 的布局文档引用。

## Test Plan

- 校验旧布局文档链接已经消失。
- 校验 Markdown 相对链接目标存在。
- 文档变更不运行代码测试。

## Verification

- [x] `rtk rg -n "FLEX_SCENE_LAYOUT|Control Frame Layout" README.md docs --glob '!docs/plans/documentation-foundation.md'`
- [x] Markdown 相对链接检查
- [x] docs 目录级 `index.md` 检查

## Progress

- [x] README 刷新
- [x] 文档入口新增
- [x] 目录级索引新增
- [x] Layout 文档新增
- [x] 旧布局文档引用迁移
- [x] 链接校验

## Resume Protocol

继续本任务时：

1. 读取 `AGENTS.md`、`CODEX.md`、本计划和当前 `git status`。
2. 检查 `README.md`、`docs/index.md`、`docs/LAYOUT.md`、`docs/AI_SCENE_AUTHORING.md`。
3. 从 `Resume Notes` 的 `Next` 继续。

## Resume Notes

Last updated: 2026-06-23

Done:
- 已刷新 README。
- 已新增 `docs/index.md` 和 `docs/LAYOUT.md`。
- 已新增 `docs/plans/index.md`、`docs/releases/index.md`、`docs/superpowers/index.md`、`docs/superpowers/plans/index.md`、`docs/superpowers/specs/index.md`。
- 已删除旧 `docs/FLEX_SCENE_LAYOUT.md`。
- 已更新 `docs/AI_SCENE_AUTHORING.md` 的布局文档引用。
- 已完成旧入口引用检查、Markdown 相对链接检查、docs 目录级 `index.md` 检查。

Current State:
- 文档编辑和验证完成。
- 自动提交被当前环境阻塞：`git add` 需要创建 `.git/index.lock`，但本会话对 `.git` 只有读权限，报错 `Operation not permitted`。

Next:
1. 在具备 `.git` 写权限的环境中提交文档变更。
