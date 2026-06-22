# ScrollContainer Runtime

## Goal

Add a runtime `ScrollContainer` for Pixifact UI scenes. It provides a fixed visible box, clips overflowing content, and moves an internal content layer through `scrollX` / `scrollY`.

## Decisions

- `ScrollContainer` is a runtime Pixi node exported from `pixifact/runtime`.
- It extends `Control`, so it uses the same Pixifact box-size and frame-layout protocol as `Group` / `Control`.
- It is a compiler primitive node, not a built-in Scene.
- `.scene` authors put children directly inside `<ScrollContainer>`; they do not write or manage an explicit content wrapper.
- Runtime redirects author-added children into an internal content layer.
- The visible viewport is `width` / `height`.
- Clipping is implemented with a rectangle `Graphics` mask owned by the container.
- Content bounds are measured from the internal content layer children; no `contentWidth` / `contentHeight` props in V1.
- V1 props are `direction`, `scrollX`, and `scrollY`.
- `direction` accepts `vertical`, `horizontal`, or `both`.
- Wheel and pointer-drag scrolling are enabled by default.

## Non-Goals

- No margin or padding.
- No scrollbar rendering.
- No inertia, bounce, snap, or kinetic scrolling.
- No configurable wheel sensitivity in V1.
- No old built-in Scene compatibility.

## Implementation Scope

- Runtime:
  - Add `packages/pixifact/src/runtime/ScrollContainer.ts`.
  - Export it from `packages/pixifact/src/runtime/index.ts`.
  - Keep internal content and mask out of the authoring API.
- Compiler:
  - Add `ScrollContainer` to primitive node types and parser whitelist.
  - Add schema defaults and prop groups for `direction`, `scrollX`, and `scrollY`.
  - Generate runtime imports and property assignments.
- Editor / Preview:
  - Add node-template and inspector labels through existing schema/i18n flow.
  - Add preview runtime export.
  - Map rendered child locators through `ScrollContainer.content`.
- Sample:
  - Update `adventure-ui-demo` inventory panel to use `ScrollContainer`.

## Test Plan

- Runtime:
  - `ScrollContainer` exports from runtime, extends `Control`, preserves Group box-size semantics.
  - Author children are redirected into the internal content layer.
  - Mask and hit area track `width` / `height`.
  - `scrollX` / `scrollY` move content and clamp by direction and content bounds.
- Compiler:
  - Parse, serialize, validate, and compile `<ScrollContainer>` as a primitive node.
  - Reject invalid `direction`.
  - Generate `ScrollContainer` runtime import and prop assignments.
- Editor:
  - Node template library exposes `ScrollContainer` in the normal node group.
  - Inspector schema exposes scroll props under `Props`.
  - Runtime preview maps children inside `ScrollContainer` to their real rendered nodes.
- Sample:
  - `adventure-ui-demo` uses `ScrollContainer` for inventory content.

## Verification

- Passed: `rtk bunx --no-install vitest run tests/scene-compiler.test.ts tests/compiler-scene-document-controller.test.ts tests/project-file-tree.test.ts tests/sample-projects.test.ts`
- Passed: `rtk bunx --no-install tsc -p apps/editor/tsconfig.json`
- Passed: `rtk bun run build`
- Passed: `rtk bun run test`

## Progress

- [x] Decisions captured.
- [x] Failing tests added.
- [x] Runtime implemented.
- [x] Compiler/editor/sample updated.
- [x] Verification passed.
- [x] Changes committed.

## Resume Protocol

1. Read `AGENTS.md`, `CODEX.md`, and this plan.
2. Run `rtk git status --short`.
3. Run the smallest failing test listed in `Resume Notes`.
4. Continue from `Next` without reopening settled design decisions unless the user changes them.
5. If stopping before completion, update `Progress` and `Resume Notes`.

## Resume Notes

Last updated: 2026-06-22

Done:
- Added runtime `ScrollContainer`.
- Added compiler/editor/preview/schema support.
- Updated `adventure-ui-demo` inventory content to use `ScrollContainer`.
- Verified targeted tests, editor typecheck, build, and full test.

Current State:
- Implementation is complete and committed as `bd05b02 Add runtime ScrollContainer`.

Currently Failing:
- None.

Next:
1. Continue with future layout/runtime needs from a new plan.
