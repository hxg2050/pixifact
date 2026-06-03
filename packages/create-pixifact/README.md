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

## 生成脚本

```bash
bun run compile:scenes
bun run dev
bun run build
```

## 环境要求

- Bun
