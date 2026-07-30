# Scene Constructor Boundary

Status: Complete

Superseded in part by [Scene Binding](./scene-binding.md). The parameterized user-constructor prohibition remains; the old zero-argument runtime construction and Editor lifecycle-preview decisions do not.

## Goal

Require every `@scene()` class to be constructable without arguments while preserving normal Editor lifecycle preview.

## Decisions

- A Scene owns its node tree and UI logic related to that tree.
- `@scene()` classes must not declare constructor parameters.
- `onMounted()` may rely only on the Scene's mounted node tree and local UI state.
- Runtime data, services, controllers, and callbacks enter through explicit methods after construction.
- Runtime accepts an initial Props object through the framework-generated Scene wrapper while user `@scene()` classes still declare no constructor parameters.
- Editor Authoring does not import project scripts or run constructors and lifecycle hooks.

## Non-Goals

- Add arbitrary dependency injection, preview factories, or a dependency injection container.

## Implementation Scope

- Reject parameterized `@scene()` constructors during script interface extraction.
- Editor lifecycle preview was removed by the later static Authoring renderer.
- Document the Scene construction rule for downstream authors.

## Test Plan

- Assert that script interface extraction rejects an `@scene()` constructor with parameters.
- The superseding Scene Binding tests assert runtime lifecycle order and that Editor Authoring does not execute project TypeScript.

## Verification

```bash
rtk bun run test -- scene-script-interface.test.ts project-file-tree.test.ts
rtk bunx --no-install tsc -p apps/editor/tsconfig.json
rtk bun run editor:frontend:build
```

## Progress

- [x] Reject parameterized Scene constructors.
- [x] Replaced Editor lifecycle preview with static Authoring preview under Scene Binding.
- [x] Update authoring documentation.

## Resume Protocol

1. Check the worktree.
2. Run the two target test files.
3. Continue from the first incomplete item above.

## Resume Notes

Last updated: 2026-07-11

Done:
- Script interface extraction rejects parameterized `@scene()` constructors.
- Runtime runs `onMounted()` after initial Props and bindings; Editor Authoring does not run it.
- Chinese and English authoring documents define the construction boundary.

Next:
- None.
