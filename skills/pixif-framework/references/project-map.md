# pixif Project Map

## Purpose

pixif is a lightweight TypeScript wrapper around PixiJS v8. It keeps Pixi rendering primitives while adding a UI/game-object model, component lifecycle, layout helpers, and DOM-backed input controls.

## Important Paths

- `src/index.ts` - package root exports.
- `src/core/index.ts` - core public exports.
- `src/core/Application.ts` - Pixi application wrapper and root `Group` setup.
- `src/core/GameObject.ts` - base object model, properties, events, components, update registration.
- `src/core/group/index.ts` - `Group`, the only pixif container node.
- `src/core/component/` - `Component`, `Layout`, `GridLayout`, `FlexGroup`, and `Flex`.
- `src/core/graphics/`, `src/core/label/`, `src/core/image/` - render leaf wrappers.
- `src/ui/` - UI components including `Button`, `ScrollView`, and DOM-backed `Input` / `Textarea`.
- `examples/basic/` - Vite example app.
- `tests/` - Vitest coverage for core and UI behavior.
- `PLAN.md` - architecture decisions and completed cleanup notes.
- `skills/` - repository-owned Codex skills.
- `scripts/install-skills.mjs` - installs repository skills into Codex's skills directory.

## Package Shape

Public entry points are declared in `package.json`:

- `pixif`
- `pixif/core`
- `pixif/ui`

Build output is generated under `dist/`. Do not edit `dist/` by hand unless the user specifically asks for generated artifacts.

## Commands

```bash
pnpm install
pnpm test
pnpm build
pnpm example
pnpm example:build
pnpm skills:install
```

`pnpm skills:install` copies every skill folder under `skills/` into `${CODEX_HOME:-$HOME/.codex}/skills`.
