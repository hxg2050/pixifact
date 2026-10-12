---
name: pixifact
description: 用于下游 Pixifact 游戏项目：编辑项目相对 .scene 文件、维护同名 Scene 脚本契约、运行 validate / compile 并截取任意 Scene 的静态预览；读取 Editor 当前 Scene 和 selection、确认修改同步并截图；以及在 Vite Web 开发模式下通过 pixifact runtime 读取运行中游戏的 PixiJS 节点、业务状态和日志，发送标准输入并验证行为。适用于 UI、HUD、menu、轻量 Scene、Editor 协作、交互逻辑、视觉检查、运行时验证和诊断任务。
---

# Pixifact

用于下游 Pixifact 游戏项目。目标是直接编辑项目里的 `.scene` 源文件和同名 `.ts` 脚本，再用 Pixifact CLI 校验和编译。

## Scene 工作流

处理 Scene、UI、HUD、menu、layout 或视觉资产任务时，优先编辑项目相对 `.scene` 源文件。用户指向 Editor 当前 Scene 或选中节点时，先按下面的「Editor 协作工作流」确定目标。

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
8. 新建空 Scene 文件对时执行：
   ```bash
   pixifact scene create src/scenes/MainMenu.scene
   ```
   命令按路径 basename 创建同名 `.scene` 与 `.ts`；随后直接编辑 `.scene`，必要时同步脚本契约。
9. 校验被编辑的 Scene：
   ```bash
   pixifact scene validate --scene src/scenes/MainMenu.scene
   ```
   多个 Scene 可能受影响时：
   ```bash
   pixifact scene validate --all
   ```
10. 视觉任务默认在校验通过后直接截取指定 Scene，Editor 未启动时也可使用：
   ```bash
   pixifact scene screenshot --scene src/scenes/MainMenu.scene --output /tmp/main-menu.png
   ```
   命令从磁盘读取目标 `.scene`、配对脚本接口和项目资源，不需要启动 Editor 或游戏，也不切换已打开的 Editor Scene。查看 PNG 后继续调整 `.scene`，直到静态画面符合目标；此命令需要本机 Google Chrome，不执行游戏脚本。游戏运行状态用 `runtime screenshot` 验证。
11. 校验通过后编译：
   ```bash
   pixifact compile-scenes
   ```
12. 运行项目最小相关检查，通常是：
   ```bash
   bun run build
   ```
13. 改动影响微信或抖音目标时，读取项目对应 mode 的 env 文件，再运行该 mode 的校验与构建。例如微信 mode 为 `wechat`：
   ```bash
   pixifact validate --mode wechat
   pixifact build --mode wechat
   ```

默认项目根是当前工作目录；不在项目根运行时再加 `--project-root <path>`。项目自己的 `bun run build`、`bun run dev` 等命令只作为后续检查或预览入口。

## UI 最佳实践

- 九宫格 UI 素材推荐每张 PNG 对应一个 `.scene` / `.ts` 文件对，在 Scene 内集中设置 `NineImage` 的图片路径和四边切片参数；按钮、面板等调用方直接引用该 Scene，只设置位置和盒子尺寸。封装、引用和换图示例见 [NineImage](references/scene-objects.md#nineimage)。
- `HBoxContainer`、`VBoxContainer`、`GridContainer` 会接管直接子节点的 `x/y`；横排的 `y`、竖排的 `x` 也会被对齐结果覆盖。需要单独微调时，让一个明确尺寸的 `Group` 参与排列，再调整其内部节点。示例和占位尺寸规则见 [排列容器中的单独偏移](references/scene-hierarchy-patterns.md#排列容器中的单独偏移)。

## Editor 协作工作流

静态视觉检查沿用上面的 `scene screenshot` 流程。用户需要打开 Editor 浏览、选择或人工微调时，在项目根目录运行 `pixifact editor`；已运行时复用。用户指向已打开 Editor 的当前 Scene、选中节点或当前画面时：

1. 修改前读取只读上下文：
   ```bash
   pixifact editor context
   ```
   核对 `projectRoot`，用 `scene.path` 确定活动 Scene，读取 `scene.revision`、`scene.syncState`、`selection` 和 `openScenes`。`selection.kind="scene"` 表示 Scene 根；`kind="node"` 时用返回的 `locator` 和节点 `id` 定位源码，不凭名称猜目标。需要节点详情时使用 `pixifact node inspect --scene <scene.path> --node <locator>`；层级变化后重新获取 locator。
2. 检查目标文件的同步状态。活动 Scene 未同步时 `editor context` 会拒绝返回上下文；成功返回也不代表其他标签已同步，编辑其他已打开 Scene 前检查 `openScenes` 中对应路径的 `syncState`。`saving` 或 context 正在更新时等待后重读；`unsaved` 或 `conflict` 时先让用户保存草稿或解决冲突，再重新读取 context 和磁盘源文件；`error` 时结合 CLI 错误和 Editor 提示排查。保留用户未保存内容，不擅自覆盖或放弃草稿。没有活动 Editor 或 Scene 时，已知目标路径就直接走 Scene 工作流；任务依赖当前选择且目标不明确时，先请用户明确目标。
3. 按 Scene 工作流直接编辑目标 `.scene` 和必要的同名 `.ts`，运行 validate、compile 和项目最小相关检查。`editor context` 不提供修改入口。
4. 外部改动会自动刷新已同步的标签；有未保存修改的标签会保留草稿，保存时可能出现版本冲突。改完后再次运行 `pixifact editor context`，确认活动 `scene.path` 仍是目标且 `scene.syncState="synced"`；成功返回表示该 context 的 revision 与当前磁盘文件一致。若仍在更新，等待后重读；若用户已切换 Scene，不能据此宣称目标 Scene 的预览已确认。
5. 需要检查当前 Editor 画面时，确认目标 Scene 已同步且 `scene.previewState="ready"`，再截图并查看 PNG：
   ```bash
   pixifact editor screenshot --output /tmp/editor-scene.png
   ```
   核对截图返回的 Scene 路径和 revision，避免把切换后的其他 Scene 当成目标。截图使用 Scene 设计尺寸，不包含 Editor UI 或选择框，不受画布 zoom / pan 影响，也不执行项目脚本。检查指定 Scene 的磁盘版本时用 `scene screenshot --scene <path>`；检查游戏运行后的状态时用 `runtime screenshot`。

## 运行时验证工作流

任务影响 Vite Web 游戏行为、交互或运行时状态，或者需要诊断运行中游戏时，先完整阅读 `references/runtime-observation.md`，再按以下顺序操作：

1. 读取项目 `package.json` 和 Runtime 接入代码，使用项目已有开发命令启动游戏；不要猜启动命令。
2. 运行 `pixifact runtime list` 发现当前页面；多个页面时为后续命令显式传 `--runtime <runtime-id>`。
3. 操作前读取 `runtime state` 和 `runtime logs`，记住日志返回的 `latestSeq`。
4. 用 `runtime tree --output .pixifact/runtime/tree.json` 保存现场节点树；编译节点的 `source.scenePath` / `source.locator` 指向 `.scene`，子 Scene 实例的 `instanceSource` 指向父 Scene 中的放置位置。需要 bounds 或详细字段时再查询 `runtime node <uid>`。
5. 通过 renderer 坐标或键盘发送 `runtime input`；不要直接调用节点方法或修改运行时状态。
6. 操作后重新查询 `state`、`tree` 或 `node`，并用 `runtime logs --after <latestSeq>` 验证结果；涉及画面变化时在操作前后分别截图比较。

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
