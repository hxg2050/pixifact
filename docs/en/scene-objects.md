# Scene Objects

Status: Active
Authority: Official objects, common props, object-specific props, use cases, and examples for Pixifact `.scene` files
Upstream: [../../README.en.md](../../README.en.md), [./index.md](./index.md), [./agent-scene-authoring.md](./agent-scene-authoring.md)
Downstream: [./layout.md](./layout.md)
Update rule: Update when the compiler Pixi node schema, Scene instance contract, slot syntax, runtime nodes, or `.scene` validation boundary changes.

[中文](../zh/scene-objects.md)

This page documents the objects that can be written directly in current `.scene` authoring. "Available" here means accepted by `scene validate` as official compiler Scene nodes.

## Basic Structure

Every `.scene` file must use `<Scene>` as its root:

```xml
<Scene name="Main" width="750" height="1334">
  <Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
  <VBoxContainer id="menu" horizontal="0" vertical="0" gap="16" alignX="center">
    <Text id="title" text="Adventure" fontSize="42" fill="#ffffff" />
  </VBoxContainer>
</Scene>
```

`<Scene>` is not an ordinary child node. It is only the file root; the runtime root node is `Group`. Recommended root attributes are:

| Prop | Type | Description |
| --- | --- | --- |
| `name` | string | Required. Must match the `@scene()` class name in the paired `.ts` file. |
| `width` | number | Optional Scene design width. If omitted, an entry Scene can use the project default resolution. |
| `height` | number | Optional Scene design height. If omitted, an entry Scene can use the project default resolution. |

`<Group>` is a direct Pixifact box container. Its `width` / `height` use stable Pixifact box-size semantics and it supports frame layout. `<Container>` keeps native PixiJS bounds / scale size semantics for pure grouping. `<Control>` remains a runtime layout base type and cannot be written directly as a `.scene` tag.

## Value Types

`.scene` props are written as XML attributes. The parser converts them according to the prop schema:

| Syntax | Type | Example |
| --- | --- | --- |
| Number | number | `x="24"`, `rotation="0.25"` |
| Boolean | boolean | `visible="false"` |
| String | string | `text="Start"`, `fontFamily="Inter"` |
| Color | number | `fill="#ffffff"`, `tint="#ffcc66"` |
| Enum | string or number | `fit="cover"`, `fontWeight="700"` |

Use `#rrggbb` for colors. Serialized color props keep that format. `texture` must be a project-relative asset path such as `assets/ui/button.png`; absolute paths, `./`, `..`, URLs, and backslash paths are rejected.

## Common Props

All official base objects and project child Scene instances can use these common props.

### Identity

| Prop | Type | Description |
| --- | --- | --- |
| `id` | string | Stable node ID. Editable nodes must have one; the compiler exposes it as a `@part`-accessible object. |

`id` is not a runtime prop, but it can be edited in the Inspector's Node section. The compiler also sets the Pixi `label` to this ID for debugging and selection; if the paired script references the old ID through `@part`, update that script as well.

### Transform

| Prop | Type | Description |
| --- | --- | --- |
| `x` | number | X coordinate for free positioning. |
| `y` | number | Y coordinate for free positioning. |
| `width` | number | Node width. Runtime semantics differ by object; see each object section. |
| `height` | number | Node height. |
| `scaleX` | number | Horizontal scale. |
| `scaleY` | number | Vertical scale. |
| `rotation` | number | Rotation in radians. |
| `pivotX` | number | Pivot X. |
| `pivotY` | number | Pivot Y. |
| `skewX` | number | Horizontal skew. |
| `skewY` | number | Vertical skew. |

### Frame Layout

| Prop | Type | Description |
| --- | --- | --- |
| `left` | number | Distance from the parent left edge. |
| `right` | number | Distance from the parent right edge. |
| `top` | number | Distance from the parent top edge. |
| `bottom` | number | Distance from the parent bottom edge. |
| `horizontal` | number | Offset from the parent horizontal center. |
| `vertical` | number | Offset from the parent vertical center. |

Horizontal priority is `left + right > left > right > horizontal > x`. Vertical priority is `top + bottom > top > bottom > vertical > y`. See [Layout](./layout.md) for the complete rules.

### Display

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `alpha` | number |  | Opacity, usually from `0` to `1`. |
| `visible` | boolean |  | Whether the node is visible. |
| `zIndex` | number |  | Sibling sort value. When set, the compiler enables `sortableChildren` on the parent. |
| `eventMode` | enum | `none` / `passive` / `auto` / `static` / `dynamic` | Pixi event mode. Use `static` for common clickable, draggable, or scroll-hit nodes. |
| `cursor` | enum | `default` / `pointer` / `text` / `grab` / `grabbing` | Mouse cursor style. |
| `label` | string |  | Pixi display object label. Prefer `id` in most authored scenes. |

## Official Base Objects

| Object | Allows Children | Common Use |
| --- | --- | --- |
| `Group` | Yes | Ordinary boxes with explicit size and frame layout. |
| `Container` | Yes | Lightweight grouping, moving, hiding, or sorting a set of children together. |
| `HBoxContainer` | Yes | Horizontal rows of buttons, icons, or resource bars. |
| `VBoxContainer` | Yes | Vertical menus, lists, and form rows. |
| `GridContainer` | Yes | Inventory slots, level cards, and fixed-column panels. |
| `ScrollContainer` | Yes | Scrollable lists, inventories, and quest panels. |
| `Sprite` | No | Simple image sprites with direct Pixi `Sprite` semantics. |
| `NineSliceSprite` | No | Native Pixi nine-slice sprites. |
| `TilingSprite` | No | Native Pixi tiled sprites. |
| `Label` | No | Box-sized UI text with alignment, wrapping, and clipping. |
| `BitmapLabel` | No | Box-sized UI text rendered with a bitmap font. |
| `Text` | No | Ordinary text. |
| `BitmapText` | No | Frequently updated or numerous text nodes when bitmap fonts are prepared. |
| `HTMLText` | No | Text that needs simple rich markup. |
| `Graphics` | No | Simple `rect` / `roundRect` vector shapes. |
| `Rect` | No | UI rectangles, rounded rectangles, color blocks, and bordered backgrounds. |
| `Image` | No | Box-sized images with `fit`; recommended for most UI images. |
| `NineImage` | No | Pixifact runtime nine-slice images; recommended for scalable UI backplates. |
| `TileImage` | No | Pixifact runtime tiled images; recommended for repeated textures and backgrounds. |

Leaf nodes cannot contain children. To put text on top of a background, wrap both nodes in a container or child Scene instead of nesting `Text` inside `Image`, `Rect`, `NineImage`, or another leaf node.

## Group

`Group` is a Pixifact box container that extends `Container`. It accepts children, and its `width` / `height` are explicit design-coordinate box sizes that do not change with child bounds or scaling. Use `<Group>` when an ordinary container needs a fixed size or frame layout.

Object-specific props: none. Use common props only.

`Group` does not draw a background or arrange children. Put a `Rect`, `Image`, or `NineImage` inside for a background; use `HBoxContainer`, `VBoxContainer`, or `GridContainer` for automatic layout.

```xml
<Group id="rewardPanel" left="24" right="24" top="160" height="140">
  <Rect id="background" left="0" right="0" top="0" bottom="0" radius="16" fillColor="#1f2937" />
  <Image id="coinIcon" texture="assets/icons/coin.png" x="24" y="46" width="48" height="48" />
  <Text id="coinAmount" text="+120" x="84" y="54" fontSize="28" fill="#ffd166" />
</Group>
```

## Container

`Container` is the native PixiJS container. Use it when you only need grouping, shared movement, shared visibility, or `zIndex` sorting.

Object-specific props: none. Use common props only.

Note: `Container.width` / `Container.height` keep native Pixi bounds / scale semantics. They are not Pixifact box sizes. Use `<Group>` or a layout container when you need stable box size and frame layout.

```xml
<Container id="rewardLayer" x="24" y="160" zIndex="10">
  <Image id="coinIcon" texture="assets/icons/coin.png" width="48" height="48" />
  <Text id="coinAmount" text="+120" x="60" y="8" fontSize="28" fill="#ffd166" />
</Container>
```

## HBoxContainer

`HBoxContainer` lays out direct children horizontally. It extends `Control`, so it can also use frame layout.

Object-specific props:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `gap` | number |  | Base horizontal spacing between children. |
| `alignY` | enum | `start` / `center` / `end` | Child alignment on the container's vertical axis. |
| `justify` | enum | `start` / `center` / `end` / `space-between` | Distribution of the whole child group on the container's horizontal axis. |

Use for toolbars, bottom button rows, and resource bars with an icon plus text.

```xml
<HBoxContainer id="resourceBar" right="24" top="24" width="260" height="56" gap="12" alignY="center" justify="end">
  <Image id="coinIcon" texture="assets/icons/coin.png" width="40" height="40" />
  <Text id="coinText" text="12,800" fontSize="24" fill="#ffffff" />
</HBoxContainer>
```

## VBoxContainer

`VBoxContainer` lays out direct children vertically. It extends `Control`, so it can also use frame layout.

Object-specific props:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `gap` | number |  | Base vertical spacing between children. |
| `alignX` | enum | `start` / `center` / `end` | Child alignment on the container's horizontal axis. |
| `justify` | enum | `start` / `center` / `end` / `space-between` | Distribution of the whole child group on the container's vertical axis. |

Use for main menus, vertical forms, dialog button groups, and quest rows.

```xml
<VBoxContainer id="mainMenu" horizontal="0" vertical="0" width="420" gap="18" alignX="center">
  <Text id="title" text="PIXIFACT" fontSize="48" fill="#ffffff" />
  <PrimaryButton id="startButton" scene="./PrimaryButton.scene" width="360" height="80" text="Start" />
  <PrimaryButton id="settingsButton" scene="./PrimaryButton.scene" width="360" height="80" text="Settings" />
</VBoxContainer>
```

## GridContainer

`GridContainer` lays out direct children left-to-right and top-to-bottom with a fixed column count. It extends `Control`, so it can also use frame layout.

Object-specific props:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `columns` | number |  | Column count. Runtime floors it and clamps it to at least `1`. |
| `gapX` | number |  | Column gap. |
| `gapY` | number |  | Row gap. |
| `alignX` | enum | `start` / `center` / `end` | Child alignment within each cell on the horizontal axis. |
| `alignY` | enum | `start` / `center` / `end` | Child alignment within each cell on the vertical axis. |

Use for inventory grids, skill slots, level selection, and fixed-column card walls.

```xml
<GridContainer id="inventoryGrid" left="32" right="32" top="160" height="520" columns="4" gapX="14" gapY="14" alignX="center" alignY="center">
  <ItemSlot id="slot1" scene="./ItemSlot.scene" width="128" height="128" />
  <ItemSlot id="slot2" scene="./ItemSlot.scene" width="128" height="128" />
  <ItemSlot id="slot3" scene="./ItemSlot.scene" width="128" height="128" />
</GridContainer>
```

## ScrollContainer

`ScrollContainer` provides a draggable scroll area. Authored children are mounted into an internal content layer and clipped to the container size.

Object-specific props:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `direction` | enum | `vertical` / `horizontal` / `both` | Scroll direction. |
| `scrollX` | number |  | Initial horizontal scroll position. |
| `scrollY` | number |  | Initial vertical scroll position. |

Use for quest lists, inventories, chat history, and long content panels. Current runtime supports dragging, wheel scrolling, elasticity, and inertia, but does not provide built-in scrollbars.

```xml
<ScrollContainer id="questScroll" left="32" right="32" top="180" bottom="120" direction="vertical">
  <VBoxContainer id="questList" width="686" gap="16">
    <QuestRow id="quest1" scene="./QuestRow.scene" width="686" height="96" title="Gather Herbs" />
    <QuestRow id="quest2" scene="./QuestRow.scene" width="686" height="96" title="Repair Bridge" />
  </VBoxContainer>
</ScrollContainer>
```

## Sprite

`Sprite` is the native PixiJS image sprite. Use it when you want direct Pixi `Sprite` behavior for a simple image. Prefer `Image` for most UI images because `Image` has stable box size and `fit`.

Object-specific props:

| Prop | Type | Description |
| --- | --- | --- |
| `texture` | string | Project-relative image asset path. |
| `anchorX` | number | Horizontal anchor, usually from `0` to `1`. |
| `anchorY` | number | Vertical anchor, usually from `0` to `1`. |
| `tint` | color | Image tint. |

```xml
<Sprite id="sparkle" texture="assets/effects/sparkle.png" x="180" y="220" width="64" height="64" anchorX="0.5" anchorY="0.5" tint="#fff2a8" />
```

## NineSliceSprite

`NineSliceSprite` is the native PixiJS nine-slice sprite. Use it when you already need native Pixi nine-slice behavior. Prefer `NineImage` for new UI backplates.

Object-specific props:

| Prop | Type | Description |
| --- | --- | --- |
| `texture` | string | Project-relative image asset path. |
| `anchorX` | number | Horizontal anchor. |
| `anchorY` | number | Vertical anchor. |
| `tint` | color | Image tint. |
| `leftWidth` | number | Width of the non-stretched left region. |
| `rightWidth` | number | Width of the non-stretched right region. |
| `topHeight` | number | Height of the non-stretched top region. |
| `bottomHeight` | number | Height of the non-stretched bottom region. |

```xml
<NineSliceSprite id="nativePanel" texture="assets/ui/panel.png" width="520" height="280" leftWidth="24" rightWidth="24" topHeight="24" bottomHeight="24" />
```

## TilingSprite

`TilingSprite` is the native PixiJS tiled sprite. Use it when you already need native Pixi tiling behavior. Prefer `TileImage` for new repeated textures.

Object-specific props:

| Prop | Type | Description |
| --- | --- | --- |
| `texture` | string | Project-relative image asset path. |
| `anchorX` | number | Horizontal anchor. |
| `anchorY` | number | Vertical anchor. |
| `tint` | color | Image tint. |
| `tilePositionX` | number | Horizontal tiled texture offset. |
| `tilePositionY` | number | Vertical tiled texture offset. |
| `tileScaleX` | number | Horizontal tiled texture scale. |
| `tileScaleY` | number | Vertical tiled texture scale. |
| `tileRotation` | number | Tiled texture rotation in radians. |

```xml
<TilingSprite id="nativePattern" texture="assets/bg/pattern.png" width="750" height="240" tileScaleX="0.5" tileScaleY="0.5" />
```

## Image

`Image` is the Pixifact runtime image box. It is recommended for most UI images, avatars, icons, and backgrounds.

Object-specific props:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `texture` | string |  | Project-relative image asset path. |
| `fit` | enum | `stretch` / `contain` / `cover` / `none` | How the image fits into the `width` / `height` box. |
| `anchorX` | number |  | Horizontal anchor. |
| `anchorY` | number |  | Vertical anchor. |
| `tint` | color |  | Image tint. |

Use for full-screen backgrounds, avatars, icons, illustrations, and images that should crop or scale inside a box.

```xml
<Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
<Image id="avatar" texture="assets/characters/hero.png" left="24" top="24" width="96" height="96" fit="contain" />
```

## NineImage

`NineImage` is the Pixifact runtime nine-slice image. It is recommended for scalable UI backplates.

Object-specific props:

| Prop | Type | Description |
| --- | --- | --- |
| `texture` | string | Project-relative image asset path. |
| `leftWidth` | number | Width of the non-stretched left region. |
| `rightWidth` | number | Width of the non-stretched right region. |
| `topHeight` | number | Height of the non-stretched top region. |
| `bottomHeight` | number | Height of the non-stretched bottom region. |
| `anchorX` | number | Horizontal anchor. |
| `anchorY` | number | Vertical anchor. |
| `tint` | color | Image tint. |

Use for button backgrounds, dialogs, bubbles, and card backgrounds.

```xml
<NineImage id="dialogPanel" texture="assets/ui/panel.png" horizontal="0" vertical="0" width="620" height="420" leftWidth="32" rightWidth="32" topHeight="32" bottomHeight="32" />
```

## TileImage

`TileImage` is the Pixifact runtime tiled image. It is recommended for repeated textures and backgrounds.

Object-specific props:

| Prop | Type | Description |
| --- | --- | --- |
| `texture` | string | Project-relative image asset path. |
| `tilePositionX` | number | Horizontal tiled texture offset. |
| `tilePositionY` | number | Vertical tiled texture offset. |
| `tileScaleX` | number | Horizontal tiled texture scale. |
| `tileScaleY` | number | Vertical tiled texture scale. |
| `tileRotation` | number | Tiled texture rotation in radians. |
| `anchorX` | number | Horizontal anchor. |
| `anchorY` | number | Vertical anchor. |
| `tint` | color | Image tint. |

Use for ground textures, repeated backgrounds, moving textures, and decorative tiled strips.

```xml
<TileImage id="groundPattern" texture="assets/bg/grass_tile.png" left="0" right="0" bottom="0" height="180" tileScaleX="2" tileScaleY="2" />
```

## Label

`Label` is the recommended Pixifact text box for UI. Its `width` / `height` define a layout box without scaling the rendered text; `fontSize` only changes typography and layout; `scaleX` / `scaleY` scale the entire control. The default box is `120 x 28`.

Object-specific props:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `text` | string |  | Text content. |
| `fontSize` | number |  | Font size. |
| `fontFamily` | string |  | Font family. |
| `fontWeight` | enum | `400` / `500` / `600` / `700` / `bold` | Font weight. Numbers can be written as numbers or strings. |
| `fill` | color |  | Text color. |
| `lineHeight` | number |  | Line height; `0` uses the natural font line height. |
| `letterSpacing` | number |  | Spacing between characters. |
| `wordWrap` | boolean |  | Whether text wraps to the current `width`. |
| `alignX` | enum | `start` / `center` / `end` | Horizontal alignment inside the box. |
| `alignY` | enum | `start` / `center` / `end` | Vertical alignment inside the box. |
| `overflow` | enum | `visible` / `clip` | Whether text outside the box remains visible. |

```xml
<Label id="title" left="24" right="24" top="32" height="52" text="Inventory" fontSize="28" fontWeight="700" fill="#ffffff" alignX="center" alignY="center" />
<Label id="description" width="420" height="120" text="A longer description that wraps inside its box" fontSize="20" lineHeight="28" wordWrap="true" overflow="clip" />
```

## BitmapLabel

`BitmapLabel` has the same layout box, typography, wrapping, alignment, and clipping props as `Label`, but renders through PixiJS `BitmapText`. Use it for bitmap-font counters, scores, damage numbers, and other text that must participate in UI layout.

Load the `.fnt` through PixiJS `Assets.load()` before instantiating the Scene. `fontFamily` must match the family declared by the bitmap font. The Editor does not execute project scripts, so Authoring Preview remains safe while the running game uses the registered bitmap font.

```ts
await Assets.load('assets/fonts/ant_count.fnt');
```

```xml
<BitmapLabel id="gold" width="160" height="48" text="1280" fontFamily="寒蝉圆黑体Heavy" fontSize="32" fill="#ffdb84" alignX="end" alignY="center" />
```

## Text

`Text` is the native Pixi text node. It has no invented authoring width or height; explicitly setting `width` / `height` resizes text through scale rather than creating a layout box. Prefer `Label` for ordinary UI text.

Object-specific props:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `text` | string |  | Text content. |
| `fontSize` | number |  | Font size. |
| `fontFamily` | string |  | Font family. |
| `fontWeight` | enum | `400` / `500` / `600` / `700` / `bold` | Font weight. Numbers can be written as numbers or strings. |
| `fill` | color |  | Text color. |

```xml
<Text id="scoreLabel" text="Score 1200" right="24" top="28" fontSize="28" fontWeight="700" fill="#ffffff" />
```

## BitmapText

`BitmapText` renders with a bitmap font. Use it for lots of text or frequently changing numeric text. Make sure the runtime font assets are prepared before using it.

Its object-specific props are the same as `Text`:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `text` | string |  | Text content. |
| `fontSize` | number |  | Font size. |
| `fontFamily` | string |  | Bitmap font family. |
| `fontWeight` | enum | `400` / `500` / `600` / `700` / `bold` | Font weight. |
| `fill` | color |  | Text color. |

```xml
<BitmapText id="damageNumber" text="-358" x="320" y="260" fontSize="36" fontFamily="DamageFont" fill="#ff4d4d" />
```

## HTMLText

`HTMLText` is useful when text needs simple HTML markup. Because `.scene` uses an XML-like format, write `<`, `>`, and `&` in `text` as entities.

Its object-specific props are the same as `Text`:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `text` | string |  | Text content, optionally with escaped simple HTML. |
| `fontSize` | number |  | Font size. |
| `fontFamily` | string |  | Font family. |
| `fontWeight` | enum | `400` / `500` / `600` / `700` / `bold` | Font weight. |
| `fill` | color |  | Text color. |

```xml
<HTMLText id="richTip" text="Found a &lt;b&gt;Rare&lt;/b&gt; item" fontSize="22" fill="#ffffff" />
```

## Graphics

`Graphics` currently supports simple `rect` and `roundRect` authoring in `.scene`. Use it for temporary vector shapes or when you need a node close to Pixi `Graphics`. Prefer `Rect` for UI color blocks and panel backgrounds.

Object-specific props:

| Prop | Type | Values | Description |
| --- | --- | --- | --- |
| `shape` | enum | `roundRect` / `rect` | Shape to draw. The compiler only emits drawing calls when `shape` is set. |
| `radius` | number |  | Corner radius for `roundRect`. |
| `fill` | color |  | Fill color. |
| `fillAlpha` | number |  | Fill opacity. |
| `strokeColor` | color |  | Stroke color. |
| `strokeWidth` | number |  | Stroke width. |
| `strokeAlpha` | number |  | Stroke opacity. |

```xml
<Graphics id="highlight" shape="roundRect" x="20" y="20" width="300" height="72" radius="12" fill="#fff3bf" fillAlpha="0.35" strokeColor="#ffd43b" strokeWidth="2" />
```

## Rect

`Rect` is the Pixifact runtime rectangle node. It redraws itself from its box size and works well for UI backgrounds, color blocks, and debug frames.

Object-specific props:

| Prop | Type | Description |
| --- | --- | --- |
| `fillColor` | color | Fill color. |
| `fillAlpha` | number | Fill opacity. |
| `strokeColor` | color | Stroke color. |
| `strokeAlpha` | number | Stroke opacity. |
| `strokeWidth` | number | Stroke width. Default is `0`, so no border is visible by default. |
| `radius` | number | Corner radius. Runtime clamps it to at most half the width or height. |

```xml
<Rect id="cardBackground" width="320" height="180" radius="16" fillColor="#1f2937" fillAlpha="0.92" strokeColor="#facc15" strokeWidth="2" />
```

## Project Child Scene Instances

In addition to official base objects, `.scene` files can reference other project Scenes:

```xml
<PrimaryButton id="startButton" scene="./PrimaryButton.scene" horizontal="0" bottom="96" width="420" height="88" text="Start Game" @click="startGame" />
```

Child Scene instance capabilities come from these sources:

| Source | Description |
| --- | --- |
| Common props | `id`, Transform, Frame Layout, and Display. |
| `scene` | Referenced `.scene` file path. Prefer paths relative to the current Scene, such as `./PrimaryButton.scene`. |
| Public props | Props exposed with `@prop()` in the child Scene script. |
| Public events | Events exposed with `@event()` in the child Scene script; bind them with `@eventName="actionName"`. |
| Public slots | Slots exposed with `@slot()` in the child Scene script; parent Scenes fill them with child nodes using `slot="name"`. |

The event binding value is an action name. At runtime, Pixifact first connects matching external actions; if none exists, it connects a method with the same name on the current root script instance.

Child Scene script example:

```ts
import type { Container } from 'pixi.js';
import { Group } from 'pixifact/runtime';
import { createEvent, event, prop, scene, slot } from 'pixifact/scene';

@scene()
export class PrimaryButton extends Group {
    @prop({ default: 'Button' })
    declare text: string;

    @event()
    readonly click = createEvent();

    @slot()
    readonly icon!: Container;
}
```

Public Props must be `declare` properties with no initializer, and their types are inferred from TypeScript. The child Scene consumes them with whole-value bindings in its own `.scene`:

```xml
<Text id="labelText" text="{text}" />
```

Use `defineVariants()` for reusable style branches and bind them through `{tone.field}`. Expressions, interpolation, and user getters/setters are not supported.

Parent Scene filling a slot:

```xml
<PrimaryButton id="startButton" scene="./PrimaryButton.scene" text="Start Game" @click="startGame">
  <Image slot="icon" id="startIcon" texture="assets/icons/play.png" width="32" height="32" />
</PrimaryButton>
```

Structured props use dot-path attributes:

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

Do not write structured props as JSON strings. See [Agent Scene Authoring](./agent-scene-authoring.md) for the complete Scene script contract rules.

## Slot Outlet

`<slot>` can only be written inside a reusable Scene's own `.scene` file. It declares where child content should mount:

```xml
<Scene name="PrimaryButton" width="420" height="88">
  <NineImage id="background" texture="assets/ui/button.png" left="0" right="0" top="0" bottom="0" leftWidth="24" rightWidth="24" topHeight="24" bottomHeight="24" />
  <HBoxContainer id="content" horizontal="0" vertical="0" gap="12" alignY="center">
    <slot name="icon" />
    <Text id="label" text="Button" fontSize="28" fill="#ffffff" />
  </HBoxContainer>
</Scene>
```

`<slot />` without `name` means the `default` slot.

## Do Not Use These Tags

These names are not current official `.scene` objects:

| Tag | Description |
| --- | --- |
| `Control` | Runtime layout base class, not a `.scene` tag. |
| `Mesh` | Still present in a low-level parser/type list, but not in the official addable or validation-supported list. |
| `DOMContainer` | Still present in a low-level parser/type list, but not in the official addable or validation-supported list. |
| `FlexLayout` / `FlexItem` | Retired protocol; no longer an official built-in capability. |

If `scene validate` reports "supported compiler Pixi node type", replace the tag with an official base object or make it a project child Scene instance with `scene="..."`.
