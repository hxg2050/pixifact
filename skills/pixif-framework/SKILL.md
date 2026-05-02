---
name: pixif-framework
description: Build, maintain, and document projects that use this pixif TypeScript framework. Use when working in the pixif repository or when implementing pixif UI/game-object code involving Application, GameObject, Group, Component lifecycles, Layout, GridLayout, FlexGroup/Flex, Graphics, Label, Image, NineSliceImage, Button, ScrollView, Input, Textarea, package exports, examples, tests, or PixiJS v8 integration patterns specific to pixif.
---

# Pixif Framework

## Workflow

Use this skill for pixif-specific architecture and API conventions. If the task depends on raw PixiJS v8 behavior, also consult the PixiJS skill or official PixiJS v8 docs for that lower-level API.

Start by identifying whether the work is inside this repository or in a consumer app:

- For repository work, read `README.md`, `PLAN.md`, and the relevant source files under `src/`.
- For consumer code, prefer public imports from `pixif`, `pixif/core`, or `pixif/ui`.
- For repository orientation, read `references/project-map.md`.
- For implementation conventions, read `references/patterns.md`.

## Core Rules

- Create pixif nodes with `GameObject.instantiate(Type, parent, props?)` when a parent is available.
- `GameObject.instantiate()` applies props before `render()`. Composite `Group` subclasses may read initial props while building their child tree.
- Treat `Group` as the only container node. Render leaves such as `Graphics`, `Label`, `Image`, and `NineSliceImage` should not own child nodes.
- Mount objects under `Application.root` for ticker-driven updates.
- Put reusable behavior in `Component` subclasses. Use `awake`, `start`, `update`, and `onDestroy` consistently; `start` runs once immediately before the component's first update tick. Always clean up listeners in `onDestroy`.
- Prefer logical `width` and `height` for layout decisions instead of deriving layout from Pixi bounds unless the source code already does so intentionally.
- Keep DOM-backed UI inputs aligned through the existing overlay model unless the user explicitly asks to migrate to PixiJS `DOMContainer`.
- Build reusable compound UI such as `Button` and `ScrollView` as `Group` subclasses that own their internal nodes and expose only intentional public attachment points such as `scrollView.content`.

## Layout Guidance

- Use `Layout` for parent-relative positioning, centering, edge constraints, and stretch constraints.
- Prefer `centerX` and `centerY`; `vertical` and `horizontal` are legacy aliases.
- Use `GridLayout` for fixed grid placement.
- Use `FlexGroup` on a `Group` and `Flex` on children for row/column distribution.
- Preserve microtask-batched layout refresh behavior when changing layout components.

## Verification

For repository changes, run the smallest relevant check first:

```bash
pnpm test
```

Use these when touched code warrants it:

```bash
pnpm build
pnpm example:build
```
