---
name: pixifact
description: 用于下游 Pixifact 游戏项目：编辑项目相对 .scene 文件、维护同名 Scene 脚本契约并运行 validate / compile；以及在 Vite Web 开发模式下通过 pixifact runtime 读取运行中游戏的 PixiJS 节点、业务状态和日志，发送标准输入并验证行为。适用于 UI、HUD、menu、轻量 Scene、交互逻辑、运行时验证和诊断任务。
---

# Pixifact

用于下游 Pixifact 游戏项目。目标是直接编辑项目里的 `.scene` 源文件和同名 `.ts` 脚本，再用 Pixifact CLI 校验和编译。

## Scene 工作流

处理 Scene、UI、HUD、menu、layout 或视觉资产任务时，优先编辑项目相对 `.scene` 源文件。

1. 读取 `package.json`、`pixifact.project.json` 和目标 `.scene` / `.ts` 文件。
2. 开始任何非纯查阅的 Scene 改动前，按 `references/scene-authoring-decisions.md` 做短决策；新建或大改 Scene 时先读全文。
3. 新建 Scene、添加节点、修改布局或不确定对象属性时，先读 `references/scene-objects.md`。
4. 涉及层级结构重组、复杂列表、overlay、slot content 或子 Scene 拆分时，先读 `references/scene-hierarchy-patterns.md`。
5. 新建或修改同名 `.ts` 脚本契约、`@part()`、`@prop()`、`@event()` 或 `@slot()` 时，先读 `references/scene-script-patterns.md`。
6. 读取项目摘要：
   ```bash
   pixifact summary
   ```
7. 需要结构上下文时 inspect 目标 Scene：
   ```bash
   pixifact scene inspect --scene src/scenes/MainMenu.scene
   ```
8. 直接编辑 `.scene`，必要时同步同名 `.ts` 脚本契约。
9. 校验被编辑的 Scene：
   ```bash
   pixifact scene validate --scene src/scenes/MainMenu.scene
   ```
   多个 Scene 可能受影响时：
   ```bash
   pixifact scene validate --all
   ```
10. 校验通过后编译：
   ```bash
   pixifact compile-scenes
   ```
11. 运行项目最小相关检查，通常是：
   ```bash
   bun run build
   ```
12. 项目声明 `targets.wechat` 且改动影响微信目标时，再运行：
   ```bash
   pixifact validate --target wechat
   pixifact build --target wechat
   ```

默认项目根是当前工作目录；不在项目根运行时再加 `--project-root <path>`。项目自己的 `bun run build`、`bun run dev` 等命令只作为后续检查或预览入口。

## 运行时验证工作流

任务影响 Vite Web 游戏行为、交互或运行时状态，或者需要诊断运行中游戏时，先完整阅读 `references/runtime-observation.md`，再按以下顺序操作：

1. 读取项目 `package.json` 和 Runtime 接入代码，使用项目已有开发命令启动游戏；不要猜启动命令。
2. 运行 `pixifact runtime list` 发现当前页面；多个页面时为后续命令显式传 `--runtime <runtime-id>`。
3. 操作前读取 `runtime state` 和 `runtime logs`，记住日志返回的 `latestSeq`。
4. 用 `runtime tree --output .pixifact/runtime/tree.json` 保存现场节点树，在 JSON 文件中搜索当前 PixiJS `uid`；需要 bounds 或详细字段时再查询 `runtime node <uid>`。
5. 通过 renderer 坐标或键盘发送 `runtime input`；不要直接调用节点方法或修改运行时状态。
6. 操作后重新查询 `state`、`tree` 或 `node`，并用 `runtime logs --after <latestSeq>` 验证结果。

不要缓存 `runtime-id` 或 PixiJS `uid`。输入命令返回 `dispatched: true` 只表示事件已分发，不代表行为成功。Runtime 信息足够回答问题时不依赖浏览器工具；需要判断像素、构图或动画观感时仍使用项目已有视觉检查方式。

## 对象和脚本契约

动手前判断见 `references/scene-authoring-decisions.md`。官方 `.scene` 对象、通用属性、对象专属属性、children 规则、slot、event 和 structured prop 写法见 `references/scene-objects.md`。层级结构组织、root 区块、layout container、scroll、overlay 和 inspect 复核见 `references/scene-hierarchy-patterns.md`。`.scene` 与同名 `.ts` 脚本的配对模板、`@part()` / `@prop()` / `@event()` / `@slot()` 模式和常见诊断修复见 `references/scene-script-patterns.md`。运行中 Vite Web 游戏的 Runtime 接入、查询、输入和验证边界见 `references/runtime-observation.md`。不要在 `SKILL.md` 里复制完整对象清单或模板库；如果不确定某个标签、属性、层级或脚本契约是否可写，先读 reference，再以 `pixifact scene validate` 为准。

## 硬性规则

- `.scene` 是 authored visual structure、hierarchy、layout、text、image、子 Scene instance、slot 和 event wiring 的 source of truth。
- Scene 资产是同目录、同 basename 的文件对，例如 `src/scenes/Hud.scene` 和 `src/scenes/Hud.ts`。
- `.scene` root 使用 `<Scene name="...">`。
- `<Group>` 用于有明确宽高或 frame layout 的普通盒子容器；`Container` 保持 Pixi 原生 bounds / scale 尺寸语义。
- Scene 脚本类必须继承 `Group`，并使用 `@scene()` 标记。
- Scene decorator、event、slot 和异步 Scene 准备 API 从 `pixifact/scene` 导入，不要从 `pixifact/compiler` 导入运行时 API。
- Scene 脚本类不能声明自定义构造参数；构造时第一个对象保留给 initial Props，其他运行依赖通过显式方法传入。
- `@part()` 绑定 `.scene` 中稳定 `id` 节点；`@prop()`、`@event()`、`@slot()` 暴露公开契约。
- `@prop()` 只能装饰无 initializer 的 `declare` property，类型由 TypeScript 声明推断；不要写 setter、accessor 或 `type` option。
- `.scene` 只使用完整值 `{prop}` / `{variant.field}` Binding，不写表达式、插值、watch 或双向绑定。
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

不要只编辑文件就结束。Scene 改动必须运行 validate、compile 和最小相关 build/dev 检查。已接入 Runtime 且任务影响运行时行为时，必须查询操作前后状态或节点，并检查增量日志；如果失败，报告准确的失败命令和 diagnostic。
