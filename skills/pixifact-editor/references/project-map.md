# Pixifact Project Map

## Purpose

Pixifact is a standalone 2D UI and lightweight scene framework. The editor, MCP server, and external agents consume the same Scene semantic layer from `packages/pixifact/`.

## Important Paths

- `packages/pixifact/` - core package published as `pixifact`.
- `packages/pixifact/src/runtime/` - Application, GameObject, Transform, Group, Component, Layout, and PixiJS bridge.
- `packages/pixifact/src/nodes/` - runtime nodes and compound controls.
- `packages/pixifact/src/scene/` - Scene spec, templates, DSL, and runtime instantiation.
- `packages/pixifact/src/commands/` - SceneCommand validation and application.
- `packages/pixifact/src/authoring/` - SceneDocument, AI context/proposal, diff, action/logic/memory authoring models.
- `packages/pixifact-mcp/` - MCP server for local Scene automation.
- `apps/editor/` - Pixifact desktop editor product.
- `apps/editor/src-tauri/` - Tauri desktop host.
- `apps/editor/src/panels/` - editor panels.
- `apps/editor/src/components/` - shared React controls and system components.
- `apps/editor/src/preview/` - runtime preview integration.
- `apps/editor/src/services/` - editor application services.
- `apps/editor/src/gateway/` - real AI gateway adapter sample.
- `examples/basic/` - runtime example app.
- `tests/` - unit, editor-domain, and MCP tests.
- `PLAN.md` - current Scene migration and project plan.
- `skills/` - repository-owned Codex skills.
- `scripts/install-skills.mjs` - installs repository skills into Codex's skills directory.

## Runtime Package Shape

Public package entry points are declared in `packages/pixifact/package.json`:

- `pixifact`
- `pixifact/runtime`
- `pixifact/nodes`
- `pixifact/scene`
- `pixifact/commands`
- `pixifact/authoring`

Build output is generated under `packages/pixifact/dist/`. Do not edit generated output by hand unless the user specifically asks for generated artifacts.

## Commands

```bash
bun install
bun run test
bun run editor:frontend:build
bun run build
bun run example:build
bun run skills:install
```

`bun run editor` launches the Tauri desktop editor. Standalone browser editor and browser Playwright workflows are not maintained.

`bun run skills:install` copies every skill folder under `skills/` into `${CODEX_HOME:-$HOME/.codex}/skills`.
