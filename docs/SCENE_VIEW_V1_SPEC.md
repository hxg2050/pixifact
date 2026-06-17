# Scene View v1 规格

本文记录 Pixifact Editor `.scene` 视口的第一版目标。Scene View v1 的重点不是做完整编辑器，而是先建立一个可信的坐标画布，并在此基础上支持最小可编辑能力：选中、移动、resize。

## 定位

Scene View 是 `.scene` 的可视化编辑画布。

核心结构：

```txt
网格坐标系
  └─ 真实 Scene 渲染
       └─ 编辑辅助层：Scene 边界、选中框、resize handles
```

`.scene` 是唯一数据源。Pixi 只负责显示，网格、选中框和 handles 只属于编辑器辅助层，不写入 `.scene`。

## 目标

v1 要做到：

- 有稳定的网格背景，像坐标系一样帮助理解位置。
- Scene 真实渲染在网格上。
- Scene 有清晰边界。
- 选中节点后出现选中框。
- 可以在视口中点击选中节点。
- 选中后可以移动节点，实时修改 `x/y`。
- 选中后可以 resize 节点，实时修改 `width/height`。
- Inspector 和层级面板与视口实时同步。
- 缩放、平移、网格、Scene、选中框始终对齐。

## 非目标

v1 不做：

- 投放模式。
- 从资源面板拖图片到视口创建节点。
- 从项目树拖 Scene 到视口创建 instance。
- 多选。
- 旋转。
- 吸附。
- 对齐线。
- 框选。
- 右键菜单。
- 复杂布局编辑。
- 预览模式下交互模拟。
- 左边 / 上边 resize。

## 视觉结构

视口分三层：

```txt
SceneView
  ├─ Grid Layer
  ├─ Runtime Scene Layer
  └─ Overlay Layer
```

### Grid Layer

网格是背景坐标系。

规则：

- 网格不属于 `.scene`。
- 网格默认显示。
- Toolbar 可以开关网格。
- 网格随视口缩放变化。
- 网格随视口平移移动。
- 网格和 Scene 坐标保持一致。

### Runtime Scene Layer

这一层显示真实 `.scene` 渲染结果。

规则：

- `.scene` 编译后生成 Pixi preview。
- Pixi root 放在网格坐标系上。
- Scene 的 `0,0` 对应网格坐标的 `0,0`。
- Scene 有自己的宽高，例如 `960x540`。
- Scene 外框由 Overlay 绘制，不进入 Pixi scene 内容。

### Overlay Layer

这一层显示编辑器辅助内容。

v1 包含：

- Scene 边界框。
- 当前选中节点边界框。
- Resize handles。

规则：

- Overlay 不写入 `.scene`。
- Overlay 必须和 Runtime Scene Layer 对齐。
- 缩放和平移后，选中框仍然覆盖真实节点。

## 导航规则

视口支持：

- Fit。
- 100%。
- 滚轮缩放。
- 空格 + 左键拖拽平移。
- 中键拖拽平移。

规则：

- 默认打开 Scene 使用 Fit。
- Fit 显示完整 Scene。
- 100% 使用 Scene 原始像素尺寸。
- 缩放范围：`10%` 到 `800%`。
- 滚轮缩放以鼠标位置为中心。
- 平移只移动视口，不修改 `.scene`。
- 平移和缩放只属于 UI 状态，不保存到 `.scene`。

## 选中规则

点击节点：

```txt
pointer down/up 命中节点
  -> 选中该节点
  -> 层级面板同步
  -> Inspector 同步
  -> Overlay 显示选中框
```

空白点击：

```txt
点击空白区域
  -> 取消选中
```

命中规则：

- 只允许选中当前 `.scene` 中可编辑节点。
- `slotOutlet` 不可直接选中编辑。
- 无法映射回 `.scene` 节点的 runtime 对象不可选中。
- 如果多个节点重叠，默认选中视觉上最上层节点。

## 移动规则

选中节点后，拖动节点主体可以移动。

流程：

```txt
pointer down 在节点主体上
  -> 选中节点
  -> 开始 move edit

pointer move
  -> 把鼠标移动距离换算成 Scene 坐标
  -> 实时更新节点 props.x / props.y
  -> Inspector 实时刷新
  -> Runtime preview 实时更新
  -> Overlay 实时更新

pointer up
  -> 结束 move edit
```

字段规则：

- 移动写入 `props.x`。
- 移动写入 `props.y`。
- 如果原本没有 `x/y`，以 `0/0` 为起点，并写入明确字段。
- 移动单位使用 Scene 坐标，不使用屏幕像素。

## Resize 规则

选中节点后显示 handles。

v1 只支持三个 handle：

```txt
右边 handle：修改 width
下边 handle：修改 height
右下角 handle：同时修改 width / height
```

暂不支持：

- 左边 handle。
- 上边 handle。
- 左上 / 右上 / 左下角 handle。

原因是左边和上边 resize 会同时影响 `x/y`，v1 先保持简单。

字段规则：

- Resize 写入 `props.width`。
- Resize 写入 `props.height`。
- 如果原本没有 `width/height`，以当前 bounds 尺寸为起点，并写入明确字段。
- 最小尺寸为 `1`。
- Resize 单位使用 Scene 坐标。

## 可编辑节点

v1 可编辑：

- `Container`
- `Sprite`
- `Text`
- `BitmapText`
- `HTMLText`
- `Graphics`
- `NineSliceSprite`
- `TilingSprite`
- Scene instance

v1 不编辑：

- `slotOutlet`
- Runtime 内部派生对象
- 无法映射到 `.scene` 的对象

## 实时更新规则

移动和 resize 必须实时更新文档内存态。

规则：

- Inspector 数值实时变化。
- 视口实时变化。
- Dirty 状态实时变化。
- 不实时写磁盘。
- 保存仍然由保存按钮触发。

## Undo 规则

v1 目标行为：

```txt
一次拖动 = 一个 undo step
一次 resize = 一个 undo step
```

建议接口语义：

```txt
beginEdit()
updateEdit()
commitEdit()
cancelEdit()
```

拖动中可以多次 update，但 undo 只记录为一次操作。

Esc 行为：

```txt
拖动或 resize 中按 Esc
  -> 恢复到操作开始前
  -> 取消本次 edit
```

## 坐标规则

必须明确区分两种坐标：

```txt
Viewport 坐标：屏幕上的鼠标位置
Scene 坐标：.scene 中的 x/y/width/height
```

所有编辑写入 `.scene` 前，都必须转换成 Scene 坐标。

示例：

```txt
deltaSceneX = deltaViewportX / camera.scale
deltaSceneY = deltaViewportY / camera.scale
```

## 验收标准

v1 完成时，用户应该能做到：

- 打开 `.scene` 后看到网格背景。
- Scene 在网格上完整显示。
- 点击节点后看到准确选中框。
- 拖动节点后，节点移动，Inspector 的 `x/y` 实时变化。
- 拖动右边 / 下边 / 右下角 handle 后，节点尺寸变化，Inspector 的 `width/height` 实时变化。
- 缩放和平移后，网格、Scene、选中框仍然对齐。
- 保存后 `.scene` 文件包含更新后的坐标或尺寸字段。
- 撤销一次可以回到拖动或 resize 前。

## 核心原则

先把 Scene View 做成可信的坐标画布，再在上面做最小可编辑能力：选中、移动、resize。
