# 追星九宫格（Web 示例）

这是一个可玩的 Pixifact 竖屏小游戏。视觉结构在 `src/scenes/Main.scene`，输入和界面更新在同名 `Main.ts`，规则在 `src/gameLogic.ts`，关卡目标顺序在 `resources/demo-level/level.json`。当前只验证 Web 开发模式。

## 玩法

点击“开始游戏”后，九宫格中会出现一颗星。点击发光格得 1 分并移动目标；点击其他格会失去一次机会。达到 8 分获胜，机会耗尽失败。两种结果都可以点击“再玩一次”。

## 本地运行

在仓库根目录安装依赖后：

```bash
bun run --cwd sample-projects/star-game-demo dev
```

浏览器打开 `http://127.0.0.1:5180/`。Web 开发模式接入了 Pixifact Runtime，可在另一个终端读取当前游戏状态或截图：

```bash
bun packages/pixifact-cli/src/pixifact-cli.ts runtime state --project-root sample-projects/star-game-demo
bun packages/pixifact-cli/src/pixifact-cli.ts runtime screenshot --project-root sample-projects/star-game-demo
```

修改 Scene 后运行：

```bash
bun packages/pixifact-cli/src/pixifact-cli.ts scene validate --all --project-root sample-projects/star-game-demo
bun packages/pixifact-cli/src/pixifact-cli.ts compile-scenes --project-root sample-projects/star-game-demo
bunx --no-install tsc --noEmit -p sample-projects/star-game-demo/tsconfig.json
```

固定 Agent 开发任务与记录表见 [Agent 游戏开发评测](../../internal-docs/testing/AGENT_GAME_EVAL.md)。
