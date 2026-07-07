---
name: pixifact
description: 用于下游 Pixifact 游戏项目：编辑项目相对 .scene 文件（如 src/scenes/Hud.scene）、维护同名 Scene 脚本契约、读取 pixifact.project.json、运行 pixifact summary / scene inspect / scene validate / compile-scenes；适用于 UI、HUD、menu、轻量 Scene 和 runtime 集成任务。
---

# Pixifact

用于下游 Pixifact 游戏项目。目标是直接编辑项目里的 `.scene` 源文件和同名 `.ts` 脚本，再用 Pixifact CLI 校验和编译。

## Scene 工作流

处理 Scene、UI、HUD、menu、layout 或视觉资产任务时，优先编辑项目相对 `.scene` 源文件。

1. 读取 `package.json`、`pixifact.project.json` 和目标 `.scene` / `.ts` 文件。
2. 新建 Scene、添加节点、修改布局或不确定对象属性时，先读 `references/scene-objects.md`。
3. 读取项目摘要：
   ```bash
   pixifact summary
   ```
4. 需要结构上下文时 inspect 目标 Scene：
   ```bash
   pixifact scene inspect --scene src/scenes/MainMenu.scene
   ```
5. 直接编辑 `.scene`，必要时同步同名 `.ts` 脚本契约。
6. 校验被编辑的 Scene：
   ```bash
   pixifact scene validate --scene src/scenes/MainMenu.scene
   ```
   多个 Scene 可能受影响时：
   ```bash
   pixifact scene validate --all
   ```
7. 校验通过后编译：
   ```bash
   pixifact compile-scenes
   ```
8. 运行项目最小相关检查，通常是：
   ```bash
   bun run build
   ```

默认项目根是当前工作目录；不在项目根运行时再加 `--project-root <path>`。项目自己的 `bun run build`、`bun run dev` 等命令只作为后续检查或预览入口。

## 可用节点

- `pixifact/runtime` 当前可直接导入的内置 runtime 包括：`Group`、`Control`、`Rect`、`Image`、`NineImage`、`TileImage`、`GridContainer`、`HBoxContainer`、`ScrollContainer`、`VBoxContainer`、`frameLayout`、`stackLayout` 和 `viewport`。
- `.scene` 中可直接使用的 primitive 节点以编译器白名单为准，当前包括：`Container`、`Sprite`、`NineSliceSprite`、`TilingSprite`、`Text`、`BitmapText`、`HTMLText`、`Graphics`、`Rect`、`Image`、`NineImage`、`TileImage`、`GridContainer`、`HBoxContainer`、`ScrollContainer` 和 `VBoxContainer`。
- `Group`、`Control` 这类是 `src/` 里的 runtime / Scene 脚本基类，不是 `.scene` 里的裸标签。
- 如果节点不在这个白名单里，不要假设它能在 `.scene` 中直接使用；先查编译器和 runtime 导出，再决定是否需要新增节点。

## 核心 API

只记录 AI 写 UI 时必须知道的公共契约，不展开 PixiJS 全量 API。

### Scene 脚本契约

- `@scene()`：标记 Scene 脚本类。
- `@part()`：绑定 `.scene` 中稳定 `id` 的子节点。
- `@prop()`：暴露可从父 Scene 传入的公开属性。
- `@event()`：暴露可被 `.scene` 事件绑定调用的公开事件。
- `@slot()`：暴露可接收子内容的插槽契约。
- Scene 脚本类必须继承 `Group`。

### runtime 关键语义

- `Group`：Scene 根节点和盒子尺寸容器，`width` / `height` 表示 Pixifact 盒子尺寸，不是 Pixi bounds 语义。
- `Control`：布局基础节点，配合 `left`、`right`、`top`、`bottom`、`horizontal`、`vertical` 做 frame layout。
- `Rect`：纯矩形 / 圆角矩形绘制节点，常用属性是 `fillColor`、`fillAlpha`、`strokeColor`、`strokeAlpha`、`strokeWidth`、`radius`。
- `Image`：图片盒子，常用属性是 `texture`、`fit`、`anchorX`、`anchorY`、`tint`。
- `NineImage`：九宫格图片盒子，常用属性是 `texture`、`leftWidth`、`rightWidth`、`topHeight`、`bottomHeight`、`anchorX`、`anchorY`、`tint`。
- `TileImage`：平铺图片盒子，常用属性是 `texture`、`tilePositionX`、`tilePositionY`、`tileScaleX`、`tileScaleY`、`tileRotation`、`anchorX`、`anchorY`、`tint`。
- `GridContainer`：网格布局容器，常用属性是 `columns`、`gapX`、`gapY`、`alignX`、`alignY`。
- `HBoxContainer` / `VBoxContainer`：栈布局容器，常用属性是 `gap`、`alignX` / `alignY`、`justify`。
- `ScrollContainer`：滚动容器，常用属性是 `direction`、`scrollX`、`scrollY`。
- `frameLayout`、`stackLayout`、`viewport`：布局和视口相关工具能力。

### `.scene` primitive 重点

- `Container`：唯一允许直接承载普通 child primitives 的基础容器。
- `Sprite`：用 `texture`、`anchorX`、`anchorY`、`tint`。
- `Text` / `BitmapText` / `HTMLText`：用 `text`、`fontSize`、`fontFamily`、`fontWeight`、`fill`。
- `Graphics`：用 `shape`、`fill`、`fillAlpha`、`strokeColor`、`strokeWidth`、`strokeAlpha`、`radius`。
- `Rect` / `Image` / `NineImage` / `TileImage`：优先按各自的盒子尺寸和专属 props 写，不要当成裸 Pixi 节点去猜。
- `GridContainer`、`HBoxContainer`、`ScrollContainer`、`VBoxContainer`：都是可直接在 `.scene` 中声明的布局容器。
- primitive 节点的可写属性以编译器 schema 为准；如果 AI 不确定某个属性是否存在，先查白名单和 schema，不要瞎编。

## 硬性规则

- `.scene` 是 authored visual structure、hierarchy、layout、text、image、子 Scene instance、slot 和 event wiring 的 source of truth。
- Scene 资产是同目录、同 basename 的文件对，例如 `src/scenes/Hud.scene` 和 `src/scenes/Hud.ts`。
- `.scene` root 使用 `<Scene name="...">`。
- Scene 脚本类必须继承 `Group`，并使用 `@scene()` 标记。
- `@part()` 绑定 `.scene` 中稳定 `id` 节点；`@prop()`、`@event()`、`@slot()` 暴露公开契约。
- `.scene` 中的事件属性如 `@clicked="handlePause"` 绑定到当前 Scene 脚本实例上的同名方法；不要把它写成全局函数或生成文件逻辑。
- 不要在 `.scene` 文件中添加 `script="..."`。
- 不要给 `@scene()` 添加 template path。
- 引用其他 Scene 时使用 `.scene` 路径，不要使用裸名称。
- 不要编辑生成的 Scene 文件，例如 `.pixifact/generated/**`、`src/generated/**`、`*.scene.generated.ts` 或 `scenes.generated.ts`。
- 使用 `<slot name="..."/>` 表示 slot outlet。
- Structured prop 使用 dot-path attributes，例如 `rectTransform.x="0"`；不要传 JSON string。
- 可编辑节点必须有稳定 `id`。
- 官方对象和属性见 `references/scene-objects.md`；最终以 `pixifact scene validate` 为准。

## 游戏代码

非 Scene 逻辑按项目现有 TypeScript 风格实现。优先使用 Pixifact 公开 import；只有 Pixifact 未覆盖的底层渲染或资产行为才直接使用 PixiJS v8。

## 完成条件

不要只编辑文件就结束。必须运行 validate、compile 和最小相关 build/dev 检查；如果失败，报告准确的失败命令和 diagnostic。
