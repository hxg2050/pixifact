# Structured Scene Props BDD

本文定义 structured Scene props 的用户行为和验收场景。需求说明见 [STRUCTURED_SCENE_PROPS_REQUIREMENTS.md](./STRUCTURED_SCENE_PROPS_REQUIREMENTS.md)，测试驱动计划见 [STRUCTURED_SCENE_PROPS_TDD.md](./STRUCTURED_SCENE_PROPS_TDD.md)。

## 1. 范围

包含：

- `@prop({ type: String | Number | Boolean })` primitive prop。
- `@prop({ type: RectTransform })` struct prop。
- `.scene` 点路径属性。
- CLI validate / compile-scenes。
- Editor Inspector 显示和编辑 struct prop。
- 保存回 canonical `.scene`。

不包含：

- 通用 layout DSL。
- Pixi 基础节点 struct prop。
- JSON 字符串 object 属性。
- 嵌套 struct、数组、union、generic。

## 2. 行为场景

### BDD-STRUCT-PROP-001 提取 primitive prop constructor

Feature: Scene prop type constructors

```gherkin
Scenario: Script exposes primitive props with constructor types
  Given a Scene script declares @prop({ type: String, default: "Button" })
  And declares @prop({ type: Number, default: 0 })
  And declares @prop({ type: Boolean, default: false })
  When Pixifact extracts the Scene script interface
  Then the contract contains string, number, and boolean prop types
  And the default values are preserved
```

### BDD-STRUCT-PROP-002 提取 RectTransform struct prop

Feature: Structured Scene prop contracts

```gherkin
Scenario: Script exposes a RectTransform prop
  Given a Scene script exports class RectTransform with x, y, width, and height fields
  And a Scene class declares @prop({ type: RectTransform })
  When Pixifact extracts the Scene script interface
  Then the contract contains a struct prop named "rectTransform"
  And the struct name is "RectTransform"
  And the fields are x, y, width, and height
  And each field is a number with the class initializer default
```

### BDD-STRUCT-PROP-003 解析点路径属性

Feature: Scene source structured prop syntax

```gherkin
Scenario: Scene instance uses dot-path RectTransform attributes
  Given a .scene contains a Button scene instance
  And the Button has rectTransform.x, rectTransform.y, rectTransform.width, and rectTransform.height attributes
  When Pixifact parses the .scene
  Then the Button node props contain a rectTransform object
  And the rectTransform object contains the parsed numeric fields
```

### BDD-STRUCT-PROP-004 编译真实 struct 实例

Feature: Structured prop code generation

```gherkin
Scenario: Compiler emits a RectTransform instance
  Given a .scene contains a Button with rectTransform fields
  And Button exposes @prop({ type: RectTransform })
  When Pixifact compiles scenes
  Then the generated code constructs a new RectTransform
  And assigns the dot-path fields to that instance
  And assigns the instance to button.rectTransform
  And the generated code does not pass a plain object to rectTransform
```

### BDD-STRUCT-PROP-005 序列化点路径属性

Feature: Structured prop serialization

```gherkin
Scenario: Scene source is saved canonically
  Given a parsed scene instance has rectTransform object props
  When Pixifact serializes the scene
  Then rectTransform fields are written as dot-path attributes
  And the scene does not contain JSON string object values
```

### BDD-STRUCT-PROP-006 校验错误字段

Feature: Structured prop validation

```gherkin
Scenario: Scene instance uses an unknown RectTransform field
  Given Button exposes RectTransform fields x, y, width, and height
  When a .scene contains rectTransform.foo="1"
  Then Pixifact validation fails
  And the diagnostic identifies the unknown struct field
```

### BDD-STRUCT-PROP-007 校验错误字段类型

Feature: Structured prop validation

```gherkin
Scenario: Scene instance uses a non-number RectTransform field
  Given Button exposes RectTransform.width as number
  When a .scene contains rectTransform.width="wide"
  Then Pixifact validation fails
  And the diagnostic identifies the expected number type
```

### BDD-STRUCT-PROP-008 Inspector 显示字段组

Feature: Inspector structured prop editing

```gherkin
Scenario: User selects a Scene instance with RectTransform
  Given a compiler .scene is open in Pixifact Editor
  And a Button scene instance is selected
  And Button exposes rectTransform as a structured prop
  When the Inspector renders props
  Then Rect Transform is shown as a grouped section
  And X, Y, Width, and Height are shown as number fields
  And rectTransform is not shown as a JSON text field
```

### BDD-STRUCT-PROP-009 Inspector 编辑字段保存点路径

Feature: Inspector structured prop editing

```gherkin
Scenario: User edits RectTransform width
  Given a Button scene instance is selected
  When the user changes Rect Transform Width to 420
  Then the compiler scene document stores rectTransform.width as 420
  And saving the scene writes rectTransform.width="420"
  And the viewport uses the updated prop value
```

## 3. 验收标准

- 所有 existing `@prop({ type: '...' })` 用 constructor type 替换。
- `@prop({ type: RectTransform })` 能被 CLI 和 Editor 提取为稳定 contract。
- `.scene` 点路径语法可 parse / serialize / validate。
- compiler 生成 `new RectTransform()` 加字段赋值。
- Inspector 将 struct prop 显示为字段组并可编辑。
- Pixi 基础节点属性模型不改变。
