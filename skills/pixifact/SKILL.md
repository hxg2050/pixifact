---
name: pixifact
description: 用于下游 Pixifact 游戏项目开发：编辑项目相对 .scene 文件（如 src/scenes/Hud.scene）、维护配对 Scene 脚本、读取 pixifact.project.json、运行 pixifact scene inspect/validate/compile-scenes，或编写 Pixifact UI、HUD、menu、轻量 Scene、游戏代码，以及识别可用 runtime 和 .scene primitive 白名单。
---

# Pixifact

## 用途

将此 skill 用于用户的下游 Pixifact 游戏项目。Pixifact 是基于 PixiJS v8 的 2D game UI、HUD、menu、轻量 Scene 和项目 Scene 资产 authoring 层。

当 workspace 包含 `pixifact.project.json`、项目相对 `.scene` 资产（如 `src/scenes/Hud.scene`）、生成的 Pixifact Scene 输出，或 `package.json` 依赖 `pixifact` / `pixifact-cli` 时，按 Pixifact 游戏项目处理。

不要把此 skill 当作 Pixifact 框架仓库维护手册。它不负责 npm 发布、Changesets、Trusted Publishing、Editor 内部实现、内置 Scene 源码维护、仓库架构决策或 Git 工作流。在 Pixifact 框架仓库本身工作时，优先遵守仓库 `AGENTS.md` 和相关源码文档；只有处理 sample project `.scene` 资产或下游游戏项目工作流时，才使用此 skill。

## Scene 工作流

处理 Scene、UI、HUD、menu、layout 或视觉资产任务时，优先编辑 `.scene` 源文件。

1. 读取 `package.json`、`pixifact.project.json` 和目标项目相对 `.scene` 文件。
2. 当结构重要时先 inspect Scene：
   ```bash
   bunx --no-install pixifact scene inspect --project-root . --scene src/scenes/MainMenu.scene
   ```
3. 直接编辑 `.scene`。
4. validate 每个被编辑的 Scene：
   ```bash
   bunx --no-install pixifact scene validate --project-root . --scene src/scenes/MainMenu.scene
   ```
   如果改动范围较大或影响不确定，validate 所有 compiler Scene：
   ```bash
   bunx --no-install pixifact scene validate --project-root . --all
   ```
5. validation 通过后 compile：
   ```bash
   bun run compile:scenes
   ```
   如果没有对应 script：
   ```bash
   bunx --no-install pixifact compile-scenes --project-root .
   ```
6. 运行最小相关项目检查，通常是：
   ```bash
   bun run build
   ```

如果项目已有 script，优先使用 `bun run compile:scenes`、`bun run build`、`bun run dev` 等项目命令。详细 `.scene` 工作流见 `references/compiler-scene-agent.md`。

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

- Scene 资产是同目录、同 basename 的文件对，例如 `src/scenes/Hud.scene` 和 `src/scenes/Hud.ts`。
- `.scene` 是 authored visual structure、hierarchy、layout、text、image、子 Scene instance、slot 和 event wiring 的 source of truth。
- 配对的 `.ts` 文件负责 behavior、runtime state update、public props/events/slots 和 `@part` 访问。
- `.scene` root 使用 `<Scene name="...">`，运行时 root 是对应 Scene 脚本类实例。
- Scene 脚本类必须继承 `Group`，并使用 `@scene()` 标记。
- `@part()` 绑定 `.scene` 中稳定 `id` 节点；`@prop()`、`@event()`、`@slot()` 是父 Scene 和 Editor Inspector 可见的公开契约。
- `.scene` 中的事件属性如 `@clicked="handlePause"` 绑定到当前 Scene 脚本实例上的同名方法；不要把它写成全局函数或生成文件逻辑。
- 不要在 `.scene` 文件中添加 `script="..."`。
- 不要给 `@scene()` 添加 template path。
- 引用其他 Scene 时使用 `.scene` 路径，不要使用裸名称。
- 不要编辑生成的 Scene 文件，例如 `.pixifact/generated/**`、`src/generated/**`、`*.scene.generated.ts` 或 `scenes.generated.ts`。
- 如果 validation 报告 diagnostics，修复 `.scene` 源文件后重新 validate。
- Compiler `.scene` 文件使用 `<Scene name="...">` root。
- Primitive `.scene` 标签以编译器白名单为准，当前是 `Container`、`Sprite`、`NineSliceSprite`、`TilingSprite`、`Text`、`BitmapText`、`HTMLText`、`Graphics`、`Rect`、`Image`、`NineImage`、`TileImage`、`GridContainer`、`HBoxContainer`、`ScrollContainer` 和 `VBoxContainer`。
- 只有 `Container` 接受直接 primitive children。子 Scene instance 只通过已声明 slot 接受 children。
- 使用 `<slot name="..."/>` 表示 slot outlet。
- 使用 `.scene` attribute 表达显示数据，例如 `Text text="..."`、`Sprite texture="assets/..."` 和 `Graphics shape="roundRect" fill="#ffffff"`。
- 可编辑节点必须有稳定的 `id`。

## 游戏代码

在 `src/` 中使用 TypeScript 编写 gameplay、state、input handling、animation，以及与 compiled Scene 的集成。优先使用 Pixifact 公开 import：

- `pixifact`
- `pixifact/runtime`
- `pixifact/compiler`
- `pixifact/compiler-node`

在写 gameplay 或 UI runtime 时，优先从 `pixifact/runtime` 里选现成节点和布局能力，不要自己重复造同类节点：

- 盒子与根节点：`Group`
- 通用布局容器：`Control`
- 轻量绘制节点：`Rect`
- 图片类节点：`Image`、`NineImage`、`TileImage`
- 栈与网格布局：`HBoxContainer`、`VBoxContainer`、`GridContainer`
- 滚动容器：`ScrollContainer`
- 其他通用能力：`frameLayout`、`stackLayout`、`viewport`

只有在 Pixifact 未覆盖的底层渲染或资产行为中，才直接使用 PixiJS v8。如果任务依赖 raw PixiJS v8 API，同时使用 PixiJS skill 或官方 PixiJS v8 文档。

## 完成条件

不要只编辑文件就结束。必须在 validation 和相关 build/dev 命令通过后结束；如果失败，报告准确的失败命令和 diagnostic。
