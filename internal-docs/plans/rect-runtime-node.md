# Rect Runtime Node

## Goal

实现 Pixifact runtime `Rect` 节点，用于在 `.scene` 中声明可布局的纯矩形/圆角矩形背景。

`Rect` 需要进入 compiler、editor Inspector、右键添加节点和运行时预览，成为 Pixifact 自己的轻量绘制叶子节点。

## Decisions

- `Rect extends Graphics`。
- `Rect` 不继承 `Control`，不作为容器，不接受 children。
- `Rect` 不创建内部 `Graphics` 子节点，不增加额外 `Container` 层。
- 不改变 PixiJS 原生 `Graphics` 节点语义。
- `Rect` 使用私有 `#width`、`#height` 持有 Pixifact box size。
- `Rect.width`、`Rect.height`、`setSize(...)`、`getSize(...)` 走 Pixifact box size 协议，不能修改 `scale`。
- `Rect` 支持 frame layout 属性：`left`、`right`、`top`、`bottom`、`horizontal`、`vertical`。
- `Rect` 第一版只绘制矩形/圆角矩形和描边，不做图片背景、渐变、九宫格或复杂路径。
- `Rect` 样式属性为 `fillColor`、`fillAlpha`、`strokeColor`、`strokeAlpha`、`strokeWidth`、`radius`。
- 默认值：
  - `width = 100`
  - `height = 60`
  - `fillColor = 0xffffff`
  - `fillAlpha = 1`
  - `strokeColor = 0x000000`
  - `strokeAlpha = 1`
  - `strokeWidth = 0`
  - `radius = 0`
- `radius` 绘制时限制到 `min(width / 2, height / 2)`。
- `stroke` 使用 `alignment: 1`，描边画在 box 内侧。
- Editor Inspector 中 Rect 字段放在 `Props`，不新建单独 Rect 分组。

## Non-Goals

- 不实现 `Image`。
- 不实现图片填满、裁剪、cover/contain。
- 不重写或删除 PixiJS `Graphics`。
- 不把 `Rect` 做成 `Control` 或通用容器。
- 不做旧 API 兼容、别名或 fallback。

## Public API / User-Facing Behavior

- `pixifact/runtime` 导出 `Rect`。
- `.scene` 支持 `<Rect />` primitive。
- `<Rect>` 可写通用 transform/display/layout 属性。
- `<Rect>` 可写 `fillColor`、`fillAlpha`、`strokeColor`、`strokeAlpha`、`strokeWidth`、`radius`。
- `<Rect>` 不允许包含子节点。
- 右键添加节点的“节点”分组中出现 `Rect`。
- Inspector 对 Rect 显示 `Props` 字段：`fillColor/fillAlpha/strokeColor/strokeAlpha/strokeWidth/radius`。

## Implementation Scope

- `packages/pixifact/src/runtime/Rect.ts`
- `packages/pixifact/src/runtime/index.ts`
- `packages/pixifact/src/compiler/spec.ts`
- `packages/pixifact/src/compiler/templateParser.ts`
- `packages/pixifact/src/compiler/pixiNodeSchema.ts`
- `packages/pixifact/src/compiler/sceneValidation.ts`
- `packages/pixifact/src/compiler/typescriptCompiler.ts`
- `packages/pixifact/src/compiler/templateSerializer.ts`
- `apps/editor/src/services/nodeTemplateLibrary.ts`
- `apps/editor/src/i18n.ts`
- `apps/editor/src/panels/InspectorPanel.tsx`
- `apps/editor/src/preview/compilerSceneRuntimePreview.ts`
- 相关 tests

## Test Plan

- [x] Runtime：验证 `Rect` 从 `pixifact/runtime` 导出、继承 `Graphics`、默认尺寸/样式、无 children、无 scale 副作用。
- [x] Runtime Layout：验证 `Rect` 在 `Group` 父节点下支持左上、右上、铺满、水平/垂直居中、`left+right`/`top+bottom` 拉伸。
- [x] Compiler：验证 `<Rect>` 解析、序列化、校验、编译生成 runtime import/new Rect。
- [x] Compiler：验证 `<Rect>` children 校验失败。
- [x] Editor：验证右键节点库包含 Rect，Inspector Props 包含 Rect 样式字段。
- [x] Preview：验证预览模块 `pixifact/runtime` 导出 Rect，`.scene` 中 Rect 可实例化。

## Verification

```bash
rtk bunx --no-install vitest run tests/scene-compiler.test.ts tests/compiler-scene-document-controller.test.ts tests/project-file-tree.test.ts tests/editor-workbench-ui.test.ts
rtk bunx --no-install tsc -p apps/editor/tsconfig.json
rtk bun run build
rtk bun run test
```

## Progress

- [x] 确认 Rect 设计决策。
- [x] 写失败测试。
- [x] 实现 runtime Rect。
- [x] 接入 compiler。
- [x] 接入 editor 和 preview。
- [x] 运行验证并提交。

## Resume Protocol

1. 阅读本文件。
2. 检查 worktree 状态，保护无关用户改动。
3. 运行最小相关目标测试。
4. 从 `Resume Notes` 继续，不重新打开已确认设计决策。
5. 如果停止时任务未完成，先更新本文件。

## Resume Notes

Last updated: 2026-06-21

Done:
- 已确认 Rect API、默认值、非容器语义和 editor 展示位置。
- 已创建计划文档。
- 已实现 runtime `Rect extends Graphics`，并从 `pixifact/runtime` 导出。
- 已接入 compiler primitive/schema/parser/serializer/validator/codegen。
- 已接入 editor 节点库、Inspector、Hierarchy 和 runtime preview。
- 已补 TDD 覆盖并通过验证。

Current State:
- Rect 需求已完成，验证通过。

Currently Failing:
- 无。

Next:
1. 无。
