# Pixifact Scene Script Patterns

本文件随 Pixifact skill 安装，用于下游项目离线查阅 `.scene` 与同名 `.ts` 脚本的配对写法。新建 Scene、修改脚本契约、添加 `@part()` / `@prop()` / `@event()` / `@slot()`，或修复 scene validate 的脚本契约 diagnostics 时先读本文件。

## 配对不变量

一个 compiler Scene 是同目录、同 basename 的文件对：

```txt
src/scenes/Hud.scene
src/scenes/Hud.ts
```

这四个名字必须对齐：

```xml
<Scene name="Hud">
```

```ts
@scene()
export class Hud extends Group {}
```

规则：

- `.scene` 文件名 basename、`<Scene name>`、同名 `.ts` 文件、`@scene()` class 名保持一致。
- Scene 名是本地文件对的名字，不是全局唯一 ID；引用其他 Scene 时用 `.scene` 路径。
- `.scene` 不写 `script="..."` 或 `class="..."`。
- `@scene()` 不接收参数。
- 生成文件只读，不编辑 `.pixifact/generated/**`、`src/generated/**`、`*.scene.generated.ts` 或 `scenes.generated.ts`。

## 分工

`.scene` 负责：

- 视觉结构、层级、布局、文本、图片和静态显示属性。
- 官方基础对象（包括用于明确盒子尺寸的 `Group`）和项目子 Scene instance。
- slot 填充和 event wiring，例如 `@click="startGame"`。

`.ts` 负责：

- 行为、运行时状态更新、输入处理和动画。
- 通过 `@part()` 访问 `.scene` 中稳定 `id` 的节点。
- 通过 `@prop()`、`@event()`、`@slot()` 暴露父 Scene 和 Inspector 可见的公开契约。

不要把静态视觉属性从 `.scene` 搬到 `.ts`。只有需要运行时行为或公开契约时才改脚本。

## 何时改脚本

| 任务 | 默认改动 |
| --- | --- |
| 移动节点、改颜色、换图片、调布局 | 只改 `.scene`。 |
| 脚本需要读写某个节点 | 给节点稳定 `id`，脚本加 `@part()`。 |
| 父 Scene 需要传值给子 Scene | 子脚本加 `@prop()`，父 `.scene` 写属性。 |
| 子 Scene 需要通知父 Scene | 子脚本加 `@event()` 和 `createEvent()`，父 `.scene` 写 `@eventName="actionName"`。 |
| 父 Scene 需要向子 Scene 塞图标或内容 | 子 `.scene` 写 `<slot>`，子脚本加 `@slot()`，父 `.scene` 子节点写 `slot="name"`。 |
| 需要多个相关字段一起传入 | 用 exported structured prop class，父 `.scene` 用 dot-path attributes。 |

## Import 速查

常用导入：

```ts
import type { Container, Text } from 'pixi.js';
import { Group, type Rect } from 'pixifact/runtime';
import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';
```

原则：

- `Group`、`Rect`、`Image`、`NineImage`、`TileImage` 等 runtime 类型来自 `pixifact/runtime`。
- `scene`、`part`、`prop`、`event`、`slot`、`createEvent` 来自 `pixifact/compiler`。
- Pixi 节点类型如 `Container`、`Text`、`Graphics` 来自 `pixi.js`。
- 只用于类型标注时使用 `import type` 或 named type import。

## 最小 Scene

`StatusBadge.scene`：

```xml
<Scene name="StatusBadge" width="220" height="64">
  <Rect id="background" left="0" right="0" top="0" bottom="0" radius="16" fillColor="#1f2937" />
  <Text id="labelText" text="READY" x="24" y="18" fontSize="24" fontWeight="700" fill="#ffffff" />
</Scene>
```

`StatusBadge.ts`：

```ts
import { Group } from 'pixifact/runtime';
import { scene } from 'pixifact/compiler';

@scene()
export class StatusBadge extends Group {}
```

如果只是静态 UI，不需要为了节点存在而添加 `@part()`。

## `@part()` + `@prop()` 更新文本

`Hud.scene`：

```xml
<Scene name="Hud" width="750" height="160">
  <Text id="playerNameText" text="Player" left="24" top="24" fontSize="28" fontWeight="700" fill="#ffffff" />
  <Text id="coinText" text="0" right="24" top="24" fontSize="28" fontWeight="700" fill="#ffd166" />
</Scene>
```

`Hud.ts`：

```ts
import type { Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { part, prop, scene } from 'pixifact/compiler';

@scene()
export class Hud extends Group {
    #playerName = 'Player';
    #coins = 0;

    @part()
    protected declare playerNameText: Text;

    @part()
    protected declare coinText: Text;

    @prop({ type: String, default: 'Player' })
    set playerName(value: string) {
        this.#playerName = value;
        this.playerNameText.text = value;
    }

    get playerName() {
        return this.#playerName;
    }

    @prop({ type: Number, default: 0 })
    set coins(value: number) {
        this.#coins = value;
        this.coinText.text = String(value);
    }

    get coins() {
        return this.#coins;
    }

    onMounted() {
        this.playerNameText.text = this.#playerName;
        this.coinText.text = String(this.#coins);
    }
}
```

注意：

- `@part()` 默认绑定同名 `id`；如果属性名不同，使用 `@part({ id: 'playerNameText' })`。
- 不要为了缺失 `@part` 写静默 fallback。缺失节点应由 `scene validate` 或运行时暴露出来。
- `@prop` 默认值写在 decorator 上；setter 负责同步 runtime state。

## Button：slot + event

`PrimaryButton.scene`：

```xml
<Scene name="PrimaryButton" width="360" height="80">
  <Rect id="background" left="0" right="0" top="0" bottom="0" radius="18" fillColor="#2563eb" />
  <HBoxContainer id="content" horizontal="0" vertical="0" gap="12" alignY="center">
    <slot name="icon" />
    <Text id="labelText" text="Button" fontSize="26" fontWeight="700" fill="#ffffff" />
  </HBoxContainer>
</Scene>
```

`PrimaryButton.ts`：

```ts
import type { Container, Text } from 'pixi.js';
import { Group, type Rect } from 'pixifact/runtime';
import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

@scene()
export class PrimaryButton extends Group {
    #label = 'Button';

    @part()
    protected declare background: Rect;

    @part()
    protected declare labelText: Text;

    @slot({ name: 'icon' })
    readonly icon!: Container;

    @prop({ type: String, default: 'Button' })
    set label(value: string) {
        this.#label = value;
        this.labelText.text = value;
    }

    get label() {
        return this.#label;
    }

    @event()
    readonly click = createEvent();

    onMounted() {
        this.labelText.text = this.#label;
        this.background.eventMode = 'static';
        this.background.cursor = 'pointer';
        this.background.on('pointertap', () => {
            this.click.emit();
        });
    }
}
```

父 Scene 填充 slot 并绑定事件：

```xml
<PrimaryButton id="startButton" scene="./PrimaryButton.scene" label="开始游戏" @click="startGame">
  <Image slot="icon" id="startIcon" texture="assets/icons/play.png" width="32" height="32" fit="contain" />
</PrimaryButton>
```

父 Scene 脚本中的 action 方法：

```ts
import { Group } from 'pixifact/runtime';
import { scene } from 'pixifact/compiler';

@scene()
export class MainMenu extends Group {
    startGame() {
        // start game flow
    }
}
```

`@click="startGame"` 的值是 action name。运行时优先连接 external actions；没有对应 action 时，连接当前 root 脚本实例上的同名方法。父脚本的 `startGame()` 不需要 `@event()`；`@event()` 用在暴露事件的子 Scene 上。

## Structured prop

当多个字段天然属于一个公开属性时，用 exported struct class，不要传 JSON。

父 `.scene`：

```xml
<RewardCard
  id="reward"
  scene="./RewardCard.scene"
  rectTransform.x="40"
  rectTransform.y="220"
  rectTransform.width="670"
  rectTransform.height="160"
/>
```

`RewardCard.ts`：

```ts
import { Group } from 'pixifact/runtime';
import { prop, scene } from 'pixifact/compiler';

export class RectTransform {
    x = 0;
    y = 0;
    width = 188;
    height = 48;
}

@scene()
export class RewardCard extends Group {
    @prop({ type: RectTransform })
    set rectTransform(value: RectTransform) {
        this.x = value.x;
        this.y = value.y;
        this.width = value.width;
        this.height = value.height;
    }
}
```

规则：

- struct class 必须从同文件导出。
- struct class 必须可无参构造。
- public fields 必须有 primitive initializer。
- structured prop 默认值来自 struct class field initializer，不在 `@prop` 里写 `default`。
- 父 `.scene` 使用 `rectTransform.x="40"` 这种 dot-path attribute。

## 负例

不要写这些：

```ts
@scene('./PrimaryButton.scene')
export class PrimaryButton extends Group {}
```

```xml
<Scene name="PrimaryButton" script="./PrimaryButton.ts">
```

```ts
@prop({ type: 'string' })
label = 'Button';
```

```ts
@event()
click = new EventEmitter<void>();
```

```xml
<RewardCard rectTransform="{&quot;x&quot;:40,&quot;y&quot;:220}" />
```

```xml
<Group id="content" />
<Control id="panel" />
```

```xml
<PrimaryButton id="button" scene="./PrimaryButton.scene">
  <Text id="label" text="Label" />
</PrimaryButton>
```

上面最后一个例子只有在 `PrimaryButton.ts` 暴露 default slot，且 `PrimaryButton.scene` 中有 `<slot />` 时才有效。子 Scene instance 只通过已声明 slot 接收 children。

## 诊断修复速查

| Diagnostic | 修复 |
| --- | --- |
| `<Scene name>` must match file basename | 改 `<Scene name>`，或重命名 `.scene` / `.ts` 文件对。 |
| requires paired script | 创建同目录同 basename 的 `.ts` 文件。 |
| must match `@scene` class | 让 `<Scene name>` 和 `@scene()` class 名一致。 |
| No `@scene` decorator found | 在配对脚本里添加一个 `@scene()` class。 |
| `@part` references missing node id | 给 `.scene` 添加对应 `id`，或修改 `@part({ id })`。 |
| unknown prop / event / slot | 在子 Scene 脚本暴露对应 `@prop()` / `@event()` / `@slot()`，或修正父 `.scene` 写法。 |

修复后重新运行失败的命令；直接编辑 `.scene` 后至少运行：

```bash
pixifact scene validate --scene src/scenes/MainMenu.scene
pixifact compile-scenes
```
