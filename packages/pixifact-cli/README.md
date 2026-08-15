# Pixifact CLI

Pixifact Scene 自动化命令行工具。

本版本 CLI 是 Bun-first 工具。

## 安装

```bash
bun add -d pixifact-cli
```

## AI 主路径

AI 修改 `.scene` 时优先只记这条路径：

```bash
pixifact summary
pixifact scene inspect --scene src/scenes/Hud.scene
pixifact scene validate --scene src/scenes/Hud.scene
pixifact compile-scenes
```

如果多个 Scene 可能变化，把单文件校验换成：

```bash
pixifact scene validate --all
```

默认使用当前工作目录作为项目根目录；不在项目根目录运行时再加 `--project-root <path>`。

其他命令是辅助入口：`scene create` 用于新建 Scene；`node inspect` 用于查看 `scene inspect` 返回的已知 locator；`editor context` 用于读取当前 Scene 和 selection；`editor screenshot --output <png-path>` 用于截取当前 Authoring Scene。不要使用 `scene get`，file mode 只保留 `scene inspect`。旧 `live ...` 命令已经删除。

## Agent Runtime

启用了 `pixifactRuntimePlugin` 且游戏页面已调用 `registerPixiRuntime` 时，外部 Agent 可以直接查询运行中的 Vite Web 游戏：

```bash
pixifact runtime list
pixifact runtime tree --output .pixifact/runtime/tree.json
pixifact runtime screenshot --output .pixifact/runtime/frame.png
pixifact runtime node <pixi-uid>
pixifact runtime state
pixifact runtime logs --after <seq>
pixifact runtime input click --x <x> --y <y>
pixifact runtime input key Space
```

一个项目只有一个游戏页面时自动选择；打开多个页面时先用 `runtime list` 获取 ID，再对其他命令添加 `--runtime <runtime-id>`。Runtime 只支持开发期只读观测和标准输入事件，不提供 eval、节点修改或业务状态修改。完整接入方式见 [Agent Runtime](https://github.com/hxg2050/pixifact/blob/main/docs/zh/runtime-agent.md)。

`runtime tree` 默认将节点树输出到终端；传入 `--output <json-path>` 时，改为保存运行时快照 JSON，终端只返回路径和采集元数据。快照包含 `schemaVersion`、`capturedAt`、当前 `runtimeId` 和 `root` 节点树，适合 Agent 使用文本搜索或 JSON 工具分析。快照中的 `runtimeId` 和 PixiJS `uid` 只对本次运行有效，不应写回项目源文件。

`runtime screenshot --output <png-path>` 保存当前 PixiJS Canvas 的 PNG 截图。截图使用当前 `app.screen` 逻辑尺寸和 renderer 背景色，只包含 `app.stage` 的 PixiJS 渲染内容，不包含浏览器 UI、HTML/CSS 或 DOM overlay；多个页面时添加 `--runtime <runtime-id>`。

## 浏览器 Editor

在目标项目根目录运行：

```bash
pixifact editor
```

CLI 会启动只绑定 `127.0.0.1` 的本地 Bun 服务并打开系统浏览器。Editor 从项目内现有 `.scene` 建立层级、Pixi 预览和 Inspector；属性输入实时更新预览，失焦或 Enter 后自动保存，Undo / Redo 也会写回文件。Scene 写入携带当前文件版本，版本不一致时返回冲突而不是覆盖外部 Agent 的修改。

同一项目重复运行 `pixifact editor` 会复用现有 Host；多个浏览器标签页中同时只有一个活动 Editor。Scene 已同步且预览 ready 时可以使用：

```bash
pixifact editor context
pixifact editor screenshot --output /tmp/scene.png
```

截图使用 Scene 设计尺寸，只包含 Authoring Preview，不包含选择框或 Editor UI，也不受当前画布 zoom / pan 影响。

图片必须由用户或外部 Agent 放入项目；Editor 只索引现有图片，不提供导入、移动、重命名或删除源资源。

## Agent 工作流

Codex、Claude Code 和其他 coding agent 应直接编辑 `.scene` 文件，然后运行：

```bash
pixifact scene validate --all
pixifact compile-scenes
bun run build
```

不要编辑 `.pixifact/generated/**` 下的生成文件。

## Web / 微信 / 抖音统一构建

三个平台共享 `src/main.ts` 和 Vite 配置。平台由标准 Vite mode env 文件选择，例如 `.env.wechat`：

```ini
VITE_PLATFORM=wechat
VITE_APP_ID=wx123456
```

微信项目安装 `@pixifact/platform-wechat` 后运行：

```bash
pixifact validate --mode wechat
pixifact build --mode wechat
pixifact dev --mode wechat
```

抖音项目安装 `@pixifact/platform-douyin` 后运行：

pixifact validate --mode douyin
pixifact build --mode douyin
pixifact dev --mode douyin
```

Web mode 只需要 `pixifact`，不安装小游戏平台包也能构建。`dev` 默认 mode 为 `development`，`build` 和 `validate` 默认为 `production`；显式 `--mode` 原样交给 Vite。默认产物目录为 `dist/<platform>/`，需要修改时使用 Vite `build.outDir`。

CLI 使用 Vite 完成 env、TypeScript、tree-shaking、watch、静态资源和产物生命周期；Pixifact 插件负责 Scene 编译、当前平台虚拟模块、Pixi manifest、资源分包、原生配置和包体检查。业务代码只使用 PixiJS `Assets`，不需要手动加载分包。

完整配置见 [微信小游戏构建](https://github.com/hxg2050/pixifact/blob/main/docs/zh/wechat-minigame.md) 和 [抖音小游戏构建](https://github.com/hxg2050/pixifact/blob/main/docs/zh/douyin-minigame.md)，可运行三端示例见 [wechat-minigame-demo](https://github.com/hxg2050/pixifact/tree/main/sample-projects/wechat-minigame-demo)。

## 环境要求

- Bun
- 目标项目已安装 `pixifact`
