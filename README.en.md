# Pixifact AI-first Game Editor

Pixifact is an editor-first AI game UI and lightweight gameplay authoring tool.

This repository is no longer defined by the standalone `pixifact` framework. The editor product is the center of gravity. The `pixifact` runtime, prefab model, commands, `EditorDocument`, and related code under `src/` are the foundation that makes the editor possible.

[中文](./README.md)

## Product Positioning

Pixifact's primary authoring loop is:

```txt
Prompt -> EditorCommand -> Validate / Repair -> EditorDocument -> Runtime Preview -> Export / Import
```

The current Alpha still exposes a `Proposal -> Dry Run -> Diff -> Apply` review flow so command validation, diffing, undo, export, and import can be verified. The product direction is send-and-execute: the user describes the goal, AI returns structured commands, the editor validates and repairs them, then applies legal changes to `EditorDocument`.

## Boundaries

- `apps/editor/` is the product surface.
- `EditorDocument` is the only source of truth for project data.
- Zustand stores UI state only, not copies of PrefabSpec or EditorDocument.
- AI cannot directly mutate projects; it can only produce structured commands / proposals.
- Real project changes must go through `EditorDocument` APIs or commands.
- JSON is an asset format, not the primary editing surface.
- No Monaco and no embedded TypeScript editor.
- The runtime is the preview and prefab-instantiation foundation, not the repository's main product goal.

## Repository Layout

```txt
apps/editor/                  AI-first editor product
apps/editor-dockview-prototype/  IDE-style dock layout interaction prototype
src/                          editor domain model, commands, prefab, and runtime foundation
src/editor/                   EditorDocument, AI context, diff, memory, logic, and editor-domain models
src/commands/                 EditorCommand validation / apply / undo foundation
src/prefab/                   PrefabSpec, DSL, templates, and runtime instantiation
examples/                     runtime examples, not editor product surfaces
tests/                        unit tests and editor-domain tests
tests/e2e/                    Playwright Alpha workflow tests
sample-projects/              projects importable by the editor
skills/                       repository-owned Codex skills
```

## Run The Editor

```bash
bun install
bun run editor
```

Vite prints the local URL, usually:

```txt
http://localhost:5173/
```

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

The gateway only returns structured proposals. It does not mutate `EditorDocument` and does not write project files.

## Verification

Run the smallest relevant check first.

Editor changes:

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run test
bun run editor:build
```

Alpha workflow changes:

```bash
bun run editor:e2e
```

Runtime / package-entry changes:

```bash
bun run build
bun run example:build
```

## Package Entry Points

The npm package name is `pixifact`. Public entry points expose runtime and editor-domain APIs directly:

```ts
import { Application, GameObject, Group } from 'pixifact';
import { Button, Input, ScrollView, Textarea } from 'pixifact/ui';
import { Layout, GridLayout } from 'pixifact/core';
```

Editor-first domain entry points:

```ts
import { EditorDocument } from 'pixifact/editor';
import { applyCommand } from 'pixifact/commands';
import { instantiate } from 'pixifact/prefab';
```

These APIs are the editor runtime foundation. New runtime work should serve editor workflows, prefab instantiation, viewport preview, command application, and export instead of growing into an independent general-purpose framework.

## Codex Skills

The repository-owned Codex skill lives at:

```txt
skills/pixifact-editor
```

The skill covers Pixifact editor work and the underlying runtime conventions.

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
