# Control Frame Layout

Pixifact 不再提供官方 `FlexLayout` / `FlexItem` 内置 Scene。UI 尺寸与位置的第一层能力由 runtime `Control` 和通用 frame 属性承担。

## Runtime Control

`Control` 是 runtime 基础类型，和 `Group` 一样从 `pixifact/runtime` 导出。它不是内置 Scene，不应该在 `.scene` 中写成裸标签。

用户可写的布局属性是：

```txt
width
height
left
right
top
bottom
horizontal
vertical
```

规则：

```txt
left + right       => 横向拉伸
left + width       => 靠左固定宽
right + width      => 靠右固定宽
horizontal + width => 水平居中偏移

top + bottom       => 纵向拉伸
top + height       => 靠上固定高
bottom + height    => 靠下固定高
vertical + height  => 垂直居中偏移
```

## Scene 写法

背景铺满：

```xml
<Graphics id="panel" shape="roundRect" left="0" right="0" top="0" bottom="0" radius="12" fill="#111827" />
```

右上角资源条：

```xml
<CoinBar right="24" top="24" width="180" height="56" />
```

居中按钮：

```xml
<Button horizontal="0" bottom="80" width="220" height="64" />
```

## Built-in Scene

当前保留的官方内置 Scene：

```txt
HBoxContainer
VBoxContainer
```

它们只负责顺序排列和 `gap` / `alignX` / `alignY` / `justify`，不再支持 `hSize`、`vSize`、`minWidth`、`minHeight`、`margin`、`padding` 或 `stretch`。
