# Pixifact

Pixifact is a Bun-first framework for AI-editable 2D game UI, HUDs, menus, and lightweight scenes on top of PixiJS v8.

Use `pixifact` for runtime APIs, Scene instantiation, compiler APIs, and generated Scene runtime support.

## Install

```bash
bun add pixifact pixi.js
```

## Usage

```ts
import { Application } from 'pixifact/runtime';
import { scene, container, text } from 'pixifact/scene';
```

Compiler Scene projects usually also install the CLI:

```bash
bun add -d pixifact-cli
```

Then validate and compile `.scene` files:

```bash
pixifact scene validate --project-root . --all
pixifact compile-scenes --project-root .
```

## Scene Workflow

Pixifact treats project-relative `.scene` files as the source of truth. External agents edit `.scene` source directly, then run validation and compilation.

Generated files such as `.pixifact/generated/**` are build artifacts and should not be edited by hand.

## Requirements

- Bun
- PixiJS v8

The desktop editor is distributed separately from the npm runtime package.
