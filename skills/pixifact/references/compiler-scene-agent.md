# Pixifact Scene Agent Workflow

Use this reference when editing `.scene` files in a Pixifact game project.

## Default Workflow

The `.scene` file is the authored source. Generated TypeScript is build output.

```bash
bunx --no-install pixifact scene inspect --project-root . --scene scenes/MainMenu.scene
bunx --no-install pixifact scene validate --project-root . --scene scenes/MainMenu.scene
bun run compile:scenes
```

If validation or compilation fails, fix the `.scene` source and rerun the failing command. Prefer package scripts from `package.json` when the project provides them.

After compilation, run the smallest relevant project check:

```bash
bun run build
```

For visual preview during active work:

```bash
bun run dev
```

## Hard Rules

- Edit `scenes/*.scene` as source of truth.
- Do not edit `.pixifact/generated/*.scene.generated.ts` or `.pixifact/generated/scenes.generated.ts`.
- Do not edit `src/generated/*.scene.generated.ts` or `src/generated/scenes.generated.ts`.
- Run `scene validate` after every edited compiler scene.
- Run `compile-scenes` after validation passes.
- If validation reports diagnostics, fix the `.scene` source and validate again.
- Treat generated TypeScript as read-only build output unless the user explicitly asks to inspect generated output.

## Optional Proposal Flow

Use proposal check/apply only when the user wants base revision protection, explicit review, or stale-write protection.

```bash
bunx --no-install pixifact scene proposal check --project-root . --scene scenes/MainMenu.scene --proposal proposal.json
bunx --no-install pixifact scene proposal apply --project-root . --scene scenes/MainMenu.scene --proposal proposal.json
```

The proposal content should be full proposed `.scene` source, not generated TypeScript changes.

## Editor Context

If the Pixifact editor is running and exposes live context, use it only as read-only context for the opened scene, selected node, dirty state, revision state, and recent validation result. Do not use editor live context as a mutation path.
