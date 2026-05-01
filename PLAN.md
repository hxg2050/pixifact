# pixif 后续计划

## 1. 核心模型收敛（已完成）

- [x] 区分容器节点和叶子节点，避免 `Graphics`、`Label` 这类叶子节点被当作 parent 使用。
- [x] 收窄 `GameObject.instantiate` 的 parent 类型，只允许可挂载子节点的容器类型。
- [x] 梳理 `GameObject.children` 的归属，只保留在 `Group` 中。
- [x] 收敛容器模型，不引入额外 `ContainerGameObject` 抽象。
- [x] 将 `Image`、`NineSliceImage` 调整为叶子节点，不再继承容器能力。

## 2. Ticker 生命周期优化

- 只有对象自身或组件需要 `update` 时才注册 ticker。
- 销毁对象时确保 ticker、事件监听和组件生命周期全部释放。
- 长期考虑由 `Application` 统一驱动对象树，减少 `Ticker.shared` 上的全局回调数量。

## 3. 布局 API 整理

- 统一 `width` / `height` 语义，明确逻辑尺寸和 Pixi display bounds 的关系。
- 修正 `Layout.vertical` / `Layout.horizontal` 的命名语义，避免和实际 x/y 方向相反。
- 整理 `GridLayout` 的 `row` / `col` / `gapVertical` / `gapHorizontal` 定义。
- 补齐 `FlexGroup` 对 child remove、child resize、`total = 0`、gap 计算的边界处理。
- 增加布局组件的单元测试，覆盖居中、拉伸、网格和弹性布局。

## 4. 发布配置完善

- Rollup 显式 external：`pixi.js`、`@math.gl/core`、`eventemitter3`。
- 在 `package.json` 顶层补充 `exports` 和 `types` 字段。
- 消除 `Application -> core index` 的循环依赖 warning。
- 检查 `dist` 类型产物是否完整覆盖所有公开模块。

## 5. UI 组件稳定

- 给 `Input` / `Textarea` 增加 canvas offset、窗口 resize、销毁后的交互测试。
- 评估是否改用 PixiJS v8 `DOMContainer` 承载 DOM 输入元素。
- 标记 `paddinRight` 为兼容旧拼写，后续版本移除。
- 清理 UI 组件中依赖示例 CSS 的隐含假设。
