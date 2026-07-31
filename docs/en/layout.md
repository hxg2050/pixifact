# Layout

Status: Active
Authority: Pixifact design resolution, viewport adaptation, frame layout, layout containers, and Editor layout behavior
Upstream: [../../README.en.md](../../README.en.md), [./index.md](./index.md)
Downstream: [./agent-scene-authoring.md](./agent-scene-authoring.md)
Update rule: Update when the runtime layout protocol, viewport modes, layout containers, or Inspector layout interaction changes.

[中文](../zh/layout.md)

## Mental Model

Pixifact layout has two layers:

1. Project viewport adaptation: map the design resolution to the real screen.
2. Scene layout: use `left/right/top/bottom/horizontal/vertical` to place children inside a parent box.

The project design resolution comes from `pixifact.project.json`:

```json
{
  "version": 1,
  "name": "adventure-ui-demo",
  "resolution": {
    "width": 750,
    "height": 1334
  },
  "viewport": {
    "mode": "showAll"
  },
  "scenes": {
    "main": "src/scenes/Main.scene"
  }
}
```

If `resolution` is omitted, the default design resolution is `750 x 1334`. This is the development coordinate system, not the final device pixel size.

## Viewport Modes

`viewport.mode` decides how design coordinates map to the real screen.

| Mode | Behavior | Common Use |
| --- | --- | --- |
| `showAll` | Show the full design resolution; mismatched aspect ratios leave empty bars | Default safe mode when content must not be cropped |
| `cover` | Fill the screen; mismatched aspect ratios crop part of the design area | Full-screen backgrounds and immersive scenes |
| `fixedWidth` | Keep the design width fixed and derive scene height from the real screen | Portrait mobile UI with fixed width and elastic height |
| `fixedHeight` | Keep the design height fixed and derive scene width from the real screen | Landscape or height-first UI |

For portrait mobile, start with `750 x 1334 + showAll`. Switch to `fixedWidth` or `cover` when the project needs stronger device adaptation.

## Runtime Foundation

PixiJS native `Container` keeps Pixi semantics. Its `width` / `height` still come from bounds / scale behavior.

Pixifact runtime adds box-size semantics:

- `Group extends Container` and is the base mental model for Scene roots and ordinary box containers.
- `Group.width` / `Group.height` are Pixifact box sizes, not Pixi bounds / scale sizes.
- `Control extends Group` and is the base layout type with frame layout properties.
- `Label extends Control` and places UI text in an independent box; changing the box size does not scale the text.
- `BitmapLabel extends Control` renders with a bitmap font while keeping the same box semantics as `Label`.
- `Rect`, `Image`, `NineImage`, and `TileImage` are not containers, but they also support frame layout properties.

`<Group>` can be written directly in `.scene` as an ordinary box container. `Control` is a runtime layout base type, not a built-in Scene tag; do not write bare `<Control>`. Use concrete layout containers, child Scene instances, or your own Scene scripts when you need automatic arrangement.

## Frame Layout

Frame layout properties are:

```txt
left
right
top
bottom
horizontal
vertical
```

These properties can be used on Pixifact runtime nodes and Scene instances. The compiler writes them through a runtime helper, so each Scene script does not need to declare matching `@prop` fields.

Horizontal rules:

| Pattern | Meaning |
| --- | --- |
| `x + width` or no horizontal layout property | Free positioning |
| `left + width` | Fixed distance from parent left |
| `right + width` | Fixed distance from parent right |
| `horizontal + width` | Offset from parent center |
| `left + right` | Stretch horizontally |

Vertical rules:

| Pattern | Meaning |
| --- | --- |
| `y + height` or no vertical layout property | Free positioning |
| `top + height` | Fixed distance from parent top |
| `bottom + height` | Fixed distance from parent bottom |
| `vertical + height` | Offset from parent center |
| `top + bottom` | Stretch vertically |

If properties on the same axis conflict, resolution uses this priority:

```txt
Horizontal: left + right > left > right > horizontal > free
Vertical: top + bottom > top > bottom > vertical > free
```

## Common Patterns

Full-scene background:

```xml
<Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
```

Top-left avatar:

```xml
<Avatar id="avatar" scene="./Avatar.scene" left="24" top="24" width="88" height="88" />
```

Top-right coin bar:

```xml
<CoinBar id="coinBar" scene="./CoinBar.scene" right="24" top="24" width="188" height="56" />
```

Centered panel:

```xml
<InventoryPanel id="inventoryPanel" scene="./InventoryPanel.scene" horizontal="0" vertical="0" width="690" height="650" />
```

Bottom menu:

```xml
<BottomMenu id="bottomMenu" scene="./BottomMenu.scene" left="0" right="0" bottom="0" height="154" />
```

## Mode Switching Math

The Layout Inspector follows a Cocos Widget-like workflow: place a node visually first, then choose the layout mode. When a mode is selected, the Editor derives layout values from the current visible rectangle and tries to keep the node from jumping.

Assume the parent is `750 x 1334` and the node rectangle is:

```txt
x = 30
y = 252
width = 690
height = 650
```

Switch to horizontal center:

```txt
horizontal = x + width / 2 - parentWidth / 2
horizontal = 30 + 690 / 2 - 750 / 2
horizontal = 0
```

Switch to right alignment:

```txt
right = parentWidth - x - width
right = 750 - 30 - 690
right = 30
```

Switch to bottom alignment:

```txt
bottom = parentHeight - y - height
bottom = 1334 - 252 - 650
bottom = 432
```

Horizontal Stretch writes `left/right` and clears same-axis `x/horizontal/width`. Vertical Stretch writes `top/bottom` and clears same-axis `y/vertical/height`.

`width` / `height` remain in Transform. Stretch is the only mode that removes the size field on that axis, because size is derived from parent size and both side distances.

## Editor Behavior

Scene View:

- Selecting a node does not recalculate or break layout.
- Moving a layout node updates the corresponding layout properties.
- Resizing a layout node updates size or margins according to the current horizontal / vertical mode.
- All 8 resize handles are supported: top, bottom, left, right, and the four corners.

Inspector:

- Horizontal Layout options: `None / Left / Center / Right / Stretch`.
- Vertical Layout options: `None / Top / Middle / Bottom / Stretch`.
- Visible fields follow the current mode and show only same-axis fields.
- `width` / `height` stay in Transform.

## Layout Containers

`HBoxContainer`, `VBoxContainer`, `GridContainer`, and `ScrollContainer` all extend `Control`, so they can participate in frame layout.

`HBoxContainer`:

- Lays direct children horizontally.
- Properties: `gap`, `alignY`, `justify`.
- `alignY`: `start`, `center`, `end`.
- `justify`: `start`, `center`, `end`, `space-between`.

`VBoxContainer`:

- Lays direct children vertically.
- Properties: `gap`, `alignX`, `justify`.
- `alignX`: `start`, `center`, `end`.
- `justify`: `start`, `center`, `end`, `space-between`.

`GridContainer`:

- Lays children left-to-right and top-to-bottom with a fixed column count.
- Properties: `columns`, `gapX`, `gapY`, `alignX`, `alignY`.
- `gapX` / `gapY` are horizontal and vertical spacing.

`ScrollContainer`:

- Provides a draggable scroll area.
- Properties: `direction`, `scrollX`, `scrollY`.
- `direction`: `vertical`, `horizontal`, `both`.
- Current runtime supports elasticity and inertia, but no scrollbars.
- Construction and property assignment only establish the content layer, clipping mask, layout, and static scroll position; they do not register input or Ticker behavior.
- Instances declared in a compiled Scene automatically activate wheel, pointer, elasticity, and inertia after parts and slots are ready and before `onMounted()`.
- Editor Authoring Preview does not activate this behavior. It displays the same static visual state, but interaction events do not mutate the preview.
- Adding a directly constructed `new ScrollContainer()` to a regular Pixi container does not automatically enable input behavior; declare interactive scroll nodes in `.scene`.

## Drawing And Image Nodes

`Rect`:

- Draws rectangles only; it is not a container.
- Properties: `fillColor`, `fillAlpha`, `strokeColor`, `strokeAlpha`, `strokeWidth`, `radius`.
- Default `strokeColor = 0x000000`, `strokeWidth = 0`, so no border is visible by default.

`Image`:

- Normal image box for avatars, icons, backgrounds, and general images.
- `fit="stretch"` stretches the image to fill the box.
- `fit="contain"` shows the full image and may leave empty space.
- `fit="cover"` fills the box and crops part of the image when aspect ratios differ.
- `fit="none"` draws at the texture's original size.

`NineImage`:

- Nine-slice scaling for buttons, panels, bubbles, and UI backplates.
- Common properties: `leftWidth`, `rightWidth`, `topHeight`, `bottomHeight`.

`TileImage`:

- Tiled texture for repeated backgrounds or scrolling textures.
- Common properties: `tilePositionX`, `tilePositionY`, `tileScaleX`, `tileScaleY`, `tileRotation`.

## Retired Layout Protocol

The current layout protocol no longer uses these old concepts:

```txt
FlexLayout
FlexItem
MarginContainer
CenterContainer
minWidth
minHeight
hSize
vSize
margin
padding
old stretch property / size policy
```

This refers to the old layout protocol's `stretch` property or size policy. It does not refer to `Image.fit="stretch"` or the Inspector's `Stretch` alignment mode.

If old docs, samples, or plans mention these concepts, this document is the current authority.
