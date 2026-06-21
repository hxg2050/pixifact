# Image Runtime Nodes

## Goal

为 Pixifact compiler `.scene` 增加三种 Pixifact 图片绘制节点：

- `Image`：普通图片盒子，支持 `stretch`、`contain`、`cover`、`none`。
- `NineImage`：九宫格拉伸图片盒子，用于按钮、面板、边框。
- `TileImage`：平铺图片盒子，用于重复背景、纹理地面、滚动图案。

三者都是 runtime leaf node，支持 Pixifact box size 和 frame layout 协议，不作为容器，不接收 children。

## Decisions

- 使用独立节点名 `Image`、`NineImage`、`TileImage`，不把九宫格和平铺做成 `Image mode`。
- `Image` 用自定义 textured quad / `Mesh` 实现，原因是 `cover` 需要通过 UV 裁切表达，而不是通过 Sprite 缩放或修改 texture frame。
- `NineImage` 继承 PixiJS `NineSliceSprite`，但在 Pixifact authoring 层暴露为 `NineImage`。
- `TileImage` 继承 PixiJS `TilingSprite`，但在 Pixifact authoring 层暴露为 `TileImage`。
- 三者的 `width` / `height` 表示 Pixifact 盒子尺寸，不产生 `scale` 副作用。
- 三者都支持 `left`、`right`、`top`、`bottom`、`horizontal`、`vertical` frame layout props。
- 三者都放在右键添加节点的普通节点组中，Inspector 不新增专属分组；节点专属属性放在 Props。
- 继续保留 Pixi 原生 `Sprite`、`NineSliceSprite`、`TilingSprite` primitive；本轮只新增 Pixifact 友好的节点。

## Non-Goals

- 不实现 AnimatedSprite、spritesheet 动画或序列帧动画。
- 不实现圆角图片裁切、遮罩、滤镜或 blend 模式封装。
- 不让图片节点成为容器。
- 不删除 Pixi 原生 Sprite primitive。
- 不做旧 API 兼容或别名。
- 不实现 `Rect`、`GridContainer` 或其他布局节点变更。

## Implementation Scope

- Runtime：
  - 新增 `packages/pixifact/src/runtime/Image.ts`。
  - 新增 `packages/pixifact/src/runtime/NineImage.ts`。
  - 新增 `packages/pixifact/src/runtime/TileImage.ts`。
  - 从 `packages/pixifact/src/runtime/index.ts` 导出。
- Compiler：
  - `spec.ts`、`templateParser.ts` 增加三种 primitive tag。
  - `pixiNodeSchema.ts` 增加默认值、字段 schema、Props 分组和 addable 列表。
  - `typescriptCompiler.ts` 从 `pixifact/runtime` 导入三种节点，复用现有 texture loading。
  - `sceneValidation.ts` 的提示文案包含新节点。
- Editor：
  - 模板库自动读取 addable node list。
  - `i18n.ts` 增加三种节点名和 `fit` 字段。
  - `HierarchyPanel.tsx` 为三种节点使用 image icon。
  - `compilerSceneRuntimePreview.ts` 的 runtime module 导出三种节点。
- Tests：
  - runtime 尺寸、layout 和节点属性。
  - compiler 解析、序列化、验证和生成代码。
  - editor 模板库、schema、runtime preview、Inspector 字段。

## Test Plan

- 先写失败测试：
  - Runtime：导出、leaf、box size、无 scale 副作用、frame layout。
  - Image：`fit` 默认和可变，`cover/contain/stretch/none` 更新 geometry 且不改变 box scale。
  - NineImage：border props、anchor、tint、box size。
  - TileImage：tile props、anchor、tint、box size。
  - Compiler：`<Image>`、`<NineImage>`、`<TileImage>` 可解析、序列化、验证和编译；children 被拒绝。
  - Editor：模板库、defaults、prop groups、预览模块和 Inspector 字段。

## Verification

最小相关验证：

```bash
rtk bunx --no-install vitest run tests/scene-compiler.test.ts tests/compiler-scene-document-controller.test.ts tests/project-file-tree.test.ts tests/editor-workbench-ui.test.ts
```

完整验证：

```bash
rtk bunx --no-install tsc -p apps/editor/tsconfig.json
rtk bun run build
rtk bun run test
```

## Progress

- [x] 写失败测试。
- [x] 实现 runtime 节点。
- [x] 接入 compiler。
- [x] 接入 editor。
- [x] 通过验证。
- [ ] 提交相关 tracked 改动。

## Resume Protocol

续作时先读本文件，再运行当前 `Resume Notes` 的最小相关失败测试，从 `Next` 开始继续。不要重新讨论已经写入 `Decisions` 的设计，除非用户明确要求改设计。

## Resume Notes

Last updated: 2026-06-22

Done:
- 已实现 `Image`、`NineImage`、`TileImage` runtime 节点并从 `pixifact/runtime` 导出。
- 已接入 compiler 解析、schema、校验和 TS 生成。
- 已接入 editor 右键模板、Inspector、Hierarchy 图标和 runtime preview。
- 已补 runtime/compiler/editor 覆盖测试。
- 已通过最小相关测试、editor TypeScript、build 和完整测试。

Current State:
- 待提交相关改动。

Currently Failing:
- 无。

Next:
1. 提交相关 tracked 改动。
