# Agent Scene Authoring

Pixifact uses source-level agent editing as the final authoring model for compiler scenes. The target user flow is external coding agents such as Claude Code and Codex using Pixifact CLI tools. Pixifact does not need integrated AI chat or a built-in model service for this flow.

Pixifact is intentionally a focused Scene capability, not a full AI IDE or project manager. It provides inspect, edit, validate, compile, preview, and diagnose support for `.scene` source. Agent orchestration, Git branches, commits, reverts, PRs, CI, and task management belong to external tools.

## Decision

External agents edit `.scene` source files. Pixifact parses, validates, and compiles those files. Generated TypeScript is always treated as a build artifact.

The default workflow is direct source editing plus validation:

```txt
Claude Code / Codex inspects .scene
Claude Code / Codex edits .scene
Pixifact validates the edited file
Pixifact compiles generated TypeScript
Agent repairs the .scene if validation or compilation fails
Editor optionally exposes live context and preview state
```

This replaces `SceneCommand[]` as the agent-facing edit protocol. `SceneCommand` may remain for `SceneDocument` internals, editor undo, and legacy implementation details, but external agent workflows must not depend on it.

## Rationale

`.scene` is the semantic source of truth. It describes scene hierarchy, component instances, props, slots, bindings, and asset references directly. Coding agents can understand this representation more accurately than generated PixiJS TypeScript because it contains less implementation noise.

The same source file is readable by people, external agents, the editor, and the compiler. This gives Pixifact one authoring model:

```txt
.scene = source
generated.ts = compiled output
Pixifact = validation and compile boundary
```

A compiler Scene asset is a pair of colocated files with the same basename. For example, `src/scenes/Hud.scene` owns visual structure, hierarchy, layout, text, images, child Scene instances, slots, and event wiring; `src/scenes/Hud.ts` owns behavior, runtime state updates, public props/events/slots, and `@part` access. Do not add `script="..."` to `.scene` files, and do not add template paths to `@scene()`.

Agents should not edit `.pixifact/generated` or generated TypeScript, because generated code contains renderer details, resource loading details, temporary variables, and compiler structure that are not the user's intent.

## Default Direct Editing

Direct source editing is the default because Codex and Claude Code already know how to read and edit files. Pixifact's responsibility is not to duplicate those tools; Pixifact owns the domain validation boundary.

Agents should follow this loop:

1. Inspect the current scene.
2. Edit project-relative `.scene` paths such as `src/scenes/Hud.scene` and related source assets/scripts requested by the user.
3. Run `scene validate` on every edited compiler scene.
4. Run `compile-scenes`.
5. If validation or compilation reports diagnostics, repair the `.scene` source and rerun the failing command.
6. Run the smallest relevant project build or test.
7. If Editor is running, optionally read `live scene get` for current selection, preview context, and the latest external refresh or validation result.

Example:

```bash
bun run pixifact -- scene inspect --project-root sample-projects/scene-compiler-demo --scene src/scenes/Button.scene
bun run pixifact -- scene validate --project-root sample-projects/scene-compiler-demo --scene src/scenes/Button.scene
bun run pixifact -- compile-scenes --project-root sample-projects/scene-compiler-demo
cd sample-projects/scene-compiler-demo && bun run build
```

`scene validate` checks parse errors, prop names, prop value types, asset references, and public Scene instance contracts. It is the required safety check after direct `.scene` edits. Git state, commits, rollback, branch isolation, and merge strategy are intentionally outside Pixifact; external agents and developer tools should manage them directly.

Pixifact does not decide when to commit or open a PR. Its responsibility is to make the `.scene` edit diagnosable and compilable; Git diff, commit, revert, branch isolation, PR review, CI, and task management remain outside the Pixifact capability boundary.

## Validation Boundary

Pixifact treats edited `.scene` source as untrusted until it passes validation and compile checks:

1. Parse the edited `.scene` content.
2. Normalize it with the canonical formatter.
3. Validate compiler scene syntax and AST invariants.
4. Validate prop names and prop value types.
5. Validate asset references against project assets.
6. Validate scene instance props against the referenced scene contract.
7. Recompile generated TypeScript.
8. Refresh editor preview when the Editor is running.

Validation errors should be explicit enough for agent repair loops. The error should point to the node, prop, expected type, actual value, and a short correction hint when available.

## Hard Rules

- `.scene` files are the only agent-editable source for compiler scenes.
- `.scene` paths are project-relative, such as `src/scenes/Hud.scene`.
- Scene scripts are paired by same directory and same basename.
- Do not add `script="..."` to `.scene` files.
- Reference other Scenes with `.scene` paths, never bare names.
- `.pixifact/generated` is never an agent editing target.
- Every editable node must have a stable ID.
- Direct edits must be followed by `scene validate`.
- Pixifact must use a canonical formatter for generated output and editor refreshes.
- Pixifact must reject scene sources that fail parse, validation, contract checks, or asset checks.
- CLI and editor save flows must use the same parse and validate rules.
- Agents must edit `.scene` files directly; Pixifact owns validation and generated output.

## Non-Goals

- Do not maintain a second compiler-scene agent editing protocol based on `SceneCommand[]`.
- Do not expose generated TypeScript as an agent-editable representation.
- Do not let editor live tools bypass `.scene` parsing and validation.
- Do not build this compiler-scene workflow around an integrated AI chat panel or built-in model service.
- Do not build Pixifact into a Git manager, AI task orchestrator, CI runner, PR tool, or long-term project tracker.

## Agent Context

External agents should receive a concise authoring context instead of raw project noise:

- The target `.scene` source.
- A normalized scene outline with node IDs and node types.
- Editable props and expected value types.
- Available image, audio, and other asset references.
- Referenced scene contracts and public props.
- Current selection or requested subtree when the task is scoped.
- The current scene revision.
- The rule that generated files are read-only build artifacts.

Large scenes should support scoped context. For example, an agent task may include only the selected subtree plus a compact ancestor path and referenced contracts.

## Agent Prompt

Use this prompt when asking Codex or Claude Code to edit a compiler scene:

```txt
You are editing a Pixifact project.

Pixifact Scene asset rules:
- A Scene asset is a pair of colocated files with the same basename.
- The .scene file owns visual structure, hierarchy, layout, text, images, child Scene instances, slots, and event wiring.
- The .ts file owns behavior, runtime state updates, public props/events/slots, and @part access.
- Do not add script="..." to .scene files.
- Do not add template paths to @scene().
- Pairing is by same directory + same basename.
- The unique Scene id is the project-relative .scene path.
- Scene names and class names are local, not globally unique.
- Reference other Scenes with .scene paths, never bare names.
- Do not edit .pixifact/generated.
- Current Scene: <scene-path>
- After editing, run:
  bun run pixifact -- scene validate --project-root <project-root> --scene <scene-path>
- Then run:
  bun run pixifact -- compile-scenes --project-root <project-root>
- Finally run the smallest relevant build or test.
```

## Diff Model

Pixifact should show a semantic diff rather than only a raw text diff. Examples:

```txt
Button.background.texture changed from "assets/old.png" to "assets/btn.png"
Button.label.text changed from "Start" to "Play"
Root.children inserted Image#icon at index 0
Panel.padding changed from 12 to 16
```

Text diff can still be available as a secondary view, but approval should be based on the semantic scene diff.

## CLI Direction

Compiler scene agent workflows should move toward these commands:

```bash
bun run pixifact -- scene inspect --project-root <project-root> --scene src/scenes/Button.scene
bun run pixifact -- scene validate --project-root <project-root> --scene src/scenes/Button.scene
bun run pixifact -- compile-scenes --project-root <project-root>
```

Legacy `commands dry-run/apply` and live mutation commands have been removed from the external CLI surface. The supported agent-facing mutation path is direct `.scene` source editing plus validation.

## Editor Agent Panel

The Editor Agent panel should primarily help external agents use the direct `.scene` workflow by showing the current project root, opened scene path, and exact CLI commands for inspect, validate, compile, and project build/run checks. It is not the main place where AI work is planned or orchestrated.

The live editor bridge is an optional context source. `live scene get` should help agents see the currently opened compiler scene, current selection, dirty state, revision, and the last external refresh or validation result for that scene. It must remain read-only; it is not a hidden apply channel.

## Editor Direction

Editor changes and external direct edits should converge on the same compiler scene validation pipeline. Inspector edits, asset drops, and direct agent edits may have different origins, but they should all produce validated `.scene` source changes.

The editor must make generated files visually read-only when opened from a project and should direct users to the source `.scene` file for edits.

The editor should improve preview refresh, validation feedback, and diagnostics for externally edited `.scene` files instead of duplicating Git workflows or AI orchestration inside the editor.

## Tradeoffs

This model improves agent understanding and simplifies the product mental model, but it moves more responsibility into Pixifact validation:

- Pixifact must provide strong parser and validator errors.
- Pixifact must canonicalize formatting to avoid noisy agent diffs.
- Pixifact must infer semantic changes from before and after ASTs.
- Pixifact must support scoped context for large scenes.

These costs are acceptable because they keep the final authoring model simple and make `.scene` the shared interface for humans, agents, editor, and compiler.

## Migration Notes

Existing legacy agent flows based on `SceneCommand[]` are retired from the CLI and live bridge surface. Compiler scene edits should use direct `.scene` source changes followed by `scene validate`.

The live editor bridge is read-only context: `live summary`, `live scene get`, and `live node inspect`. It exists to expose the current editor state, selected node, and latest external `.scene` refresh or validation result, not to mutate project files.
