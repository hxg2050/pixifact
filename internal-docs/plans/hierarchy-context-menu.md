# 层级节点右键菜单

## Goal

在层级树的 Scene 根节点和普通节点上提供添加、复制、粘贴、删除操作，并按右键目标确定插入位置。

## Decisions

- 右键菜单作用于鼠标所在节点，打开时同步选择该节点；Scene 根节点视为容器。
- 添加使用现有可新增节点类型，并通过悬停的二级菜单选择类型。
- 容器目标追加到子节点末尾；非容器目标插入到它的同级后方。粘贴沿用同样的目标规则。
- 右键“复制”保存节点树快照到当前 Editor 的剪贴板；可重复粘贴，粘贴时沿用现有唯一 ID 生成逻辑。Scene 根节点不可复制或删除，Slot Outlet 不可复制。
- 顶部“复制节点”保留现有就地复制行为。
- 使用现有 `reka-ui` 的 ContextMenu 组件承载菜单、悬停子菜单和键盘交互；整棵层级树共用一套菜单。

## Non-Goals

- 不改动 `.scene` 命令或文件格式。
- 不接入操作系统剪贴板。

## Public API / User-Facing Behavior

无公开 API 变化。用户右键目标节点后可添加、复制、粘贴或删除；不适用的动作显示为禁用。

## Implementation Scope

- `apps/editor/src/panels/HierarchyPanel.vue`：目标定位、节点剪贴板、命令提交和右键菜单。
- `apps/editor/src/styles.css`：菜单样式。

## Test Plan

按用户当前要求交由其手动检查；只构建前端供检查，不运行自动测试或页面检查。

## Verification

等待用户手动检查。

## Progress

菜单和命令已接入，前端资源已构建，等待用户手动检查。

## Resume Protocol

先读本计划与当前 worktree 状态，再从 Resume Notes 继续。保留其他未跟踪文件。

## Resume Notes

Last updated: 2026-09-24

Done:
- 明确右键目标、插入规则、剪贴板与顶栏复制的关系。
- 在层级树接入一套可按行定位的右键菜单，使用悬停子菜单列出可新增节点。
- 接入节点快照复制、重复粘贴和既有的添加、删除命令。

Current State:
- 代码已提交为 `df053ab`，前端资源已构建；按用户要求未运行测试或页面检查。

Next:
1. 交由用户手动检查右键目标、二级菜单和四种操作。
