# Editor 多选与批量操作

## Goal
在同一 Scene 中多选节点，并完成批量移动、整体缩放、共有属性编辑、复制、粘贴、删除与撤销。

## Decisions
- 选区是每个 Scene Tab 的 UI 状态，包含按选择顺序排列的 locators 和主节点。Scene 文本仍是数据源。
- 层级点击单选，Cmd/Ctrl 点击增减，Shift 点击当前可见树的连续范围；画布 Cmd/Ctrl 点击增减。
- 层级右键已选节点保留选区；右键未选节点转为单选。添加和粘贴的目标是右键点到的节点；快捷键粘贴的目标是主节点。
- 复制的剪贴板是一组按树顺序排列的顶层节点快照，父子同时选中时只复制父节点。粘贴到容器末尾或普通节点后面，生成独立 ID，整组一条撤销记录，完成后选中新节点。
- 结构操作只作用于选区中没有已选祖先的根节点。删除按倒序执行。画布移动使用相同的屏幕位移并转换到各节点父坐标系。
- 检查器展示共有且 schema 相容的字段；混合值显示占位符，提交时给所有节点写同一值。批量修改只产生一条撤销记录。ID 仅单选时可编辑。
- 多选 Resize 使用整个选区的包围框，位置和尺寸随包围框比例变化；不支持调整尺寸的节点不进入此手势。
- 外部文件重载逐个重映射选区；现有 Agent context 继续报告主节点。

## Non-Goals
- 跨 Scene 多选、对齐分布、框选、系统剪贴板互通。

## Public API / User-Facing Behavior
只改变 Editor 交互；Compiler 与 CLI 公共 API 不变。

## Implementation Scope
选区状态、层级与右键菜单、画布交互、检查器和结构批处理辅助函数。

## Test Plan
按用户要求由用户手动验证；完成前只构建 Editor 前端以便在现有服务中查看。

## Verification
- `bun run editor:typecheck` 通过。
- `bun run editor:frontend:build` 通过，已刷新本地 Editor 静态资源。
- `git diff --check` 通过。按用户要求，不做浏览器操作或 UI 自动验证，由用户手动验收。

## Progress
已完成实现，待用户手动验收。

## Resume Protocol
读取本计划和当前 diff，从未完成的实现继续。

## Resume Notes
Last updated: 2026-09-24

Current State:
- 已完成多选、批量结构命令、检查器共有属性、画布整组移动与缩放。
- 类型检查与前端构建通过；未做浏览器操作验证。

Next:
1. 用户手动验收；如发现具体交互问题，再按反馈修复。
