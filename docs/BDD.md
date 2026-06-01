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

## 2. Editor

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

## 3. CLI

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

## 4. Runtime

### BDD-RUNTIME-001 Scene runtime loads generated output

Feature: Runtime scene loading

```gherkin
Scenario: Game loads compiled scene output
  Given a compiler .scene has been compiled
  When the game imports generated scene code
  Then PixiJS runtime objects are created from the generated mount function
  And gameplay code binds to declared parts, props, events, and slots
```

TDD 入口：`tests/core.test.ts`、`tests/ui.test.ts`、sample project build tests。

## 5. Non-Goals

- Pixifact 不提供内置模型服务、模拟 Agent 服务或内置 AI chat 作为主开发路径。
- Pixifact 不提供 Git/PR/CI/任务编排能力。
- Editor live bridge 不提供 mutation action。
- 外部 Agent 不使用 `SceneCommand[]` 作为项目修改协议。
