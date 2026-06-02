# Pixifact Scene Agent 工作流

在 Pixifact 游戏项目中编辑 `.scene` 文件时使用此 reference。

## 默认工作流

`.scene` 文件是 authored source。生成的 TypeScript 是 build output。

```bash
bunx --no-install pixifact scene inspect --project-root . --scene src/scenes/MainMenu.scene
bunx --no-install pixifact scene validate --project-root . --scene src/scenes/MainMenu.scene
bunx --no-install pixifact scene validate --project-root . --all
bun run compile:scenes
```

已知目标 Scene 时使用 `--scene`；改动范围较大或不确定影响哪些 Scene 时使用 `--all`。如果 validation 或 compilation 失败，修复 `.scene` 源文件并重新运行失败命令。项目提供 package script 时优先使用；如果没有 compile script，运行 `bunx --no-install pixifact compile-scenes --project-root .`。

compile 后，运行最小相关项目检查：

```bash
bun run build
```

需要在开发中做视觉预览时：

```bash
bun run dev
```

## 硬性规则

- 编辑项目相对 `.scene` 路径（如 `src/scenes/Hud.scene`）作为 source of truth。
- Scene 资产按同目录、同 basename 配对，例如 `src/scenes/Hud.scene` 和 `src/scenes/Hud.ts`。
- 不要在 `.scene` 文件中添加 `script="..."`。
- 不要给 `@scene()` 添加 template path。
- 引用其他 Scene 时使用 `.scene` 路径，不要使用裸名称。
- 不要编辑 `.pixifact/generated/*.scene.generated.ts` 或 `.pixifact/generated/scenes.generated.ts`。
- 不要编辑 `src/generated/*.scene.generated.ts` 或 `src/generated/scenes.generated.ts`。
- 目标明确的编辑后运行 `scene validate --scene <path>`；范围较大的编辑后运行 `scene validate --all`。
- validation 通过后运行 `compile-scenes`。
- 如果 validation 报告 diagnostics，修复 `.scene` 源文件并重新 validate。
- 除非用户明确要求 inspect generated output，否则把生成的 TypeScript 视为只读 build output。

## Compiler Scene 语法

- `.scene` 文件使用 `<Scene name="...">` root。
- Primitive 标签是 `Container`、`Sprite`、`NineSliceSprite`、`TilingSprite`、`Text`、`BitmapText`、`HTMLText` 和 `Graphics`。
- 只有 `Container` 接受直接 primitive children。
- 子 Scene instance 使用带 `scene="relative-or-project.scene"` 的自定义标签，并且只通过已声明 slot 接受 children。
- Slot outlet 写作 `<slot name="..."/>`。
- 显示 props 写在 XML attributes 上，例如 `Text text="..."`、`Sprite texture="assets/..."` 和 `Graphics shape="roundRect" fill="#ffffff"`。
- Structured Scene props 使用 dot-path attributes，例如 `rectTransform.x="0"`；不要传 JSON string。

## Editor Context

如果 Pixifact editor 正在运行并暴露 live context，只把它作为 read-only context 使用，用于读取 opened scene、selected node、dirty state、revision state 和最近 validation result。不要把 editor live context 当作 mutation path。
