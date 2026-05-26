# Pixifact

Pixifact is a Scene, UI, lightweight scene, and project asset management layer for AI-assisted full game development. PixiJS is the rendering implementation underneath; Pixifact provides `.scene` source files, validation, compilation, preview, and runtime loading.

Codex, Claude Code, and similar external coding agents are the primary AI entry points. Pixifact CLI is the tool layer those agents use to understand, edit, validate, and compile Scenes; the desktop editor lives in `apps/editor/` and provides preview, asset browsing, live context, validation feedback, and manual refinement.

Pixifact focuses on one capability: AI-operable Scene authoring. Agent orchestration, Git branches / commits / reverts, task management, CI, PRs, and long-term project management belong to specialized external tools.

[中文](./README.md)

## Core Model

Pixifact uses a Godot-style unified `Scene` asset model. It does not use a Unity-style split between Scene resources and Prefab resources.

The current primary agent authoring path is compiler `.scene`:

```txt
Codex / Claude Code -> edit .scene -> Pixifact CLI validate -> compile-scenes -> Editor preview -> Runtime
```

`.scene proposal` is an optional safety path for stale-write protection, explicit review, or collaborative audit. It is not the default AI development path.

```txt
Codex / Claude Code -> .scene proposal -> check diff -> apply -> validate / compile
```

Editor is an enhancer: it provides the currently opened Scene, selected node, preview, and asset context. Without Editor, agents can still develop fully through file editing and the CLI.

## Repository Layout

```txt
packages/pixifact/              core Pixifact package, published as pixifact
packages/pixifact/src/runtime/  Application, GameObject, Component, layout, PixiJS bridge
packages/pixifact/src/nodes/    runtime nodes and behavior components
packages/pixifact/src/scene/    legacy SceneSpec, DSL, Scene instantiation, Scene templates
packages/pixifact/src/commands/ SceneDocument internal commands, validation, application, undo foundation
packages/pixifact/src/compiler/ compiler .scene parsing, validation, proposal, generation
packages/pixifact/src/authoring/SceneDocument, selection, diff, locks, actions, logic
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

`bun run editor` is an alias for `bun run desktop`. The project does not provide a standalone browser editor entry; the Vite server started by Tauri dev mode is only an internal desktop WebView frontend.

Build the desktop app:

```bash
bun run desktop:build
```

Desktop development and packaging require Rust / Cargo. Users who install the packaged desktop app do not need Bun or Rust.

## CLI

The CLI is the primary entry point for external agents operating on Pixifact projects. Pixifact does not treat built-in chat or a built-in model service as the main AI path.

Common commands:

```bash
bun run pixifact -- summary --project-root /path/to/project
bun run pixifact -- scene inspect --project-root /path/to/project --scene scenes/Button.scene
bun run pixifact -- scene validate --project-root /path/to/project --scene scenes/Button.scene
bun run pixifact -- compile-scenes --project-root /path/to/project
```

Optional proposal review:

```bash
bun run pixifact -- scene proposal check --project-root /path/to/project --scene scenes/Button.scene --proposal proposal.json
bun run pixifact -- scene proposal apply --project-root /path/to/project --scene scenes/Button.scene --proposal proposal.json
```

Read-only Editor live context:

```bash
bun run pixifact -- live summary
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node 0:content/0:label
```

## Project Asset Boundary

Pixifact Editor provides project asset browsing, lightweight previews, resource references, and validation. It does not edit source assets.

- `.scene` files open, preview, and receive lightweight edits inside the Editor.
- Images, audio, fonts, data files, and similar assets can have lightweight previews for content and path checks.
- Double-clicking a concrete asset opens it with the system default application.
- Script files are not edited inside the Editor; opening a script delegates to an external code editor.
- Codex / Claude Code still owns full game code development. Pixifact owns the visual Scene, UI, lightweight scene, and resource-reference layer.

## Package Entry Points

```ts
import { Application, GameObject, Group } from 'pixifact/runtime';
import { SceneDocument } from 'pixifact/authoring';
import { createSceneRevision, parseSceneTemplate } from 'pixifact/compiler';
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
