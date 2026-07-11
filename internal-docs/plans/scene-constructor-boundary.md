# Scene Constructor Boundary

Status: Complete

## Goal

Require every `@scene()` class to be constructable without arguments while preserving normal Editor lifecycle preview.

## Decisions

- A Scene owns its node tree and UI logic related to that tree.
- `@scene()` classes must not declare constructor parameters.
- `onMounted()` may rely only on the Scene's mounted node tree and local UI state.
- Runtime data, services, controllers, and callbacks enter through explicit methods after construction.
- Editor continues to run `onMounted()` for valid Scenes; it does not suppress lifecycle hooks.

## Non-Goals

- Add constructor argument injection, preview factories, or a dependency injection container.
- Change the `@prop`, `@event`, or `@slot` contracts.

## Implementation Scope

- Reject parameterized `@scene()` constructors during script interface extraction.
- Restore Editor preview lifecycle behavior.
- Document the Scene construction rule for downstream authors.

## Test Plan

- Assert that script interface extraction rejects an `@scene()` constructor with parameters.
- Assert that Editor preview runs `onMounted()` for a zero-argument Scene.

## Verification

```bash
rtk bun run test -- scene-script-interface.test.ts project-file-tree.test.ts
rtk bunx --no-install tsc -p apps/editor/tsconfig.json
rtk bun run editor:frontend:build
```

## Progress

- [x] Reject parameterized Scene constructors.
- [x] Restore Editor lifecycle preview.
- [x] Update authoring documentation.

## Resume Protocol

1. Check the worktree.
2. Run the two target test files.
3. Continue from the first incomplete item above.

## Resume Notes

Last updated: 2026-07-11

Done:
- Script interface extraction rejects parameterized `@scene()` constructors.
- Editor preview runs `onMounted()` for valid zero-argument Scenes.
- Chinese and English authoring documents define the construction boundary.

Next:
- None.
