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

### BDD-PROP-001 Scene script prop types use constructors

Feature: Scene script public props

```gherkin
Scenario: Script exposes primitive props
  Given a Scene script declares "@prop({ type: String, default: \"Button\" })"
  And declares Number and Boolean public props
  When Pixifact extracts the Scene script interface
  Then the contract contains string, number, and boolean prop types
  And the old string type form is rejected
```

TDD 入口：`tests/scene-script-interface.test.ts`。

### BDD-PROP-002 Structured props compile to real class instances

Feature: Structured Scene props

```gherkin
Scenario: Parent scene sets a RectTransform prop
  Given a child Scene script exports RectTransform
  And exposes "@prop({ type: RectTransform })"
  When a parent .scene sets "rectTransform.width=\"420\""
  Then Pixifact validates the field against the child Scene contract
  And serialized source keeps dot-path attributes
  And generated TypeScript constructs "new RectTransform()"
  And the setter receives the RectTransform instance rather than a plain object
```

TDD 入口：`tests/scene-script-interface.test.ts`、`tests/scene-compiler.test.ts`、`tests/compiler-scene-commands.test.ts`。

### BDD-PROP-003 Inspector edits structured fields

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

TDD 入口：`tests/project-file-tree.test.ts`、`tests/editor-workbench-ui.test.ts`。

## 3. Editor

### BDD-EDITOR-001 Editor 预览外部修改

Feature: Editor refreshes after external scene edits

```gherkin
Scenario: External agent changes the opened .scene file
  Given a compiler .scene is open in the Editor
  When an external agent changes that file
  Then the Editor refreshes the compiler scene document
  And the viewport reflects the new source
```

TDD 入口：`tests/project-file-tree.test.ts`、`tests/editor-live-context-ui.test.ts`。

### BDD-EDITOR-002 资产浏览不编辑源资源

Feature: Project asset browsing

```gherkin
Scenario: User opens a source asset
  Given a project contains images, audio, scripts, and data files
  When the user double-clicks a concrete asset
  Then Pixifact delegates to the system default application
  And Pixifact does not edit the asset bytes
```

TDD 入口：`tests/project-file-tree.test.ts`。

### BDD-EDITOR-003 Zustand 不保存项目数据

Feature: UI store persistence boundary

```gherkin
Scenario: Editor UI preferences are persisted
  Given the user changes panel layout or language
  When the editor store persists state
  Then only lightweight UI preferences are stored
  And Scene source, project file contents, and secrets are not stored in Zustand
```

TDD 入口：`tests/editor-store.test.ts`。

## 4. CLI

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

## 6. Non-Goals

- Pixifact 不提供内置模型服务、模拟 Agent 服务或内置 AI chat 作为主开发路径。
- Pixifact 不提供 Git/PR/CI/任务编排能力。
- Editor live bridge 不提供 mutation action。
- 外部 Agent 不使用 `SceneCommand[]` 作为项目修改协议。
