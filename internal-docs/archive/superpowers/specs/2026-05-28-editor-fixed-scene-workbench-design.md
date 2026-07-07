# Editor Fixed Scene Workbench Design

## Goal

Redesign the Pixifact editor around the current `.scene` workflow instead of the existing Dockview panel workspace. The editor should feel like a stable Scene workbench for previewing, inspecting, validating, and composing `.scene` files.

The first implementation phase focuses on information architecture and core interaction flow. It does not add full design-tool behavior.

## Product Direction

The editor opens into a fixed four-area workbench:

- Left: `Hierarchy`, always showing the current Scene tree.
- Center: runtime `Preview`, always focused on the opened Scene.
- Right: `Inspector`, always focused on the selected Scene node.
- Bottom: `Project Shelf`, a plain project file browser.
- Footer: `Status Bar`, independent from the Project Shelf.

Dockview is not the primary product model for this flow. The MVP should use a fixed layout rather than draggable or detachable panels.

## Layout

### Top Bar

The top bar is minimal and aligned with the three main columns:

- Left: product/project identity, such as `Pixifact` and the current project name.
- Center: opened Scene name and path.
- Right: primary Scene commands: save, validate, compile, run.

Detailed validation and live-context state belongs in the footer Status Bar, not in the top bar.

### Hierarchy

The left panel is dedicated to the current Scene tree. It is not a mixed resource browser.

Expected behavior:

- Shows the opened Scene root and children.
- Supports expand/collapse.
- Supports selecting nodes.
- Shows the selected node.
- Accepts `.scene` drops from the Project Shelf as Scene Instance placement.
- Shows drop targets for root, container nodes, and slots.
- May keep small local hierarchy actions, such as add-node or hierarchy options, but file management actions do not belong here.

### Preview

The center area stays dedicated to runtime preview.

Expected behavior:

- Reuses the existing compiler Scene preview path.
- Shows the selected node bounds.
- Lets users click visible preview bounds to select a node when possible.
- Keeps viewport utilities such as zoom, fit, grid, and background controls.
- Does not support direct move/resize editing in the MVP.

### Inspector

The right panel is a traditional object property inspector.

Expected behavior:

- Shows selected node identity and type.
- Shows existing compiler Scene fields grouped by current implementation concepts, such as transform, display, and type-specific fields.
- Updates the preview after property edits.
- Marks the current Scene dirty when fields change.
- When no node is selected, it may show current Scene overview, but the default selected-node experience is the priority.

### Project Shelf

The bottom Project Shelf is a plain project file browser. Scene files, assets, scripts, documents, and unknown files all live in the same browser.

It must not expose separate top-level tabs such as `Scenes`, `Assets`, `Files`, `Diagnostics`, or `Agent`. It also must not expose type filter chips such as `All`, `Scenes`, `Images`, `Scripts`, or `Docs` in the MVP.

Expected structure:

- Header:
  - Collapse/expand control.
  - `Project` title.
  - Current folder path.
  - Search input.
  - Right-side selected item label or details heading.
- Body:
  - Left: folder tree.
  - Center: current folder contents.
  - Right: selected file preview or details.

Default UI should focus on browsing, selecting, previewing, and dragging files. New Scene, new folder, rename, delete, and other file management actions should not be visible as persistent buttons in the default Project Shelf. Those actions can remain available through existing contextual mechanisms later, but they are outside this MVP's primary visual surface.

Drag behavior:

- Drag `.scene` files from Project Shelf to Hierarchy to create Scene Instance placement.
- Drag compatible assets to Inspector fields or future compatible targets.
- Double-click `.scene` opens it as the current Scene.
- Double-click scripts, docs, assets, and unknown files follows existing external-open behavior where supported.

### Status Bar

The footer Status Bar is independent from Project Shelf.

Expected behavior:

- Shows compact current Scene state: saved/dirty, validate result, compile result, live context availability.
- Shows `CLI Context` as a status/action entry, not as a Project Shelf tab.
- Stays one-line and non-interruptive in normal states.
- Can provide a path to diagnostics details when there are validation or compile errors.
- Does not auto-expand and interrupt the user in the MVP.

## Core Interaction Flow

1. User opens a project.
2. The workbench shows Hierarchy, Preview, Inspector, Project Shelf, and Status Bar.
3. User double-clicks a `.scene` in Project Shelf.
4. The Scene opens as the current Scene.
5. Hierarchy shows the current Scene tree.
6. Preview renders the current Scene.
7. User selects a node from Hierarchy or Preview.
8. Inspector shows fields for that node.
9. User edits fields in Inspector.
10. The current Scene becomes dirty and Preview updates.
11. User drags another `.scene` from Project Shelf to Hierarchy.
12. Hierarchy shows legal drop targets and creates a Scene Instance placement.
13. Status Bar reflects saved/dirty, validate, compile, and live context state.

## MVP Scope

Included:

- Replace the Dockview-first main editor surface with the fixed workbench layout.
- Keep Hierarchy, Preview, Inspector, Project Shelf, and Status Bar visible in stable positions.
- Reuse existing compiler Scene document, hierarchy, preview, inspector, project tree, and host bridge capabilities where possible.
- Preserve `.scene` drag-to-tree behavior.
- Preserve double-click open behavior for Scene and external resources.
- Preserve save, validate, compile, run, and live context status semantics.

Excluded:

- Canvas direct manipulation for moving or resizing nodes.
- Dockview detachable, draggable, or user-rearrangeable panels.
- Persistent file creation, rename, delete, or folder management buttons in Project Shelf.
- Project Shelf type tabs or type filter chips.
- Embedded code editing.
- Image, audio, font, or script resource editing.
- Automatic diagnostics drawer expansion.
- Backward compatibility with old editor layout APIs or old external mutation surfaces.

## Implementation Boundaries

The design should respect existing Pixifact architecture:

- `.scene` source files remain the shared source of truth.
- Zustand stores only UI state, not Scene data copies.
- Editor live bridge remains read-only.
- Scene mutation should continue through existing compiler Scene document/controller paths.
- Project resources remain files; JSON is not the primary authoring entry.
- The editor may preview and reference assets, but does not edit source resources.

## Verification

Relevant checks after implementation should include the smallest focused editor checks:

- TypeScript check for `apps/editor/src/main.tsx`.
- `bun run editor:frontend:build`.
- Focused tests for drag/drop, project file opening, hierarchy selection, inspector updates, and status display when available.

Manual verification should cover:

- Opening a project.
- Opening a `.scene`.
- Selecting a node from Hierarchy.
- Selecting a node from Preview where supported.
- Editing a field in Inspector.
- Dragging a `.scene` from Project Shelf to Hierarchy.
- Confirming Status Bar states for dirty, saved, validation, compile, and live context.
