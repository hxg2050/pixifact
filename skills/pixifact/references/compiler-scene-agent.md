# Compiler Scene Agent Workflow

Use this reference when editing Pixifact compiler `.scene` files with Codex, Claude Code, or another external coding agent.

## Default Workflow

Compiler `.scene` source is the primary authoring format. Edit `scenes/*.scene` directly, then let Pixifact validate and compile generated TypeScript.

```bash
bun run pixifact -- scene inspect --project-root <project-root> --scene scenes/Button.scene
bun run pixifact -- scene validate --project-root <project-root> --scene scenes/Button.scene
bun run pixifact -- compile-scenes --project-root <project-root>
```

After compilation, run the smallest relevant project build or test. For the compiler demo:

```bash
cd sample-projects/scene-compiler-demo
bun run compile:scenes
bun run build
```

## Hard Rules

- Edit `scenes/*.scene` as source of truth.
- Do not edit `.pixifact/generated/*.scene.generated.ts` or `.pixifact/generated/scenes.generated.ts`.
- Run `scene validate` after every edited compiler scene.
- Run `compile-scenes` after validation passes.
- If validation reports diagnostics, fix the `.scene` source and validate again.
- Treat generated TypeScript as read-only build output unless the user explicitly asks to inspect generated output.

## Optional Proposal Flow

Use proposal check/apply only when the task needs base revision protection, an explicit review step, or stale-write protection.

```bash
bun run pixifact -- scene proposal check --project-root <project-root> --scene scenes/Button.scene --proposal proposal.json
bun run pixifact -- scene proposal apply --project-root <project-root> --scene scenes/Button.scene --proposal proposal.json
```

The proposal content should be full proposed `.scene` source, not generated TypeScript changes.

## Legacy Boundary

`SceneCommand[]` remains for legacy `SceneSpec` documents and internal editor implementation. Do not introduce a new compiler `.scene` workflow based on legacy command lists.
