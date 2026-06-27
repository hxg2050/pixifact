# Scene Objects

状态：活跃
权威范围：Pixifact `.scene` 中官方可写对象、通用属性、对象专属属性、适用场景和示例
上游文档：[../../README.md](../../README.md)、[./index.md](./index.md)、[./agent-scene-authoring.md](./agent-scene-authoring.md)
下游文档：[./layout.md](./layout.md)
更新规则：修改 compiler Pixi node schema、Scene instance contract、slot 语法、runtime 节点或 `.scene` 校验边界时更新

本页描述当前 `.scene` authoring 中可以直接写的对象。这里的“可用”以 `scene validate` 接受的官方 compiler Scene 节点为准。

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

`<Scene>` 不是普通子节点。它只作为文件根，运行时根节点是 `Group`。根标签推荐只写：

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 必填。必须与同名 `.ts` 文件中的 `@scene()` class 名一致。 |
| `width` | number | 可选。Scene 设计宽度。省略时，入口 Scene 可使用项目默认分辨率。 |
| `height` | number | 可选。Scene 设计高度。省略时，入口 Scene 可使用项目默认分辨率。 |

`Group` 和 `Control` 是 runtime 类型，不是可直接写的 `.scene` 标签。不要写 `<Group>` 或 `<Control>`；需要容器时用 `Container`、布局容器、子 Scene 实例，或项目自己的 Scene 脚本。

## 值类型

`.scene` 属性值都写在 XML attribute 中，parser 会按属性 schema 转成类型：

| 写法 | 类型 | 示例 |
| --- | --- | --- |
| 数字 | number | `x="24"`、`rotation="0.25"` |
| 布尔 | boolean | `visible="false"` |
| 字符串 | string | `text="Start"`、`fontFamily="Inter"` |
| 颜色 | number | `fill="#ffffff"`、`tint="#ffcc66"` |
| 枚举 | string 或 number | `fit="cover"`、`fontWeight="700"` |

颜色推荐写 `#rrggbb`。序列化后颜色属性也会保持这种格式。`texture` 必须是项目内相对资源路径，例如 `assets/ui/button.png`，不能使用绝对路径、`./`、`..`、URL 或反斜杠路径。

## 通用属性

所有官方基础对象，以及项目子 Scene 实例，都可以使用这些通用属性。

### 标识

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 节点稳定 ID。可编辑节点必须写，compiler 会把它暴露为 `@part` 可访问对象。 |

`id` 不是 runtime prop，不会出现在 Inspector 的普通属性组里。compiler 会同时把节点的 Pixi `label` 设为这个 ID，方便调试和选择。

### Transform

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `x` | number | 自由定位时的横坐标。 |
| `y` | number | 自由定位时的纵坐标。 |
| `width` | number | 节点宽度。不同节点对宽高的运行时语义不同，见各对象说明。 |
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

横向同轴优先级是 `left + right > left > right > horizontal > x`。纵向同轴优先级是 `top + bottom > top > bottom > vertical > y`。完整规则见 [Layout](./layout.md)。

### Display

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `alpha` | number |  | 透明度，通常使用 `0` 到 `1`。 |
| `visible` | boolean |  | 是否显示。 |
| `zIndex` | number |  | 同级排序值。设置后父节点会启用 `sortableChildren`。 |
| `eventMode` | enum | `none` / `passive` / `auto` / `static` / `dynamic` | Pixi 事件模式。需要点击、拖拽或滚动命中时常用 `static`。 |
| `cursor` | enum | `default` / `pointer` / `text` / `grab` / `grabbing` | 鼠标指针样式。 |
| `label` | string |  | Pixi display object label。通常优先使用 `id`。 |

## 官方基础对象总览

| 对象 | 是否可放子节点 | 适合场景 |
| --- | --- | --- |
| `Container` | 是 | 轻量分组、统一移动或排序一组子节点。 |
| `HBoxContainer` | 是 | 横向排列按钮、图标、资源条。 |
| `VBoxContainer` | 是 | 纵向菜单、列表、表单项。 |
| `GridContainer` | 是 | 背包格子、关卡卡片、固定列数面板。 |
| `ScrollContainer` | 是 | 可滚动列表、背包、任务面板。 |
| `Sprite` | 否 | 简单图片精灵，直接使用 Pixi `Sprite` 语义。 |
| `NineSliceSprite` | 否 | Pixi 原生九宫格精灵。 |
| `TilingSprite` | 否 | Pixi 原生平铺精灵。 |
| `Text` | 否 | 普通文本。 |
| `BitmapText` | 否 | 高频更新或大量文本，依赖 bitmap font 准备。 |
| `HTMLText` | 否 | 需要简单富文本标记的文本。 |
| `Graphics` | 否 | 简单 `rect` / `roundRect` 矢量形状。 |
| `Rect` | 否 | UI 矩形、圆角矩形、色块、描边背景。 |
| `Image` | 否 | 带盒子尺寸和 `fit` 的图片，推荐用于大多数 UI 图片。 |
| `NineImage` | 否 | Pixifact runtime 九宫格图片，推荐用于可缩放 UI 背板。 |
| `TileImage` | 否 | Pixifact runtime 平铺图片，推荐用于重复纹理和背景。 |

叶子节点不能放子节点。需要把文字放到背景上时，用容器或子 Scene 包起来，而不是把 `Text` 写进 `Image`、`Rect`、`NineImage` 等叶子节点里。

## Container

`Container` 是 PixiJS 原生容器，适合只需要分组、统一位移、统一显示隐藏或 `zIndex` 排序的场景。

专属属性：无。只使用通用属性。

注意：`Container.width` / `Container.height` 保持 Pixi 原生 bounds / scale 语义，不是 Pixifact 盒子尺寸。需要稳定盒子尺寸和 frame layout 心智时，优先使用布局容器、`Rect` / `Image` / `NineImage` / `TileImage`，或继承 `Group` 的项目 Scene。

```xml
<Container id="rewardLayer" x="24" y="160" zIndex="10">
  <Image id="coinIcon" texture="assets/icons/coin.png" width="48" height="48" />
  <Text id="coinAmount" text="+120" x="60" y="8" fontSize="28" fill="#ffd166" />
</Container>
```

## HBoxContainer

`HBoxContainer` 横向排列直接子节点。它继承 `Control`，自身可以使用 frame layout。

专属属性：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `gap` | number |  | 子节点之间的基础横向间距。 |
| `alignY` | enum | `start` / `center` / `end` | 子节点在容器纵向上的对齐。 |
| `justify` | enum | `start` / `center` / `end` / `space-between` | 整组子节点在容器横向上的分布。 |

适合：工具栏、底部按钮组、图标加数字的资源条。

```xml
<HBoxContainer id="resourceBar" right="24" top="24" width="260" height="56" gap="12" alignY="center" justify="end">
  <Image id="coinIcon" texture="assets/icons/coin.png" width="40" height="40" />
  <Text id="coinText" text="12,800" fontSize="24" fill="#ffffff" />
</HBoxContainer>
```

## VBoxContainer

`VBoxContainer` 纵向排列直接子节点。它继承 `Control`，自身可以使用 frame layout。

专属属性：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `gap` | number |  | 子节点之间的基础纵向间距。 |
| `alignX` | enum | `start` / `center` / `end` | 子节点在容器横向上的对齐。 |
| `justify` | enum | `start` / `center` / `end` / `space-between` | 整组子节点在容器纵向上的分布。 |

适合：主菜单、纵向表单、弹窗按钮组、任务条目列表。

```xml
<VBoxContainer id="mainMenu" horizontal="0" vertical="0" width="420" gap="18" alignX="center">
  <Text id="title" text="PIXIFACT" fontSize="48" fill="#ffffff" />
  <PrimaryButton id="startButton" scene="./PrimaryButton.scene" width="360" height="80" text="开始" />
  <PrimaryButton id="settingsButton" scene="./PrimaryButton.scene" width="360" height="80" text="设置" />
</VBoxContainer>
```

## GridContainer

`GridContainer` 按固定列数从左到右、从上到下排列直接子节点。它继承 `Control`，自身可以使用 frame layout。

专属属性：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `columns` | number |  | 列数。运行时会向下取整，并至少为 `1`。 |
| `gapX` | number |  | 列间距。 |
| `gapY` | number |  | 行间距。 |
| `alignX` | enum | `start` / `center` / `end` | 子节点在单元格横向上的对齐。 |
| `alignY` | enum | `start` / `center` / `end` | 子节点在单元格纵向上的对齐。 |

适合：背包、技能格、关卡选择、固定列卡片墙。

```xml
<GridContainer id="inventoryGrid" left="32" right="32" top="160" height="520" columns="4" gapX="14" gapY="14" alignX="center" alignY="center">
  <ItemSlot id="slot1" scene="./ItemSlot.scene" width="128" height="128" />
  <ItemSlot id="slot2" scene="./ItemSlot.scene" width="128" height="128" />
  <ItemSlot id="slot3" scene="./ItemSlot.scene" width="128" height="128" />
</GridContainer>
```

## ScrollContainer

`ScrollContainer` 提供可拖拽滚动区域。作者写进去的子节点会挂到内部 content layer，并被容器尺寸裁剪。

专属属性：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `direction` | enum | `vertical` / `horizontal` / `both` | 滚动方向。 |
| `scrollX` | number |  | 初始横向滚动位置。 |
| `scrollY` | number |  | 初始纵向滚动位置。 |

适合：任务列表、背包列表、聊天记录、长内容面板。当前运行时支持拖拽、滚轮、弹性和惯性，不提供内置滚动条。

```xml
<ScrollContainer id="questScroll" left="32" right="32" top="180" bottom="120" direction="vertical">
  <VBoxContainer id="questList" width="686" gap="16">
    <QuestRow id="quest1" scene="./QuestRow.scene" width="686" height="96" title="采集草药" />
    <QuestRow id="quest2" scene="./QuestRow.scene" width="686" height="96" title="修理木桥" />
  </VBoxContainer>
</ScrollContainer>
```

## Sprite

`Sprite` 是 PixiJS 原生图片精灵。它适合直接使用 Pixi `Sprite` 行为的简单图片。大多数 UI 图片优先用 `Image`，因为 `Image` 有稳定盒子尺寸和 `fit`。

专属属性：

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `texture` | string | 项目内图片资源路径。 |
| `anchorX` | number | 横向 anchor，常见范围 `0` 到 `1`。 |
| `anchorY` | number | 纵向 anchor，常见范围 `0` 到 `1`。 |
| `tint` | color | 图片 tint。 |

```xml
<Sprite id="sparkle" texture="assets/effects/sparkle.png" x="180" y="220" width="64" height="64" anchorX="0.5" anchorY="0.5" tint="#fff2a8" />
```

## NineSliceSprite

`NineSliceSprite` 是 PixiJS 原生九宫格精灵，适合已经依赖 Pixi 原生 nine-slice 行为的场景。新 UI 背板通常优先用 `NineImage`。

专属属性：

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

## TilingSprite

`TilingSprite` 是 PixiJS 原生平铺精灵，适合已经依赖 Pixi 原生 tiling 行为的场景。新重复纹理通常优先用 `TileImage`。

专属属性：

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

## Image

`Image` 是 Pixifact runtime 图片盒子，推荐用于大多数 UI 图片、头像、图标和背景图。

专属属性：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `texture` | string |  | 项目内图片资源路径。 |
| `fit` | enum | `stretch` / `contain` / `cover` / `none` | 图片如何放进 `width` / `height` 盒子。 |
| `anchorX` | number |  | 横向 anchor。 |
| `anchorY` | number |  | 纵向 anchor。 |
| `tint` | color |  | 图片 tint。 |

适合：全屏背景、头像、图标、插画、可按盒子裁切或等比适配的图片。

```xml
<Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
<Image id="avatar" texture="assets/characters/hero.png" left="24" top="24" width="96" height="96" fit="contain" />
```

## NineImage

`NineImage` 是 Pixifact runtime 九宫格图片，推荐用于可缩放 UI 背板。

专属属性：

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

适合：按钮底图、弹窗面板、提示气泡、卡片背景。

```xml
<NineImage id="dialogPanel" texture="assets/ui/panel.png" horizontal="0" vertical="0" width="620" height="420" leftWidth="32" rightWidth="32" topHeight="32" bottomHeight="32" />
```

## TileImage

`TileImage` 是 Pixifact runtime 平铺图片，推荐用于重复纹理和背景。

专属属性：

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

适合：地面纹理、重复背景、流动纹理、可平铺装饰带。

```xml
<TileImage id="groundPattern" texture="assets/bg/grass_tile.png" left="0" right="0" bottom="0" height="180" tileScaleX="2" tileScaleY="2" />
```

## Text

`Text` 是普通 Pixi 文本节点，适合大多数静态或低频更新文本。

专属属性：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `text` | string |  | 文本内容。 |
| `fontSize` | number |  | 字号。 |
| `fontFamily` | string |  | 字体族。 |
| `fontWeight` | enum | `400` / `500` / `600` / `700` / `bold` | 字重。数字可写成数字或字符串。 |
| `fill` | color |  | 文本颜色。 |

```xml
<Text id="scoreLabel" text="Score 1200" right="24" top="28" fontSize="28" fontWeight="700" fill="#ffffff" />
```

## BitmapText

`BitmapText` 使用 bitmap font 渲染，适合大量文本或频繁变化的数值文本。使用前应确保运行时字体资源准备好。

专属属性与 `Text` 相同：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `text` | string |  | 文本内容。 |
| `fontSize` | number |  | 字号。 |
| `fontFamily` | string |  | bitmap font family。 |
| `fontWeight` | enum | `400` / `500` / `600` / `700` / `bold` | 字重。 |
| `fill` | color |  | 文本颜色。 |

```xml
<BitmapText id="damageNumber" text="-358" x="320" y="260" fontSize="36" fontFamily="DamageFont" fill="#ff4d4d" />
```

## HTMLText

`HTMLText` 适合需要简单 HTML 标记的文本。因为 `.scene` 是 XML-like 格式，`text` 中的 `<`、`>`、`&` 要写成实体。

专属属性与 `Text` 相同：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `text` | string |  | 文本内容，可包含转义后的简单 HTML。 |
| `fontSize` | number |  | 字号。 |
| `fontFamily` | string |  | 字体族。 |
| `fontWeight` | enum | `400` / `500` / `600` / `700` / `bold` | 字重。 |
| `fill` | color |  | 文本颜色。 |

```xml
<HTMLText id="richTip" text="获得 &lt;b&gt;稀有&lt;/b&gt; 道具" width="420" fontSize="22" fill="#ffffff" />
```

## Graphics

`Graphics` 当前在 `.scene` 中支持简单 `rect` 和 `roundRect`。它适合临时矢量形状或需要直接贴近 Pixi `Graphics` 的节点。UI 色块和面板背景通常优先用 `Rect`。

专属属性：

| 属性 | 类型 | 可选值 | 说明 |
| --- | --- | --- | --- |
| `shape` | enum | `roundRect` / `rect` | 绘制形状。只有设置 `shape` 时 compiler 才生成绘制调用。 |
| `radius` | number |  | `roundRect` 圆角半径。 |
| `fill` | color |  | 填充颜色。 |
| `fillAlpha` | number |  | 填充透明度。 |
| `strokeColor` | color |  | 描边颜色。 |
| `strokeWidth` | number |  | 描边宽度。 |
| `strokeAlpha` | number |  | 描边透明度。 |

```xml
<Graphics id="highlight" shape="roundRect" x="20" y="20" width="300" height="72" radius="12" fill="#fff3bf" fillAlpha="0.35" strokeColor="#ffd43b" strokeWidth="2" />
```

## Rect

`Rect` 是 Pixifact runtime 矩形节点，会按盒子尺寸自动重绘，适合 UI 背景、遮罩感色块和调试框。

专属属性：

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `fillColor` | color | 填充颜色。 |
| `fillAlpha` | number | 填充透明度。 |
| `strokeColor` | color | 描边颜色。 |
| `strokeAlpha` | number | 描边透明度。 |
| `strokeWidth` | number | 描边宽度。默认 `0`，即不显示描边。 |
| `radius` | number | 圆角半径。运行时会限制到不超过宽高一半。 |

```xml
<Rect id="cardBackground" width="320" height="180" radius="16" fillColor="#1f2937" fillAlpha="0.92" strokeColor="#facc15" strokeWidth="2" />
```

## 项目子 Scene 实例

除了官方基础对象，`.scene` 可以引用项目里的其他 Scene：

```xml
<PrimaryButton id="startButton" scene="./PrimaryButton.scene" horizontal="0" bottom="96" width="420" height="88" text="开始游戏" @click="startGame" />
```

子 Scene 实例可用能力由这些部分组成：

| 属性来源 | 说明 |
| --- | --- |
| 通用属性 | `id`、Transform、Frame Layout、Display。 |
| `scene` | 引用的 `.scene` 文件路径。推荐写相对当前 Scene 的路径，例如 `./PrimaryButton.scene`。 |
| public props | 子 Scene 脚本中用 `@prop()` 暴露的属性。 |
| public events | 子 Scene 脚本中用 `@event()` 暴露的事件，用 `@eventName="actionName"` 绑定。 |
| public slots | 子 Scene 脚本中用 `@slot()` 暴露的 slot，父 Scene 用子节点的 `slot="name"` 填入。 |

子 Scene 脚本示例：

```ts
@scene()
export class PrimaryButton extends Group {
    @prop({ type: String, default: 'Button' })
    text = 'Button';

    @event()
    click = new EventEmitter<void>();

    @slot()
    icon!: Container;
}
```

父 Scene 填充 slot：

```xml
<PrimaryButton id="startButton" scene="./PrimaryButton.scene" text="开始游戏" @click="startGame">
  <Image slot="icon" id="startIcon" texture="assets/icons/play.png" width="32" height="32" />
</PrimaryButton>
```

结构化 props 使用 dot-path：

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

不要把 structured prop 写成 JSON 字符串。完整 Scene 脚本契约规则见 [Agent Scene Authoring](./agent-scene-authoring.md)。

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

## 当前不要使用的标签

这些名字不是当前官方 `.scene` 对象：

| 标签 | 说明 |
| --- | --- |
| `Group` | runtime 根和脚本基类，不是 `.scene` 标签。 |
| `Control` | runtime 布局基类，不是 `.scene` 标签。 |
| `Mesh` | parser 底层类型中仍有遗留入口，但不在官方可新增和校验支持列表中。 |
| `DOMContainer` | parser 底层类型中仍有遗留入口，但不在官方可新增和校验支持列表中。 |
| `FlexLayout` / `FlexItem` | 旧协议，不再是官方内置能力。 |

如果 `scene validate` 报 “supported compiler Pixi node type”，请把标签替换成官方基础对象，或改为带 `scene="..."` 的项目子 Scene 实例。
