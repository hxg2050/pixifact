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
3. 新建或修改同名 `.ts` 脚本契约、`@part()`、`@prop()`、`@event()` 或 `@slot()` 时，先读 `references/scene-script-patterns.md`。
4. 读取项目摘要：
   ```bash
   pixifact summary
   ```
5. 需要结构上下文时 inspect 目标 Scene：
   ```bash
   pixifact scene inspect --scene src/scenes/MainMenu.scene
   ```
6. 直接编辑 `.scene`，必要时同步同名 `.ts` 脚本契约。
7. 校验被编辑的 Scene：
   ```bash
   pixifact scene validate --scene src/scenes/MainMenu.scene
   ```
   多个 Scene 可能受影响时：
   ```bash
   pixifact scene validate --all
   ```
8. 校验通过后编译：
   ```bash
   pixifact compile-scenes
   ```
9. 运行项目最小相关检查，通常是：
   ```bash
   bun run build
   ```

默认项目根是当前工作目录；不在项目根运行时再加 `--project-root <path>`。项目自己的 `bun run build`、`bun run dev` 等命令只作为后续检查或预览入口。

## 对象和脚本契约

官方 `.scene` 对象、通用属性、对象专属属性、children 规则、slot、event 和 structured prop 写法见 `references/scene-objects.md`。`.scene` 与同名 `.ts` 脚本的配对模板、`@part()` / `@prop()` / `@event()` / `@slot()` 模式和常见诊断修复见 `references/scene-script-patterns.md`。不要在 `SKILL.md` 里复制完整对象清单或模板库；如果不确定某个标签、属性或脚本契约是否可写，先读 reference，再以 `pixifact scene validate` 为准。

## 硬性规则

- `.scene` 是 authored visual structure、hierarchy、layout、text、image、子 Scene instance、slot 和 event wiring 的 source of truth。
- Scene 资产是同目录、同 basename 的文件对，例如 `src/scenes/Hud.scene` 和 `src/scenes/Hud.ts`。
- `.scene` root 使用 `<Scene name="...">`。
- Scene 脚本类必须继承 `Group`，并使用 `@scene()` 标记。
- `@part()` 绑定 `.scene` 中稳定 `id` 节点；`@prop()`、`@event()`、`@slot()` 暴露公开契约。
- `@prop()` 类型使用 `String` / `Number` / `Boolean` 或导出的 structured prop class；不要使用旧字符串类型。
- `.scene` 中的事件属性如 `@clicked="handlePause"` 绑定 action name；运行时连接 external actions 或当前 root 脚本同名方法。不要把它写成全局函数或生成文件逻辑。
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
