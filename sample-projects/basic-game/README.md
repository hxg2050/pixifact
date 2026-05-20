# Basic Game Sample

这是一个重新创建的 Pixifact 示例项目，用来验证当前 CLI 文件模式和 editor 打开 `.scene` 的基础流程。

## 内容

- `scenes/Main.scene`：主场景，包含背景、标题、生命值条和登录表单。
- `commands/setup-main-scene.json`：用于把新建空 Scene 扩展为当前示例画面的 `SceneCommand[]`。

## 查看项目

```bash
bun run pixifact -- summary \
  --project-root sample-projects/basic-game
```

```bash
bun run pixifact -- scene get \
  --project-root sample-projects/basic-game \
  --scene scenes/Main.scene
```

## 复现创建流程

下面的命令用于从空的 `scenes/Main.scene` 复现当前示例。`commands/setup-main-scene.json` 会创建固定 key 的节点，不是幂等更新；如果 `Main.scene` 已经包含这些节点，重复 apply 会因为节点 ID 已存在而失败。

先创建标准 Scene：

```bash
bun run pixifact -- scene create \
  --project-root sample-projects/basic-game \
  --scene scenes/Main.scene \
  --name BasicGame
```

添加登录模板：

```bash
bun run pixifact -- template add apply \
  --project-root sample-projects/basic-game \
  --scene scenes/Main.scene \
  --kind loginForm \
  --parent root \
  --key login \
  --label 开始游戏
```

预演并应用主场景命令：

```bash
bun run pixifact -- commands dry-run \
  --project-root sample-projects/basic-game \
  --scene scenes/Main.scene \
  --commands sample-projects/basic-game/commands/setup-main-scene.json
```

```bash
bun run pixifact -- commands apply \
  --project-root sample-projects/basic-game \
  --scene scenes/Main.scene \
  --commands sample-projects/basic-game/commands/setup-main-scene.json
```

## 规则

- 不直接编辑 `.scene` JSON。
- 修改 Scene 时使用 `SceneCommand[]`，并先 dry-run。
- 常见 UI 结构优先使用 `template add`。
