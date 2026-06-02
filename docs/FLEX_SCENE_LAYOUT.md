# Pixifact Flex Scene Layout

本文定义 Pixifact 最终 UI 自适应布局方向。Flex 布局通过官方内置 Scene 组合实现，不引入 `rectTransform`，不改变 Pixi / display 节点原有属性语义。

## 1. 核心决策

- Flex 是 Pixifact Scene 能力，不是 Pixi 节点能力。
- `FlexLayout` 和 `FlexItem` 是官方内置 Scene，但仍然走普通 Scene 的实例化、prop、slot、编译和运行逻辑。
- 普通节点如 `Text`、`Image`、`Shape`、`Container` 的 `x`、`y`、`width`、`height`、`scale`、`rotation` 等属性保持原义。
- Flex props 只暴露在 `FlexLayout` / `FlexItem` 这类 Scene 组件上。
- 不支持 `position` / `absolute` 作为 Flex 模型的一部分。
- 不把 `rectTransform` 作为最终 UI 自适应布局模型。

目标结构：

```xml
<FlexLayout>
  <FlexItem>
    <Text />
  </FlexItem>
</FlexLayout>
```

## 2. 官方 Scene 和普通 Scene 的关系

`FlexLayout` / `FlexItem` 是官方默认 Scene，不是不可覆盖的关键字。

用户可以自己实现同名 Scene，但必须通过显式 `scene="xxx.scene"` 使用：

```xml
<FlexLayout scene="./custom/FlexLayout.scene">
  <FlexItem scene="./custom/FlexItem.scene">
    <Text id="label" text="Custom" width="120" height="28" />
  </FlexItem>
</FlexLayout>
```

无 `scene` 属性时，`FlexLayout` / `FlexItem` 默认解析到官方内置 Scene：

```xml
<FlexLayout>
  <FlexItem>
    <Text id="label" text="Built in" width="120" height="28" />
  </FlexItem>
</FlexLayout>
```

等价于使用官方内置 Scene id，例如：

```txt
pixifact://FlexLayout.scene
pixifact://FlexItem.scene
```

## 3. Scene 解析优先级

Scene tag 解析必须使用确定优先级：

1. 基础显示节点名先按基础节点解析，例如 `Container`、`Text`、`Shape`、`Image`、`Input`。
2. 如果节点显式写了 `scene="xxx.scene"`，永远按该 scene path 解析。
3. 如果没有 `scene`，且 tag 命中官方默认 Scene，例如 `FlexLayout` 或 `FlexItem`，解析为官方内置 Scene。
4. 其他非基础节点必须报错，要求用户显式写 `scene="xxx.scene"`。

官方识别必须基于 resolved scene id，而不是 tag name。

```txt
<FlexLayout>                         -> pixifact://FlexLayout.scene
<FlexLayout scene="./FlexLayout.scene"> -> project scene
```

Editor、CLI 和 compiler 不应只因为 tag 名叫 `FlexLayout` 就按官方 Flex 处理；只有 resolved scene id 是官方内置 Scene 时，才应用官方 Flex 诊断和 UI 展示。

如果同一 Scene 同时使用官方 `FlexLayout` 和项目自定义 `FlexLayout.scene`，compiler 生成 TypeScript 时必须按 resolved scene path 做 import alias，避免类名冲突。

## 4. FlexLayout

`FlexLayout` 负责排列直接子 `FlexItem`。

建议第一版公开 props：

```txt
direction: row | column
align: start | center | end | stretch
justify: start | center | end | space-between
gap: number
paddingLeft: number
paddingRight: number
paddingTop: number
paddingBottom: number
paddingX: number
paddingY: number
```

第一版不支持：

```txt
wrap
order
position
absolute
baseline
auto margin
```

示例：

```xml
<FlexLayout direction="row" align="center" justify="space-between" gap="16" paddingX="24">
  <FlexItem>
    <Text id="hpLabel" text="HP" width="40" height="24" />
  </FlexItem>
  <FlexItem grow="1" minWidth="160">
    <Shape id="hpBar" width="220" height="12" />
  </FlexItem>
  <FlexItem>
    <Text id="score" text="0000" width="96" height="24" />
  </FlexItem>
</FlexLayout>
```

## 5. FlexItem

`FlexItem` 是父 `FlexLayout` 的直接布局项，同时也是普通 Scene 容器，承载 default slot 内容。

建议第一版公开 props：

```txt
grow: number
shrink: number
basis: number | auto
minWidth: number
minHeight: number
maxWidth: number
maxHeight: number
marginLeft: number
marginRight: number
marginTop: number
marginBottom: number
alignSelf: auto | start | center | end | stretch
```

不要把单个 `flex` shorthand 作为主字段。第一版应直接使用 `grow`、`shrink`、`basis`，避免含混。

## 6. FlexItem 内部内容规则

`FlexItem` 默认只改变自己这个 box 的位置和尺寸，不默认修改 default slot 内部子节点的 `x`、`y`、`width`、`height`、`scale` 等 authored props。

例如：

```xml
<FlexItem grow="1">
  <Shape width="120" height="12" />
</FlexItem>
```

如果父 `FlexLayout` 计算出 `FlexItem.width = 500`，默认行为是：

```txt
FlexItem.width = 500
Shape.width = 120
```

不允许默认隐藏地变成：

```txt
FlexItem.width = 500
Shape.width = 500
```

如果后续确实需要让 `FlexItem` 影响内部内容，必须通过显式 prop 声明，例如：

```xml
<FlexItem grow="1" contentSizing="stretch">
  <Shape width="120" height="12" />
</FlexItem>
```

这类能力可以后续只在 `FlexItem` 内部扩展，但必须满足：

- 行为由显式 prop 触发。
- Editor / CLI 能展示该行为。
- 不默认覆盖 slot 子节点 authored props。

## 7. Runtime 语义

`FlexLayout` 根据自身尺寸、direction、gap、padding、align、justify 和子项 flex props 计算每个直接 `FlexItem` 的 box。

`FlexLayout` 可以设置直接子 `FlexItem` 的 runtime `x`、`y`、`width`、`height`，因为这正是 Flex 布局的职责。

`FlexItem` 内部内容默认保持自身 authored props。内部内容需要自适应时，通过嵌套 `FlexLayout` 或未来显式 `FlexItem` content props 实现。

Scene instance 作为父布局中的一个 box 参与计算。子 Scene 内部如何自适应，由该子 Scene 自己的 `.scene` 和 Flex 结构决定，父 Scene 不直接修改子 Scene 内部节点。

## 8. 测量和重排

第一版优先使用 authored `width` / `height` 或 `basis` 作为 Flex item 测量输入。

静态 `Text` / `Image` 的尺寸可以在编译、加载或预览阶段提前计算并填充。

运行时仍然必须保留 layout invalidation 能力，以处理：

- 文本内容变化，例如分数、血量、倒计时。
- 语言切换。
- 字体或图片资源加载完成。
- 父 Scene 或 viewport 尺寸变化。
- 子 Scene 内部尺寸变化。

最终 runtime 应具备明确流程：

```txt
measure -> layout -> render
content changed -> invalidate measure/layout
parent resized -> invalidate layout
asset loaded -> invalidate measure/layout
```

## 9. Validator 规则

官方 `FlexLayout` / `FlexItem` 需要高质量校验。

基础规则：

- 官方 `FlexLayout` 的直接 children 必须是官方 `FlexItem`，除非后续明确支持自定义 capability。
- 官方 `FlexItem` 必须是官方 `FlexLayout` 的直接 child。
- 普通显示节点不能直接作为官方 `FlexLayout` 的直接 child。
- `FlexLayout` props 必须符合官方 contract。
- `FlexItem` props 必须符合官方 contract。
- 不认识的 Flex prop 直接报错。
- 不支持 `position` / `absolute`。

识别规则：

- 官方规则只应用于 resolved scene id 为 `pixifact://FlexLayout.scene` / `pixifact://FlexItem.scene` 的节点。
- 用户显式 `scene="./FlexLayout.scene"` 的同名 Scene 默认按普通 Scene 处理。

后续如果允许用户自定义 Scene 声明官方 Flex capability，需要另行定义 metadata；第一版不隐式推断。

## 10. Editor 和 CLI 要求

Editor 不应把官方 Flex 只当作普通 Scene 展示。

最低要求：

- Hierarchy 能看出 `FlexLayout` / `FlexItem` 是官方布局 Scene。
- Inspector 选中官方 `FlexLayout` 时展示 Flex layout props。
- Inspector 选中官方 `FlexItem` 时展示 Flex item props。
- Preview resize 后能触发布局重算。
- 诊断能指出 Flex 结构错误，例如普通节点直接挂在官方 `FlexLayout` 下。

CLI / live context 需要返回 resolved scene 信息，避免 tag name 歧义：

```json
{
  "tag": "FlexLayout",
  "scene": "pixifact://FlexLayout.scene",
  "source": "official"
}
```

或：

```json
{
  "tag": "FlexLayout",
  "scene": "src/scenes/FlexLayout.scene",
  "source": "project"
}
```

## 11. Agent Authoring 规则

Agent 修改 Flex UI 时应优先编辑 `FlexLayout` / `FlexItem` props，而不是给普通节点新增手写布局计算。

推荐流程：

1. Inspect 当前 `.scene`。
2. 确认 `FlexLayout` / `FlexItem` resolved scene source。
3. 修改官方 Flex props，例如 `direction`、`gap`、`grow`、`basis`。
4. 运行 `scene validate`。
5. 运行 `compile-scenes`。
6. 如果 Editor 正在运行，读取 live context 或查看外部刷新诊断。

Agent 不应把 `rectTransform` 作为 UI 自适应方案。

## 12. 后续落地顺序

建议实现顺序：

1. 定义官方 `FlexLayout` / `FlexItem` Scene asset 和 public prop contract。
2. 增加 Scene tag resolution：无 `scene` 属性时命中官方默认 Scene。
3. 增加 resolved scene id 到 inspect / live context。
4. 增加官方 Flex validator。
5. 实现 runtime Flex layout 行为。
6. 接入 Editor Inspector 和 Preview 自动重排。
7. 将 HUD 模板和示例项目迁移到官方 Flex Scene。
8. 增加 E2E：`.scene` 创建、Flex 编辑、CLI validate、compile、Editor 预览刷新。
