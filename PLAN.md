# pixif 后续计划

## 1. 核心模型收敛（已完成）

- [x] 区分容器节点和叶子节点，避免 `Graphics`、`Label` 这类叶子节点被当作 parent 使用。
- [x] 收窄 `GameObject.instantiate` 的 parent 类型，只允许可挂载子节点的容器类型。
- [x] 梳理 `GameObject.children` 的归属，只保留在 `Group` 中。
- [x] 收敛容器模型，不引入额外 `ContainerGameObject` 抽象。
- [x] 将 `Image`、`NineSliceImage` 调整为叶子节点，不再继承容器能力。

## 2. Ticker 生命周期优化（已完成）

- [x] 只有对象自身或组件需要 `update` 时才注册 ticker。
- [x] 销毁对象时确保 ticker、事件监听和组件生命周期全部释放。
- [x] 由 `Application` 维护活跃更新对象集合，通过单个 `app.ticker` 回调统一驱动对象树，避免每个对象直接注册 `Ticker.shared`。
- [x] 对象挂载、移除、重挂载和销毁时同步活跃更新集合。

### 2.1 回归记录

- [x] `Input` 在本阶段后出现 PC 鼠标无法稳定选中输入框的问题，原因是 `focus()` 从 `Ticker.shared.addOnce` 改成 microtask 后，DOM 聚焦进入了原生 pointer/mouse 默认行为的同一轮事件时序；PC 端可能被 canvas 默认行为抢回焦点。修复时不回退到 `Ticker.shared`，而是在非 touch 指针激活时阻止默认行为，并保持同步聚焦。
- [x] `Input` 的 DOM overlay 位置同步不能依赖 Pixi 缓存的 `worldTransform`，统一 `app.ticker` 在 render 前驱动 `update()` 后会读到旧矩阵；应使用 `getGlobalTransform()` 获取当前全局矩阵。

## 3. Layout 优化计划

### 3.1 语义和 API 收敛（已完成）

- [x] 将 `Layout.vertical` / `Layout.horizontal` 增加更清晰的别名：`centerX` / `centerY`。
- [x] 保留 `vertical` / `horizontal` 兼容旧代码，但在注释中标记为旧命名。
- [x] 修复 `centerX` / `centerY` 设置为 `undefined` 时不触发布局刷新的问题。
- [x] 明确优先级：`centerX` 覆盖 `left/right`，`centerY` 覆盖 `top/bottom`。
- [x] 更新注释示例，使用当前真实 API：`GameObject.instantiate`、`anchorX`、`anchorY`。

### 3.2 尺寸模型整理（已完成）

- [x] 统一 `width` / `height` 的语义，明确它们是逻辑布局尺寸，不直接等同于 Pixi `getBounds()`。
- [x] 将 `oldWidth` / `oldHeight` 改名为 `preferredWidth` / `preferredHeight`，表达右贴边和底贴边时使用的基准尺寸。
- [x] 定义手动修改组件宽高后的行为：手动改宽高会同步更新 `preferredWidth` / `preferredHeight`。
- [x] 对拉伸结果做下限保护，避免 `parent.width - left - right` 得到负尺寸。
- [x] 增加 `minWidth` / `minHeight` 预留设计，当前版本已实现。

### 3.3 刷新机制优化（已完成）

- [x] 减少每个 `Layout` 常驻 ticker 的成本，改为 microtask 批量刷新。
- [x] 保持属性 setter 只打 dirty 标记，由统一刷新入口批量执行 `resize()`。
- [x] 避免一次布局中分别设置 `x` 和 `y` 触发两次 `REPOSITION`，给 `Transform` 增加公开 `setPosition(x, y)`。
- [x] 父节点 resize、自身 resize、added、removed 的监听继续集中在 `Layout` 内部管理。
- [x] 销毁组件后确保父级和自身事件监听全部释放。

### 3.4 边界场景覆盖（已完成）

- [x] 覆盖居中：`centerX`、`centerY`、带 anchor 的居中。
- [x] 覆盖贴边：`left/top`、`right/bottom`、混合方向。
- [x] 覆盖拉伸：`left + right`、`top + bottom`、父级尺寸变化后的重算。
- [x] 覆盖解除约束：从居中切回普通贴边，从拉伸切回固定尺寸。
- [x] 覆盖重挂载：从一个 parent 移动到另一个 parent 后监听和布局都正确。

### 3.5 示例同步（已完成）

- [x] 简化 `examples/basic/src/main.ts` 中和 Layout 相关的手动兜底逻辑。
- [x] 示例中只展示稳定 API，优先使用 `centerX` / `centerY`。
- [x] 示例 resize 后应能自动保持居中，无需调用 `layout.resize()`。

## 4. 其他布局 API 整理

- [x] 整理 `GridLayout` 的 `row` / `col` / `gapVertical` / `gapHorizontal` 定义。
- [x] 补齐 `FlexGroup` 对 child remove、child resize、`total = 0`、gap 计算的边界处理。
- [x] 增加布局组件的单元测试，覆盖网格和弹性布局。

## 5. 发布配置完善（已完成）

- [x] Rollup 显式 external：`pixi.js`、`@math.gl/core`、`eventemitter3`。
- [x] 在 `package.json` 顶层补充 `exports` 和 `types` 字段。
- [x] 消除 `Application -> core index` 的循环依赖 warning。
- [x] 检查 `dist` 类型产物是否完整覆盖所有公开模块。

## 6. UI 组件稳定（已完成）

- [x] 给 `Input` / `Textarea` 增加 canvas offset、窗口 resize、销毁后的交互测试。
- [x] 评估是否改用 PixiJS v8 `DOMContainer` 承载 DOM 输入元素：当前暂不迁移，因为 `DOMContainer` 在 PixiJS v8 仍为 experimental，库级组件先保留自维护 DOM overlay。
- [x] 标记 `paddinRight` 为兼容旧拼写，后续版本移除。
- [x] 清理 UI 组件中依赖示例 CSS 的隐含假设。

## 7. 复杂 UI 组件与滚动容器（已完成）

- [x] 明确复杂 UI 使用 `Group` 子类表达，在 `render()` 中组装内部子树，不额外引入 prefab 或响应式系统。
- [x] 调整 `GameObject.instantiate()` 时序：先应用 props，再调用 `render()`，最后挂载到 parent，使复合组件的内部结构可以读取初始化参数。
- [x] 增加回归测试，覆盖 `Group` 子类在 `render()` 中读取 props 并创建内部节点。
- [x] 新增 `ScrollView`，提供 `content` 挂载点、遮罩、滚动条、滚轮滚动、拖拽滚动、边界 clamp、内容高度刷新。
- [x] 增加 `ScrollView` 单元测试，覆盖滚动位置、内容位移、resize 后重新 clamp 和事件清理。
- [x] 将基础示例改为固定 header + `ScrollView` 内容页，验证复杂内容页滚动。
