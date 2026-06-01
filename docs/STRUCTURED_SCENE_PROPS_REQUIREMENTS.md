# Structured Scene Props Requirements

本文定义 Scene 公开属性从 primitive prop 扩展到结构化 prop 的目标方案。行为验收见 [STRUCTURED_SCENE_PROPS_BDD.md](./STRUCTURED_SCENE_PROPS_BDD.md)，测试驱动计划见 [STRUCTURED_SCENE_PROPS_TDD.md](./STRUCTURED_SCENE_PROPS_TDD.md)。

## 1. 背景

当前 `@prop` 使用字符串声明 primitive 类型：

```ts
@prop({ type: 'string', default: 'Button' })
@prop({ type: 'number', default: 0 })
@prop({ type: 'boolean', default: false })
```

这个模型只能表达扁平字段。面对组件级 API 时会造成字段爆炸，例如 `rectX`、`rectY`、`rectWidth`、`rectHeight`、`paddingLeft`、`paddingRight`、`normalColor`、`hoverColor` 等。

Pixifact 需要解决的是一类问题：Scene 组件公开 API 需要结构化数据，同时保持 PixiJS 基础节点属性不被重新发明。

## 2. 目标

- `@prop` 的 `type` 使用运行时类型引用，而不是字符串标记。
- primitive prop 使用 `String`、`Number`、`Boolean`。
- struct prop 使用可无参构造的 class，例如 `RectTransform`。
- `.scene` 使用点路径表达结构化字段。
- compiler 生成真实 struct 实例，不传 plain object。
- Inspector 根据 contract 将 struct prop 显示为字段组。
- 第一版使用 `RectTransform` 验证完整机制，但实现方向面向通用 structured prop。

## 3. 非目标

- 不新增通用 layout DSL。
- 不改变 PixiJS 基础节点的原生属性模型。
- 不支持 JSON 字符串属性值。
- 不支持数组、union、generic、`Record`、`Map`、嵌套 object。
- 不支持带参数构造的 struct 初始化。
- 不保留 `type: 'string' | 'number' | 'boolean'` 旧写法兼容。

## 4. 目标 API

```ts
import { Container, NineSliceSprite, Text } from 'pixi.js';
import { part, prop, scene } from 'pixifact/compiler';

export class RectTransform {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
}

@scene()
export class Button extends Container {
    @part()
    protected declare background: NineSliceSprite;

    @part({ id: 'label' })
    protected declare labelText: Text;

    @prop({ type: String, default: 'Button' })
    set text(value: string) {
        this.labelText.text = value;
        this.layoutLabel();
    }

    @prop({ type: RectTransform })
    set rectTransform(value: RectTransform) {
        this.position.set(value.x, value.y);
        this.background.width = value.width;
        this.background.height = value.height;
        this.layoutLabel();
    }

    private layoutLabel() {
        this.labelText.x = (this.background.width - this.labelText.width) / 2;
        this.labelText.y = (this.background.height - this.labelText.height) / 2;
    }
}
```

父 Scene 使用：

```xml
<Scene name="GameOver" width="720" height="1280">
  <Button
    id="restartButton"
    scene="./Button.scene"
    text="RESTART"
    rectTransform.x="150"
    rectTransform.y="692"
    rectTransform.width="420"
    rectTransform.height="92"
  />
</Scene>
```

## 5. Contract

`scriptInterfaceExtractor` 输出稳定、可序列化的 contract。运行时 constructor 不进入 JSON contract。

Primitive prop：

```ts
{
    text: {
        type: 'string',
        default: 'Button',
    },
}
```

Struct prop：

```ts
{
    rectTransform: {
        type: 'struct',
        struct: 'RectTransform',
        fields: {
            x: { type: 'number', default: 0 },
            y: { type: 'number', default: 0 },
            width: { type: 'number', default: 0 },
            height: { type: 'number', default: 0 },
        },
    },
}
```

字段默认值来自 struct class field initializer。第一版 struct 字段只允许 `string`、`number`、`boolean`。

## 6. 编译输出

编译 Scene Instance struct prop 时生成真实实例：

```ts
const restartButtonRectTransform = new RectTransform();
restartButtonRectTransform.x = 150;
restartButtonRectTransform.y = 692;
restartButtonRectTransform.width = 420;
restartButtonRectTransform.height = 92;
restartButton.rectTransform = restartButtonRectTransform;
```

不生成：

```ts
restartButton.rectTransform = {
    x: 150,
    y: 692,
    width: 420,
    height: 92,
};
```

也不优先生成：

```ts
restartButton.rectTransform = new RectTransform(150, 692, 420, 92);
```

struct class 必须可无参构造。未在 `.scene` 中声明的字段保留 class initializer 默认值。

## 7. Parser 与 Serializer

`.scene` 中 struct 字段使用点路径：

```xml
rectTransform.width="420"
```

parser 内部合并为：

```ts
props: {
    rectTransform: {
        width: 420,
    },
}
```

serializer 输出回点路径：

```xml
rectTransform.x="150"
rectTransform.y="692"
rectTransform.width="420"
rectTransform.height="92"
```

不使用 JSON：

```xml
rectTransform="{...}"
```

## 8. Inspector

选中 Scene Instance 时，Inspector 根据 contract 显示字段组：

```txt
Rect Transform
  X       [150]
  Y       [692]
  Width   [420]
  Height  [92]

Props
  Text    [RESTART]
```

primitive prop 继续按现有单行字段显示。struct prop 不显示为 JSON 输入框。

选中 Pixi 基础节点时，继续显示 Pixi 原生属性分组，例如 `Transform`、`Display`、`Sprite`、`Text`、`Graphics`。`RectTransform` 不进入 Pixi 基础节点属性模型。

## 9. 实现边界

需要改动的核心模块：

- `packages/pixifact/src/compiler/spec.ts`
- `packages/pixifact/src/compiler/decorators.ts`
- `packages/pixifact/src/compiler/scriptInterfaceExtractor.ts`
- `packages/pixifact/src/compiler/templateParser.ts`
- `packages/pixifact/src/compiler/templateSerializer.ts`
- `packages/pixifact/src/compiler/typescriptCompiler.ts`
- `packages/pixifact/src/compiler/sceneValidation.ts`
- `apps/editor/src/panels/InspectorPanel.tsx`
- editor document/controller 中 nested prop 更新相关代码

第一版只需要 `RectTransform` 完成端到端闭环。后续 `Padding`、`Margin`、`TextStyle`、`ColorState` 应复用同一套 structured prop 机制。
