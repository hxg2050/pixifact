# 移除 adventure-ui-demo 示例项目

## Goal

移除仓库中不再维护的 `adventure-ui-demo` 示例项目及其专属验证入口，让 `wechat-minigame-demo` 成为当前唯一内置示例。

## Decisions

- 删除 `sample-projects/adventure-ui-demo` 整个目录。
- 删除只服务于该示例的拖尾原型测试和计划文档，不将拖尾效果迁移到核心 Runtime。
- 发布安装冒烟统一从 `wechat-minigame-demo` 复制 Web 示例，并保留微信、抖音平台验证。
- 公开文档中的示例项目名改为通用名称；历史计划文档保留原样。

## Non-Goals

- 不删除 `sample-projects/wechat-minigame-demo`。
- 不新增 Editor 启动、拖尾 Runtime 节点或其他示例替代功能。
- 不重写 `internal-docs/plans/` 中记录历史决策的文档。

## Public API / User-Facing Behavior

仓库不再提供 `adventure-ui-demo` 示例；样例项目发现、发布冒烟和版本同步流程不再引用它。

## Implementation Scope

- 删除 Adventure UI 示例目录、拖尾测试和拖尾计划。
- 更新样例项目测试、Editor fixture、发布安装脚本和版本同步脚本。
- 更新锁文件和公开/发布文档中的当前引用。

## Test Plan

- [x] 样例项目和 Editor Vue 测试通过。
- [x] 全量 Vitest 通过。
- [x] Editor 类型检查和前端构建通过。
- [x] 发布安装冒烟通过。
- [x] 搜索确认当前入口不再残留 Adventure UI 引用。

## Verification

```bash
rtk bunx --no-install vitest run tests/sample-projects.test.ts tests/editor-vue-ui.test.ts
rtk bun run test
rtk bun run editor:typecheck
rtk bun run editor:frontend:build
rtk bun scripts/check-release-install.mjs
```

## Progress

- [x] 清理代码、测试、脚本和文档引用。
- [x] 删除示例目录并更新锁文件。
- [x] 完成验证并提交相关变动。

## Resume Protocol

1. 阅读本文件、仓库 `AGENTS.md` 和 `CODEX.md`。
2. 检查 worktree，保留用户已有的 `docs/plans/editor-layout-authoring.md`。
3. 运行最小相关测试。
4. 从 `Resume Notes` 的 Next 继续。

## Resume Notes

Last updated: 2026-09-13

Done:
- 已确认删除目标和所有当前代码入口。
- 已删除 `adventure-ui-demo` 目录、拖尾测试和拖尾计划。
- 已将发布安装冒烟切换到 `wechat-minigame-demo`，并修复其 Scene 中阻塞校验的属性写法。
- 已通过样例/Editor 目标测试、全量 Vitest、Editor 类型检查、前端构建和发布安装冒烟。

Current State:
- 代码与文档清理已完成，相关 tracked 变动已提交为 `c4225bb`。

Currently Failing:
- 无。

Next:
1. 无；后续开发保留用户已有的 `docs/plans/editor-layout-authoring.md`。
