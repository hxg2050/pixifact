# create-pixifact

创建 Bun-first 的 Pixifact 游戏项目。

## 使用

```bash
bun create pixifact my-game
cd my-game
bun install
bun run dev
```

生成的项目包含：

- `pixifact.project.json`
- 一个最小 Pixifact Scene 资产对
- Vite 项目脚本
- `pixifact` 和 `pixifact-cli` 依赖
- 开发模式下的 Pixifact Runtime 接入，可直接观察节点、截图、菜单状态并模拟输入

## 生成脚本

```bash
bun run dev
pixifact runtime tree
pixifact runtime state
pixifact runtime screenshot
```

先在浏览器打开开发页面，再运行 Runtime 命令。可从 `runtime tree` 找到 `startButtonBack` 的 Pixi `uid`，用 `runtime node <uid>` 查看其 `globalBounds`，再按中心点执行 `runtime input click --x <x> --y <y>`。`runtime state` 初始返回 `startPressed: false`，点击后返回 `true`。扩展游戏时，在 Scene 或游戏逻辑中维护明确的业务状态，并由 `registerPixiRuntime` 的 `getState` 返回。

## 环境要求

- Bun
