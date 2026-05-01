# pixif

pixif is a lightweight TypeScript wrapper around PixiJS v8. It adds a UI- and game-object-oriented layer on top of Pixi's rendering model.

It keeps PixiJS rendering primitives while adding `GameObject`, `Group`, component lifecycles, layout components, and DOM-backed input controls. It is suitable for interactive 2D scenes, tool UIs, and lightweight canvas-based interfaces.

[中文](./README.md)

## Features

- Built on PixiJS v8 and compatible with the Pixi ecosystem.
- `GameObject.instantiate()` for object creation and parenting.
- `Group` as the only container node; render leaves do not manage children.
- `Application` drives active objects and components through a single `app.ticker` callback.
- Layout helpers including `Layout`, `GridLayout`, and `FlexGroup`.
- DOM-backed `Input` and `Textarea` components for real text entry inside Pixi scenes.
- Rollup build, Vitest tests, and a Vite example.

## Installation

```bash
pnpm add pixif pixi.js
```

For local development in this repository:

```bash
pnpm install
```

## Quick Start

```ts
import {
    Application,
    GameObject,
    Graphics,
    Group,
    Label,
    LabelStyle,
    Layout,
} from 'pixif';

const app = new Application();

await app.init({
    resizeTo: window,
    backgroundColor: 0xf4f0e6,
    antialias: true,
});

document.body.append(app.canvas);

const stage = app.root;

const panel = GameObject.instantiate(Group, stage, {
    width: 360,
    height: 220,
    anchorX: 0.5,
    anchorY: 0.5,
});

panel.addComponent(Layout, {
    centerX: 0,
    centerY: 0,
});

GameObject.instantiate(Graphics, panel)
    .roundRect(0, 0, panel.width, panel.height, 12)
    .fill(0xffffff)
    .stroke({ width: 1, color: 0x2f3437, alpha: 0.18 });

GameObject.instantiate(Label, panel, {
    value: 'Hello pixif',
    x: 24,
    y: 24,
    style: new LabelStyle({
        fill: 0x23272a,
        fontSize: 24,
        fontWeight: '700',
    }),
});
```

## Core Concepts

### Application

`Application` extends PixiJS `Application`. After initialization, it creates `app.root` as the root pixif `Group`.

Objects are updated only when they are mounted under `app.root` and either the object itself or one of its components has update work.

### GameObject

`GameObject` is the base object model in pixif. It handles:

- The underlying Pixi display object.
- Common transform properties such as position, scale, rotation, and alpha.
- Component management.
- Add, remove, resize, reposition, and ticker events.

Use `GameObject.instantiate()` to create objects:

```ts
const group = GameObject.instantiate(Group, app.root, {
    x: 100,
    y: 80,
    width: 200,
    height: 120,
});
```

### Group and Leaves

`Group` is the only container node in the current model.

`Graphics`, `Label`, `Image`, and `NineSliceImage` are render leaves. They render content but do not manage child nodes.

### Component

Components can be attached to a `GameObject`:

```ts
import { Component, Group } from 'pixif';

class Spinner extends Component<Group> {
    speed = 0.02;

    update(dt: number) {
        this.gameObject.rotation += this.speed * dt;
    }
}

group.addComponent(Spinner);
```

Component `update()` methods are driven by `app.ticker` after the object is mounted under `Application.root`.

## Layout

### Layout

`Layout` positions an object relative to its parent. It supports centering, edge constraints, and stretching:

```ts
panel.addComponent(Layout, {
    centerX: 0,
    centerY: 0,
});
```

```ts
child.addComponent(Layout, {
    left: 20,
    right: 20,
    top: 10,
    bottom: 10,
    minWidth: 80,
    minHeight: 40,
});
```

### GridLayout

`GridLayout` arranges child nodes in a grid:

```ts
grid.addComponent(GridLayout, {
    col: 3,
    gridWidth: 120,
    gridHeight: 80,
    gapHorizontal: 16,
    gapVertical: 16,
});
```

### FlexGroup

`FlexGroup` arranges children in a flexible horizontal or vertical list.

## UI Inputs

`Input` and `Textarea` use real HTML elements for text entry, then synchronize the DOM element with the Pixi canvas position.

```ts
const input = GameObject.instantiate(Input, form, {
    x: 18,
    y: 88,
    width: 174,
    height: 44,
    fontSize: 16,
});

input.value = 'pixif';
```

Notes:

- Input components align to a target canvas. By default they use the first `canvas` on the page.
- If the page has multiple canvases, pass the `canvas` property explicitly.
- DOM input components listen to window resize and scroll events to keep their position in sync.
- The current implementation keeps a self-managed DOM overlay and does not migrate to the experimental PixiJS v8 `DOMContainer`.

## Example

Run the basic example:

```bash
pnpm example
```

Build the basic example:

```bash
pnpm example:build
```

Example source:

```text
examples/basic/src/main.ts
```

## Codex Skills

The pixif npm package ships a project-specific Codex skill:

```text
skills/pixif-framework
```

Install from npm without cloning the repository:

```bash
npm exec --package pixif -- pixif-skills --replace
```

If pixif is already installed as a dependency in the current project:

```bash
pnpm exec pixif-skills --replace
```

When developing inside the pixif source repository:

```bash
pnpm skills:install
```

The default target is `${CODEX_HOME:-$HOME/.codex}/skills`. To install elsewhere:

```bash
node scripts/install-skills.mjs --target /path/to/skills --replace
```

After installation, use `$pixif-framework` in Codex for pixif-specific components, layout, examples, tests, and package-entry conventions.

## Development Scripts

```bash
pnpm test
```

Run Vitest tests.

```bash
pnpm build
```

Build `dist` with Rollup.

```bash
pnpm example
```

Start the Vite example.

```bash
pnpm example:build
```

Build the example project.

```bash
pnpm skills:install
```

Install the repository-owned Codex skills from the source checkout.

## Package Entry Points

```ts
import { Application, GameObject, Group } from 'pixif';
import { Input, Textarea } from 'pixif/ui';
import { Layout, GridLayout } from 'pixif/core';
```

Available entry points:

- `pixif`
- `pixif/core`
- `pixif/ui`

## License

MIT
