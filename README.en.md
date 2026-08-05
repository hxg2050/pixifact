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
- [Agent Runtime](./docs/en/runtime-agent.md): how external agents observe and operate a running Vite Web game.
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

Pixifact's default loop ends at `scene validate`, `compile-scenes`, and optional read-only Editor context. Git diff, commits, reverts, PRs, CI, and task orchestration belong to external tools, not Pixifact built-ins.

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

When maintaining this repository, run `bun run editor`; it builds the Vue frontend, starts a local Bun service bound to `127.0.0.1`, and opens the system browser. The hierarchy can add, duplicate, delete, reorder, and reparent nodes by dragging the node row. Every completed operation is saved automatically and available to Undo / Redo. Structural changes replace only the Scene preview root while the Pixi Application and Canvas remain alive. Inspector input updates runtime nodes immediately, then blur or Enter writes the versioned `.scene` file.

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

When Editor is running and its Scene is synchronized, external agents can read the current Scene and selection:

```bash
pixifact editor context
```

This command only returns the project, Scene revision, sync state, and current selection. It does not modify project files. Agents still edit `.scene` directly and run the file validation commands. The retired `live ...` commands and fixed-port bridge remain removed.

## Agent Runtime

A Vite Web game can opt into the development Runtime so an external agent can read the real PixiJS tree, explicit business state, and logs and can operate the game through renderer coordinates or keyboard input without browser tooling:

```bash
pixifact runtime list
pixifact runtime tree --output .pixifact/runtime/tree.json
pixifact runtime state
pixifact runtime logs --after 42
pixifact runtime input click --x 640 --y 360
```

Add `pixifactRuntimePlugin` to the Vite config and call `registerPixiRuntime(app, { getState? })` once after development startup. Runtime traverses `app.stage` directly, maintains no Scene Instance tree, exposes no eval or state mutation, and never registers Editor Authoring Preview. See [Agent Runtime](./docs/en/runtime-agent.md) for setup and boundaries.

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
import { registerPixiRuntime } from 'pixifact/runtime-dev';
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
