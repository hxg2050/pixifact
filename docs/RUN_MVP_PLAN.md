# Pixifact Run MVP Plan

本文档定义 Pixifact MVP 的“运行真实游戏”闭环。目标不是再做一个 Scene preview，而是让用户从 Editor 启动当前游戏项目，并验证游戏代码真的加载和使用 Pixifact `.scene`。

## 1. 产品目标

Pixifact MVP 必须证明完整 AI 游戏开发链路可跑通：

```txt
Codex / Claude Code 修改游戏代码和 Pixifact Scene
  -> Pixifact CLI scene validate / compile-scenes
  -> Pixifact Editor 预览、审查和保存 Scene
  -> Editor Run 启动真实游戏项目
  -> 游戏 runtime 加载 .scene
  -> 用户看到并操作真实游戏
```

`预览` 和 `运行` 必须保持清晰边界：

- `预览`：Editor 内 isolated Scene runtime，只验证当前 `.scene` 资产能否实例化和显示。
- `运行`：启动当前游戏项目的真实 run command，验证完整游戏能否启动、能否加载 `.scene`、能否和 gameplay 状态联动。

## 2. MVP 使用路径

目标用户路径：

1. 用户用 Pixifact Editor 打开一个游戏项目。
2. 文件树展示 `src/`、`assets/`、`scenes/` 和 `pixifact.project.json`。
3. 用户双击 `scenes/Hud.scene`，Editor 预览 HUD。
4. Codex / Claude Code 通过 Pixifact CLI 修改 HUD 或游戏代码。
5. 用户在 Editor 保存 Scene。
6. 用户点击 `运行`。
7. Editor 读取项目 run 配置，启动真实游戏 dev server。
8. Editor 显示运行状态和日志摘要。
9. 如果配置了 URL，Editor 用系统默认浏览器打开游戏。
10. 用户在浏览器中操作真实游戏，看到 HUD 随血量、分数、波次变化。
11. 用户点击 `停止`，Editor 终止由本次运行启动的进程。

## 3. 项目配置

MVP 使用项目根目录的 `pixifact.project.json` 描述运行入口。

```json
{
  "version": 1,
  "name": "Space HUD Game",
  "scenes": {
    "mainMenu": "scenes/MainMenu.scene",
    "hud": "scenes/Hud.scene",
    "gameOver": "scenes/GameOver.scene"
  },
  "run": {
    "command": "bun",
    "args": ["run", "dev"],
    "cwd": ".",
    "url": "http://localhost:5173"
  }
}
```

字段规则：

- `version`：项目配置版本，MVP 固定为 `1`。
- `name`：显示在 Editor 顶部和运行面板中的项目名。
- `scenes`：命名 Scene 引用，路径必须是 project-relative path。
- `run.command`：启动命令，不经过 shell 拼接。
- `run.args`：启动参数数组。
- `run.cwd`：相对 project root 的工作目录。
- `run.url`：启动成功后打开的 URL；MVP 用系统默认浏览器打开。

不做：

- 不解析 shell 字符串。
- 不做 Docker / remote runner。
- 不做多 profile。
- 不做调试器。
- 不做内嵌游戏浏览器。
- 不从 React / Zustand 保存 run 配置。

## 4. Editor Run 行为

`运行` 按钮的状态：

- `未配置`：当前项目没有 `pixifact.project.json` 或没有 `run` 字段。
- `可运行`：配置合法且没有运行中的进程。
- `启动中`：进程已创建，等待日志或 URL 打开。
- `运行中`：进程仍存活。
- `失败`：命令不存在、cwd 无效、进程退出码非 0，或 Tauri host 返回错误。
- `已停止`：用户点击停止后进程结束。

MVP 行为：

- 点击 `运行` 前，若当前 Scene dirty，提示用户保存；不静默保存。
- Editor 通过 Tauri host 启动进程。
- Editor 展示最近日志摘要，至少区分 stdout / stderr。
- 配置 `run.url` 时，进程启动后用系统默认浏览器打开。
- 点击 `停止` 只终止由 Editor 本次启动的进程。
- 运行进程不成为 `SceneDocument` 数据源。

错误状态：

- 缺少 `pixifact.project.json`：按钮禁用或显示未配置。
- JSON 格式错误：展示配置错误和文件路径。
- `run.command` 缺失：展示配置错误。
- `run.cwd` 越出 project root：拒绝运行。
- 命令启动失败：展示 host 错误。
- 进程非 0 退出：展示 exit code 和 stderr 摘要。

## 5. 完整示例游戏

MVP 必须新增一个完整示例项目：

```txt
sample-projects/space-hud-game/
  pixifact.project.json
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  scenes/
    MainMenu.scene
    Hud.scene
    GameOver.scene
  assets/
    images/
    audio/
  src/
    main.ts
    game/
      state.ts
      input.ts
      player.ts
      enemies.ts
      collision.ts
    ui/
      loadPixifactScene.ts
      hudBindings.ts
      menuBindings.ts
```

示例游戏选择：太空射击 / 生存小游戏。

功能范围：

- 玩家飞船移动。
- 敌人或陨石生成。
- 碰撞扣血。
- 击中或存活加分。
- 波次或计时。
- Game Over。
- Main Menu Scene：Start / Restart。
- Hud Scene：HP、Score、Wave / Time、Energy 或 Cooldown。
- GameOver Scene：Final Score、Restart。

示例项目必须使用 Pixifact runtime 加载 `.scene`，不能只把 Scene 当普通 JSON 展示。

## 6. 示例游戏验收

MVP 成功标准：

1. 打开 `sample-projects/space-hud-game`。
2. Editor 文件树显示 `src`、`assets`、`scenes` 和 `pixifact.project.json`。
3. 双击 `scenes/Hud.scene` 后，Editor 预览 HUD。
4. 点击 `运行` 后，Editor 启动示例项目 run command。
5. 系统默认浏览器打开配置的 URL。
6. 游戏能操作玩家飞船。
7. 游戏加载 `Hud.scene`。
8. 血量、分数、波次或时间在 HUD 中随 gameplay state 更新。
9. 修改 `Hud.scene` 并保存后，重新运行能看到修改后的 HUD。
10. 运行失败时 Editor 显示错误日志。
11. 点击停止能终止 Editor 启动的 dev server。

当前验收状态：

- [x] `sample-projects/space-hud-game` 已新增并提交。
- [x] 示例项目使用 Pixifact compiler runtime 加载 `.scene`。
- [x] `bun run build`、相关 run config / run service 测试和样例项目测试已通过。
- [x] 已由人工通过 Pixifact Editor 完整手动验收：打开项目、预览 HUD、运行真实游戏、浏览器操作、HUD 随 gameplay 更新、保存后重新运行、停止进程。

## 7. Agent 参与方式

Codex / Claude Code 是完整游戏开发入口。给 Agent 的推荐任务格式：

```txt
使用 Pixifact CLI 和项目源码完成当前游戏功能。
先读取 pixifact.project.json、summary 和目标 .scene。
Scene 修改直接编辑 .scene 源文件，之后运行 scene validate 和 compile-scenes。
游戏代码可以直接修改源码。
完成后确保 Editor 的运行按钮能启动真实游戏。
```

后续 CLI 可以增加 `pixifact run` / `pixifact run status` / `pixifact run stop`，但 MVP 优先保证 Editor Run 按钮跑通。

## 8. 实现顺序

1. [x] 定义 `pixifact.project.json` schema 和读取服务。
2. [x] 为 Tauri host 增加受控进程启动、日志、停止能力。
3. [x] 将 Editor toolbar 的 `运行` 按钮接入 run service。
4. [x] 展示运行状态和日志摘要。
5. [x] 新增 `sample-projects/space-hud-game`。
6. [x] 示例游戏接入 Pixifact runtime 并加载 `.scene`。
7. [x] 补 service / host / CLI-adjacent 测试。
8. [x] 手动验收完整运行闭环。

不在 MVP 中实现：

- 内嵌浏览器运行面板。
- 多运行 profile。
- 游戏调试器。
- 热重载协议。
- 远程设备运行。
- 自动修复运行错误。
