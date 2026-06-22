# Viewport Adaptation V1 Plan

## Goal

为 Pixifact 增加第一版屏幕适配协议，让项目能够明确声明设计分辨率如何映射到真实屏幕，并让竖屏示例项目使用 `fixedWidth` 适配移动端。

## Decisions

- `pixifact.project.json` 新增 `viewport.mode`。
- V1 支持四种模式：
  - `showAll`：完整显示设计画布，可能留边。
  - `cover`：等比铺满真实屏幕，可能裁切设计画布。
  - `fixedWidth`：设计宽度固定，高度按真实屏幕比例扩展或收缩，竖屏移动端优先。
  - `fixedHeight`：设计高度固定，宽度按真实屏幕比例扩展或收缩，横屏优先。
- `resolution` 继续表示设计坐标系。
- runtime 提供纯计算 helper，输出逻辑 Scene 尺寸、stage 缩放、stage 偏移和可见区域。
- 示例项目使用 `viewport.mode = "fixedWidth"`。
- 示例项目运行时不再靠 CSS 缩放 canvas，而是用 runtime viewport helper 根据容器尺寸 resize Pixi renderer 并更新根 Scene 尺寸。
- V1 不处理设备刘海、系统安全区 inset 和平台原生 safe area。

## Non-Goals

- 不实现真实相机系统。
- 不新增 Scene 语法。
- 不改变 `left/right/top/bottom/horizontal/vertical` 布局协议。
- 不引入新的第三方依赖。
- 不把 Editor 的 Zustand 状态变成项目数据源。

## Implementation Scope

- 更新 project config 解析和摘要，包含 `viewport.mode`。
- 新增 viewport runtime helper 并从 `pixifact/runtime` 导出。
- 更新 adventure UI demo 的项目配置和运行入口。
- 让 Editor 预览读取项目 viewport，在主 Scene 预览时按 viewport 模式计算逻辑画布尺寸。
- 补测试覆盖 project config、runtime viewport 计算、sample 配置和预览转换函数。

## Test Plan

- 先写失败测试：
  - project config 能解析并摘要 `viewport.mode`。
  - invalid viewport mode 会报错。
  - viewport helper 覆盖 `showAll`、`cover`、`fixedWidth`、`fixedHeight`。
  - adventure UI demo 声明 `fixedWidth`。
- 实现后运行：
  - `rtk bunx --no-install vitest run tests/project-run-config.test.ts tests/scene-compiler.test.ts tests/sample-projects.test.ts tests/editor-workbench-ui.test.ts`
  - `rtk bun run pixifact -- scene validate --project-root sample-projects/adventure-ui-demo --all`
  - `rtk bun run --cwd sample-projects/adventure-ui-demo build`
  - `rtk bun run build`
  - `rtk bun run test`

## Verification

- 2026-06-22 通过 `rtk bunx --no-install vitest run tests/project-run-config.test.ts tests/scene-compiler.test.ts tests/sample-projects.test.ts tests/editor-workbench-ui.test.ts`。
- 2026-06-22 通过 `rtk bun run pixifact -- scene validate --project-root sample-projects/adventure-ui-demo --all`。
- 2026-06-22 通过 `rtk bun run --cwd sample-projects/adventure-ui-demo build`。
- 2026-06-22 通过 `rtk bunx --no-install tsc -p apps/editor/tsconfig.json`。
- 2026-06-22 通过 `rtk bun run build`。
- 2026-06-22 通过 `rtk bun run test`。

## Progress

- [x] 确定四种 viewport mode。
- [x] 添加失败测试。
- [x] 实现 project/runtime/editor/sample 改动。
- [x] 运行验证并修复问题。

## Resume Protocol

继续本任务时：

1. 阅读 `AGENTS.md`、`CODEX.md` 和本计划。
2. 查看 `git status --short`。
3. 运行 `rtk bunx --no-install vitest run tests/project-run-config.test.ts tests/scene-compiler.test.ts tests/sample-projects.test.ts tests/editor-workbench-ui.test.ts`。
4. 从 `Resume Notes` 的 `Next` 继续。

## Resume Notes

Last updated: 2026-06-22

Done:
- 已确定 V1 只做 `showAll`、`cover`、`fixedWidth`、`fixedHeight`。
- 已创建计划文档。
- 已新增 `calculatePixifactViewportLayout` 和 `applyPixifactViewportLayout`。
- 已新增 `viewport.mode` 项目配置解析与 summary 输出。
- 已让 `create-pixifact` minimal 模板显式声明 `viewport.mode = "showAll"`。
- 已让 Editor 主 Scene 预览根据项目 viewport 计算逻辑 Scene 尺寸。
- 已让 adventure UI demo 使用 `fixedWidth` 并在运行时按容器 resize。

Current State:
- 本轮计划已完成，验证命令全部通过。

Currently Failing:
- 无。

Next:
1. 后续可继续讨论是否加入设备 safe area inset、Editor 设备预设或横竖屏预览切换。
