# Pixifact

Pixifact is a standalone 2D UI and lightweight scene development framework. PixiJS is the rendering implementation underneath; Pixifact exposes Scene, node, behavior component, command, and authoring document semantics.

The editor, MCP server, and external agents all consume the Pixifact semantic layer. The desktop editor lives in `apps/editor/`; it is used to build UI / lightweight scenes, preview AI or agent output, refine manually, and expose controlled editing tools to Codex, Claude Code, and similar agents through MCP.

[中文](./README.md)

## Core Model

Pixifact uses a Godot-style unified `Scene` asset model. It does not use a Unity-style split between Scene resources and Prefab resources.

```txt
Prompt / Agent -> SceneCommand -> Validate / Dry Run -> SceneDocument -> instantiateScene -> Runtime Preview
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
packages/pixifact-mcp/          MCP server; depends on pixifact, not on the desktop editor
apps/editor/                    Pixifact desktop editor React / Vite frontend
apps/editor/src-tauri/          Tauri desktop host
examples/                       runtime examples
tests/                          unit, editor, and MCP tests
tests/e2e/                      Playwright editor workflow tests
sample-projects/                sample Pixifact projects
skills/                         repository-owned Codex skills
```

## Run

```bash
bun install
bun run editor
```

Desktop development entry:

```bash
bun run desktop
```

Build the desktop app:

```bash
bun run desktop:build
```

Desktop development and packaging require Rust / Cargo. Users who install the packaged desktop app do not need Bun or Rust.

## MCP

Start the MCP server:

```bash
bun run editor:mcp
```

The MCP tools read and write `SceneCommand` changes against `.scene` or `pixifact.aiEditorProject` files. With a Live Editor connection, tools operate on the open editor; without it, they read and write local project files directly.

## AI Gateway

Start the local gateway adapter:

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

The gateway only returns structured proposals. It does not mutate `SceneDocument` and does not write project files.

## Package Entry Points

```ts
import { Application, GameObject, Group } from 'pixifact/runtime';
import { SceneDocument } from 'pixifact/authoring';
import { applySceneCommand, validateSceneCommand } from 'pixifact/commands';
import { container, scene, shape, text, instantiateScene } from 'pixifact/scene';
```

The root `pixifact` entry also exports the public semantic layer for editor, MCP, and tests.

## Verification

Run the smallest relevant check first.

```bash
bun run test
```

Editor changes:

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run editor:build
```

Runtime or export API changes:

```bash
bun run build
bun run example:build
```

Alpha workflow changes:

```bash
bun run editor:e2e
```

## Codex Skills

The repository-owned Codex skill lives at:

```txt
skills/pixifact-editor
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
