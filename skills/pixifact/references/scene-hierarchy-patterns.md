# Pixifact Scene Hierarchy Patterns

本文件随 Pixifact skill 安装，用于下游项目设计或修复 `.scene` 层级结构。新建 Scene、大改 UI、插入复杂列表、拆子 Scene、或发现 agent 把节点堆错层级时先读本文件。

## 先画树，再写 XML

写 `.scene` 前先给出短树形草图：

```txt
Scene Hud
  Image#background
  Container#topLayer
    HBoxContainer#resourceRow
      Image#coinIcon
      Text#coinText
  BottomMenu#bottomMenu scene="./BottomMenu.scene"
```

原则：

- 先识别屏幕区块，再决定容器。
- 每个容器必须有职责。
- 叶子节点只显示，不承载 children。
- 子 Scene 是黑盒，父子交互只走 props、events、slots。
- 改完用 `pixifact scene inspect --scene <path>` 对比实际树和计划。

## Root 只放大区块

根 `<Scene>` 下优先放少量大区块：

```txt
Scene Main
  Image#background
  Container#worldLayer
  Hud#hud scene="./Hud.scene"
  Container#overlayLayer
```

常见 root child：

- `Image#background` 或 `TileImage#backgroundPattern`
- `Container#contentLayer`
- `Container#overlayLayer`
- 主要子 Scene instance，例如 `Hud`、`BottomMenu`、`InventoryPanel`
- 少量全局遮罩或调试节点

不要在大型 Scene 的 root 下直接堆几十个 `Text`、`Image`、`Rect`。先按区域分组。

## 容器必须有理由

合理容器理由：

- 分组移动、缩放、显隐或排序。
- 隔离层级，例如 content / overlay / modal。
- 使用 layout container 排列子节点。
- `ScrollContainer` 裁剪和滚动内容。
- 子 Scene 的 slot outlet host。
- 复用组件边界。

没有职责的空壳 `Container` 不要加。容器名字应该说明职责，例如 `resourceRow`、`contentLayer`、`questList`，不要只叫 `group1`。

## 叶子节点不是容器

这些节点通常是叶子：

```txt
Text
BitmapText
HTMLText
Rect
Image
NineImage
TileImage
Sprite
NineSliceSprite
TilingSprite
Graphics
```

错误：

```xml
<Rect id="buttonBack" width="180" height="64">
  <Text id="label" text="Start" />
</Rect>
```

正确：

```xml
<Container id="buttonGroup" width="180" height="64">
  <Rect id="buttonBack" left="0" right="0" top="0" bottom="0" radius="12" fillColor="#2563eb" />
  <Text id="label" text="Start" x="48" y="18" fontSize="24" fill="#ffffff" />
</Container>
```

更可复用时，拆成 `PrimaryButton.scene`。

## 重复结构用 layout container

横向资源条：

```xml
<HBoxContainer id="resourceRow" right="24" top="24" width="260" height="56" gap="12" alignY="center" justify="end">
  <Image id="coinIcon" texture="assets/icons/coin.png" width="40" height="40" />
  <Text id="coinText" text="12,800" fontSize="24" fill="#ffffff" />
</HBoxContainer>
```

纵向菜单：

```xml
<VBoxContainer id="mainMenu" horizontal="0" vertical="0" width="420" gap="18" alignX="center">
  <Text id="title" text="PIXIFACT" fontSize="48" fill="#ffffff" />
  <PrimaryButton id="startButton" scene="./PrimaryButton.scene" width="360" height="80" label="开始" />
  <PrimaryButton id="settingsButton" scene="./PrimaryButton.scene" width="360" height="80" label="设置" />
</VBoxContainer>
```

背包网格：

```xml
<GridContainer id="inventoryGrid" left="32" right="32" top="160" height="520" columns="4" gapX="14" gapY="14">
  <ItemSlot id="slot1" scene="./ItemSlot.scene" width="128" height="128" />
  <ItemSlot id="slot2" scene="./ItemSlot.scene" width="128" height="128" />
</GridContainer>
```

不要手写大量 `x/y` 去模拟横排、竖排或网格，除非每个元素确实需要独立位置。

## ScrollContainer 标准结构

滚动容器通常只直接承载一个内容 layout container：

```xml
<ScrollContainer id="questScroll" left="32" right="32" top="180" bottom="120" direction="vertical">
  <VBoxContainer id="questList" width="686" gap="16">
    <QuestRow id="quest1" scene="./QuestRow.scene" width="686" height="96" title="采集草药" />
    <QuestRow id="quest2" scene="./QuestRow.scene" width="686" height="96" title="修理木桥" />
  </VBoxContainer>
</ScrollContainer>
```

背包可用内部 `GridContainer`：

```xml
<ScrollContainer id="slotScroll" left="32" right="32" top="160" bottom="120" direction="vertical">
  <GridContainer id="slotGrid" columns="4" gapX="14" gapY="14">
    <ItemSlot id="slot1" scene="./ItemSlot.scene" width="128" height="128" />
  </GridContainer>
</ScrollContainer>
```

不要把几十个 item 直接平铺在 `ScrollContainer` 下，除非它们确实不需要统一排列。

## 子 Scene 是黑盒

父 Scene 可以：

- 设置子 Scene public props。
- 绑定子 Scene public events。
- 向子 Scene public slots 填内容。
- 设置通用 transform、frame layout 和 display props。

父 Scene 不应该：

- 假设子 Scene 内部节点 id。
- 直接操作子 Scene 内部 `@part()`。
- 把 children 塞进没有声明 slot 的子 Scene。

正确：

```xml
<PrimaryButton id="startButton" scene="./PrimaryButton.scene" label="开始" @click="startGame">
  <Image slot="icon" id="startIcon" texture="assets/icons/play.png" width="32" height="32" fit="contain" />
</PrimaryButton>
```

要求：

- `PrimaryButton.ts` 暴露 `@prop() label`。
- `PrimaryButton.ts` 暴露 `@event() click`。
- `PrimaryButton.ts` 暴露 `@slot({ name: 'icon' })`。
- `PrimaryButton.scene` 中有 `<slot name="icon" />`。

## z 顺序

默认用树顺序表达层级：

```xml
<Scene name="Main">
  <Image id="background" ... />
  <Container id="contentLayer">...</Container>
  <Container id="overlayLayer">...</Container>
</Scene>
```

后写的 sibling 通常在视觉上更靠上。只有确实需要同层显式排序或动态排序时才用 `zIndex`。

不要靠大量 `zIndex` 修补混乱树。先重组层级。

## 常见反模式

反模式：root 下堆叶子。

```xml
<Scene name="Hud">
  <Image id="coinIcon" texture="assets/icons/coin.png" />
  <Text id="coinText" text="1200" />
  <Image id="gemIcon" texture="assets/icons/gem.png" />
  <Text id="gemText" text="35" />
</Scene>
```

改成：

```xml
<Scene name="Hud">
  <HBoxContainer id="resourceRow" right="24" top="24" height="48" gap="10" alignY="center">
    <Image id="coinIcon" texture="assets/icons/coin.png" width="36" height="36" />
    <Text id="coinText" text="1200" fontSize="24" fill="#ffffff" />
    <Image id="gemIcon" texture="assets/icons/gem.png" width="36" height="36" />
    <Text id="gemText" text="35" fontSize="24" fill="#ffffff" />
  </HBoxContainer>
</Scene>
```

反模式：用普通 `Container` 手写列表位置。

```xml
<Container id="questList">
  <QuestRow id="quest1" scene="./QuestRow.scene" y="0" />
  <QuestRow id="quest2" scene="./QuestRow.scene" y="112" />
  <QuestRow id="quest3" scene="./QuestRow.scene" y="224" />
</Container>
```

改成：

```xml
<VBoxContainer id="questList" gap="16">
  <QuestRow id="quest1" scene="./QuestRow.scene" width="686" height="96" />
  <QuestRow id="quest2" scene="./QuestRow.scene" width="686" height="96" />
  <QuestRow id="quest3" scene="./QuestRow.scene" width="686" height="96" />
</VBoxContainer>
```

反模式：把 modal、遮罩和背景混在 content 中。

```xml
<Scene name="Main">
  <Image id="background" ... />
  <InventoryPanel id="inventory" scene="./InventoryPanel.scene" ... />
  <PlayerCard id="player" scene="./PlayerCard.scene" ... />
  <Rect id="modalMask" ... />
</Scene>
```

改成：

```xml
<Scene name="Main">
  <Image id="background" ... />
  <Container id="contentLayer">
    <PlayerCard id="player" scene="./PlayerCard.scene" ... />
    <InventoryPanel id="inventory" scene="./InventoryPanel.scene" ... />
  </Container>
  <Container id="overlayLayer">
    <Rect id="modalMask" ... />
  </Container>
</Scene>
```

## Inspect 复核

层级大改后先 inspect：

```bash
pixifact scene inspect --scene src/scenes/Hud.scene
```

检查：

- root 下是否只有少量大区块。
- 背景、内容、overlay 顺序是否正确。
- layout container 是否承载重复结构。
- 叶子节点下是否没有 children。
- 子 Scene children 是否都通过已声明 slot。
- 需要脚本访问的节点是否有稳定 `id`。

inspect 树和预先草图不一致时，先修层级，再运行 validate 和 compile。
