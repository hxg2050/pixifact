# Pixifact Scene Authoring Decisions

本文件随 Pixifact skill 安装，用于下游项目在编辑 `.scene` 和同名 `.ts` 前做最小决策。目标不是写长篇分析，而是让 agent 先判断改动应该落在哪一层、需要哪些公开契约、用什么布局和验证闭环。

## 默认决策顺序

动手前按这个顺序判断：

1. 用户要改的是视觉结构、布局、文案、图片，还是行为？
2. 这是现有 Scene 的局部修改，还是应该新建可复用子 Scene？
3. 父子 Scene 是否需要公开契约：`@prop()`、`@event()`、`@slot()` 或 `@part()`？
4. 层级树应该怎么组织：root 区块、容器、layout container、子 Scene、叶子节点各放哪里？
5. 改完需要跑哪些命令证明结果？

把结论压成短决策即可，不要写长篇推理。

```md
Decision:
- Source of truth: edit `src/scenes/Hud.scene`
- Script needed: yes, expose `@prop({ type: Number }) coins`
- Hierarchy: `HBoxContainer#resourceRow` groups icon + text
- Validation: validate Hud.scene, compile-scenes, then build
```

## Source of Truth

| 用户目标 | 默认落点 |
| --- | --- |
| 改位置、尺寸、颜色、图片、字体、静态文案 | `.scene` |
| 调整父子层级、分组、布局容器、slot 填充 | `.scene` |
| 运行时改变文字、显隐、颜色、数值 | `.ts` 通过 `@part()` 和 `@prop()` / 方法更新 |
| 点击、拖拽、输入、动画、计时器、状态切换 | `.ts` |
| 父 Scene 给子 Scene 传值 | 子 `.ts` 暴露 `@prop()`，父 `.scene` 写属性 |
| 子 Scene 通知父 Scene | 子 `.ts` 暴露 `@event()`，父 `.scene` 写 `@eventName="actionName"` |
| 父 Scene 给子 Scene 塞内容 | 子 `.scene` 写 `<slot>`，子 `.ts` 暴露 `@slot()`，父 `.scene` 子节点写 `slot="name"` |

如果只是静态 UI，不要为了“更像组件”而写脚本逻辑。静态视觉属性留在 `.scene`。

## 是否拆子 Scene

优先不拆。只有满足下面至少一条时才新建子 Scene：

- 会在多个父 Scene 中复用。
- 有独立 public props、events 或 slots。
- 自身有明确交互行为，例如按钮、列表项、弹窗。
- 层级足够复杂，拆出后能减少父 Scene 噪音。

不要因为一个面板只用一次就立刻拆子 Scene。先用容器组织；需要复用或公开契约时再拆。

## 契约选择

| 需要 | 用法 |
| --- | --- |
| 脚本访问 `.scene` 节点 | 节点写稳定 `id`，脚本写 `@part()` |
| 父 Scene 设置子 Scene 单个值 | `@prop({ type: String / Number / Boolean })` |
| 父 Scene 设置一组相关字段 | exported structured prop class + dot-path attributes |
| 子 Scene 发出动作 | `@event()` + `createEvent()` |
| 父 Scene 填充子内容 | 子 `.scene` 写 `<slot name="..."/>`，脚本写 `@slot()` |

常见选择树：

```txt
需要改变显示文字？
- 静态文案：改 <Text text="...">
- 运行时可变：Text 写 id，脚本 @part()，公开 @prop() 或方法更新

需要按钮点击？
- 子 Scene 暴露 @event() readonly click = createEvent()
- pointertap 时 this.click.emit()
- 父 Scene 写 @click="methodName"
- 父脚本实现 methodName()

需要父 Scene 塞图标？
- 子 Scene 写 <slot name="icon" />
- 子脚本写 @slot({ name: 'icon' })
- 父 Scene 子节点写 slot="icon"
```

## 布局选择

| 情况 | 优先写法 |
| --- | --- |
| 背景铺满 | `left="0" right="0" top="0" bottom="0"` |
| HUD 贴边元素 | `left` / `right` / `top` / `bottom` |
| 居中弹窗或按钮组 | `horizontal="0"` / `vertical="0"` |
| 横向资源条、工具栏 | `HBoxContainer` |
| 纵向菜单、任务列表 | `VBoxContainer` |
| 背包、关卡卡片、固定列 | `GridContainer` |
| 长列表、背包滚动区 | `ScrollContainer` + 内部 `VBoxContainer` / `GridContainer` |
| 纯分组、统一移动或显隐 | `Container` |

布局和层级不确定时，先读 `scene-hierarchy-patterns.md`，并写一个短树形草图。

## 不要写

- 不要编辑 generated files。
- 不要在 `.scene` 写 `script="..."` 或 `class="..."`。
- 不要给 `@scene()` 传路径。
- 不要把静态视觉属性迁移到 `.ts`。
- 不要猜不存在的 `.scene` 标签或属性。
- 不要为缺失 `@part()`、未知 prop、未知 event 写静默 fallback。
- 不要为了单次使用过早拆子 Scene。
- 不要用旧字符串 prop 类型，例如 `@prop({ type: 'string' })`。

## 验证选择

| 改动范围 | 验证 |
| --- | --- |
| 单个 Scene 的 `.scene` / `.ts` | `pixifact scene validate --scene <path>` |
| 多个 Scene 或公共子 Scene 契约 | `pixifact scene validate --all` |
| 层级结构大改 | 先 `pixifact scene inspect --scene <path>` 对比树，再 validate |
| validate 通过 | `pixifact compile-scenes` |
| 影响运行项目 | `bun run build` 或项目最小相关检查 |

如果 validation 或 compile 失败，修源码，不修生成文件；修复后重跑失败命令。
