---
name: pixifact-editor
description: Build, maintain, and document the Pixifact AI-first editor and its runtime foundation. Use when working in this repository on apps/editor, EditorDocument, PrefabSpec, commands, AI proposal/repair flow, runtime preview, or underlying pixifact runtime code involving Application, GameObject, Group, Component lifecycles, Layout, GridLayout, FlexGroup/Flex, Graphics, Label, Image, NineSliceImage, Button, ScrollView, Input, Textarea, package exports, examples, tests, or PixiJS v8 integration patterns.
---

# Pixifact Editor And Runtime Foundation

## Workflow

Use this skill for Pixifact editor architecture and the runtime conventions that support it. If the task depends on raw PixiJS v8 behavior, also consult the PixiJS skill or official PixiJS v8 docs for that lower-level API.

Start by identifying whether the work is inside this repository or in a consumer app:

- For repository work, read `README.md`, `PLAN.md`, `AI_FIRST_GAME_EDITOR_PLAN.md`, and the relevant files under `apps/editor/` or `src/`.
- For consumer code, prefer public imports from `pixifact`, `pixifact/core`, `pixifact/ui`, `pixifact/editor`, `pixifact/commands`, or `pixifact/prefab`.
- For repository orientation, read `references/project-map.md`.
- For implementation conventions, read `references/patterns.md`.

## Core Rules

- Treat `apps/editor/` as the product center. Runtime changes should serve editor workflows, Prefab instantiation, viewport preview, command application, or export.
- `EditorDocument` is the only source of truth for editor project data.
- AI does not mutate projects directly; it produces structured commands / proposals that are validated before application.
- Create runtime nodes with `GameObject.instantiate(Type, parent, props?)` when a parent is available.
- `GameObject.instantiate()` applies props before `render()`. Composite `Group` subclasses may read initial props while building their child tree.
- Treat `Group` as the only container node. Render leaves such as `Graphics`, `Label`, `Image`, and `NineSliceImage` should not own child nodes.
- Mount objects under `Application.root` for ticker-driven updates.
- Put reusable behavior in `Component` subclasses. Use `awake`, `start`, `update`, and `onDestroy` consistently; `start` runs once immediately before the component's first update tick. Always clean up listeners in `onDestroy`.
- Prefer logical `width` and `height` for layout decisions instead of deriving layout from Pixi bounds unless the source code already does so intentionally.
- Keep DOM-backed UI inputs aligned through the existing overlay model unless the user explicitly asks to migrate to PixiJS `DOMContainer`.
- Build reusable compound UI such as `Button` and `ScrollView` as `Group` subclasses that own their internal nodes and expose only intentional public attachment points such as `scrollView.content`.

## Layout Guidance

- Use `Layout` for parent-relative positioning, centering, edge constraints, and stretch constraints.
- Use `centerX` and `centerY` for centering.
- Use `GridLayout` for fixed grid placement.
- Use `FlexGroup` on a `Group` and `Flex` on children for row/column distribution.
- Preserve microtask-batched layout refresh behavior when changing layout components.

## Verification

For repository changes, run the smallest relevant check first:

```bash
bun run test
```

Use these when touched code warrants it:

```bash
bun run build
bun run example:build
bun run editor:build
```
