# Space HUD Game

Vertical Pixifact sample game for the Editor Run MVP.

```bash
bun run compile:scenes
bun run dev
bun run build
```

The game uses `720x1280` as its portrait design size and scales that design into the current window while keeping the full scene visible across different aspect ratios.

## Agent Proposal Review

`proposals/hud-hint-mobile.proposal.json` is a small `.scene proposal` for testing the Editor Agent review flow. It changes the HUD hint text from keyboard-only controls to a mobile-friendly hint.

```bash
cd ../..
bun run pixifact -- scene proposal check --project-root sample-projects/space-hud-game --scene scenes/Hud.scene --proposal sample-projects/space-hud-game/proposals/hud-hint-mobile.proposal.json
```

In the Editor:

1. Open `sample-projects/space-hud-game`.
2. Open `scenes/Hud.scene`.
3. Paste the proposal JSON into the Agent panel Proposal Review box.
4. Click `检查 Proposal`, review the diff, then click `应用 Proposal`.
5. Run the game to see the updated HUD hint.
