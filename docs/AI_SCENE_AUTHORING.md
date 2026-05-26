# Agent Scene Authoring

Pixifact uses source-level agent editing as the final authoring model for compiler scenes. The target user flow is external coding agents such as Claude Code and Codex using Pixifact CLI tools. Pixifact does not need an integrated AI chat or model gateway for this flow.

## Decision

External agents edit `.scene` source files. Pixifact parses, validates, and compiles those files. Generated TypeScript is always treated as a build artifact.

The default workflow is direct source editing plus validation:

```txt
Claude Code / Codex reads .scene
Claude Code / Codex edits .scene
Pixifact validates the file
Pixifact compiles generated TypeScript
Editor refreshes preview
```

For higher-risk edits, agents may use the guarded proposal workflow:

```txt
Claude Code / Codex reads .scene
Claude Code / Codex writes a .scene proposal envelope
Pixifact checks base revision, validation, and semantic diff
User or agent applies the proposal after review
Pixifact writes the .scene file
Pixifact compiles generated TypeScript
Editor refreshes preview
```

This replaces `SceneCommand[]` as the primary agent-facing edit protocol for compiler scenes. `SceneCommand` may remain for legacy SceneSpec flows or internal editor implementation, but compiler scene agent workflows should not depend on it.

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
5. Run the smallest relevant project build or test.

Example:

```bash
bun run pixifact -- scene inspect --project-root sample-projects/scene-compiler-demo --scene scenes/Button.scene
bun run pixifact -- scene validate --project-root sample-projects/scene-compiler-demo --scene scenes/Button.scene
bun run pixifact -- compile-scenes --project-root sample-projects/scene-compiler-demo
cd sample-projects/scene-compiler-demo && bun run build
```

`scene validate` checks parse errors, prop names, prop value types, asset references, and public Scene instance contracts. It is the required safety check after direct `.scene` edits.

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
- Do not build this compiler-scene workflow around an integrated AI chat panel or model gateway.
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

Legacy `commands dry-run/apply` may remain for legacy SceneSpec documents. It should not be the primary path for compiler scenes.

## Editor Proposal Review

The Editor Agent panel exposes the guarded proposal flow for the currently opened compiler scene:

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

Editor changes and external agent proposals should converge on the same apply boundary. Inspector edits, asset drops, and agent proposals may have different origins, but they should all produce validated `.scene` source changes and pass through the shared compiler scene validation pipeline.

The editor must make generated files visually read-only when opened from a project and should direct users to the source `.scene` file for edits.

## Tradeoffs

This model improves agent understanding and simplifies the product mental model, but it moves more responsibility into Pixifact validation:

- Pixifact must provide strong parser and validator errors.
- Pixifact must canonicalize formatting to avoid noisy agent diffs.
- Pixifact must infer semantic changes from before and after ASTs.
- Pixifact must handle stale proposals using base revisions.
- Pixifact must support scoped context for large scenes.

These costs are acceptable because they keep the final authoring model simple and make `.scene` the shared interface for humans, agents, editor, and compiler.

## Migration Notes

Existing legacy agent flows based on `SceneCommand[]` should remain available for legacy SceneSpec documents until those flows are retired. Compiler XML scenes should not add new `SceneCommand` surface area unless it is purely internal.

The live editor bridge currently rejects legacy SceneCommand editing for compiler XML scenes. That behavior matches this decision. Compiler scene edits should use direct `.scene` source changes followed by `scene validate`, or the optional proposal check/apply flow when a guarded review step is needed.
