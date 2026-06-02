---
name: pixifact
description: Use when working in a Pixifact game project: editing project-relative .scene files such as src/scenes/Hud.scene, using pixifact.project.json, running pixifact scene inspect/validate/compile-scenes, importing generated scenes, or adding Pixifact runtime, UI, HUD, menu, or lightweight game code.
---

# Pixifact

## Purpose

Use this skill for downstream Pixifact game projects. Pixifact is the authoring layer for 2D game UI, HUDs, menus, lightweight scenes, and project scene assets on top of PixiJS v8.

Assume a Pixifact game project when the workspace contains `pixifact.project.json`, project-relative `.scene` assets such as `src/scenes/Hud.scene`, generated Pixifact scene output, or `package.json` dependencies on `pixifact` / `pixifact-cli`.

When working in the Pixifact framework repository itself, follow the repository `AGENTS.md` first. Use this skill there only for sample project `.scene` assets or downstream-game workflows.

## Scene Workflow

For scene, UI, HUD, menu, layout, or visual asset tasks, edit `.scene` source first.

1. Read `package.json`, `pixifact.project.json`, and the target project-relative `.scene` file.
2. Inspect the scene when structure matters:
   ```bash
   bunx --no-install pixifact scene inspect --project-root . --scene src/scenes/MainMenu.scene
   ```
3. Edit the `.scene` directly.
4. Validate every edited scene:
   ```bash
   bunx --no-install pixifact scene validate --project-root . --scene src/scenes/MainMenu.scene
   ```
   For broad edits or uncertain impact, validate every compiler scene:
   ```bash
   bunx --no-install pixifact scene validate --project-root . --all
   ```
5. Compile after validation passes:
   ```bash
   bun run compile:scenes
   ```
   If no script exists:
   ```bash
   bunx --no-install pixifact compile-scenes --project-root .
   ```
6. Run the smallest relevant project check, usually:
   ```bash
   bun run build
   ```

Prefer project scripts such as `bun run compile:scenes`, `bun run build`, and `bun run dev` when they exist. Read `references/compiler-scene-agent.md` for the detailed `.scene` workflow.

## Hard Rules

- A Scene asset is a same-directory, same-basename pair such as `src/scenes/Hud.scene` and `src/scenes/Hud.ts`.
- The `.scene` file is the source of truth for authored visual structure, hierarchy, layout, text, images, child Scene instances, slots, and event wiring.
- The paired `.ts` file owns behavior, runtime state updates, public props/events/slots, and `@part` access.
- Do not add `script="..."` to `.scene` files.
- Do not add template paths to `@scene()`.
- Reference other Scenes with `.scene` paths, never bare names.
- Do not edit generated scene files such as `.pixifact/generated/**`, `src/generated/**`, `*.scene.generated.ts`, or `scenes.generated.ts`.
- If validation reports diagnostics, fix the `.scene` source and validate again.
- Compiler `.scene` files use a `<Scene name="...">` root.
- Primitive `.scene` tags are `Container`, `Sprite`, `NineSliceSprite`, `TilingSprite`, `Text`, `BitmapText`, `HTMLText`, and `Graphics`.
- Only `Container` accepts direct primitive children. Child Scene instances accept children only through declared slots.
- Use `<slot name="..."/>` for slot outlets.
- Use `.scene` fields such as `Text text="..."`, `Sprite texture="assets/..."`, and `Graphics shape="roundRect" fill="#ffffff"`.
- Give editable nodes stable `id` values.

## Game Code

Use TypeScript in `src/` for gameplay, state, input handling, animation, and integration with compiled scenes. Prefer public Pixifact imports:

- `pixifact`
- `pixifact/runtime`
- `pixifact/nodes`
- `pixifact/scene`
- `pixifact/compiler-node`

Use PixiJS v8 directly only for lower-level rendering or asset behavior that Pixifact does not cover. If a task depends on raw PixiJS v8 APIs, also use a PixiJS skill or official PixiJS v8 documentation.

## Completion

Do not finish after editing files only. Finish after validation and the relevant build/dev command pass, or report the exact failing command and diagnostic.
