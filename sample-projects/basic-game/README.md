# Pixif Basic Game Sample

这是一个给 Pixif AI-first 游戏编辑器使用的基础项目样例。

## 打开方式

1. 启动编辑器：

```bash
pnpm editor
```

2. 在编辑器右侧打开 `项目`。
3. 点击 `导入项目`。
4. 选择本目录下的：

```txt
basic-game.ai-editor.json
```

导入后会看到一个 960x540 的基础游戏 HUD：

- 顶部状态栏
- 玩家信息
- 金币统计
- 任务提示
- 开始战斗按钮
- 背包按钮
- 底部三个技能按钮

## 目录说明

```txt
basic-game.ai-editor.json  编辑器可导入的项目资产
assets/                    资源占位目录
scripts/                   逻辑脚本占位目录
```

当前编辑器还没有真实磁盘文件树和资源导入能力，所以 `assets/` 和 `scripts/` 主要用于模拟项目结构。真正打开编辑器项目时，请导入 `.ai-editor.json`。
