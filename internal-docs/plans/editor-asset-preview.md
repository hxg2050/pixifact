# Editor 图片素材预览

## Goal
在右侧检查器底部按需显示图片素材预览、原始分辨率和文件大小；为星星游戏示例增加两张可测试图片。

## Decisions
- 资产树布局及画布尺寸不变。点击图片行后，右侧检查器底部出现一个可关闭的预览区；拖动图片不触发预览。
- 检查器上半部独立滚动，预览固定在右栏底部。Scene 节点选区和检查器内容不因素材预览而改变。
- 原图在预览区按比例缩放，透明像素用棋盘格标识；显示项目相对路径、原始像素尺寸和磁盘文件大小。SVG 显示矢量图，不伪称固定像素分辨率。
- 图片从现有只读 `/api/file` 获取；项目文件刷新时重新读取当前图片。读取失败直接在预览区显示错误。
- 两张不同分辨率的 PNG 添加到 `sample-projects/star-game-demo`，并同步到当前运行的临时示例副本以便手动验收。

## Non-Goals
- 修改 Scene、导入资源、图片编辑、AI 资源接口、音频预览、缩略图网格。

## Public API / User-Facing Behavior
不变更 CLI 公共 API；只增加 Editor 中点击图片后的右侧预览 UI。

## Implementation Scope
资产行点击事件、Editor 顶层预览选择状态、右侧预览面板与布局样式、示例图片。

## Test Plan
按用户先前要求，UI 交互由用户手动验收。完成前运行 Editor 类型检查及前端构建。

## Verification
- `bun run editor:typecheck` 通过。
- `bun run editor:frontend:build` 通过；UI 按用户要求由用户手动验收。
- 当前运行的 Editor `/api/project` 已列出两张测试图片。
- `git diff --cached --check` 通过；相关代码与图片已提交为 `b2d9783`。

## Progress
预览面板、点击与拖动区分、示例图片已完成并提交。

## Resume Protocol
读取本计划及当前 diff，从未完成的实现继续。

## Resume Notes
Last updated: 2026-09-25

Current State:
- 已实现功能并生成示例图片，类型检查与构建通过，相关文件已提交。

Next:
1. 用户手动验收右侧预览面板及拖放交互。
