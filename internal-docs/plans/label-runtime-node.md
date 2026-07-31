# Label Runtime Node

## Goal

实现 Pixifact runtime `Label` 文本显示控件，让 UI 文本的布局盒、排版字号和整体缩放拥有独立语义，并移除原生 `Text`、`BitmapText`、`HTMLText` 的旧 authoring 假宽高默认值。

## Decisions

- `Label extends Control`，内部使用一个 PixiJS `Text` 渲染文本。
- `Label.width` / `Label.height` 是 Pixifact 布局盒尺寸，不修改内部文字或自身的 `scale`。
- `fontSize` 修改字号并重新排版；`scaleX` / `scaleY` 仍缩放整个 `Label`。
- `Label` 是 `.scene` 叶子节点，不接受 authored children。
- 第一版属性为 `text`、`fontFamily`、`fontSize`、`fontWeight`、`fill`、`lineHeight`、`letterSpacing`、`wordWrap`、`alignX`、`alignY`、`overflow`。
- `alignX` / `alignY` 支持 `start`、`center`、`end`。
- `overflow` 支持 `visible`、`clip`。
- `wordWrap=true` 时换行宽度始终跟随 `Label.width`。
- 默认值为 `width=120`、`height=28`、`text="Text"`、`fontFamily="Arial"`、`fontSize=16`、`fontWeight=400`、`fill=0x111827`、`lineHeight=0`、`letterSpacing=0`、`wordWrap=false`、`alignX="start"`、`alignY="start"`、`overflow="visible"`。
- 原生 `Text`、`BitmapText`、`HTMLText` 保留 Pixi bounds / scale 尺寸语义，schema 默认值不再包含 `width` / `height`。
- Editor 继续使用安全 Authoring Preview，不执行项目脚本；Inspector 由 compiler schema 自动展示 `Label` 属性。

## Non-Goals

- 不实现富文本、文本输入、自动缩小字号、省略号、最大行数或自动适应盒子尺寸。
- 不以 `Label` 替换或删除原生 `Text`、`BitmapText`、`HTMLText`。
- 不允许 `Label` 包含 authored children。
- 不新增兼容层、别名或 fallback。

## Public API / User-Facing Behavior

- `pixifact/runtime` 导出 `Label`。
- `.scene` 支持 `<Label />` primitive。
- Editor 可以安全预览并在 Inspector 中编辑 `Label` 的盒子、排版、对齐、换行和裁剪属性。
- 原生文本节点未显式设置 `width` / `height` 时使用 Pixi 自然尺寸。

## Implementation Scope

- Runtime：新增 `packages/pixifact/src/runtime/Label.ts` 并从 runtime 入口导出。
- Compiler：接入 primitive type、parser、schema、validator 和 TypeScript codegen。
- Editor：接入安全 runtime preview、Hierarchy 图标和增量属性预览。
- Docs：更新中英文 Scene Objects、Layout、README runtime 节点清单和 skill 离线参考。
- Tests：覆盖 runtime 语义、compiler 往返/校验/codegen、Editor Authoring Preview。

## Test Plan

- [x] Runtime：盒子宽高变化不修改文字 scale，字号变化重新排版。
- [x] Runtime：水平/垂直对齐、换行宽度和 overflow mask 正确更新。
- [x] Compiler：`<Label>` 可解析、序列化、校验并生成 runtime `Label`。
- [x] Compiler：`<Label>` children 校验失败。
- [x] Schema：`Label` 有真实盒子默认值；原生三种文本无假宽高默认值。
- [x] Editor：Authoring Preview 能实例化并显示 `Label`，不读取项目脚本。

## Verification

```bash
rtk bunx --no-install vitest run tests/scene-compiler.test.ts tests/project-file-tree.test.ts tests/editor-vue-ui.test.ts
rtk bun run editor:typecheck
rtk bun run editor:frontend:build
rtk bun run build
rtk bun run test
```

## Progress

- [x] 确认 Label 第一版语义和范围。
- [x] 创建计划并补 BDD。
- [x] 写失败测试。
- [x] 实现 runtime、compiler 和 Editor 接入。
- [x] 更新公开文档与离线参考。
- [x] 运行验证并提交。

## Resume Protocol

1. 阅读本文件。
2. 检查 worktree 状态，保留用户对示例 `.scene` 的现有修改。
3. 运行 `Resume Notes` 中的最小相关失败测试。
4. 从 `Next` 继续，不重新讨论已写入 `Decisions` 的设计。
5. 如果任务未完成，更新 `Progress` 和 `Resume Notes`。

## Resume Notes

Last updated: 2026-07-31

Done:
- 已确定 Label API、默认值、叶子语义以及原生 Text 边界。
- 已创建实现计划。
- 已实现 runtime `Label`，盒子尺寸不会修改文字 scale。
- 已接入 compiler parser/schema/validator/codegen 和 Editor Authoring Preview/Inspector/Hierarchy。
- 已移除原生 `Text`、`BitmapText`、`HTMLText` schema 的 `120 x 28` 假宽高默认值。
- 已更新中英文公开文档、Layout、README 和 skill 离线参考。
- 已通过 13 个测试文件、182 个测试、runtime build、Editor typecheck/build、示例项目 build 和浏览器验收。

Current State:
- Label 需求已完成，验证通过。

Currently Failing:
- 无。

Next:
1. 无。
