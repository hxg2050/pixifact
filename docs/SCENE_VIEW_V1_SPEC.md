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

## TDD / BDD 实施计划

本节基于当前项目现状制定。Scene View v1 不先大改结构，而是围绕已有文件逐步补测试、补实现：

- `apps/editor/src/preview/CompilerSceneViewport.tsx`：当前 `.scene` 视口入口，已包含 Fit、100%、zoom、pan、grid 和 overlay 基础。
- `apps/editor/src/panels/ViewportPanel.tsx`：当前 toolbar 入口，已连接 `fit()`、`setActualSize()`、`toggleGrid()`。
- `apps/editor/src/preview/compilerSceneRuntimePreview.ts`：当前 Pixi runtime preview 创建入口，已返回 locator 到 Pixi `Container` 的映射。
- `apps/editor/src/document/compilerSceneDocumentController.ts`：当前 `.scene` 内存态更新入口，已有 `selectCompilerSceneNode()`、`updateCompilerSceneNode()`、undo / redo 和 `mergeKey`。
- `tests/editor-workbench-ui.test.ts`：当前 editor UI 行为测试入口，已有 viewport transform 和 toolbar 测试。
- `tests/compiler-scene-document-controller.test.ts`：当前 compiler scene 文档、undo / redo 测试入口。

### 测试分层

v1 使用三层测试，不直接从 UI 测所有细节。

```txt
纯函数 TDD
  -> 坐标、camera、move、resize、hit 选择规则

文档控制器 TDD
  -> updateCompilerSceneNode、dirty、mergeKey、undo / redo、save 前内存态

Editor UI BDD
  -> 用户可见行为：网格、选择框、拖动、resize、Inspector 同步、撤销
```

原则：

- 坐标换算和编辑计算必须先写纯函数测试。
- React / Pixi 组件只负责接事件、渲染状态、调用纯函数和文档控制器。
- Pixi event adapter 尽量薄，避免把核心规则藏在 pointer handler 里。
- 能在 `tests/editor-workbench-ui.test.ts` 验证的用户行为，用 Given / When / Then 写成 BDD 风格。
- 不为了测试新增真实项目数据源；`.scene` 仍然由 compiler scene document controller 管理。

### TDD 阶段 1：锁定视口坐标系统

目标：先确保网格、Scene、Overlay 使用同一套 camera。

优先测试：

- `fitViewportTransform()`：大 Scene 缩小完整显示。
- `fitViewportTransform()`：小 Scene 最多放大到 `4x`。
- `actualSizeViewportTransform()`：`100%` 后 Scene 居中。
- `zoomViewportTransform()`：鼠标所在 Scene 点缩放前后不漂移。
- `panViewportTransform()`：只改变 offset，不改变 scale。
- `resizeManualViewportTransform()`：手动模式 resize 后保持视口中心。
- `viewportPointToScenePoint()`：屏幕点正确转 Scene 坐标。
- `viewportDeltaToSceneDelta()`：拖动距离按 `scale` 正确换算。

当前已有一部分测试在 `tests/editor-workbench-ui.test.ts`，后续如果纯函数继续增多，应抽到：

```txt
apps/editor/src/preview/sceneViewTransform.ts
```

对应测试仍可放在 `tests/editor-workbench-ui.test.ts`，或在测试膨胀后拆成：

```txt
tests/editor-scene-view-transform.test.ts
```

### TDD 阶段 2：定义可编辑节点和 hit 规则

目标：点击时能从 runtime 对象稳定映射回 `.scene` locator。

建议新增纯函数：

```txt
isEditableSceneViewNode(node)
pickTopEditableHit(candidates)
sceneViewSelectionRect(bounds)
```

优先测试：

- `slotOutlet` 不可编辑。
- 无 locator 的 runtime 对象不可编辑。
- 多个节点重叠时选择视觉最上层节点。
- 空白点击返回无选中。
- 选中框忽略 `width <= 0` 或 `height <= 0` 的 bounds。
- 缩放 / 平移后 selection rect 和 Pixi bounds 对齐。

说明：当前 `compilerSceneSelectionRect()` 直接使用 Pixi `getBounds()` 结果，也就是屏幕变换后的 bounds。后续如果改成 Scene 坐标 overlay，必须同步修改测试，不能混用两套坐标。

### TDD 阶段 3：定义 move / resize 编辑计算

目标：拖动过程只做确定的数学计算，不把规则写散在 pointer handler 里。

建议新增纯函数：

```txt
moveSceneNodeProps(startProps, deltaScene)
resizeSceneNodeProps(startProps, startBounds, handle, deltaScene)
```

move 测试：

- 原本有 `x/y` 时，在起点基础上加 Scene 坐标 delta。
- 原本没有 `x/y` 时，以 `0/0` 为起点，并写入明确字段。
- viewport delta 必须除以 camera scale 后再写入 `.scene`。
- 负坐标允许，除非后续产品明确限制。

resize 测试：

- 右边 handle 只修改 `width`。
- 下边 handle 只修改 `height`。
- 右下角 handle 同时修改 `width/height`。
- 原本没有 `width/height` 时，以当前 bounds 尺寸为起点。
- 最小尺寸 clamp 到 `1`。
- resize 不修改 `x/y`。

### TDD 阶段 4：接入文档控制器和 undo

目标：视口编辑实时更新 compiler scene document，但一次拖动只形成一个 undo step。

优先在 `tests/compiler-scene-document-controller.test.ts` 补测试：

- 连续 move update 使用同一个 `mergeKey`，undo 一次回到拖动前。
- 连续 resize update 使用同一个 `mergeKey`，undo 一次回到 resize 前。
- move 和 resize 使用不同 `mergeKey`，分别形成独立 undo step。
- scene instance 的 `x/y/width/height` 也通过 `props` 更新。
- `slotOutlet` 不允许通过 Scene View edit 写入 props。

当前 `CompilerSceneCommandStack` 已支持 `mergeKey`，所以 v1 不需要新增 command stack 机制。建议 Scene View 使用类似：

```txt
scene-view:move:{locator}:{sessionId}
scene-view:resize:{locator}:{handle}:{sessionId}
```

### BDD 阶段 5：Editor UI 行为验收

BDD 主要放在 `tests/editor-workbench-ui.test.ts`。每个场景以用户行为描述，不以内部函数命名。

场景：打开 `.scene` 后显示基础视口

```txt
Given 已打开 GameProject/src/scenes/Button.scene
When Editor 渲染完成
Then 视口 toolbar 显示 Scene 名称、尺寸和缩放百分比
And 网格默认可见
And Scene 边界框存在
And “适配”按钮处于 active 状态
```

场景：切换网格

```txt
Given 已打开 `.scene`
When 点击“网格”
Then 网格隐藏
And “网格”按钮 aria-pressed 为 false

When 再次点击“网格”
Then 网格显示
And “网格”按钮 aria-pressed 为 true
```

场景：点击选择节点

```txt
Given 视口中有 Text 节点 label
When 点击 label 的可点击区域
Then compiler scene selection 是 label locator
And 层级面板选中 label
And Inspector 显示 label 的字段
And Overlay 显示选中框
```

场景：点击空白取消选择

```txt
Given 当前已选中 label
When 点击 Scene 空白区域
Then selection 回到 Scene
And Overlay 不显示节点选中框
```

场景：拖动节点实时移动

```txt
Given 当前选中 label，label 的 x=10，y=20
When 在节点主体上 pointer down
And 鼠标在 200% 缩放下向右移动 20px、向下移动 10px
Then Inspector 中 x 实时显示 20
And Inspector 中 y 实时显示 25
And 文档 dirty 状态为 true
And Overlay 选中框跟随节点移动

When pointer up
And 点击撤销
Then x/y 回到 10/20
```

场景：resize 节点实时修改尺寸

```txt
Given 当前选中 label，label 的 width=100，height=40
When 拖动右边 handle 向右 30 Scene 坐标
Then width 实时显示 130
And height 保持 40

When 撤销
Then width/height 回到 100/40
```

场景：导航不破坏编辑对齐

```txt
Given 当前选中 label
When 滚轮缩放
And 空格 + 左键拖拽平移
Then 网格、Scene 边界、选中框仍然对齐
And 普通左键拖节点不会触发平移
```

### 测试实现约束

- UI 测试继续使用 Vitest + React DOM + happy-dom。
- Tauri host 继续按现有测试方式 mock，不引入真实桌面窗口。
- 视口数学和编辑计算优先纯函数测试，不依赖真实 WebGL。
- Pixi runtime preview 可以在 UI 行为测试中使用轻量 mock，但 mock 必须保留 locator、bounds、root transform 这些关键语义。
- 不用 snapshot 测试锁定大段 DOM。
- 不用像素级截图作为 v1 自动化门槛；对齐优先用 transform、bounds、DOM 属性断言。
- 若某个行为必须依赖真实 Pixi pointer event，先把业务规则抽成可测函数，再让 Pixi listener 只做事件转发。

### 推荐实现顺序

1. 补齐 viewport transform / grid 默认显示测试，让当前视口结构可验证。
2. 抽出 Scene View 坐标和编辑纯函数，先写失败测试，再实现。
3. 给 document controller 补 `mergeKey` 驱动的 move / resize undo 测试。
4. 接入选择：点击节点、空白取消、Overlay 更新。
5. 接入 move：实时更新 `x/y`、Inspector、dirty、undo。
6. 接入 resize：三个 handle、实时更新 `width/height`、undo、Esc cancel。
7. 跑 editor 相关验证，再跑 frontend build。

当前阶段记录：

- 阶段 1 已完成：视口坐标、Fit / 100%、缩放、平移、网格和开发分辨率参考框。
- 阶段 2 已完成：可编辑节点命中、点击选中、空白取消选中、选中框对齐。
- 阶段 3 当前只接入移动编辑：选中节点后拖动主体实时写入 `props.x / props.y`，一次拖动合并为一个 undo step。
- Resize 仍保留到下一阶段实现，不混入当前 move 交付。

### 验证命令

每个小阶段优先跑最小测试：

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
bunx --no-install vitest run tests/compiler-scene-document-controller.test.ts
```

完成 v1 行为后跑：

```bash
bun run editor:frontend:build
```

如果改到 compiler command stack，再补跑：

```bash
bunx --no-install vitest run tests/compiler-scene-commands.test.ts
```

本计划不要求处理当前仓库里与 Scene View 无关的全局 `tsc` 失败。

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
