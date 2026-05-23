# Pixifact Compiler Notes

本文记录关于 Pixifact 代码层定位的阶段性讨论结论，暂不作为实施计划，不改动当前 runtime / editor / CLI 代码。

## 当前工作假设

Pixifact 后续更贴近 `Pixifact Compiler`：

```txt
.scene template -> typed Scene AST -> SceneCommand -> compiler -> PixiJS TypeScript
```

- `.scene` 是可编辑、可预览、AI 可理解、可读取、可操作的结构源文件。
- `.scene` 更像 PixiJS 世界里的 Vue / React 组件模板，不是普通数据文件。
- Pixifact 负责编译 `.scene` 到 PixiJS TypeScript 代码。
- PixiJS 是最终运行时心智，不再让用户围绕 Pixifact 自定义 runtime framework 编程。
- Editor / CLI / SceneCommand / dry-run / diff / apply 仍然是 Pixifact 的 authoring 和 AI 操作价值。

类比：

```txt
Vue / React template or JSX -> .scene
component class / setup logic -> Scene Script
<Button /> -> Scene Instance
props -> props
events / callbacks -> events
children / named slots -> slots
```

## 不再定义基础显示模型

Pixifact 不再需要自己的基础显示节点体系。

旧模型：

```txt
container / image / text / input / shape
```

后续应收敛为：

```txt
PixiJS primitives + Pixifact composition metadata
```

基础显示能力来自 PixiJS：

- `Container`
- `Sprite`
- `Text` / `BitmapText` / `HTMLText`
- `Graphics`
- `Mesh`
- `NineSliceSprite`
- `TilingSprite`
- `DOMContainer`

Pixifact 自己只保留 authoring / compiler 语义：

- `.scene` 文件
- Scene Script 绑定
- public contract
- Scene Instance
- Slot / `<slot>`
- props / events / slots
- Inspector schema
- AI command / diff / dry-run
- compiler output

`input` 不再作为内置基础节点。输入框应是普通复合 Scene：

```txt
TextInput.scene
TextInput.ts
```

内部可以使用 `DOMContainer` 或自绘 PixiJS 对象；外部只使用脚本暴露的 `value`、`onSubmit` 等接口。

## .scene 文件形态

`.scene` 可以使用受限 XML / Vue-like template，而不是任意 XML。

推荐心智：

```txt
.scene = PixiJS 组件模板的可视化 AST
```

也就是：

- 人和 AI 阅读 `.scene` 时像读组件模板。
- Pixifact 解析 `.scene` 后得到 typed Scene AST。
- Editor / CLI / Compiler 操作 AST，不直接依赖 XML DOM。
- AI 修改通过 `SceneCommand`，而不是直接手改大段 XML。

示意：

```xml
<Scene name="Button" script="src/scenes/Button.ts" class="Button">
  <Interface>
    <Prop name="label" type="string" default="Button" />
    <Prop name="disabled" type="boolean" default="false" />
    <Event name="click" />
    <Slot name="icon" />
  </Interface>

  <Graphics id="background" shape="roundRect" width="180" height="52" radius="8" fill="#4169e1" />
  <Text id="label" text="Button" x="72" y="16" fontSize="16" fill="#ffffff" />
  <Container id="iconHost" x="20" y="14">
    <slot name="icon" />
  </Container>
</Scene>
```

父 Scene 使用它：

```xml
<Scene name="MainMenu" script="src/scenes/MainMenu.ts" class="MainMenu">
  <Button id="startButton" scene="scenes/Button.scene" x="390" y="300" label="Start" @click="startGame">
    <Sprite id="playIcon" slot="icon" texture="assets/icons/play.png" />
  </Button>
</Scene>
```

这里 `Button` 是 Scene Instance，不是展开后的内部节点副本。

## 不做任意 XML

`.scene` 可以长得像 XML，但它不是通用 XML 文档格式。它应是 Pixifact 自己定义的窄模板语言。

允许的语义应非常明确：

- 只允许 Pixifact 认识的标签，或可解析到 `.scene` 的 Scene 组件标签。
- 标签对应 PixiJS 对象、Scene Instance 或 Pixifact 模板语义。
- 属性会被解析成 typed AST，不原样保留为字符串。
- props / events / slots 是一等语义。

需要禁止或暂缓：

- DTD
- namespace
- CDATA
- processing instruction
- 任意文本节点
- 任意 unknown tag
- 任意 unknown attribute
- XML entity 扩展
- 内联 JS
- 模板业务表达式

例如不要在模板中写：

```xml
<Text text="{score > 10 ? 'Win' : 'Lose'}" />
```

状态和业务逻辑应放在 Scene Script：

```ts
hud.score = value;
```

## Scene Script 强制绑定

后续规则应收敛为：每个 `.scene` 必须绑定一个对应的 TypeScript 脚本。

- `.scene` 描述完整的可视化结构。
- 脚本继承 PixiJS `Container`。
- 脚本可以定义自定义属性、方法和事件入口。
- `.scene` 编译出的内部结构只由对应脚本访问和操作。
- 对外部调用方来说，一个 Scene 实例是完整且独立的对象，例如一个按钮、面板或 HUD。
- 新建 `.scene` 时编辑器应自动生成同名脚本。
- 无脚本 `.scene` 不再作为长期支持的主形态；打开时提示迁移，编译时失败。

示意：

```txt
scenes/Button.scene
src/scenes/Button.ts
src/generated/pixifact/Button.scene.generated.ts
```

`.scene` 和脚本做双向声明：

```xml
<Scene name="Button" script="src/scenes/Button.ts" class="Button" width="180" height="52">
</Scene>
```

```ts
import { Container } from 'pixi.js';
import { scene } from 'pixifact/compiler';

@scene('scenes/Button.scene')
export class Button extends Container {
  onMounted() {}
}
```

绑定规则：

- `.scene` 的 `script` 使用项目根相对路径，例如 `src/scenes/Button.ts`。
- 脚本的 `@scene()` 使用项目根相对路径，例如 `scenes/Button.scene`。
- `.scene` 的 `class` 必须等于被 `@scene` 装饰的导出类名。
- 两边不一致时 compiler 报错。
- compiler 可以从任意一边定位另一边，但会校验双向一致性。

外部使用时只面对脚本公开 API：

```ts
const button = new Button({ label: 'Start' });
button.label = 'Restart';
button.onClick(startGame);
stage.addChild(button);
```

外部不应依赖 Button 的内部背景、文字、图标等节点结构。

## Public Contract

每个 Scene 需要一个明确的 public contract，供 Editor、AI、Inspector、Compiler 共同理解。

```txt
private tree     内部 PixiJS 对象树，只在编辑该 Scene 自身时展开
public contract  对外暴露的 props / events / slots
```

contract 不应只从 TS 脚本 getter / setter 中推断。Editor 和 AI 需要在不执行 TS 的情况下稳定理解接口。

但 public contract 的权威来源应是脚本装饰器，而不是 `.scene` 中手写的 `Interface`。用户不应同时维护两份信息。

```txt
Button.ts decorators -> compiler -> Button.scene <Interface>
权威来源               同步结果     给 editor / AI / Scene Instance 快速读取
```

脚本示意：

```ts
import { Container, Text } from 'pixi.js';
import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

@scene('scenes/Button.scene')
export class Button extends Container {
  @part()
  declare protected labelText: Text;

  @prop({ type: 'string', default: 'Button' })
  set label(value: string) {
    this.labelText.text = value;
  }

  @event()
  readonly click = createEvent();

  @slot()
  declare readonly icon: Container;

  onMounted() {}
}
```

同步后的 `.scene` 可以包含只读快照：

```xml
<Interface>
  <Prop name="label" type="string" default="Button" />
  <Event name="click" />
  <Slot name="icon" />
</Interface>
```

规则：

- 有脚本时，compiler 从脚本装饰器提取 `props / events / slots / parts`。
- `.scene <Interface>` 是 compiler 同步结果，供 editor / AI / other Scene 快速读取。
- 保存/编译时脚本装饰器覆盖 `.scene <Interface>`。
- Editor 默认只读展示 Public Contract，不作为日常编辑入口。
- 脚本和 `.scene <Interface>` 不一致时，脚本赢。

示意：

```txt
props
  label: string
  disabled: boolean
  variant: enum

events
  click

slots
  icon
  default
```

原来 Component schema 给 Inspector 暴露属性的思路可以迁移到 Scene contract：

```txt
Component schema -> Inspector fields
Scene public contract -> Inspector fields
```

因此后续 authoring 组件可以退出主模型：

- 行为封装迁移到 Scene Script。
- Inspector schema 迁移到 Scene public contract。
- Button、Input、Panel、ProgressBar 都应是 `.scene + script`，不是 Pixifact 内置 runtime component。

## 编译产物

编译器生成内部 mount 函数和 typed parts。

```txt
Button.scene -> Button.scene.generated.ts
```

生成代码负责：

- 创建 PixiJS `Container` / `Graphics` / `Text` / `Sprite` 等对象。
- 按 `.scene` 描述挂载内部节点。
- 返回脚本可访问的 typed parts。

用户脚本负责：

- 继承 PixiJS `Container`。
- 调用生成的 mount 函数。
- 保存私有 parts。
- 暴露稳定的属性、方法和事件接口。

示意：

```ts
export class Button extends Container {
  #parts: ButtonParts;

  constructor(props?: ButtonProps) {
    super();
    this.#parts = mountButtonScene(this);
  }

  set label(value: string) {
    this.#parts.label.text = value;
  }

  onClick(handler: () => void) {
    this.eventMode = 'static';
    this.on('pointertap', handler);
  }
}
```

属性 / 方法风格：

- 状态和配置优先使用 property，例如 `button.label`、`button.disabled`、`hud.score`。
- 用户动作、一次性命令、事件注册使用 method，例如 `show()`、`hide()`、`onClick()`。
- 不机械使用 Java 风格 `setXxx()`。

## 内部隔离

脚本继承 `Container` 后，外部技术上仍可访问 PixiJS 的 `children` 等公共 API，但 Pixifact 语义上约定：

- 外部只使用 Scene Script 暴露的属性和方法。
- `.scene` 内部节点不是外部 API。
- 内部节点通过脚本私有 `parts` 使用。
- AI / editor 在编辑该 `.scene` 本身时可以理解和操作内部结构。
- 在父级 Scene 使用它时默认把它视作整体。

## Scene Instance

Scene Instance 是在一个 `.scene` 里引用另一个 `.scene`，并把它当成一个独立对象使用。

示意：

```txt
Button.scene      定义按钮长什么样、脚本 API 是什么
Hud.scene         放入一个 Button.scene 的实例
```

在 `Hud.scene` 里：

```txt
Root
  StartButton : instance of Button.scene
```

`StartButton` 不复制 `Button.scene` 的内部节点，不展开 `background`、`label`、`hitArea`。

Scene Instance 保存的是使用方式：

- 引用哪个 Scene。
- 实例自己的位置、尺寸、显示状态。
- 传给该 Scene 的 props。
- 绑定到该 Scene 的 events。
- 填入该 Scene 暴露 slots 的内容。

运行时代码大致对应：

```ts
const startButton = new Button();
startButton.position.set(390, 300);
startButton.label = 'Start';
startButton.onClick(startGame);
root.addChild(startButton);
```

## Slots

Scene 可以参考 Vue 的 slot 心智。

- 无 slots 的 Scene 更像叶子组件，例如 `Button`、`Icon`、`HpBar`。
- 有 slots 的 Scene 更像容器组件，例如 `Panel`、`Dialog`、`Window`。

slot 是 `.scene` 中声明的受控挂载点，不是随意暴露全部内部结构。

原则：

```txt
parts = 脚本私有访问内部节点
props = 外部可设置的属性
slots = 外部可插入内容的公开挂载点
```

源 Scene 中可以这样表达：

```xml
<Container key="contentHost">
  <slot />
</Container>
```

父 Scene 使用时：

```xml
<Panel key="settingsPanel" scene="scenes/Panel.scene" title="Settings">
  <Text slot="default" key="volumeLabel" text="Volume" />
  <Button slot="footer" key="okButton" scene="scenes/Button.scene" label="OK" />
</Panel>
```

父 Scene 只看到 `default` / `footer` 这些公开 slot，看不到 `Panel.scene` 内部的 `background`、`border`、`contentHost`。

slot 内容属于父 Scene；slot host 的样式和位置属于被引用的子 Scene。

## Editor 视角

Editor 至少需要区分三个视角。

### 编辑源 Scene

打开 `Button.scene` 自身时，显示完整内部结构：

```txt
ButtonRoot
  background
  label
  iconHost [slot: icon]
```

同时显示 public contract 面板：

```txt
Props
  label
  disabled

Events
  click

Slots
  icon
```

### 使用 Scene Instance

在父 Scene 中使用 `Button.scene` 时，Hierarchy 默认显示整体：

```txt
MainMenu
  startButton : Button.scene
```

不展开：

```txt
background
label
hitArea
```

Inspector 显示 public contract：

```txt
Button
  label
  disabled
  click
  slots
```

### 编辑 slot 内容

有 slots 的 Scene Instance 可以展示 slot 行，但只展示 slot 内容，不展示内部实现：

```txt
settingsPanel : Panel.scene
  slot: default
    volumeLabel : Text
  slot: footer
    okButton : Button.scene
```

选择规则：

- 点击 Scene Instance 内部装饰时选中 instance。
- 点击 slot 内容时选中 slot 内容，因为它属于父 Scene。
- 双击 Scene Instance 可以打开源 `.scene`，进入内部编辑。
- 选中有 slots 的 instance 时，Viewport 可以显示 slot 边界和 drop zone。

## Inspector

Inspector 的属性来源应从 Component schema 迁移到 Scene public contract。

选中 Scene Instance：

```txt
Props     来自 interface.props
Events    来自 interface.events
Slots     来自 interface.slots
Transform 来自实例自身
```

选中普通 PixiJS 对象：

```txt
显示 PixiJS-facing properties
```

选中 slot：

```txt
显示 slot 名称、是否 multiple、当前内容、可投放类型
```

内部节点属性只在编辑源 Scene 自身时出现；父 Scene 不直接编辑子 Scene 内部节点。

## AI 友好性

对 AI 最友好的组合是：

```txt
人和 AI 阅读：受限 XML / Vue-like template
机器操作：typed Scene AST
AI 修改：SceneCommand
```

原因：

- XML-like template 对 AI 更接近组件心智。
- props / events / slots / children 层级比深层 JSON 更直观。
- AI 可以理解一个 Scene Instance 是整体，不需要展开内部节点。
- 真正修改仍通过 SceneCommand，便于 validate / dry-run / diff / apply。

AI 在编辑父 Scene 时，只能改：

- Scene Instance props
- Scene Instance events
- Scene Instance slots 内容
- 父 Scene 自己拥有的 PixiJS 对象

AI 不应直接改被引用 Scene 的内部结构。要改内部，必须明确目标为该源 `.scene`。

## 后续讨论点

- `.scene` 受限 XML 的准确标签集合和属性规则。
- XML attribute 到 typed AST 的类型转换规则。
- Scene public contract 的具体 schema。
- Scene script 绑定路径、class 名和重命名规则。
- generated 文件的目录和命名约定。
- Scene Instance 在编译时如何 import / instantiate 对应脚本。
- slots 的 multiple、默认 slot、命名 slot、可投放类型如何表达。
- Editor hierarchy / canvas hit-test / selection 的精确规则。
- CLI / compiler 命令形态。
- 生成代码是否提交到 git，或仅构建时生成。
- 当前 `GameObject` / `Component` / `instantiateScene` runtime 路径如何迁移或降级。
