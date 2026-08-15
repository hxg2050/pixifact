# Agent Runtime

Status: Experimental
Authority: Pixifact Runtime setup, CLI observation, input, and boundaries for Vite Web development
Upstream: [./index.md](./index.md), [../../README.en.md](../../README.en.md)
Update rule: Update when the Runtime registration API, Vite transport, CLI commands, or security boundary changes.

Pixifact Runtime lets an external agent observe and operate a running PixiJS game without Playwright, Browser MCP, or browser developer tools. It is a development-only observation surface, not a game state system or remote debugger.

## Setup

Enable the Runtime transport in the Vite config:

```ts
import { defineConfig } from 'vite';
import { pixifactRuntimePlugin } from 'pixifact/compiler-node';

export default defineConfig({
  plugins: [pixifactRuntimePlugin()],
});
```

Register the page's only PixiJS `Application` after game startup:

```ts
if (import.meta.env.DEV) {
  const { registerPixiRuntime } = await import('pixifact/runtime-dev');

  registerPixiRuntime(app, {
    getState: () => ({
      phase: game.phase,
      player: {
        hp: player.hp,
        coins: player.coins,
      },
    }),
  });
}
```

`getState` is optional. Call only `registerPixiRuntime(app)` when no business state should be exposed.

`getState` runs only for a `runtime state` request and must synchronously return JSON data. It can read closure or class-private state available through its normal JavaScript scope. Pixifact does not traverse the JavaScript heap or infer business meanings such as HP, inventory, or current level.

## CLI

Run from the game project root:

```bash
pixifact runtime list
pixifact runtime tree --output .pixifact/runtime/tree.json
pixifact runtime screenshot
pixifact runtime node <pixi-uid>
pixifact runtime state
pixifact runtime logs
```

Each page registers one Application. When multiple game pages are open, list them and select one explicitly:

```bash
pixifact runtime state --runtime <runtime-id>
```

Both the `runtime-id` and PixiJS `uid` values may change after a page reload. Agents must rediscover them from the current `runtime list` and `runtime tree` output rather than storing them as project data.

`runtime tree` prints the complete tree by default. When the tree is large or needs repeated searching, save a JSON snapshot instead; stdout then contains only the file path and capture metadata:

```bash
pixifact runtime tree --output .pixifact/runtime/tree.json
```

The CLI creates the output directory and stores `schemaVersion`, `capturedAt`, `runtimeId`, and `root`. This is a one-time runtime observation file, not a `.scene` data source; generate a new snapshot after a page reload.

## Screenshots

```bash
pixifact runtime screenshot
pixifact runtime screenshot --output /tmp/game.png --runtime <runtime-id>
```

When `--output` is omitted, the CLI writes the PNG to `.pixifact/runtime/frame.png` under the project root; pass `--output <png-path>` to override it. The screenshot captures the registered PixiJS `Application`'s `app.stage` as a PNG. It uses the current `app.screen` logical dimensions, `resolution: 1`, and the renderer's current background color. The CLI creates the output directory and, on success, reports the `runtimeId`, dimensions, byte count, and absolute path; failures do not create the target file.

It contains PixiJS Canvas rendering only. Browser UI, HTML/CSS, and DOM overlays are excluded. This is a one-time observation of the current state, with no screenshot history or wait conditions; effects that depend on framebuffer contents from previous frames are not guaranteed to be pixel-identical.

## PixiJS Tree

`runtime tree` traverses the current `app.stage` for every request and preserves the PixiJS `children` order. It returns PixiJS `uid`, constructor type, `label`, child index, position, scale, rotation, display fields, interaction fields, and children.

A Scene is only a normal `Container` subtree here. Runtime does not return `.scene` paths, Compiler locators, Props, or Bindings and does not maintain a second Scene Instance tree.

`runtime node <uid>` returns detailed transform, size, local/global bounds, global alpha, tint, blend mode, interaction fields, and limited Sprite, Text, and BitmapText details. Graphics returns bounds only; drawing instructions are never serialized.

## State And Logs

```bash
pixifact runtime state
pixifact runtime logs --after 42
pixifact runtime logs --level error
```

State answers "what is true now." Logs answer "what just happened." Runtime automatically captures existing `console.debug/log/info/warn/error`, `window.error`, and `unhandledrejection` output and retains the latest 500 in-memory entries. A page reload clears the buffer.

Each log has a monotonically increasing `seq`. An agent can remember the current sequence before an operation, then use `--after` to read only new logs. Stable, frequently queried state belongs in `getState`; an agent can add temporary logs inside a scope that can access private state and remove them after diagnosis.

## Input

```bash
pixifact runtime input click --x 640 --y 360
pixifact runtime input move --x 420 --y 280
pixifact runtime input key Space
pixifact runtime input keydown ArrowLeft
pixifact runtime input keyup ArrowLeft
```

Pointer commands use Pixi renderer screen coordinates. An agent can read a node's `globalBounds`, calculate its center, and click there. Browser Runtime maps that point through the Canvas DOM bounds to client coordinates.

Input commands only dispatch standard pointer and keyboard events. They do not invoke PixiJS node methods, bypass hit testing, or mutate node and business state directly. Success means only that input was dispatched; the agent must query tree, state, and logs again to determine whether animation or asynchronous work has completed.

Programmatically dispatched browser events have `isTrusted === false`, so they cannot replace user gestures required for fullscreen or audio unlock.

## Boundaries

- Vite Web development and loopback servers only.
- Transport reuses the Vite HMR WebSocket and a token-protected project descriptor in the system temporary directory. There is no fixed port or additional Runtime Host.
- Editor Authoring Preview is not registered and still executes no project gameplay logic.
- No eval, node mutation, business state mutation, direct node click, Scenario, assertions, state subscriptions, history, or persistent logs.
- The first version does not support WeChat Mini Games, production builds, gamepads, multi-touch, or network capture.
