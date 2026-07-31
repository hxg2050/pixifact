# Layout

状态：活跃
权威范围：Pixifact 设计分辨率、视口适配、frame layout、布局容器和 Editor 布局编辑行为
上游文档：[../../README.md](../../README.md)、[./index.md](./index.md)
下游文档：[./agent-scene-authoring.md](./agent-scene-authoring.md)
更新规则：修改 runtime layout 协议、视口模式、布局容器或 Inspector 布局交互时更新

[English](../en/layout.md)

## 核心心智

Pixifact 的布局分两层：

1. 项目视口适配：把设计分辨率映射到真实屏幕。
2. Scene 内部布局：用 `left/right/top/bottom/horizontal/vertical` 把子节点放进父节点盒子。

项目设计分辨率来自 `pixifact.project.json`：

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

如果没有配置 `resolution`，默认设计分辨率是 `750 x 1334`。这只是开发坐标系，不是最终屏幕像素尺寸。

## 视口模式

`viewport.mode` 决定设计坐标如何映射到真实屏幕。

| 模式 | 作用 | 常见用途 |
| --- | --- | --- |
| `showAll` | 完整显示设计分辨率，屏幕比例不一致时出现留边 | 默认安全方案，适合先保证内容不被裁掉 |
| `cover` | 铺满屏幕，比例不一致时裁掉一部分设计区域 | 全屏背景、强沉浸画面 |
| `fixedWidth` | 固定设计宽度，高度按真实屏幕反推 | 竖屏移动 UI，宽度固定，高度弹性 |
| `fixedHeight` | 固定设计高度，宽度按真实屏幕反推 | 横屏或高度优先的界面 |

推荐竖屏移动端从 `750 x 1334 + showAll` 开始；当需要更强的真机适配时，再根据项目目标切到 `fixedWidth` 或 `cover`。

## Runtime 基础

PixiJS 原生 `Container` 保持 Pixi 语义，`width` / `height` 仍是 bounds / scale 结果。

Pixifact runtime 增加盒子尺寸心智：

- `Group extends Container`，用于 Scene 根节点和普通盒子容器。
- `Group.width` / `Group.height` 是 Pixifact 盒子尺寸，不是 Pixi 的 bounds / scale 尺寸。
- `Control extends Group`，是布局基础类型，支持 frame layout 属性。
- `Label extends Control`，用独立盒子承载 UI 文字；修改盒子宽高不会缩放文字。
- `Rect`、`Image`、`NineImage`、`TileImage` 不是容器，但也支持 frame layout 属性。

`<Group>` 可直接写在 `.scene` 中，用于普通盒子容器。`Control` 是 runtime 布局基类，不是内置 Scene；不要在 `.scene` 中写裸 `<Control>`。需要自动排列时使用具体布局容器、子 Scene 实例或项目自己的 Scene 脚本。

## Frame Layout

Frame layout 属性是：

```txt
left
right
top
bottom
horizontal
vertical
```

这些属性可以用于 Pixifact runtime 节点和 Scene instance。compiler 会生成 runtime helper 写入布局属性，不要求每个 Scene 脚本都声明对应 `@prop`。

横向规则：

| 写法 | 含义 |
| --- | --- |
| `x + width` 或没有横向 layout 属性 | 自由定位 |
| `left + width` | 距父节点左边固定 |
| `right + width` | 距父节点右边固定 |
| `horizontal + width` | 相对父节点中心偏移 |
| `left + right` | 横向拉伸 |

纵向规则：

| 写法 | 含义 |
| --- | --- |
| `y + height` 或没有纵向 layout 属性 | 自由定位 |
| `top + height` | 距父节点上边固定 |
| `bottom + height` | 距父节点下边固定 |
| `vertical + height` | 相对父节点中心偏移 |
| `top + bottom` | 纵向拉伸 |

同一轴上如果属性组合冲突，按下面优先级解析：

```txt
横向：left + right > left > right > horizontal > free
纵向：top + bottom > top > bottom > vertical > free
```

## 常见写法

背景铺满整个 Scene：

```xml
<Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
```

左上角头像：

```xml
<Avatar id="avatar" scene="./Avatar.scene" left="24" top="24" width="88" height="88" />
```

右上角金币条：

```xml
<CoinBar id="coinBar" scene="./CoinBar.scene" right="24" top="24" width="188" height="56" />
```

居中弹窗：

```xml
<InventoryPanel id="inventoryPanel" scene="./InventoryPanel.scene" horizontal="0" vertical="0" width="690" height="650" />
```

底部菜单：

```xml
<BottomMenu id="bottomMenu" scene="./BottomMenu.scene" left="0" right="0" bottom="0" height="154" />
```

## 模式切换怎么计算

Layout Inspector 的对齐编辑参考 Cocos Widget 心智：先把节点拖到想要的位置，再选择布局模式。选择模式时，Editor 会根据当前可见矩形反算 layout 属性，尽量保持节点不跳。

假设父节点是 `750 x 1334`，节点当前矩形是：

```txt
x = 30
y = 252
width = 690
height = 650
```

切到横向居中：

```txt
horizontal = x + width / 2 - parentWidth / 2
horizontal = 30 + 690 / 2 - 750 / 2
horizontal = 0
```

切到右对齐：

```txt
right = parentWidth - x - width
right = 750 - 30 - 690
right = 30
```

切到纵向底部：

```txt
bottom = parentHeight - y - height
bottom = 1334 - 252 - 650
bottom = 432
```

切到横向 Stretch 时写入 `left/right`，并清理同轴的 `x/horizontal/width`。切到纵向 Stretch 时写入 `top/bottom`，并清理同轴的 `y/vertical/height`。

`width` / `height` 仍属于 Transform 区。只有 Stretch 会在对应轴上不再保留尺寸字段，因为尺寸由父节点尺寸和两侧距离共同决定。

## Editor 行为

Scene View：

- 选择节点不会重新计算或破坏 layout。
- 拖动 layout 节点时，会更新对应的 layout 属性。
- resize layout 节点时，会按当前横向 / 纵向模式更新尺寸或边距。
- 支持 8 个 resize handle：上、下、左、右、四个角。

Inspector：

- Layout 区提供横向 `None / Left / Center / Right / Stretch`。
- Layout 区提供纵向 `None / Top / Middle / Bottom / Stretch`。
- 可见字段跟随当前模式，只显示同轴相关字段。
- `width` / `height` 保持在 Transform 区。

## 布局容器

`HBoxContainer`、`VBoxContainer`、`GridContainer`、`ScrollContainer` 都继承 `Control`，所以本身可以参与 frame layout。

`HBoxContainer`：

- 横向排列直接子节点。
- 属性：`gap`、`alignY`、`justify`。
- `alignY` 可用 `start`、`center`、`end`。
- `justify` 可用 `start`、`center`、`end`、`space-between`。

`VBoxContainer`：

- 纵向排列直接子节点。
- 属性：`gap`、`alignX`、`justify`。
- `alignX` 可用 `start`、`center`、`end`。
- `justify` 可用 `start`、`center`、`end`、`space-between`。

`GridContainer`：

- 按固定列数从左到右、从上到下排列子节点。
- 属性：`columns`、`gapX`、`gapY`、`alignX`、`alignY`。
- `gapX` / `gapY` 分别表示横向和纵向间距。

`ScrollContainer`：

- 提供可拖拽滚动区域。
- 属性：`direction`、`scrollX`、`scrollY`。
- `direction` 可用 `vertical`、`horizontal`、`both`。
- 当前运行时支持弹性和惯性，不提供滚动条。

## 绘制和图片节点

`Rect`：

- 只负责绘制矩形，不作为容器。
- 属性：`fillColor`、`fillAlpha`、`strokeColor`、`strokeAlpha`、`strokeWidth`、`radius`。
- 默认 `strokeColor = 0x000000`，`strokeWidth = 0`，所以默认不显示边框。

`Image`：

- 普通图片盒子，适合头像、图标、背景图和一般图片。
- `fit="stretch"`：拉伸图片填满盒子。
- `fit="contain"`：完整显示图片，可能留空。
- `fit="cover"`：铺满盒子，比例不一致时裁掉一部分图片。
- `fit="none"`：使用图片原始尺寸绘制。

`NineImage`：

- 基于九宫格缩放，适合按钮、面板、气泡等 UI 背板。
- 常用属性：`leftWidth`、`rightWidth`、`topHeight`、`bottomHeight`。

`TileImage`：

- 基于平铺纹理，适合重复背景或可滚动纹理。
- 常用属性：`tilePositionX`、`tilePositionY`、`tileScaleX`、`tileScaleY`、`tileRotation`。

## 不再使用的旧协议

当前布局协议不再使用这些旧概念：

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
旧 stretch 属性 / size policy
```

这里说的是旧布局协议里的 `stretch` 属性或尺寸策略，不是 `Image.fit="stretch"`，也不是 Inspector 里的 `Stretch` 对齐模式。

如果旧文档、旧示例或计划文件提到这些内容，以本文档为当前权威。
