# Pixifact Scene Objects

本文件随 Pixifact skill 安装，用于下游项目离线查阅 `.scene` 可写对象和属性。新建 Scene、添加节点、修改布局、设置对象属性、使用子 Scene / slot / event / structured prop 时先读本文件；最终以 `pixifact scene validate` 为准。

## 基本结构

每个 `.scene` 文件必须以 `<Scene>` 为根：

```xml
<Scene name="Main" width="750" height="1334">
  <Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
  <VBoxContainer id="menu" horizontal="0" vertical="0" gap="16" alignX="center">
    <Text id="title" text="Adventure" fontSize="42" fill="#ffffff" />
  </VBoxContainer>
</Scene>
```

`<Scene>` 只作为文件根，运行时根节点是同名 Scene 脚本类实例。根标签常用属性：

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 必填。必须与同目录同 basename 的 `.ts` 文件中的 `@scene()` class 名一致。 |
| `width` | number | 可选。Scene 设计宽度。 |
| `height` | number | 可选。Scene 设计高度。 |

`Group` 和 `Control` 是 runtime 类型，不是可直接写的 `.scene` 标签。需要容器时用 `Container`、布局容器、子 Scene 实例，或项目自己的 Scene 脚本。

不要在 `<Scene>` 上写 `class="..."` 或 `script="..."`。Scene 脚本由同目录同 basename 的 `.ts` 文件和其中的 `@scene()` class 推断。

## 值类型

`.scene` 属性值都写在 XML attribute 中：

| 写法 | 类型 | 示例 |
| --- | --- | --- |
| 数字 | number | `x="24"`、`rotation="0.25"` |
| 布尔 | boolean | `visible="false"` |
| 字符串 | string | `text="Start"`、`fontFamily="Inter"` |
| 颜色 | color | `fill="#ffffff"`、`tint="#ffcc66"` |
| 枚举 | enum | `fit="cover"`、`fontWeight="700"` |

颜色推荐写 `#rrggbb`。`texture` 必须是项目内相对资源路径，例如 `assets/ui/button.png`；不要使用绝对路径、`./`、`..`、URL 或反斜杠路径。

## 通用属性

所有官方基础对象和项目子 Scene 实例都支持这些通用属性。

### 标识

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 稳定节点 ID。可编辑节点必须写，便于 `@part()`、inspect、diff 和调试。 |

### Transform

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `x` | number | 自由定位时的横坐标。 |
| `y` | number | 自由定位时的纵坐标。 |
| `width` | number | 节点宽度。 |
| `height` | number | 节点高度。 |
| `scaleX` | number | 横向缩放。 |
| `scaleY` | number | 纵向缩放。 |
| `rotation` | number | 旋转弧度。 |
| `pivotX` | number | pivot 横坐标。 |
| `pivotY` | number | pivot 纵坐标。 |
| `skewX` | number | 横向 skew。 |
| `skewY` | number | 纵向 skew。 |

### Frame Layout

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `left` | number | 距父节点左边距离。 |
| `right` | number | 距父节点右边距离。 |
| `top` | number | 距父节点上边距离。 |
| `bottom` | number | 距父节点下边距离。 |
| `horizontal` | number | 相对父节点水平中心的偏移。 |
| `vertical` | number | 相对父节点垂直中心的偏移。 |

横向优先级：`left + right > left > right > horizontal > x`。纵向优先级：`top + bottom > top > bottom > vertical > y`。

常见写法：

```xml
<Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
<Panel id="panel" scene="./Panel.scene" horizontal="0" vertical="0" width="640" height="420" />
<Button id="confirm" scene="./Button.scene" right="24" bottom="24" width="180" height="64" text="OK" />
```

### Display

| 属性 | 类型 | 可选值 / 说明 |
| --- | --- | --- |
| `alpha` | number | 透明度，通常 `0` 到 `1`。 |
| `visible` | boolean | 是否显示。 |
| `zIndex` | number | 同级排序值。 |
| `eventMode` | enum | `none` / `passive` / `auto` / `static` / `dynamic`。点击、拖拽、滚动命中常用 `static`。 |
| `cursor` | enum | `default` / `pointer` / `text` / `grab` / `grabbing`。 |
| `label` | string | Pixi display object label；通常优先用 `id`。 |

## 官方基础对象总览

| 对象 | 可放子节点 | 适合场景 |
| --- | --- | --- |
| `Container` | 是 | 轻量分组、统一移动、显示隐藏、排序。 |
| `HBoxContainer` | 是 | 横向按钮组、工具栏、图标加数字。 |
| `VBoxContainer` | 是 | 纵向菜单、列表、表单项。 |
| `GridContainer` | 是 | 背包格子、关卡卡片、固定列数面板。 |
| `ScrollContainer` | 是 | 可滚动列表、背包、任务面板。 |
| `Sprite` | 否 | Pixi 原生图片精灵。 |
| `NineSliceSprite` | 否 | Pixi 原生九宫格精灵。 |
| `TilingSprite` | 否 | Pixi 原生平铺精灵。 |
| `Text` | 否 | 普通文本。 |
| `BitmapText` | 否 | 高频更新或大量文本。 |
| `HTMLText` | 否 | 简单富文本。 |
| `Graphics` | 否 | 简单 `rect` / `roundRect` 矢量形状。 |
| `Rect` | 否 | UI 矩形、圆角矩形、色块、描边背景。 |
| `Image` | 否 | 带盒子尺寸和 `fit` 的图片，推荐用于大多数 UI 图片。 |
| `NineImage` | 否 | Pixifact runtime 九宫格图片，推荐用于可缩放 UI 背板。 |
| `TileImage` | 否 | Pixifact runtime 平铺图片，推荐用于重复纹理和背景。 |

叶子节点不能放 children。需要把文字放到背景上时，用容器或子 Scene 包起来，不要把 `Text` 写进 `Image`、`Rect`、`NineImage` 等叶子节点里。

## Container

`Container` 是 PixiJS 原生容器。专属属性：无，只使用通用属性。

`Container.width` / `Container.height` 保持 Pixi 原生 bounds / scale 语义，不是 Pixifact 盒子尺寸。需要稳定盒子尺寸时，优先使用布局容器、`Rect`、`Image`、`NineImage`、`TileImage` 或继承 `Group` 的项目 Scene。

```xml
<Container id="rewardLayer" x="24" y="160" zIndex="10">
  <Image id="coinIcon" texture="assets/icons/coin.png" width="48" height="48" />
  <Text id="coinAmount" text="+120" x="60" y="8" fontSize="28" fill="#ffd166" />
</Container>
```

## Layout Containers

这些容器都可以放 children，也都支持通用属性和 frame layout。

### HBoxContainer

横向排列直接子节点。

| 属性 | 类型 | 可选值 / 说明 |
| --- | --- | --- |
| `gap` | number | 子节点之间的基础横向间距。 |
| `alignY` | enum | `start` / `center` / `end`。子节点纵向对齐。 |
| `justify` | enum | `start` / `center` / `end` / `space-between`。整组横向分布。 |

```xml
<HBoxContainer id="resourceBar" right="24" top="24" width="260" height="56" gap="12" alignY="center" justify="end">
  <Image id="coinIcon" texture="assets/icons/coin.png" width="40" height="40" />
  <Text id="coinText" text="12,800" fontSize="24" fill="#ffffff" />
</HBoxContainer>
```

### VBoxContainer

纵向排列直接子节点。

| 属性 | 类型 | 可选值 / 说明 |
| --- | --- | --- |
| `gap` | number | 子节点之间的基础纵向间距。 |
| `alignX` | enum | `start` / `center` / `end`。子节点横向对齐。 |
| `justify` | enum | `start` / `center` / `end` / `space-between`。整组纵向分布。 |

```xml
<VBoxContainer id="mainMenu" horizontal="0" vertical="0" width="420" gap="18" alignX="center">
  <Text id="title" text="PIXIFACT" fontSize="48" fill="#ffffff" />
  <PrimaryButton id="startButton" scene="./PrimaryButton.scene" width="360" height="80" text="开始" />
</VBoxContainer>
```

### GridContainer

按固定列数从左到右、从上到下排列直接子节点。

| 属性 | 类型 | 可选值 / 说明 |
| --- | --- | --- |
| `columns` | number | 列数。运行时向下取整，至少为 `1`。 |
| `gapX` | number | 列间距。 |
| `gapY` | number | 行间距。 |
| `alignX` | enum | `start` / `center` / `end`。子节点在单元格横向对齐。 |
| `alignY` | enum | `start` / `center` / `end`。子节点在单元格纵向对齐。 |

```xml
<GridContainer id="inventoryGrid" left="32" right="32" top="160" height="520" columns="4" gapX="14" gapY="14" alignX="center" alignY="center">
  <ItemSlot id="slot1" scene="./ItemSlot.scene" width="128" height="128" />
  <ItemSlot id="slot2" scene="./ItemSlot.scene" width="128" height="128" />
</GridContainer>
```

### ScrollContainer

可拖拽滚动区域。作者写进去的子节点会挂到内部 content layer，并被容器尺寸裁剪。

| 属性 | 类型 | 可选值 / 说明 |
| --- | --- | --- |
| `direction` | enum | `vertical` / `horizontal` / `both`。 |
| `scrollX` | number | 初始横向滚动位置。 |
| `scrollY` | number | 初始纵向滚动位置。 |

```xml
<ScrollContainer id="questScroll" left="32" right="32" top="180" bottom="120" direction="vertical">
  <VBoxContainer id="questList" width="686" gap="16">
    <QuestRow id="quest1" scene="./QuestRow.scene" width="686" height="96" title="采集草药" />
  </VBoxContainer>
</ScrollContainer>
```

## Sprite-like Nodes

### Sprite

PixiJS 原生图片精灵。大多数 UI 图片优先用 `Image`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `texture` | string | 项目内图片资源路径。 |
| `anchorX` | number | 横向 anchor，常见 `0` 到 `1`。 |
| `anchorY` | number | 纵向 anchor，常见 `0` 到 `1`。 |
| `tint` | color | 图片 tint。 |

```xml
<Sprite id="sparkle" texture="assets/effects/sparkle.png" x="180" y="220" width="64" height="64" anchorX="0.5" anchorY="0.5" tint="#fff2a8" />
```

### NineSliceSprite

PixiJS 原生九宫格精灵。新 UI 背板通常优先用 `NineImage`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `texture` | string | 项目内图片资源路径。 |
| `anchorX` | number | 横向 anchor。 |
| `anchorY` | number | 纵向 anchor。 |
| `tint` | color | 图片 tint。 |
| `leftWidth` | number | 左侧不可拉伸区域宽度。 |
| `rightWidth` | number | 右侧不可拉伸区域宽度。 |
| `topHeight` | number | 顶部不可拉伸区域高度。 |
| `bottomHeight` | number | 底部不可拉伸区域高度。 |

```xml
<NineSliceSprite id="nativePanel" texture="assets/ui/panel.png" width="520" height="280" leftWidth="24" rightWidth="24" topHeight="24" bottomHeight="24" />
```

### TilingSprite

PixiJS 原生平铺精灵。新重复纹理通常优先用 `TileImage`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `texture` | string | 项目内图片资源路径。 |
| `anchorX` | number | 横向 anchor。 |
| `anchorY` | number | 纵向 anchor。 |
| `tint` | color | 图片 tint。 |
| `tilePositionX` | number | 纹理平铺横向偏移。 |
| `tilePositionY` | number | 纹理平铺纵向偏移。 |
| `tileScaleX` | number | 纹理平铺横向缩放。 |
| `tileScaleY` | number | 纹理平铺纵向缩放。 |
| `tileRotation` | number | 纹理平铺旋转弧度。 |

```xml
<TilingSprite id="nativePattern" texture="assets/bg/pattern.png" width="750" height="240" tileScaleX="0.5" tileScaleY="0.5" />
```

### Image

Pixifact runtime 图片盒子，推荐用于大多数 UI 图片、头像、图标和背景图。

| 属性 | 类型 | 可选值 / 说明 |
| --- | --- | --- |
| `texture` | string | 项目内图片资源路径。 |
| `fit` | enum | `stretch` / `contain` / `cover` / `none`。 |
| `anchorX` | number | 横向 anchor。 |
| `anchorY` | number | 纵向 anchor。 |
| `tint` | color | 图片 tint。 |

`fit="stretch"` 拉伸填满盒子；`contain` 完整显示，可能留空；`cover` 铺满盒子，可能裁切；`none` 使用原始尺寸绘制。

```xml
<Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
<Image id="avatar" texture="assets/characters/hero.png" left="24" top="24" width="96" height="96" fit="contain" />
```

### NineImage

Pixifact runtime 九宫格图片，推荐用于按钮底图、弹窗面板、提示气泡、卡片背景。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `texture` | string | 项目内图片资源路径。 |
| `leftWidth` | number | 左侧不可拉伸区域宽度。 |
| `rightWidth` | number | 右侧不可拉伸区域宽度。 |
| `topHeight` | number | 顶部不可拉伸区域高度。 |
| `bottomHeight` | number | 底部不可拉伸区域高度。 |
| `anchorX` | number | 横向 anchor。 |
| `anchorY` | number | 纵向 anchor。 |
| `tint` | color | 图片 tint。 |

```xml
<NineImage id="dialogPanel" texture="assets/ui/panel.png" horizontal="0" vertical="0" width="620" height="420" leftWidth="32" rightWidth="32" topHeight="32" bottomHeight="32" />
```

### TileImage

Pixifact runtime 平铺图片，推荐用于重复背景或可滚动纹理。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `texture` | string | 项目内图片资源路径。 |
| `tilePositionX` | number | 纹理平铺横向偏移。 |
| `tilePositionY` | number | 纹理平铺纵向偏移。 |
| `tileScaleX` | number | 纹理平铺横向缩放。 |
| `tileScaleY` | number | 纹理平铺纵向缩放。 |
| `tileRotation` | number | 纹理平铺旋转弧度。 |
| `anchorX` | number | 横向 anchor。 |
| `anchorY` | number | 纵向 anchor。 |
| `tint` | color | 图片 tint。 |

```xml
<TileImage id="groundPattern" texture="assets/bg/grass_tile.png" left="0" right="0" bottom="0" height="180" tileScaleX="2" tileScaleY="2" />
```

## Text Nodes

`Text`、`BitmapText`、`HTMLText` 支持相同文本属性。

| 属性 | 类型 | 可选值 / 说明 |
| --- | --- | --- |
| `text` | string | 文本内容。 |
| `fontSize` | number | 字号。 |
| `fontFamily` | string | 字体族或 bitmap font family。 |
| `fontWeight` | enum | `400` / `500` / `600` / `700` / `bold`，数字可写成数字或字符串。 |
| `fill` | color | 文本颜色。 |

`Text` 适合大多数静态或低频更新文本。`BitmapText` 适合大量文本或频繁变化数值。`HTMLText` 适合简单 HTML 标记；因为 `.scene` 是 XML-like 格式，`text` 中的 `<`、`>`、`&` 要写成实体。

```xml
<Text id="scoreLabel" text="Score 1200" right="24" top="28" fontSize="28" fontWeight="700" fill="#ffffff" />
<BitmapText id="damageNumber" text="-358" x="320" y="260" fontSize="36" fontFamily="DamageFont" fill="#ff4d4d" />
<HTMLText id="richTip" text="获得 &lt;b&gt;稀有&lt;/b&gt; 道具" width="420" fontSize="22" fill="#ffffff" />
```

## Graphics

当前在 `.scene` 中支持简单 `rect` 和 `roundRect`。UI 色块和面板背景通常优先用 `Rect`。

| 属性 | 类型 | 可选值 / 说明 |
| --- | --- | --- |
| `shape` | enum | `roundRect` / `rect`。只有设置 `shape` 时 compiler 才生成绘制调用。 |
| `radius` | number | `roundRect` 圆角半径。 |
| `fill` | color | 填充颜色。 |
| `fillAlpha` | number | 填充透明度。 |
| `strokeColor` | color | 描边颜色。 |
| `strokeWidth` | number | 描边宽度。 |
| `strokeAlpha` | number | 描边透明度。 |

```xml
<Graphics id="highlight" shape="roundRect" x="20" y="20" width="300" height="72" radius="12" fill="#fff3bf" fillAlpha="0.35" strokeColor="#ffd43b" strokeWidth="2" />
```

## Rect

Pixifact runtime 矩形节点，会按盒子尺寸自动重绘，适合 UI 背景、色块和描边框。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `fillColor` | color | 填充颜色。 |
| `fillAlpha` | number | 填充透明度。 |
| `strokeColor` | color | 描边颜色。 |
| `strokeAlpha` | number | 描边透明度。 |
| `strokeWidth` | number | 描边宽度。默认 `0`，即不显示描边。 |
| `radius` | number | 圆角半径。 |

```xml
<Rect id="cardBackground" width="320" height="180" radius="16" fillColor="#1f2937" fillAlpha="0.92" strokeColor="#facc15" strokeWidth="2" />
```

## 项目子 Scene 实例

除了官方基础对象，`.scene` 可以引用项目里的其他 Scene：

```xml
<PrimaryButton id="startButton" scene="./PrimaryButton.scene" horizontal="0" bottom="96" width="420" height="88" text="开始游戏" @click="startGame" />
```

子 Scene 实例可用属性：

| 属性来源 | 说明 |
| --- | --- |
| 通用属性 | `id`、Transform、Frame Layout、Display。 |
| `scene` | 引用的 `.scene` 文件路径，推荐写相对当前 Scene 的路径，例如 `./PrimaryButton.scene`。 |
| public props | 子 Scene 脚本中用 `@prop()` 暴露的属性。 |
| public events | 子 Scene 脚本中用 `@event()` 暴露的事件，用 `@eventName="actionName"` 绑定。 |
| public slots | 子 Scene 脚本中用 `@slot()` 暴露的 slot，父 Scene 用子节点的 `slot="name"` 填入。 |

事件绑定值是 action name。运行时会优先连接 external actions；没有对应 action 时，连接当前 root 脚本实例上的同名方法。

子 Scene 脚本示例：

```ts
import type { Container } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { createEvent, event, prop, scene, slot } from 'pixifact/compiler';

@scene()
export class PrimaryButton extends Group {
    @prop({ type: String, default: 'Button' })
    text = 'Button';

    @event()
    readonly click = createEvent();

    @slot()
    readonly icon!: Container;
}
```

Primitive public props 必须用 runtime constructor types：

```ts
@prop({ type: String, default: 'Button' })
text = 'Button';

@prop({ type: Number, default: 0 })
count = 0;

@prop({ type: Boolean, default: false })
disabled = false;
```

不要写旧字符串类型，例如 `@prop({ type: 'string' })`。

父 Scene 填充 slot：

```xml
<PrimaryButton id="startButton" scene="./PrimaryButton.scene" text="开始游戏" @click="startGame">
  <Image slot="icon" id="startIcon" texture="assets/icons/play.png" width="32" height="32" />
</PrimaryButton>
```

## Slot Outlet

`<slot>` 只能写在可复用 Scene 自己的 `.scene` 里，用来声明子内容挂载位置：

```xml
<Scene name="PrimaryButton" width="420" height="88">
  <NineImage id="background" texture="assets/ui/button.png" left="0" right="0" top="0" bottom="0" leftWidth="24" rightWidth="24" topHeight="24" bottomHeight="24" />
  <HBoxContainer id="content" horizontal="0" vertical="0" gap="12" alignY="center">
    <slot name="icon" />
    <Text id="label" text="Button" fontSize="28" fill="#ffffff" />
  </HBoxContainer>
</Scene>
```

`<slot />` 省略 `name` 时表示 `default` slot。

## Events

事件属性写在子 Scene instance 上，绑定值是 action name：

```xml
<PrimaryButton id="pauseButton" scene="./PrimaryButton.scene" text="暂停" @click="handlePause" />
```

事件名来自子 Scene 脚本的 `@event()`。运行时会优先连接 external actions；没有对应 action 时，连接当前 root 脚本实例上的同名方法。不要把事件写成全局函数或生成文件逻辑。

## Structured Props

结构化 props 使用 dot-path attributes，不要传 JSON string：

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

Scene script 中的 struct class 必须导出、可无参构造，public fields 必须有 primitive initializer：

```ts
export class RectTransform {
    x = 0;
    y = 0;
    width = 188;
    height = 48;
}

@scene()
export class RewardCard extends Group {
    @prop({ type: RectTransform })
    rectTransform = new RectTransform();
}
```

## 当前不要使用的标签

| 标签 | 说明 |
| --- | --- |
| `Group` | runtime 根和脚本基类，不是 `.scene` 标签。 |
| `Control` | runtime 布局基类，不是 `.scene` 标签。 |
| `Mesh` | parser 底层类型中仍有遗留入口，但不在官方可新增和校验支持列表中。 |
| `DOMContainer` | parser 底层类型中仍有遗留入口，但不在官方可新增和校验支持列表中。 |
| `FlexLayout` / `FlexItem` | 旧协议，不再是官方内置能力。 |

如果 `scene validate` 报 “supported compiler Pixi node type”，请把标签替换成官方基础对象，或改为带 `scene="..."` 的项目子 Scene 实例。

## 快速模板

```xml
<Scene name="Hud" width="750" height="1334">
  <Image id="background" texture="assets/bg/hud.png" left="0" right="0" top="0" bottom="0" fit="cover" />
  <VBoxContainer id="content" left="32" right="32" top="80" gap="16">
    <Text id="title" text="任务" fontSize="36" fontWeight="700" fill="#ffffff" />
    <QuestRow id="questRow" scene="./QuestRow.scene" width="686" height="96" title="采集草药" @click="openQuest" />
  </VBoxContainer>
</Scene>
```
