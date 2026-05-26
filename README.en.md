# Pixifact

Pixifact is a Scene, UI, lightweight scene, and project asset management layer for AI-assisted full game development. PixiJS is the rendering implementation underneath; Pixifact exposes Scene, node, behavior component, command, compiler `.scene`, and validation semantics.

Codex, Claude Code, and similar coding agents are the primary AI entry points. Pixifact CLI is the tool layer those agents use to understand, edit, validate, and compile Scenes; the desktop editor lives in `apps/editor/` and is used for preview, asset browsing, validation feedback, and manual refinement; the runtime loads `.scene` assets in the game.

Pixifact focuses on one capability: AI-operable Scene authoring. Agent orchestration, Git branches / commits / reverts, task management, CI, PRs, and long-term project management belong to specialized external tools instead of Pixifact.

[中文](./README.md)

## Core Model

Pixifact uses a Godot-style unified `Scene` asset model. It does not use a Unity-style split between Scene resources and Prefab resources.

There are currently two Scene authoring paths:

- Legacy `SceneSpec`: `SceneCommand[]` is the agent edit entry point for the existing `container` / `image` / `text` / `input` / `shape` semantic layer.
- Compiler `.scene`: the `.scene` source file is the agent edit entry point. The default flow is direct `.scene` editing followed by `scene validate` and `compile-scenes`; use `.scene proposal` check/apply only when stale-write protection or explicit review is needed. See [Agent Scene Authoring](./docs/AI_SCENE_AUTHORING.md).

```txt
Codex / Claude Code -> Pixifact CLI -> SceneCommand -> Validate / Dry Run -> SceneDocument -> Editor Preview -> Runtime
```

The flow above describes legacy `SceneSpec`. Compiler scene defaults to this flow:

```txt
Codex / Claude Code -> edit .scene -> Pixifact CLI validate -> Compile -> Editor Preview -> Runtime
```

- `.scene` files store `SceneSpec`.
- `SceneSpec.root` must be a `container`.
- Public node kinds are only `container`, `image`, `text`, `input`, and `shape`.
- Only `container` nodes can contain children.
- Every node can carry behavior components.
- Button, ProgressBar, ScrollView, and similar controls are Scene templates or compound controls, not base display nodes.
- `ui.TextGraphic`, `ui.ImageGraphic`, and `ui.RoundedRectGraphic` are internal runtime implementation details, not authoring APIs.

## Repository Layout

```txt
packages/pixifact/              core Pixifact package, published as pixifact
packages/pixifact/src/runtime/  Application, GameObject, Component, layout, PixiJS bridge
packages/pixifact/src/nodes/    runtime nodes and compound controls
packages/pixifact/src/scene/    SceneSpec, DSL, Scene instantiation, Scene templates
packages/pixifact/src/commands/ SceneCommand validation, application, undo foundation
packages/pixifact/src/authoring/SceneDocument, selection, diff, AI context, locks, actions, logic
packages/pixifact-cli/          Pixifact CLI; depends on pixifact, not on the desktop editor
apps/editor/                    Pixifact desktop editor React / Vite frontend
apps/editor/src-tauri/          Tauri desktop host
examples/                       runtime examples
tests/                          unit, editor, and CLI tests
sample-projects/                sample Pixifact projects
skills/                         repository-owned Codex skills
```

## Run

```bash
bun install
bun run desktop
```

`bun run editor` is an alias for `bun run desktop`. The project no longer provides or maintains a browser editor entry; the Vite server started by Tauri dev mode is only an internal desktop WebView frontend.

Alias:

```bash
bun run editor
```

Build the desktop app:

```bash
bun run desktop:build
```

Desktop development and packaging require Rust / Cargo. Users who install the packaged desktop app do not need Bun or Rust.

## CLI

The CLI is the primary entry point for external agents operating on Pixifact projects. Pixifact does not treat built-in chat as the main AI path.

For compiler `.scene`, the default agent flow is direct `.scene` source editing followed by Pixifact CLI domain validation and compilation. `.scene proposal` is only for stale-write protection, explicit review, or collaborative audit workflows; it is not the default AI development path.

For legacy `SceneSpec`, agents should read context, generate structured `SceneCommand[]`, dry-run, then apply after validation succeeds:

```bash
bun run pixifact -- summary --project-root /path/to/project
```

CLI commands read and write `SceneCommand` changes against `.scene` or `pixifact.aiEditorProject` files. Live mode operates on the currently open editor; file mode reads and writes local project files directly.

The legacy agent workflow is documented in:

```txt
docs/AGENT_CLI_WORKFLOW.md
```

The target compiler `.scene` agent workflow is documented in:

```txt
docs/AI_SCENE_AUTHORING.md
```

Common validation commands:

```bash
bun run pixifact -- scene validate --project-root /path/to/project --scene scenes/Button.scene
bun run pixifact -- compile-scenes --project-root /path/to/project
```

## Project Asset Boundary

Pixifact Editor provides project asset browsing, lightweight previews, resource references, and validation. It does not edit source assets.

- Scene files open and edit inside the Editor.
- Images, audio, fonts, data files, and similar assets can have lightweight previews for content and path checks.
- Double-clicking a concrete asset opens it with the system default application.
- Script files are not edited inside the Editor; opening a script delegates to an external code editor.
- Codex / Claude Code still owns full game code development. Pixifact owns the visual Scene, UI, lightweight scene, and resource-reference layer.

## Legacy Gateway Sample

Gateway is not the primary agent path for compiler `.scene`. The recommended flow is external agents such as Codex and Claude Code calling Pixifact CLI. This section only keeps the legacy gateway adapter sample.

Start the gateway adapter:

```bash
bun run editor:gateway
```

Or pass a model key through the environment:

```bash
OPENAI_API_KEY=your-key bun run editor:gateway
```

Default Remote endpoint:

```txt
http://localhost:8788/proposal
```

The gateway only returns legacy structured proposals. It does not mutate `SceneDocument` and does not write project files.

## Package Entry Points

```ts
import { Application, GameObject, Group } from 'pixifact/runtime';
import { SceneDocument } from 'pixifact/authoring';
import { applySceneCommand, validateSceneCommand } from 'pixifact/commands';
import { container, scene, shape, text, instantiateScene } from 'pixifact/scene';
```

The root `pixifact` entry also exports the public semantic layer for editor, CLI, and tests.

## Verification

Run the smallest relevant check first.

```bash
bun run test
```

Editor changes:

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run editor:frontend:build
```

Runtime or export API changes:

```bash
bun run build
bun run example:build
```

## Codex Skills

The repository-owned Codex skill lives at:

```txt
skills/pixifact
```

Install from the source checkout:

```bash
bun run skills:install
```

Install from the published package:

```bash
bunx --package pixifact pixifact-skills --replace
```

## License

MIT
