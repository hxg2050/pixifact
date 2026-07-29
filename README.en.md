# Pixifact

Pixifact is a Scene, UI, lightweight scene, and project asset management layer for AI-assisted full game development. PixiJS is the rendering implementation underneath; Pixifact provides `.scene` source files, validation, compilation, preview, and runtime loading.

Codex, Claude Code, and similar external coding agents are the primary AI entry points. Pixifact CLI is the tool layer those agents use to understand, edit, validate, and compile Scenes; the browser Editor lives in `apps/editor/` and provides preview, asset browsing, an Inspector, and manual refinement.

Pixifact focuses on one capability: AI-operable Scene authoring. Agent orchestration, Git branches / commits / reverts, task management, CI, PRs, and long-term project management belong to specialized external tools.

[中文](./README.md)

## Start Here

- [Docs](./docs/en/index.md): public English documentation entry.
- [Layout](./docs/en/layout.md): design resolution, viewport adaptation, frame layout, and editor layout controls.
- [Scene Objects](./docs/en/scene-objects.md): official `.scene` object tags, props, use cases, and examples.
- [Agent Scene Authoring](./docs/en/agent-scene-authoring.md): how external agents edit `.scene` source.
- [WeChat Mini Game Builds](./docs/en/wechat-minigame.md): game target, platform runtime, resource delivery, and build output.
- [Internal Docs](./internal-docs/index.md): repository maintenance, testing, release, plans, and historical specs.

## npm Quick Start

The current Pixifact npm packages are:

- `pixifact`: runtime extensions, project config, and compiler APIs.
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
pixifact scene validate --all
pixifact compile-scenes
pixifact editor
```

Build a WeChat Mini Game:

```bash
pixifact validate --target wechat
pixifact build --target wechat
pixifact dev --target wechat
```

`pixifact-cli` and `create-pixifact` are Bun-first tools in this release, so Bun must be installed locally.

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
packages/pixifact/src/runtime/  Pixifact runtime extensions such as Group
packages/pixifact/src/scene/    Scene runtime public entry point
packages/pixifact/src/platform/ game-target platform runtimes
packages/pixifact/src/project/  pixifact.project.json parsing and project summaries
packages/pixifact/src/compiler/ compiler .scene parsing, validation, generation
packages/pixifact-cli/          Pixifact CLI and local browser Editor service
apps/editor/                    Pixifact browser Editor Vue / Vite frontend
tests/                          unit, editor, and CLI tests
skills/                         repository-owned Codex skills
```

## Run

Run the Editor from the target project root:

```bash
pixifact editor
```

When maintaining this repository, run `bun run editor`; it builds the Vue frontend, starts a local Bun service bound to `127.0.0.1`, and opens the system browser. Inspector input updates the long-lived Pixi preview immediately, then blur or Enter writes the versioned `.scene` file. Undo and Redo save automatically as well.

## CLI

The CLI is the primary entry point for external agents operating on Pixifact projects. Pixifact does not treat built-in chat or a built-in model service as the main AI path.

Common commands:

```bash
pixifact summary
pixifact scene inspect --scene src/scenes/Button.scene
pixifact scene validate --scene src/scenes/Button.scene
pixifact scene validate --all
pixifact compile-scenes
```

The default project root is the current working directory. Add `--project-root <path>` only when running outside the project root. Use `scene validate --all` after broad edits or when multiple `.scene` files may have changed.

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
import { Group } from 'pixifact/runtime';
import { prepareSceneClass, scene } from 'pixifact/scene';
import { createSceneRevision, parseSceneTemplate } from 'pixifact/compiler';
import { createWechatPixiApplication } from 'pixifact/platform/wechat';
import { parsePixifactProjectConfig } from 'pixifact';
```

The root `pixifact` entry exports project config helpers, runtime extensions, and common CLI error hints. Scene decorators, events, slots, async preparation, and asset loading are exported from `pixifact/scene`; compiler APIs come from `pixifact/compiler`; the WeChat platform runtime comes from `pixifact/platform/wechat`.

## Verification

Run the smallest relevant check first.

```bash
bun run test
```

Editor changes:

```bash
bun run editor:typecheck
bun run editor:frontend:build
```

Runtime or export API changes:

```bash
bun run build
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

Installing skills from npm will be provided later by a separate `pixifact-skills` package. The current public npm packages only include the runtime package, CLI, and project scaffold.

## License

MIT
