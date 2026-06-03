# Pixifact

Pixifact is a Scene, UI, lightweight scene, and project asset management layer for AI-assisted full game development. PixiJS is the rendering implementation underneath; Pixifact provides `.scene` source files, validation, compilation, preview, and runtime loading.

Codex, Claude Code, and similar external coding agents are the primary AI entry points. Pixifact CLI is the tool layer those agents use to understand, edit, validate, and compile Scenes; the desktop editor lives in `apps/editor/` and provides preview, asset browsing, live context, validation feedback, and manual refinement.

Pixifact focuses on one capability: AI-operable Scene authoring. Agent orchestration, Git branches / commits / reverts, task management, CI, PRs, and long-term project management belong to specialized external tools.

[中文](./README.md)

## npm Quick Start

The first Pixifact npm packages have been published:

- `pixifact`: runtime, Scene DSL, compiler, and authoring APIs.
- `pixifact-cli`: Bun-first Scene automation CLI.
- `create-pixifact`: Bun-first project scaffold.

Create a new project:

```bash
bun create pixifact my-game
cd my-game
bun install
bun run build
```

Use runtime and compiler APIs in an existing Bun project:

```bash
bun add pixifact pixi.js
bun add -d pixifact-cli
```

Common installed CLI commands:

```bash
pixifact scene validate --project-root . --all
pixifact compile-scenes --project-root .
```

`pixifact-cli` and `create-pixifact` are Bun-first tools in this release, so Bun must be installed locally.

## 0.1.3 Release Notes

`v0.1.3` is the first Pixifact npm release and includes:

- `pixifact@0.1.3`
- `pixifact-cli@0.1.3`
- `create-pixifact@0.1.3`

After publishing, the release was verified with `bun create pixifact npm-smoke`, `bun install`, and `bun run build` from npm registry packages.

## Core Model

Pixifact uses a Godot-style unified `Scene` asset model. It does not use a Unity-style split between Scene resources and Prefab resources.

The current primary agent authoring path is compiler `.scene`:

```txt
Codex / Claude Code -> inspect .scene -> edit .scene -> scene validate -> compile-scenes -> repair until valid
```

Editor is an enhancer: it provides the currently opened Scene, selected node, preview, and asset context. Without Editor, agents can still develop fully through file editing and the CLI.

Pixifact's default loop ends at `scene validate`, `compile-scenes`, and optional live context. Git diff, commits, reverts, PRs, CI, and task orchestration belong to external tools, not Pixifact built-ins.

## Repository Layout

```txt
packages/pixifact/              core Pixifact package, published as pixifact
packages/pixifact/src/runtime/  Application, GameObject, Component, layout, PixiJS bridge
packages/pixifact/src/nodes/    runtime nodes and behavior components
packages/pixifact/src/scene/    legacy SceneSpec, DSL, Scene instantiation, Scene templates
packages/pixifact/src/commands/ SceneDocument internal commands, validation, application, undo foundation
packages/pixifact/src/compiler/ compiler .scene parsing, validation, generation
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
bun run pixifact -- scene inspect --project-root /path/to/project --scene src/scenes/Button.scene
bun run pixifact -- scene validate --project-root /path/to/project --scene src/scenes/Button.scene
bun run pixifact -- scene validate --project-root /path/to/project --all
bun run pixifact -- compile-scenes --project-root /path/to/project
```

Use `scene validate --all` after broad edits or when multiple `.scene` files may have changed.

Read-only Editor live context:

```bash
bun run pixifact -- live summary
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node 0:content/0:label
```

When Editor is running, `live scene get` can also return the selected node and the latest external `.scene` refresh or validation result so an agent can decide whether its direct edit needs repair. It does not modify project files.

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

Installing from npm will be provided later by a separate `pixifact-skills` package. The first npm release only includes the runtime package, CLI, and project scaffold.

## License

MIT
