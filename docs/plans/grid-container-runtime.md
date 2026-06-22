# GridContainer Runtime

## Goal

Add a runtime `GridContainer` for Pixifact UI scenes. It lays out children from left to right and top to bottom with a fixed column count.

## Decisions

- `GridContainer` is a runtime Pixi node exported from `pixifact/runtime`.
- It extends `Control`, matching `HBoxContainer` and `VBoxContainer`.
- It is a compiler primitive node, not a built-in Scene.
- V1 props are `columns`, `gapX`, `gapY`, `alignX`, and `alignY`.
- V1 uses only `gapX` / `gapY`; no single `gap` prop.
- `columns` controls how many children are placed in each row; rows are automatic.
- Column widths are measured from the widest child in each column.
- Row heights are measured from the tallest child in each row.
- `alignX` / `alignY` align each child inside its measured cell.
- If width or height is not explicit, the container uses its natural grid size.

## Non-Goals

- No scroll behavior; use `ScrollContainer` outside the grid.
- No `cellWidth` / `cellHeight`.
- No `justify`, `justifyX`, or `justifyY`.
- No single `gap` alias.
- No old built-in Scene compatibility.

## Implementation Scope

- Runtime:
  - Add `packages/pixifact/src/runtime/GridContainer.ts`.
  - Export it from `packages/pixifact/src/runtime/index.ts`.
- Compiler:
  - Add `GridContainer` to primitive node types and parser whitelist.
  - Add schema defaults and prop groups for grid props.
  - Generate runtime imports and property assignments.
- Editor / Preview:
  - Add node template and inspector labels through existing schema/i18n flow.
  - Add preview runtime export.
- Sample:
  - Update `adventure-ui-demo` inventory content to use `GridContainer`.

## Test Plan

- Runtime:
  - `GridContainer` exports from runtime, extends `Control`, and preserves Group box-size semantics.
  - Lays children into fixed columns with `gapX` / `gapY`.
  - Measures natural width and height from column and row sizes.
  - Supports `alignX` / `alignY` inside measured cells.
- Compiler:
  - Parse, serialize, validate, and compile `<GridContainer>` as a primitive node.
  - Reject invalid `columns`, `alignX`, or `alignY`.
  - Generate `GridContainer` runtime import and prop assignments.
- Editor:
  - Node template library exposes `GridContainer`.
  - Inspector schema exposes grid props under `Stack`.
- Sample:
  - `adventure-ui-demo` inventory content uses `GridContainer` instead of manual HBox rows.

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
- Captured V1 GridContainer decisions.
- Added runtime `GridContainer`.
- Added compiler/editor/preview/schema support.
- Updated `adventure-ui-demo` inventory content to use `GridContainer`.
- Verified targeted tests, editor typecheck, build, and full test.

Current State:
- Implementation is complete.

Currently Failing:
- None.

Next:
1. Continue with future layout/runtime needs from a new plan.
