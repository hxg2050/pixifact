# Pixifact BDD

本文档描述 Pixifact 当前产品行为和验收边界。详细测试映射见 [TDD.md](./TDD.md)。

## 1. Agent Authoring

### BDD-AGENT-001 直接编辑 `.scene`

Feature: External agent edits compiler scene source

```gherkin
Scenario: Agent edits a compiler scene without Editor
  Given a Pixifact project contains "src/scenes/Button.scene"
  When the agent edits the .scene source file
  And runs "pixifact scene validate"
  And runs "pixifact compile-scenes"
  Then Pixifact validates the semantic Scene source
  And generated TypeScript is refreshed
  And no Editor process is required
```

TDD 入口：`tests/pixifact-cli.test.ts`。

### BDD-AGENT-002 Editor live context 是只读增强

Feature: Editor live context

```gherkin
Scenario: Agent reads selected node from the running Editor
  Given Pixifact Editor has a project open
  And a Scene node is selected
  When the agent runs "pixifact live scene get"
  Or runs "pixifact live node inspect"
  Then Pixifact returns the current Scene and selection context
  And no project file is modified
```

TDD 入口：`tests/pixifact-cli.test.ts`。

## 2. Compiler Scene Props

### BDD-PROP-001 Scene script props are static declarations

Feature: Scene script public props

```gherkin
Scenario: Script exposes primitive props
  Given a Scene script declares "@prop({ default: \"Button\" }) declare label: string"
  And declares number and boolean Props with static defaults
  When Pixifact extracts the Scene script interface
  Then the contract contains string, number, and boolean prop types
  And a setter, accessor, field initializer, or dynamic default is rejected
```

TDD 入口：`tests/scene-script-interface.test.ts`。

### BDD-PROP-002 Static variants expose reactive style values

Feature: Scene Prop variants

```gherkin
Scenario: Button tone selects a static style case
  Given a Scene script declares a local "defineVariants" object
  And "@prop" exposes its keys as the tone Prop
  And Button.scene binds "{tone.background}" and "{tone.text}"
  When Pixifact extracts and compiles the Scene pair
  Then the contract contains every static Variant case and field
  And changing tone updates only the bound node properties
  And no user setter is executed
```

TDD 入口：`tests/scene-script-interface.test.ts`、`tests/scene-compiler.test.ts`。

### BDD-PROP-003 Scene props initialize before mount

Feature: Scene Prop construction

```gherkin
Scenario: Parent constructs a child Scene with initial Props
  Given Button has default label "Button"
  And a parent Scene declares "<Button label=\"背包\" />"
  When the generated parent Scene constructs Button
  Then "背包" is available before Button nodes are mounted
  And the first rendered label is "背包"
  And onMounted runs only after the final initial values and parts are ready
```

TDD 入口：`tests/scene-compiler.test.ts`、runtime integration tests。

### BDD-PROP-004 Structured props compile to real class instances

Feature: Structured Scene props

```gherkin
Scenario: Parent scene sets a RectTransform prop
  Given a child Scene script exports RectTransform
  And exposes "@prop({ type: RectTransform })"
  When a parent .scene sets "rectTransform.width=\"420\""
  Then Pixifact validates the field against the child Scene contract
  And serialized source keeps dot-path attributes
  And generated TypeScript constructs "new RectTransform()"
  And the generated Prop state receives the RectTransform instance rather than a plain object
```

TDD 入口：`tests/scene-script-interface.test.ts`、`tests/scene-compiler.test.ts`、`tests/compiler-scene-commands.test.ts`。

### BDD-PROP-005 Inspector edits structured fields

Feature: Inspector structured prop editing

```gherkin
Scenario: User edits a structured field
  Given a Scene instance with a RectTransform prop is selected
  When the Inspector renders its public props
  Then RectTransform fields are shown as editable primitive fields
  When the user changes width
  Then the compiler scene document updates "rectTransform.width"
  And saving writes "rectTransform.width" as a dot-path attribute
```

TDD 入口：`tests/compiler-scene-commands.test.ts`、`tests/editor-scene-document.test.ts`、`tests/editor-vue-ui.test.ts`。

## 3. Runtime Text

### BDD-LABEL-001 Label separates box layout from text scale

Feature: Box-sized UI text

```gherkin
Scenario: Author changes a Label box and typography independently
  Given a Scene contains a Label with explicit width and height
  When the author changes the Label width or height
  Then the Label layout box changes
  And the rendered text scale stays at 1
  And word wrapping follows the new box width
  When the author changes fontSize
  Then the text is re-laid out at the new font size
  And the Label box size does not change
```

```gherkin
Scenario: Author uses a native Pixi Text node
  Given a Scene contains Text, BitmapText, or HTMLText without width and height
  When Pixifact opens or compiles the Scene
  Then Pixifact does not invent a 120 by 28 size
  And the node keeps native Pixi bounds and scale semantics
```

### BDD-LABEL-002 BitmapLabel combines bitmap fonts with box layout

```gherkin
Feature: Bitmap font text box

Scenario: Author uses a bitmap font in a layout box
  Given the application loaded a bitmap font before Scene instantiation
  And a Scene contains a BitmapLabel using that font family
  When the author changes the BitmapLabel width or height
  Then the BitmapLabel layout box changes
  And the internal BitmapText scale remains unchanged

Scenario: Editor previews BitmapLabel without running game scripts
  Given a Scene contains a BitmapLabel
  When the Editor opens the Scene in Authoring Preview
  Then the Editor creates a safe BitmapLabel preview
  And the Editor does not execute the paired Scene script or application font-loading code
```

TDD 入口：`tests/scene-compiler.test.ts`、`tests/project-file-tree.test.ts`。

## 4. Editor

### BDD-EDITOR-001 Editor 预览外部修改

Feature: Editor refreshes after external scene edits

```gherkin
Scenario: External agent changes the opened .scene file
  Given a compiler .scene is open in the Editor
  When an external agent changes that file
  Then the Editor refreshes the compiler scene document
  And the viewport reflects the new source
```

TDD 入口：`tests/editor-server.test.ts`、`tests/editor-scene-document.test.ts`、浏览器验收。

### BDD-EDITOR-002 Authoring preview does not execute project scripts

Feature: Safe Scene authoring preview

```gherkin
Scenario: Editor opens a Scene with runtime behavior
  Given the paired TypeScript has module-level code, a constructor, and onMounted
  And the Scene declares static Props and bindings
  When the user opens the Scene in Editor
  Then the Editor renders the bound initial visual state
  And it does not execute module-level code, the constructor, onMounted, events, timers, or network calls
  And changing an Inspector value updates the existing bound Pixi node without replacing the Scene root
```

```gherkin
Scenario: User inspects and detaches a bound node property
  Given a node property is bound to a Scene Prop or Variant field
  When the user selects that node
  Then the Inspector displays the resolved value as read-only
  And it displays the semantic Binding source
  When the user explicitly detaches the Binding
  Then the current resolved value is saved as a literal .scene property
  And Undo restores the original Binding
```

TDD 入口：`tests/project-file-tree.test.ts`、`tests/editor-scene-document.test.ts`、`tests/editor-vue-ui.test.ts`、Editor 前端构建。

### BDD-EDITOR-003 资产浏览不编辑源资源

Feature: Project asset browsing

```gherkin
Scenario: User opens a source asset
  Given a project contains images, audio, scripts, and data files
  When the user double-clicks a concrete asset
  Then Pixifact delegates to the system default application
  And Pixifact does not edit the asset bytes

Scenario: User adds an indexed asset to the current Scene
  Given the project asset index contains an image or another Scene
  When the user drags the image or Scene onto the canvas
  Then the Editor inserts a root Image or Scene Instance at the Scene drop coordinates
  And the node references the existing project-relative asset path
  When the user drags the asset onto a hierarchy insertion target
  Then the Editor inserts it before, inside, or after that target
  And the insertion is saved as one undoable Scene Command
  But the current Scene cannot be inserted into itself
```

TDD 入口：`tests/editor-vue-ui.test.ts`、`tests/editor-server.test.ts`；系统程序调用仍需补自动化覆盖。

### BDD-EDITOR-004 Pinia 不保存项目数据

Feature: UI store persistence boundary

```gherkin
Scenario: Editor UI preferences are persisted
  Given the user changes panel layout or language
  When the editor store persists state
  Then only lightweight UI preferences are stored
  And Scene source, project file contents, and secrets are not stored in Pinia
```

TDD 入口：`tests/editor-vue-ui.test.ts`。

### BDD-EDITOR-005 从当前项目启动浏览器 Editor

Feature: Browser Editor startup

```gherkin
Scenario: User starts Editor from a Pixifact project
  Given the current directory is a Pixifact project
  When the user runs "pixifact editor"
  Then Pixifact starts a local service bound to 127.0.0.1
  And opens the Editor URL in the system browser
  And the service exposes only files under the current project root
```

TDD 入口：`tests/pixifact-cli.test.ts`、`tests/editor-server.test.ts`。

### BDD-EDITOR-006 打开一个 compiler Scene

Feature: Single Scene authoring workspace

```gherkin
Scenario: User opens a Scene from the asset list
  Given the project contains "src/scenes/Menu.scene"
  When the user opens that Scene
  Then the hierarchy displays its authored nodes
  And the long-lived Pixi Application displays its authoring preview
  And the Inspector displays fields for the selected node
```

TDD 入口：`tests/editor-scene-document.test.ts`、`tests/project-file-tree.test.ts`、Editor 前端构建与浏览器验收。

### BDD-EDITOR-007 Inspector 属性增量预览并自动保存

Feature: Incremental Inspector editing

```gherkin
Scenario: User changes a numeric node property
  Given a Scene node is selected in the Editor
  When the user types a new x value in the Inspector
  Then the existing Pixi node updates immediately
  And the Pixi Application and Canvas are not recreated
  When the input loses focus or the user presses Enter
  Then one Scene Command is committed
  And the .scene file is saved with its expected file version
  And Undo restores the previous value and saves again
```

TDD 入口：`tests/editor-scene-document.test.ts`、`tests/editor-vue-ui.test.ts`。

### BDD-EDITOR-008 外部修改不能被静默覆盖

Feature: Versioned Scene writes

```gherkin
Scenario: Scene changes after the Editor reads it
  Given the Editor has read a Scene file version
  And an external Agent changes the same file
  When the Editor commits an operation using the previous version
  Then the local service rejects the write with a conflict
  And the Editor reports "同步冲突"
  And the external file content is not overwritten
```

TDD 入口：`tests/editor-server.test.ts`、`tests/editor-scene-document.test.ts`。

### BDD-EDITOR-009 层级结构编辑

Feature: Hierarchy structure editing

```gherkin
Scenario: User adds, duplicates, deletes, and reorders Scene nodes
  Given a compiler Scene is open in the Editor
  When the user adds a node from the hierarchy toolbar
  Then the node is inserted beside the selection or inside the selected container
  And the new node receives a unique id and schema defaults
  When the user duplicates or deletes a selected node
  Then ids remain unique and the resulting parent is selected after deletion
  When the user drags a hierarchy node row before, inside, or after another hierarchy row
  Then the hierarchy shows the exact drop position
  And invalid cycles or leaf parents are rejected
  And the .scene child order matches the hierarchy order
  And each completed action is one undoable Scene Command and is automatically saved
```

```gherkin
Scenario: Structural command replaces only the Scene preview root
  Given the Editor has a long-lived Pixi Application and Canvas
  When a hierarchy structure Command is committed, undone, or redone
  Then the Editor prepares a new authoring Scene root
  And atomically replaces the previous Scene root
  And the Pixi Application and Canvas remain the same instances
```

TDD 入口：`tests/editor-scene-document.test.ts`、`tests/editor-vue-ui.test.ts`、`tests/project-file-tree.test.ts` 与浏览器验收。

### BDD-EDITOR-010 画布直接编辑

Feature: Canvas direct manipulation

```gherkin
Scenario: User selects, moves, and resizes a Scene node on the canvas
  Given a compiler Scene is open in the Editor authoring canvas
  When the user selects a node on the canvas
  Then the hierarchy and Inspector select the same stable locator
  And the canvas shows one selection outline with eight resize handles
  When the user drags the selected node
  Then the runtime node follows the pointer without rebuilding the Scene root
  And pointer release commits one undoable Scene Command and automatically saves the .scene file
  When the user drags a resize handle
  Then the runtime node resizes continuously
  And pointer release commits one undoable Scene Command and automatically saves the .scene file
```

```gherkin
Scenario: Canvas editing preserves layout ownership
  Given a node uses frame layout constraints
  When the user moves or resizes it on the canvas
  Then the Editor changes its existing left, right, top, bottom, horizontal, or vertical values
  And the Editor does not replace those constraints with free x or y properties
  Given a node is arranged by an HBoxContainer, VBoxContainer, or GridContainer
  When the user selects it on the canvas
  Then the node can be inspected
  And the canvas does not offer free-position movement for that node
  But the canvas offers right, bottom, and bottom-right resize handles
  And resizing changes width and height without authoring x or y
```

TDD 入口：`tests/editor-scene-canvas.test.ts`、`tests/editor-scene-document.test.ts` 与浏览器验收。

## 5. CLI

### BDD-CLI-001 Inspect and validate compiler scenes

Feature: CLI scene inspection and validation

```gherkin
Scenario: Agent inspects and validates a scene
  Given a project contains "src/scenes/Button.scene"
  When the agent runs "pixifact scene inspect"
  Then Pixifact returns a revision and normalized scene summary
  When the agent runs "pixifact scene validate"
  Then Pixifact returns validation diagnostics or ok true
```

TDD 入口：`tests/pixifact-cli.test.ts`。

### BDD-CLI-002 Compile scenes

Feature: CLI compiler output

```gherkin
Scenario: Agent compiles scene sources
  Given a project contains compiler .scene files
  When the agent runs "pixifact compile-scenes"
  Then Pixifact writes generated TypeScript under .pixifact/generated
  And generated files are treated as build artifacts
```

TDD 入口：`tests/pixifact-cli.test.ts`。

### BDD-CLI-003 Path guard

Feature: CLI project path safety

```gherkin
Scenario: Agent passes a path outside the project root
  Given the project root is "/project"
  When the agent requests "../outside.scene"
  Then Pixifact rejects the request
  And returns structured JSON with a project-relative path hint
```

TDD 入口：`tests/pixifact-cli.test.ts`。

## 5. Runtime

### BDD-RUNTIME-001 Scene runtime loads generated output

Feature: Runtime scene loading

```gherkin
Scenario: Game loads compiled scene output
  Given a compiler .scene has been compiled
  When the game imports generated scene code
  Then PixiJS runtime objects are created from the generated mount function
  And gameplay code binds to declared parts, props, events, and slots
```

TDD 入口：`tests/scene-compiler.test.ts`、`tests/scene-script-interface.test.ts`、sample project build tests。

### BDD-RUNTIME-002 Runtime behavior activates outside Authoring

Feature: Runtime behavior activation boundary

```gherkin
Scenario: Game instantiates a compiled Scene with interactive runtime nodes
  Given a compiled Scene contains a ScrollContainer
  When the game constructs the decorated Scene class
  Then Pixifact mounts nodes and injects parts and slots
  And it activates wheel, pointer, and Ticker behavior before onMounted
  And an already activated nested Scene is not activated twice

Scenario: Editor constructs the same visual node for Authoring Preview
  Given a .scene contains a ScrollContainer with a static scroll position
  When the Editor opens the Scene in Authoring Preview
  Then the Editor creates its content layer, clipping mask, layout, and static scroll position
  And wheel or pointer events do not change preview state
  And no runtime behavior or project logic is activated
```

TDD 入口：`tests/scene-compiler.test.ts`、`tests/project-file-tree.test.ts`。

## 6. Non-Goals

- Pixifact 不提供内置模型服务、模拟 Agent 服务或内置 AI chat 作为主开发路径。
- Pixifact 不提供 Git/PR/CI/任务编排能力。
- Editor live bridge 不提供 mutation action。
- 外部 Agent 不使用 `SceneCommand[]` 作为项目修改协议。
