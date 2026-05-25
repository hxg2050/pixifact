# Scene Compiler Handoff

本文用于新会话快速接续 Pixifact Compiler 方向。完整背景见 `docs/SCENE_COMPILER_NOTES.md`。

Agent authoring 的最新结论见 `docs/AI_SCENE_AUTHORING.md`。本文中 `SceneCommand` 作为 compiler scene 修改入口的描述是历史阶段结论，不再作为最终方向。

## 核心结论

Pixifact 后续定位应从 runtime framework 收敛为 PixiJS Scene compiler / authoring toolchain。

```txt
.scene proposal -> parse -> normalize -> validate -> diff -> apply -> compiler -> PixiJS TypeScript
```

历史讨论曾考虑让 `.scene template -> typed Scene AST -> SceneCommand -> compiler -> PixiJS TypeScript` 成为 agent 修改链路。最新方向不再让 compiler scene agent workflows 依赖 `SceneCommand[]`。

心智类比：

```txt
Vue / React template or JSX -> .scene
component class / setup logic -> Scene Script
<Button /> -> Scene Instance
props -> props
events / callbacks -> events
children / named slots -> slots
```

Pixifact 不再定义自己的基础显示模型。基础显示能力直接来自 PixiJS：

```txt
Container / Sprite / Text / Graphics / Mesh / NineSliceSprite / TilingSprite / DOMContainer / ...
```

Pixifact 自己只保留：

```txt
.scene 文件
Scene Script 绑定
public contract
Scene Instance
slot
Inspector schema
proposal check / diff / apply
compiler output
```

`input`、`Button`、`ProgressBar`、`Panel` 等都应是 `.scene + script`，不是 Pixifact 内置 runtime component。

## .scene 方向

`.scene` 倾向使用受限 XML / Vue-like template，不做任意 XML。

允许：

- PixiJS 对象标签，例如 `Container`、`Sprite`、`Text`、`Graphics`。
- Scene Instance 标签，例如 `<Button scene="scenes/Button.scene" />`。
- Vue 风格 slot 出口：`<slot />`、`<slot name="icon" />`。
- Vue 风格事件：`@click="startGame"`。

禁止或暂缓：

- DTD / namespace / CDATA / processing instruction。
- 任意文本节点。
- unknown tag / unknown attribute。
- XML entity 扩展。
- 内联 JS 和模板业务表达式。

模板中不写：

```xml
<Text text="{score > 10 ? 'Win' : 'Lose'}" />
```

状态和行为放到 Scene Script：

```ts
hud.score = value;
```

## Scene Script 强制绑定

后续规则收敛为：每个 `.scene` 必须绑定一个 TypeScript 脚本。脚本继承 PixiJS `Container`，是这个 Scene 的公开 API 权威来源。

绑定采用 `.scene` 单向声明，脚本用 `@scene()` 标记自己是 Scene 类：

```xml
<Scene name="Button" script="src/scenes/Button.ts" width="180" height="52">
</Scene>
```

```ts
import { Container } from 'pixi.js';
import { scene } from 'pixifact/compiler';

@scene()
export class Button extends Container {
  onMounted() {}
}
```

约定：

- `.scene` 的 `script` 使用项目根相对路径，例如 `src/scenes/Button.ts`。
- `.scene` 不保存 `class`；类名从脚本中被 `@scene()` 装饰的导出类推导。
- 脚本中的 `@scene()` 不接收路径参数，避免脚本和 `.scene` 维护两份绑定关系。
- `.scene` 的 `name` 必须等于被 `@scene()` 装饰的导出类名；不一致时 compiler 报错。
- 新建 `.scene` 时编辑器应自动生成配套脚本。
- 打开或编译无脚本 `.scene` 时应提示迁移或直接失败。

## Public Contract 来源

`props / events / slots / parts` 不要求用户同时改 `.scene` 和脚本。脚本装饰器是单一权威源，`.scene` 只保存视觉模板和 `script` 绑定。

```txt
Button.scene script="src/scenes/Button.ts" -> Button.ts decorators -> virtual contract
绑定来源                                  权威来源              给 editor / AI / Scene Instance 读取
```

脚本示例：

```ts
export class Button extends Container {
  set label(value: string) {}
  readonly click = createEvent();
}
```

外部只使用脚本公开 API，不依赖内部节点。

当前更推荐的 public contract 来源是 TS 装饰器，而不是手写在 `.scene` 中：

```ts
import { Container, Text } from 'pixi.js';
import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

@scene()
export class Button extends Container {
  @part()
  declare protected labelText: Text;

  @prop({ type: 'string', default: 'Button' })
  set label(value: string) {
    this.labelText.text = value;
  }

  onMounted() {
    this.eventMode = 'static';
    this.on('pointertap', () => {
      this.click.emit();
    });
  }

  @event()
  readonly click = createEvent();

  @slot()
  declare readonly icon: Container;
}
```

`@scene` 当前已具备普通 TS 运行时能力：它会在用户 constructor 执行后挂载已注册的 `.scene`，绑定 `@part` 和 `@slot`，应用 `@prop` 默认值，然后调用 `onMounted()`。因此 constructor 中不要访问 `@part`；需要访问内部节点的初始化逻辑放在 `onMounted()`。

工具链静态提取装饰器得到 virtual contract。Editor / AI / Inspector 读取这个派生结果，不直接执行用户代码，也不把 Interface 写回 `.scene`。

约束：

- 只支持字面量参数。
- 不支持动态表达式，例如 `@prop(makeSchema())`。
- 装饰器是作者体验；派生出的 virtual contract 是工具链契约。
- 保存/编译不会写入 Interface。
- Editor 中 Public Contract 默认只读显示；不作为日常手写入口。

## Scene Instance

Scene Instance 是在一个 `.scene` 里引用另一个 `.scene`，并把它当成独立对象使用。

```xml
<Button id="startButton" scene="scenes/Button.scene" x="390" y="300" label="Start" @click="startGame">
  <Sprite slot="icon" id="playIcon" texture="assets/icons/play.png" />
</Button>
```

它不是复制内部节点：

```txt
startButtonBg
startButtonLabel
hitArea
```

而是整体：

```txt
startButton : Button.scene
```

父 Scene 只能改 instance 的 props / events / slots，不能直接改被引用 Scene 的内部结构。

## Slots

Vue 风格：

```xml
<slot />
<slot name="icon" />
```

父 Scene 传入：

```xml
<Sprite slot="icon" id="playIcon" texture="assets/icons/play.png" />
```

原则：

```txt
parts = 脚本私有访问内部节点
props = 外部可设置属性
slots = 外部可插入内容的公开挂载点
```

slot 内容属于父 Scene；slot host 的位置和样式属于被引用的子 Scene。

## Editor 规则

编辑源 Scene 时展开内部结构：

```txt
ButtonRoot
  background
  label
  iconHost [slot: icon]
```

在父 Scene 使用 Scene Instance 时默认不展开内部结构：

```txt
MainMenu
  startButton : Button.scene
```

如果有 slots，只展开公开 slot 和 slot 内容：

```txt
settingsPanel : Panel.scene
  slot: default
    volumeLabel : Text
  slot: footer
    okButton : Button.scene
```

Inspector：

- 选中 Scene Instance：显示 public props / events / slots + instance transform。
- 选中普通 PixiJS 对象：显示 PixiJS-facing properties。
- 选中 slot：显示 slot 名称、当前内容、可投放类型。

点击实例内部装饰时选中 instance；点击 slot 内容时选中 slot 内容。双击 Scene Instance 打开源 `.scene`。

## 已做最小验证

已有 compiler spike，提交包括：

```txt
5943839 feat: add scene compiler spike
a596cc6 feat: use vue style slot syntax
74d6381 feat: extract scene script interface
```

新增模块：

```txt
packages/pixifact/src/compiler/
```

当前能力：

- `parseSceneTemplate(source)`：解析受限 XML 到 typed Scene AST。
- `compileSceneTemplateToTs(template)`：生成最小 PixiJS TS mount function，可注册到 runtime scene registry。
- `pixifact/compiler-node` 提供 `compileScenes(options)`：扫描项目 `scenes/*.scene`，从绑定脚本提取 virtual contract，生成 `.pixifact/generated/*.scene.generated.ts` 与 registry 入口。
- Pixifact CLI 提供 `compile-scenes` 命令，内部调用 `compileScenes({ projectRoot })`。
- `extractSceneScriptInterface(source, fileName, { scene })`：静态提取 `@scene/@prop/@event/@slot/@part`。
- `emitSceneScriptInterfaceDescriptor(source, fileName, { scene })`：输出稳定 JSON descriptor，仅作为派生结果，不落回 `.scene`。
- `scene/part/prop/event/slot`：装饰器 API；`@scene` 可在普通 TS 环境中挂载已注册 `.scene`。
- `registerScene(path, definition)`：注册编译后的 `.scene`。
- `mount(target, child, slot?)`：向 Scene 暴露的 slot 投放 PixiJS 节点或 Scene Instance。
- `connectSceneEvent(event, actionName, root, actions?)`：连接 `.scene` 里的事件声明；优先使用外部 actions，否则调用 root Scene Script 上的同名方法。
- Editor 已接入 compiler scene 只读模式：XML `.scene` 打开后显示只读层级、public contract、parts 和选中节点摘要，不进入旧 `SceneDocument` 编辑链路。

当前 `.scene` 结构：

```xml
<Scene name="Button" script="src/scenes/Button.ts" width="188" height="48">
  <Graphics id="background" shape="roundRect" width="188" height="48" radius="10" fill="#2f6fed" />
  <Container id="iconHost" x="18" y="14">
    <slot name="icon" />
  </Container>
  <Text id="labelText" text="Button" x="54" y="13" />
</Scene>
```

`<Scene>` 是编译单元，不是运行时 PixiJS 节点。Scene Script 实例本身是根 `Container`，`.scene` 的一级节点直接 `addChild` 到该实例。节点使用 `id`，同一 `.scene` 内必须唯一；`@part()` 默认用字段名关联同名 `id`。

测试：

```txt
tests/scene-compiler.test.ts
tests/scene-script-interface.test.ts
```

验证命令已通过：

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts tests/scene-script-interface.test.ts
bun run build
bun run test
```

## 当前注意事项

- 现在只是 spike，不要直接迁移 editor/runtime 主流程。
- 不要把 `.scene` 设计成任意 XML。
- 不要让 Editor 运行用户脚本来获得 metadata。
- 不要从 TS 动态表达式推断 interface。
- 不要再扩展 Pixifact 自己的 `container/image/text/input/shape` 基础模型。
- 不要把 Scene Instance 展开成被引用 Scene 的内部节点副本。

当前工作区可能有用户未跟踪文件：

```txt
sample-projects/space-hud-game/src/Button.ts
```

这是用户手写草稿，不要自动提交，除非用户明确要求。

## 下一步建议

优先继续做“最小闭环”，不要大迁移：

1. 补齐 Scene Binding Index，让 Editor 感知脚本变化后自动刷新 virtual contract。
2. 继续完善 editor hierarchy / inspector 对 virtual contract 的展示和投放体验。
3. 给 `@scene()` + `.scene script` 绑定模型补端到端测试和 source map 方案。

## 当前新增决策：Scene Binding Index

Editor 需要把 `.scene -> script -> public contract` 当作只读派生快照处理：

- `.scene` 只保存视觉模板和 `script="src/scenes/X.ts"` 绑定，不写入 Interface。
- 脚本装饰器是 `props / events / slots / parts` 的单一权威源。
- `SceneBindingIndex` 扫描项目内 `.scene`，读取绑定脚本，并生成以 scene 相对路径为 key 的派生索引。
- 打开 `.scene`、拖入 Scene Instance、Inspector 绑定状态和 Scene Instance 的 public contract 都应从这个索引读取。
- 编辑器可以自动重新读取脚本并刷新内存中的 virtual contract；这个刷新不保存 `.scene`，不标记 dirty。

## 当前实现快照

截至当前实现，Compiler Scene 已经有一个可运行的最小编辑器闭环：

- `.scene` 必须绑定脚本；打开无脚本 `.scene` 会失败。
- `.scene` 的 `script` 是唯一持久绑定信息；`className / props / events / slots / parts` 都来自脚本装饰器派生快照。
- `SceneTemplate.interface` 只作为内存中的派生 contract，不保存回 XML。
- 新建 `.scene` 时会同时生成配套 `src/scenes/X.ts` 脚本。
- 打开 `.scene` 时会读取 `SceneBindingIndex`，加载当前 Scene descriptor，并递归收集被引用 Scene Instance 的 public interface。
- 保存 `.scene` 只写受限 XML，不写 Interface。

Editor 当前行为：

- 左侧文件树不展示 `node_modules` 和 `dist`。
- 从文件树拖入 `.scene` 会创建 Scene Instance；拖入当前打开的同一个 Scene 会被拒绝。
- 层级面板中 Scene Instance 默认黑盒，只展开 public slots 和 slot 内容。
- slot 是特殊投放点，表现为 `kind: 'slot'`，不是可编辑 Container；它只允许放置子节点。
- 普通 PixiJS 节点可以添加、删除、移动；节点可以移动进 Scene Instance 的公开 slot，也可以从 slot 移回合法父级。
- `<slot />` / `<slot name="x" />` 是定义子 Scene 可投放位置的 outlet，只能放在 Container 内。
- 旧的组合模板入口已删除，当前只保留 PixiJS 基础节点和 slot 工具。

Inspector 当前行为：

- 选中 Scene 根：展示 Scene 名称、尺寸、脚本绑定状态、public contract 和 parts 摘要。
- 选中 PixiJS 节点：按 PixiJS schema 分组展示完整 transform / display / type-specific props。
- 选中 Scene Instance：只展示 instance 自身 `id / type / scene`、transform、display、public props、public events 和 public slots。
- Scene Instance 的 public props/events 来自被引用脚本的 contract；不会暴露被引用 Scene 内部 parts。
- Scene Instance 的 public slots 只读展示为 `slot:name -> children count`，slot 内容本身仍属于父 Scene。
- 选中 placement slot：展示 slot 名称、owner 和当前 children 数量。

Preview / Save 当前行为：

- `CompilerSceneViewport` 会递归渲染 Scene Instance。
- Scene Instance 的 slot children 会挂载到被引用 Scene 的 `<slot>` 宿主 Container 上。
- 保存后的 XML 使用子节点 `slot="name"` 表达 Scene Instance slot 内容。
- 保存再重开会还原为 `sceneInstance.slots[name]`，不丢失 slot children。
- 预览面板透明背景，避免白色底遮挡编辑器视觉。

Demo 当前状态：

- 示例项目在 `sample-projects/scene-compiler-demo/`。
- `Panel.scene` 暴露 `content` 和 `footer` slots，以及 `title` prop。
- `Button.scene` 暴露 `icon` slot、`label` / `disabled` props，以及 `click` event。
- `MainMenu.scene` 展示 `Panel` Scene Instance、`Button` Scene Instance、slot 投放、public props 和 `@click="startGame"`。
- 生成产物在 `sample-projects/scene-compiler-demo/.pixifact/generated/`，由 Pixifact CLI 生成。

Demo 常用命令：

```bash
cd sample-projects/scene-compiler-demo
bun run compile:scenes
bun run build
bun run dev
```

近期已验证命令：

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts tests/project-file-tree.test.ts
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run test
bun run editor:frontend:build
cd sample-projects/scene-compiler-demo && bun run build
```

近期提交：

```txt
a0bde36 feat: show scene instance slot details
8cca9b8 test: cover scene instance slot reopen
a0ebcb7 chore: polish scene compiler demo
```

## 当前剩余问题

下一阶段建议从编辑器交互细节继续，而不是再改核心模型：

1. Inspector 文案和 slot 文案本地化，例如 `slot:footer`、`children` 是否保留英文。
2. slot 投放视觉提示：拖拽悬停到 placement slot 时提供明确可投放反馈。
3. 预览选中节点：当前只做 Scene 中选中节点，暂不做从预览反选。
4. SceneBindingIndex 自动刷新：监听脚本变化后刷新 virtual contract，不标记 `.scene` dirty。
5. source map / generated code 调试定位：让运行时错误尽量定位到用户脚本或 `.scene` 源位置。
