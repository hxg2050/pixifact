---
name: pixifact
description: 用于下游 Pixifact 游戏项目开发：编辑项目相对 .scene 文件（如 src/scenes/Hud.scene）、维护配对 Scene 脚本、读取 pixifact.project.json、运行 pixifact scene inspect/validate/compile-scenes，或编写 Pixifact UI、HUD、menu、轻量 Scene 和游戏代码。
---

# Pixifact

## 用途

将此 skill 用于用户的下游 Pixifact 游戏项目。Pixifact 是基于 PixiJS v8 的 2D game UI、HUD、menu、轻量 Scene 和项目 Scene 资产 authoring 层。

当 workspace 包含 `pixifact.project.json`、项目相对 `.scene` 资产（如 `src/scenes/Hud.scene`）、生成的 Pixifact Scene 输出，或 `package.json` 依赖 `pixifact` / `pixifact-cli` 时，按 Pixifact 游戏项目处理。

不要把此 skill 当作 Pixifact 框架仓库维护手册。它不负责 npm 发布、Changesets、Trusted Publishing、Editor 内部实现、内置 Scene 源码维护、仓库架构决策或 Git 工作流。在 Pixifact 框架仓库本身工作时，优先遵守仓库 `AGENTS.md` 和相关源码文档；只有处理 sample project `.scene` 资产或下游游戏项目工作流时，才使用此 skill。

## Scene 工作流

处理 Scene、UI、HUD、menu、layout 或视觉资产任务时，优先编辑 `.scene` 源文件。

1. 读取 `package.json`、`pixifact.project.json` 和目标项目相对 `.scene` 文件。
2. 先用 CLI 读取项目摘要：
   ```bash
   pixifact summary
   ```
3. 当结构重要时 inspect 目标 Scene：
   ```bash
   pixifact scene inspect --scene src/scenes/MainMenu.scene
   ```
4. 直接编辑 `.scene`。
5. validate 每个被编辑的 Scene：
   ```bash
   pixifact scene validate --scene src/scenes/MainMenu.scene
   ```
   如果改动范围较大或影响不确定，validate 所有 compiler Scene：
   ```bash
   pixifact scene validate --all
   ```
6. validation 通过后 compile：
   ```bash
   bun run compile:scenes
   ```
   如果没有对应 script：
   ```bash
   pixifact compile-scenes
   ```
7. 运行最小相关项目检查，通常是：
   ```bash
   bun run build
   ```

默认项目根目录是当前工作目录；不在项目根目录运行时再加 `--project-root <path>`。如果项目已有 script，优先使用 `bun run compile:scenes`、`bun run build`、`bun run dev` 等项目命令。详细 `.scene` 工作流见 `references/compiler-scene-agent.md`。

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
- 官方基础 `.scene` 标签是 `Container`、`HBoxContainer`、`VBoxContainer`、`GridContainer`、`ScrollContainer`、`Sprite`、`NineSliceSprite`、`TilingSprite`、`Text`、`BitmapText`、`HTMLText`、`Graphics`、`Rect`、`Image`、`NineImage` 和 `TileImage`。
- `Container`、布局容器和 `ScrollContainer` 可以接受 children。叶子节点如 `Text`、`Image`、`Rect` 不能接受 children。子 Scene instance 只通过已声明 slot 接受 children。
- 使用 `<slot name="..."/>` 表示 slot outlet。
- 使用 `.scene` attribute 表达显示数据，例如 `Text text="..."`、`Image texture="assets/..." fit="cover"` 和 `Rect fillColor="#ffffff"`。
- 可编辑节点必须有稳定的 `id`。

## 游戏代码

在 `src/` 中使用 TypeScript 编写 gameplay、state、input handling、animation，以及与 compiled Scene 的集成。优先使用 Pixifact 公开 import：

- `pixifact`
- `pixifact/runtime`
- `pixifact/compiler`
- `pixifact/compiler-node`

只有在 Pixifact 未覆盖的底层渲染或资产行为中，才直接使用 PixiJS v8。如果任务依赖 raw PixiJS v8 API，同时使用 PixiJS skill 或官方 PixiJS v8 文档。

## 完成条件

不要只编辑文件就结束。必须在 validation 和相关 build/dev 命令通过后结束；如果失败，报告准确的失败命令和 diagnostic。
