# Scene Compiler Handoff

本文用于新会话快速接续 Pixifact Compiler 方向。完整背景见 `docs/SCENE_COMPILER_NOTES.md`。

## 核心结论

Pixifact 后续定位应从 runtime framework 收敛为 PixiJS Scene compiler / authoring toolchain。

```txt
.scene template -> typed Scene AST -> SceneCommand -> compiler -> PixiJS TypeScript
```

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
SceneCommand / dry-run / diff / apply
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

## Scene Script 和 Interface

每个 `.scene` 可以绑定一个 TypeScript 脚本。脚本继承 PixiJS `Container`。

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

@scene('./Button.scene')
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

工具链仍可静态提取装饰器生成 interface descriptor。Editor / AI / Inspector 读取生成后的 descriptor，不直接执行用户代码，也不在运行时解析 TS。

约束：

- 只支持字面量参数。
- 不支持动态表达式，例如 `@prop(makeSchema())`。
- 装饰器是作者体验；生成后的 interface descriptor 是工具链契约。

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
- `sample-projects/scene-compiler-demo/scripts/compile-scenes.ts`：扫描 demo `scenes/*.scene` 并生成 `src/generated/*.scene.generated.ts` 与 registry 入口。
- `extractSceneScriptInterface(source)`：静态提取 `@scene/@prop/@event/@slot`。
- `emitSceneScriptInterfaceDescriptor(source)`：输出稳定 JSON descriptor。
- `scene/part/prop/event/slot`：装饰器 API；`@scene` 可在普通 TS 环境中挂载已注册 `.scene`。
- `registerScene(path, definition)`：注册编译后的 `.scene`。
- `mount(target, child, slot?)`：向 Scene 暴露的 slot 投放 PixiJS 节点或 Scene Instance。

当前 `.scene` 结构：

```xml
<Scene name="Button" script="../src/scenes/Button.ts" class="Button" width="188" height="48">
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

1. 生成 interface descriptor 文件，例如 `Button.scene.interface.json`。
2. 让 `.scene` 去掉 `<Interface>`，只保留模板结构和 script 绑定。
3. 用一个 `Button.scene + Button.ts + MainMenu.scene` 样例串起 parse / extract / compile。
4. 再讨论 editor hierarchy / inspector 如何接入 descriptor。
