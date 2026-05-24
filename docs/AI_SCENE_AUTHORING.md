# Agent Scene Authoring

Pixifact uses source-level agent editing with guarded apply as the final authoring model for compiler scenes. The target user flow is external coding agents such as Claude Code and Codex using Pixifact CLI tools. Pixifact does not need an integrated AI chat or model gateway for this flow.

## Decision

External agents read and propose changes to `.scene` source files. Pixifact parses, validates, diffs, applies, and compiles those proposals. Generated TypeScript is always treated as a build artifact.

```txt
Claude Code / Codex reads .scene
Claude Code / Codex returns a .scene proposal
Pixifact parses the proposal
Pixifact validates the AST, prop types, asset refs, and scene contracts
Pixifact produces a reviewable diff
User approves apply through the agent workflow
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

## Guarded Apply

Agent proposals are not written directly to disk. Pixifact must treat a proposal as untrusted input and pass it through a guarded apply pipeline:

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
- `src/generated/*.scene.generated.ts` is never an agent editing target.
- Every editable node must have a stable ID.
- Proposal apply must check the base scene revision.
- Pixifact must use a canonical formatter before diff and apply.
- Pixifact must reject proposals that fail parse, validation, contract checks, or asset checks.
- CLI and editor save flows must use the same parse, validate, diff, and apply pipeline.
- Agents may produce a full-file proposal, but Pixifact owns normalization and final file output.

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

## Proposal Shape

The primary agent output is a `.scene` proposal. The exact transport may be full-file text, a structured object containing full-file text, or a patch envelope. The semantic contract is the same: Pixifact receives proposed `.scene` source and decides whether it can be applied.

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
pixifact scene inspect scenes/Button.scene
pixifact scene proposal check --scene scenes/Button.scene --proposal proposal.json
pixifact scene proposal apply --scene scenes/Button.scene --proposal proposal.json
pixifact compile-scenes
```

Legacy `commands dry-run/apply` may remain for legacy SceneSpec documents. It should not be the primary path for compiler scenes.

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

The live editor bridge currently rejects legacy SceneCommand editing for compiler XML scenes. That behavior matches this decision. The next step is to add proposal check/apply support for compiler scenes instead of teaching legacy SceneCommand to edit compiler XML.
