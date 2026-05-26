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

For higher-risk edits, agents may use the guarded proposal workflow:

```txt
Claude Code / Codex reads .scene
Claude Code / Codex writes a .scene proposal envelope
Pixifact checks base revision, validation, and semantic diff
User or agent applies the proposal when explicit review is required
Pixifact writes the .scene file
Pixifact compiles generated TypeScript
Editor refreshes preview
```

This replaces `SceneCommand[]` as the agent-facing edit protocol. `SceneCommand` may remain for `SceneDocument` internals, editor undo, and legacy implementation details, but external agent workflows must not depend on it.

## Rationale

`.scene` is the semantic source of truth. It describes scene hierarchy, component instances, props, slots, bindings, and asset references directly. Coding agents can understand this representation more accurately than generated PixiJS TypeScript because it contains less implementation noise.

The same source file is readable by people, external agents, the editor, and the compiler. This gives Pixifact one authoring model:

```txt
.scene = source
generated.ts = compiled output
Pixifact = validation and apply boundary
```

Agents should not edit `generated.ts`, because generated code contains renderer details, resource loading details, temporary variables, and compiler structure that are not the user's intent.

## Default Direct Editing

Direct source editing is the default because Codex and Claude Code already know how to read and edit files. Pixifact's responsibility is not to duplicate those tools; Pixifact owns the domain validation boundary.

Agents should follow this loop:

1. Inspect the current scene.
2. Edit only `scenes/*.scene` and related source assets/scripts requested by the user.
3. Run `scene validate` on every edited compiler scene.
4. Run `compile-scenes`.
5. If validation or compilation reports diagnostics, repair the `.scene` source and rerun the failing command.
6. Run the smallest relevant project build or test.
7. If Editor is running, optionally read `live scene get` for current selection, preview context, and the latest external refresh or validation result.

Example:

```bash
bun run pixifact -- scene inspect --project-root sample-projects/scene-compiler-demo --scene scenes/Button.scene
bun run pixifact -- scene validate --project-root sample-projects/scene-compiler-demo --scene scenes/Button.scene
bun run pixifact -- compile-scenes --project-root sample-projects/scene-compiler-demo
cd sample-projects/scene-compiler-demo && bun run build
```

`scene validate` checks parse errors, prop names, prop value types, asset references, and public Scene instance contracts. It is the required safety check after direct `.scene` edits. Git state, commits, rollback, branch isolation, and merge strategy are intentionally outside Pixifact; external agents and developer tools should manage them directly.

Pixifact does not decide when to commit or open a PR. Its responsibility is to make the `.scene` edit diagnosable and compilable; Git diff, commit, revert, branch isolation, PR review, CI, and task management remain outside the Pixifact capability boundary.

## Guarded Proposal Workflow

Proposal envelopes are optional. Use them when the edit needs base-revision protection, semantic diff review before writing, or an explicit apply/reject step. Pixifact treats a proposal as untrusted input and passes it through a guarded apply pipeline:

1. Parse the proposed `.scene` content.
2. Normalize it with the canonical formatter.
3. Validate compiler scene syntax and AST invariants.
4. Validate prop names and prop value types.
5. Validate asset references against project assets.
6. Validate scene instance props against the referenced scene contract.
7. Compare proposal revision with the current file revision.
8. Generate a semantic AST diff for review.
9. Apply only after approval.
10. Recompile and refresh editor preview.

Validation errors should be explicit enough for agent repair loops. The error should point to the node, prop, expected type, actual value, and a short correction hint when available.

## Hard Rules

- `.scene` files are the only agent-editable source for compiler scenes.
- `.pixifact/generated/*.scene.generated.ts` is never an agent editing target.
- Every editable node must have a stable ID.
- Direct edits must be followed by `scene validate`.
- Proposal apply must check the base scene revision.
- Pixifact must use a canonical formatter before diff and apply.
- Pixifact must reject proposals that fail parse, validation, contract checks, or asset checks.
- CLI and editor save flows must use the same parse and validate rules.
- Agents may directly edit `.scene` files or produce a full-file proposal; Pixifact owns validation and generated output.

## Non-Goals

- Do not maintain a second compiler-scene agent editing protocol based on `SceneCommand[]`.
- Do not expose generated TypeScript as an agent-editable representation.
- Do not let editor live tools bypass `.scene` parsing and validation.
- Do not build this compiler-scene workflow around an integrated AI chat panel or built-in model service.
- Do not build Pixifact into a Git manager, AI task orchestrator, CI runner, PR tool, or long-term project tracker.
- Do not add backwards compatibility shims for old compiler-scene proposal formats during alpha development.

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
You are editing a Pixifact compiler scene.

Rules:
- Edit scenes/*.scene as the source of truth.
- Do not edit .pixifact/generated/*.scene.generated.ts or .pixifact/generated/scenes.generated.ts.
- Use Pixifact CLI to inspect and validate scenes.
- After editing any .scene file, run:
  bun run pixifact -- scene validate --project-root <project-root> --scene <scene-path>
- Then run:
  bun run pixifact -- compile-scenes --project-root <project-root>
- Finally run the smallest relevant build or test.
- If scene validate reports diagnostics, fix the .scene source and run validation again.
- If Editor is available, use `bun run pixifact -- live scene get` as read-only context for the selected node and latest external refresh result.
- Do not treat Git commit or PR creation as part of Pixifact's required workflow.
```

## Proposal Shape

The optional proposal output is a `.scene` proposal envelope. The exact transport may be full-file text, a structured object containing full-file text, or a patch envelope. The semantic contract is the same: Pixifact receives proposed `.scene` source and decides whether it can be applied.

Recommended envelope:

```json
{
  "kind": "pixifact.sceneProposal.v1",
  "scene": "scenes/Button.scene",
  "baseRevision": "revision-id",
  "content": "<scene source>"
}
```

The proposal should not include generated TypeScript changes.

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
bun run pixifact -- scene inspect --project-root <project-root> --scene scenes/Button.scene
bun run pixifact -- scene validate --project-root <project-root> --scene scenes/Button.scene
bun run pixifact -- compile-scenes --project-root <project-root>
```

Optional guarded proposal flow:

```bash
bun run pixifact -- scene proposal check --project-root <project-root> --scene scenes/Button.scene --proposal proposal.json
bun run pixifact -- scene proposal apply --project-root <project-root> --scene scenes/Button.scene --proposal proposal.json
```

Legacy `commands dry-run/apply` and live mutation commands have been removed from the external CLI surface. The supported agent-facing mutation paths are direct `.scene` source edits plus validation, or the optional `.scene proposal` check/apply flow.

## Editor Agent Panel

The Editor Agent panel should primarily help external agents use the direct `.scene` workflow by showing the current project root, opened scene path, and exact CLI commands for inspect, validate, compile, and project build/run checks. It is not the main place where AI work is planned or orchestrated.

The live editor bridge is an optional context source. `live scene get` should help agents see the currently opened compiler scene, current selection, dirty state, revision, and the last external refresh or validation result for that scene. It must remain read-only; it is not a hidden apply channel.

The panel also exposes the guarded proposal flow for the currently opened compiler scene when explicit review is useful:

1. Open the project folder in Pixifact Editor.
2. Open the target `scenes/*.scene` file.
3. Paste a `pixifact.sceneProposal.v1` JSON envelope into `Proposal 审查`.
4. Click `检查 Proposal` to run the same base revision, parser, asset, scene contract, and semantic diff checks as the CLI proposal check path.
5. Review the diff shown in the panel.
6. Click `应用 Proposal` to write the canonical `.scene` source and refresh the current editor preview.
7. Run `compile-scenes` or use the project run/build flow.

The Space HUD sample includes a copyable proposal:

```bash
bun run pixifact -- scene proposal check --project-root sample-projects/space-hud-game --scene scenes/Hud.scene --proposal sample-projects/space-hud-game/proposals/hud-hint-mobile.proposal.json
```

## Editor Direction

Editor changes, external direct edits, and optional agent proposals should converge on the same compiler scene validation pipeline. Inspector edits, asset drops, direct agent edits, and proposal applies may have different origins, but they should all produce validated `.scene` source changes.

The editor must make generated files visually read-only when opened from a project and should direct users to the source `.scene` file for edits.

The editor should improve preview refresh, validation feedback, and diagnostics for externally edited `.scene` files instead of duplicating Git workflows or AI orchestration inside the editor.

## Tradeoffs

This model improves agent understanding and simplifies the product mental model, but it moves more responsibility into Pixifact validation:

- Pixifact must provide strong parser and validator errors.
- Pixifact must canonicalize formatting to avoid noisy agent diffs.
- Pixifact must infer semantic changes from before and after ASTs.
- Pixifact must handle stale proposals using base revisions.
- Pixifact must support scoped context for large scenes.

These costs are acceptable because they keep the final authoring model simple and make `.scene` the shared interface for humans, agents, editor, and compiler.

## Migration Notes

Existing legacy agent flows based on `SceneCommand[]` are retired from the CLI and live bridge surface. Compiler scene edits should use direct `.scene` source changes followed by `scene validate`, or the optional proposal check/apply flow when a guarded review step is needed.

The live editor bridge is read-only context: `live summary`, `live scene get`, and `live node inspect`. It exists to expose the current editor state, selected node, and latest external `.scene` refresh or validation result, not to mutate project files.
