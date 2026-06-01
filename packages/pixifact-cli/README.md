# Pixifact CLI

Command line tools for Pixifact Scene automation.

The CLI is Bun-first in this release.

## Install

```bash
bun add -d pixifact-cli
```

## Commands

Inspect a Scene:

```bash
pixifact scene inspect --project-root . --scene src/scenes/Hud.scene
```

Validate one Scene:

```bash
pixifact scene validate --project-root . --scene src/scenes/Hud.scene
```

Validate every compiler Scene:

```bash
pixifact scene validate --project-root . --all
```

Compile generated Scene runtime files:

```bash
pixifact compile-scenes --project-root .
```

## Agent Workflow

Codex, Claude Code, and other coding agents should edit `.scene` files directly, then run:

```bash
pixifact scene validate --project-root . --all
pixifact compile-scenes --project-root .
bun run build
```

Do not edit generated files under `.pixifact/generated/**`.

## Requirements

- Bun
- `pixifact` installed in the target project
