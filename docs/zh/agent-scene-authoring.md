# Agent Scene Authoring

状态：活跃
权威范围：外部 Agent 直接编辑 Pixifact `.scene` 的规则、契约和校验边界
上游文档：[./index.md](./index.md)、[../../README.md](../../README.md)
下游文档：[./layout.md](./layout.md)、[./scene-objects.md](./scene-objects.md)
更新规则：修改 `.scene` authoring 模型、CLI 校验边界、Scene 脚本契约或 Editor context 行为时更新

[English](../en/agent-scene-authoring.md)

Pixifact 的最终 authoring 模型是源码级 Agent 编辑。目标用户流是 Codex、Claude Code 这类外部 coding agent 通过 Pixifact CLI 操作 compiler Scene。Pixifact 不需要把内置 AI 聊天或内置模型服务作为这条路径的核心。

Pixifact 是聚焦的 Scene 能力，不是完整 AI IDE 或项目管理器。它提供 `.scene` 源文件的 inspect、edit、validate、compile、preview 和 diagnose 支持。Agent 编排、Git 分支、commit、revert、PR、CI 和任务管理交给外部工具。

## 决策

外部 Agent 直接编辑 `.scene` 源文件。Pixifact 负责解析、校验和编译这些文件。生成的 TypeScript 始终视为构建产物。

默认流程是直接编辑源文件并校验：

```txt
Claude Code / Codex inspect .scene
Claude Code / Codex edit .scene
Pixifact validate edited file
Pixifact compile generated TypeScript
Agent repair .scene if validation or compilation fails
Editor optionally exposes read-only context and preview state
```

这替代了面向 Agent 的 `SceneCommand[]` 编辑协议。Editor 内部 undo 可以继续使用 compiler-scene commands，但外部 Agent 工作流不能依赖 command payload。

## 原因

`.scene` 是语义 source of truth。它直接描述 Scene 层级、组件实例、props、slots、bindings 和 asset references。相比生成的 PixiJS TypeScript，它包含更少实现噪音，更适合 coding agent 理解。

同一个源文件可以被人、外部 Agent、Editor 和 compiler 读取。Pixifact 只有一个 authoring 模型：

```txt
.scene = source
generated.ts = compiled output
Pixifact = validation and compile boundary
```

compiler Scene asset 是同目录同 basename 的一对文件。例如 `src/scenes/Hud.scene` 负责视觉结构、层级、布局、文字、图片、子 Scene 实例、slot 和事件绑定；`src/scenes/Hud.ts` 负责行为、运行时状态更新、公开 props/events/slots 和 `@part` 访问。不要在 `.scene` 里添加 `script="..."`，也不要给 `@scene()` 添加模板路径。

`@scene()` 类不能声明自定义构造参数。Pixifact 把构造时的第一个对象作为 initial Props，并在创建节点前合并默认值；`onMounted()` 在节点和 Binding 都准备好后运行。关卡数据、服务、Ticker 和回调等非 Prop 依赖仍通过显式方法传入。

Agent 不应该编辑 `.pixifact/generated` 或生成 TypeScript。生成代码包含 renderer 细节、资源加载细节、临时变量和 compiler 结构，不代表用户意图。

最终 UI 适配使用 `<Group>` 的明确盒子尺寸和 runtime `Control` frame layout，加上 runtime `HBoxContainer` / `VBoxContainer` / `GridContainer` / `ScrollContainer` 节点。`Container` 保留 Pixi 原生的 bounds / scale 尺寸语义。不要使用 `FlexLayout` / `FlexItem`，它们不再是官方内置能力。布局规则见 [Layout](./layout.md)，`.scene` 可写对象和属性见 [Scene Objects](./scene-objects.md)。

## 默认直接编辑流程

直接编辑源文件是默认路径，因为 Codex 和 Claude Code 已经擅长读写文件。Pixifact 的职责不是重复这些工具，而是拥有领域校验边界。

Agent 应遵循这个循环；AI-facing 文档优先只暴露这条主路径，其他命令作为辅助入口：

1. 运行 `summary` 理解项目。
2. 运行 `scene inspect` 查看目标 Scene。
3. 编辑项目相对 `.scene` 路径，例如 `src/scenes/Hud.scene`，以及用户要求的相关源资源或脚本。
4. 对每个编辑过的 compiler Scene 运行 `scene validate`；广泛修改后运行 `scene validate --all`。
5. 运行 `compile-scenes`。
6. 如果 validation 或 compilation 报 diagnostics，修复 `.scene` 源文件并重跑失败命令。
7. 运行最小相关项目 build 或 test。
8. 如果 Editor 正在运行且用户指向了具体对象，可运行 `editor context` 获取当前 Scene 和 selection。

示例命令应在下游 Pixifact 游戏项目根目录运行，使用项目相对 scene path；不在项目根目录运行时再加 `--project-root <path>`。

`scene validate` 检查 parse errors、prop names、prop value types、asset references 和 public Scene instance contracts。已知目标用 `--scene`，多个 Scene 可能变化时用 `--all`。直接编辑 `.scene` 后必须执行这个安全检查。Git 状态、commit、rollback、branch isolation 和 merge strategy 不属于 Pixifact；外部 Agent 和开发工具直接管理它们。

Pixifact 不决定何时 commit 或开 PR。它的责任是让 `.scene` 编辑可诊断、可编译；Git diff、commit、revert、branch isolation、PR review、CI 和任务管理都在 Pixifact 能力边界之外。

## Scene 脚本契约

Scene 脚本暴露父 `.scene`、Compiler 和 Editor Inspector 使用的公开契约。Primitive Prop 的类型从 TypeScript property type 推断，默认值写在 `@prop` 上：

```ts
@prop({ default: 'Button' })
declare label: string;

@prop({ default: 0 })
declare count: number;

@prop({ default: false })
declare disabled: boolean;
```

`@prop` 只能装饰没有 initializer 的 `declare` property。不要写 `type` option、field initializer、accessor、getter、setter 或 method：

```ts
@prop({ type: String, default: 'Button' })
accessor label = 'Button';
```

可复用的样式分支用同文件静态 `defineVariants()` 声明。每个 case 必须包含相同字段和字段类型：

```ts
const buttonTones = defineVariants({
    primary: { background: '#24456f', text: '#fff3cf' },
    danger: { background: '#713044', text: '#fff0f4' },
});

@prop({ default: 'primary', variants: buttonTones })
declare tone: keyof typeof buttonTones;
```

`.scene` 使用完整属性值 Binding，不支持表达式或字符串插值：

```xml
<Rect id="background" fillColor="{tone.background}" />
<Text id="labelText" text="{label}" fill="{tone.text}" />
```

运行时构造 `new Button({ label: '背包', tone: 'danger' })` 时，initial Props 在节点挂载前生效。后续 `button.label = '仓库'` 只更新依赖 `{label}` 的节点，不重建 Scene，也不调用用户 setter。

结构化 Prop 使用同文件导出的 class 作为 TypeScript 类型。这个 class 必须可以无参构造，并且 public fields 必须有 primitive initializers：

```ts
export class RectTransform {
    x = 0;
    y = 0;
    width = 188;
    height = 48;
}

@scene()
export class Button extends Group {
    @prop({})
    declare rectTransform: RectTransform;
}
```

Primitive Prop defaults 写在 `@prop` 上。Structured Prop defaults 来自 struct class 的 field initializers；不要给 structured Prop 写 `type` 或 `default` option。

父 Scene 用 dot-path attributes 设置结构化字段：

```xml
<Button
  id="restartButton"
  scene="./Button.scene"
  text="RESTART"
  rectTransform.x="150"
  rectTransform.y="692"
  rectTransform.width="420"
  rectTransform.height="92"
/>
```

compiler 会创建真实 struct instance：

```ts
const restartButtonRectTransform = new RectTransform();
restartButtonRectTransform.x = 150;
restartButtonRectTransform.y = 692;
restartButtonRectTransform.width = 420;
restartButtonRectTransform.height = 92;
const restartButton = new Button({ rectTransform: restartButtonRectTransform });
```

它不会把 plain object 或 JSON string 传给用户 setter。`.scene` 中省略的字段保留 class initializer 的值。

### 契约继承

Scene script contracts 从 decorators 提取，然后通过 TypeScript inheritance 组合。子 Scene 继承父类公开 `@prop`、`@event` 和 `@slot` contracts；同名子 decorators 覆盖父 contracts。`@part` 保持局部于 Scene script template，不作为继承的必需 template shape。

继承解析基于源码，不是裸 class-name 猜测：

- 支持 same-file parent classes。
- 支持 relative named imports，例如 `import { BasePanel } from './BasePanel'`。
- built-in Scenes 使用与项目 Scenes 相同的 decorator extraction 和 import-based inheritance 路径。
- barrel re-exports、path aliases、namespace imports 和 default imports 不属于 compiler Scene contract model。

继承来的 structured props 保留声明来源。如果 `BasePanel.ts` 导出 `RectTransform`，且 `Button extends BasePanel`，那么 `<Button rectTransform.x="12" />` 生成代码会从 `BasePanel.ts` 导入 `RectTransform`，不是从 `Button.ts` 导入。

Built-in Scene contracts 必须来自 decorated TypeScript source。不要添加手写 built-in prop tables；要修改 built-in Scene class 上的 `@prop`、`@event` 或 `@slot` decorators。

## 校验边界

Pixifact 把编辑后的 `.scene` source 视为不可信，直到它通过 validation 和 compile checks：

1. Parse edited `.scene` content。
2. 用 canonical formatter normalize。
3. Validate compiler scene syntax and AST invariants。
4. Validate prop names and prop value types。
5. Validate asset references against project assets。
6. Validate owner Scene Bindings against its paired script contract。
7. Validate scene instance props against referenced scene contract。
8. Recompile generated TypeScript。
9. Editor 刷新 authoring preview。

Validation errors 应足够明确，便于 Agent repair loop。错误应指出 node、prop、expected type、actual value，并尽量给出短 correction hint。

## 硬规则

- `.scene` files 是 compiler scenes 唯一 Agent-editable source。
- `.scene` paths 是项目相对路径，例如 `src/scenes/Hud.scene`。
- Scene scripts 按同目录同 basename 配对。
- `@scene()` 类不能声明自定义构造参数；构造时第一个对象保留给 initial Props。
- 不要在 `.scene` 中添加 `script="..."`。
- 引用其他 Scenes 时使用 `.scene` paths，不要使用 bare names。
- `.pixifact/generated` 永远不是 Agent editing target。
- Scene 脚本的 decorator、event、slot 和异步准备 API 从 `pixifact/scene` 导入；`pixifact/compiler` 只用于解析、校验和生成 API。
- 每个 editable node 必须有 stable ID。
- 官方基础对象和属性以 [Scene Objects](./scene-objects.md) 为准。
- `@prop()` 只能装饰无 initializer 的 `declare` property，类型由 TypeScript 声明推断。
- `.scene` Binding 只写完整值 `{prop}` 或 `{variant.field}`，不写表达式、插值、watch 或双向绑定。
- Structured scene props 必须使用 dot-path `.scene` attributes，不要用 JSON strings。
- Public Scene contracts 通过 same-file parents 或 relative named imports 继承。
- Built-in Scene contracts 来自 decorator extraction，不来自手写 prop tables。
- 直接编辑后必须运行 `scene validate --scene <path>` 或 `scene validate --all`。
- Pixifact 必须对 generated output 和 editor refreshes 使用 canonical formatter。
- Pixifact 必须拒绝 parse、validation、contract checks 或 asset checks 失败的 scene sources。
- CLI 和 editor save flows 必须使用同一套 parse 和 validate rules。
- Agents 必须直接编辑 `.scene` files；Pixifact 拥有 validation 和 generated output。

## 非目标

- 不维护第二套基于 `SceneCommand[]` 的 compiler-scene Agent editing protocol。
- 不暴露 generated TypeScript 作为 Agent-editable representation。
- 不让 editor live tools 绕过 `.scene` parsing 和 validation。
- 不围绕 integrated AI chat panel 或 built-in model service 构建这个 compiler-scene workflow。
- 不把 Pixifact 做成 Git manager、AI task orchestrator、CI runner、PR tool 或 long-term project tracker。

## Agent Context

外部 Agent 应接收精简过的 authoring context，而不是整份项目噪音：

- 目标 `.scene` source。
- 规范化后的 scene outline，包括 node IDs 和 node types。
- 可编辑 props 及其期望类型。
- structured prop fields 及其 primitive field types。
- 可用图片、音频和其他 asset references。
- 被引用 Scene 的 contracts 和 public props。
- 任务有范围时的当前 selection 或目标 subtree。
- 当前 scene revision。
- generated files 是只读构建产物的规则。

大 Scene 应支持 scoped context。比如一个 Agent 任务可以只包含选中 subtree、精简 ancestor path 和相关 contracts。

## Agent Prompt

让 Codex 或 Claude Code 编辑 compiler scene 时，可以使用这个 prompt：

```txt
You are editing a Pixifact project.

Pixifact Scene asset rules:
- A Scene asset is a pair of colocated files with the same basename.
- The .scene file owns visual structure, hierarchy, layout, text, images, child Scene instances, slots, and event wiring.
- The .ts file owns behavior, runtime state updates, public props/events/slots, and @part access.
- Do not add script="..." to .scene files.
- Do not add template paths to @scene().
- Pairing is by same directory + same basename.
- The unique Scene id is the project-relative .scene path.
- Scene names and class names are local, not globally unique.
- Reference other Scenes with .scene paths, never bare names.
- Use the Pixifact Scene Objects reference for official base object tags and props.
- Do not edit .pixifact/generated.
- Current Scene: <scene-path>
- After editing, run:
  pixifact scene validate --scene <scene-path>
- If multiple scenes changed, run:
  pixifact scene validate --all
- Then run:
  pixifact compile-scenes
- Finally run the smallest relevant build or test.
```

## Diff Model

Pixifact 应展示 semantic diff，而不只是 raw text diff。例如：

```txt
Button.background.texture changed from "assets/old.png" to "assets/btn.png"
Button.label.text changed from "Start" to "Play"
Root.children inserted Image#icon at index 0
Panel.padding changed from 12 to 16
```

Text diff 仍可作为辅助视图，但审批应优先基于 semantic scene diff。

## CLI Direction

Compiler scene Agent 工作流应收敛到这些命令：

```bash
pixifact summary
pixifact scene inspect --scene src/scenes/Button.scene
pixifact scene validate --scene src/scenes/Button.scene
pixifact compile-scenes
```

如果多个 Scene 可能变化，把单文件校验换成：

```bash
pixifact scene validate --all
```

默认项目根目录是当前工作目录；不在项目根目录运行时再加 `--project-root <path>`。`node inspect` 只在已有 locator 时作为辅助入口使用。file mode 不提供 `scene get`，查看 Scene 使用 `scene inspect`。旧 `live ...` 命令已经删除。

Live mutation commands 已从外部 CLI surface 移除。对 Agent 暴露的修改路径是直接编辑 `.scene` source，然后执行 validation。

## Editor Context 方向

Editor 可以通过暴露当前 project root、打开的 scene path、selection、preview context、最近一次外部 refresh 或 validation result，辅助外部 Agent 使用直接 `.scene` 工作流。它不是 AI 工作的计划或编排入口。

`pixifact editor context` 是可选的只读 context source，返回当前项目、打开的 Scene、revision、同步状态和 selection。它不返回 mutation action，也不是隐藏的 apply channel。旧 `live ...` 命令和固定端口 bridge 已删除。

## Editor Direction

Editor edits 和外部 direct edits 应收敛到同一套 compiler scene validation pipeline。Inspector 编辑、asset drop 和 direct agent edit 来源不同，但都应该产出通过校验的 `.scene` source changes。

Editor 打开项目内 generated files 时应明确呈现为 read-only，并引导用户编辑源 `.scene` 文件。

Editor 应改进 preview refresh、validation feedback 和 externally edited `.scene` files 的 diagnostics，而不是在 Editor 内重复 Git workflow 或 AI orchestration。

## Tradeoffs

这个模型能提升 Agent 理解能力，也能简化产品心智，但会把更多责任放到 Pixifact validation 上：

- Pixifact 必须提供明确的 parser 和 validator errors。
- Pixifact 必须 canonicalize formatting，避免 Agent diff 产生噪音。
- Pixifact 必须能从前后 AST 推断 semantic changes。
- Pixifact 必须为大 Scene 支持 scoped context。

这些成本是可以接受的，因为它们让最终 authoring model 保持简单，并让 `.scene` 成为人、Agent、Editor 和 compiler 共享的接口。

## Migration Notes

基于 `SceneCommand[]` 的旧 command-payload Agent flows 不再从 CLI 暴露。Compiler scene edits 应使用直接 `.scene` source changes，然后运行 `scene validate --scene <path>` 或 `scene validate --all`。

旧 `live summary`、`live scene get` 和 `live node inspect` 已删除，不保留兼容入口。
