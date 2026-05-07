# Pixifact Project Map

## Purpose

Pixifact is an editor-first AI game UI and lightweight gameplay authoring tool. The editor product lives in `apps/editor/`. The `pixifact` runtime package under `src/` is the foundation for Prefab instantiation, viewport preview, command application, tests, and exported runtime code.

## Important Paths

- `apps/editor/` - AI-first editor product.
- `apps/editor/src/EditorApp.tsx` - top-level editor composition and document subscription.
- `apps/editor/src/panels/` - editor panels.
- `apps/editor/src/components/` - shared React controls and system components.
- `apps/editor/src/preview/` - runtime preview integration.
- `apps/editor/src/services/` - editor application services.
- `apps/editor/src/gateway/` - real AI gateway adapter sample.
- `apps/editor-dockview-prototype/` - IDE-style dock layout interaction prototype.
- `src/editor/` - EditorDocument, AI context/proposal, diff, action/logic/memory editor models.
- `src/commands/` - editor command validation and application.
- `src/prefab/` - Prefab spec, templates, DSL, and runtime instantiation.
- `src/core/` - runtime foundation: Application, GameObject, Transform, Group, Component, Layout.
- `src/ui/` - runtime UI components including Button, ScrollView, Input, and Textarea.
- `examples/basic/` - runtime example app, not the editor product.
- `tests/` - unit and editor-domain tests.
- `tests/e2e/` - Playwright Alpha workflow tests.
- `PLAN.md` - editor-first project plan.
- `AI_FIRST_GAME_EDITOR_PLAN.md` - detailed product and architecture plan.
- `skills/` - repository-owned Codex skills.
- `scripts/install-skills.mjs` - installs repository skills into Codex's skills directory.

## Runtime Package Shape

Public package entry points are declared in `package.json`:

- `pixifact`
- `pixifact/core`
- `pixifact/ui`
- `pixifact/editor`
- `pixifact/commands`
- `pixifact/prefab`

Build output is generated under `dist/`. Do not edit `dist/` by hand unless the user specifically asks for generated artifacts.

## Commands

```bash
bun install
bun run test
bun run editor:build
bun run editor:e2e
bun run build
bun run example:build
bun run skills:install
```

`bun run skills:install` copies every skill folder under `skills/` into `${CODEX_HOME:-$HOME/.codex}/skills`.
