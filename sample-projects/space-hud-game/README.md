# Space HUD Game

Vertical Pixifact sample game for the Editor Run MVP.

```bash
bun run compile:scenes
bun run dev
bun run build
```

The game uses `720x1280` as its portrait design size and scales that design into the current window while keeping the full scene visible across different aspect ratios.

## Agent Workflow

The default Agent workflow is direct `.scene` editing followed by Pixifact validation and compile checks:

```bash
cd ../..
bun run pixifact -- scene inspect --project-root sample-projects/space-hud-game --scene src/scenes/Hud.scene
bun run pixifact -- scene validate --project-root sample-projects/space-hud-game --scene src/scenes/Hud.scene
bun run pixifact -- scene validate --project-root sample-projects/space-hud-game --all
bun run pixifact -- compile-scenes --project-root sample-projects/space-hud-game
cd sample-projects/space-hud-game && bun run build
```

Scene scripts are paired by same directory and same basename, for example `src/scenes/Hud.scene` and `src/scenes/Hud.ts`. Do not add `script="..."` to `.scene` files, and do not edit `.pixifact/generated`.
