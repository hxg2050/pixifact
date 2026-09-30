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
- 已初始化的 Git 仓库和 `.gitignore`，忽略依赖、构建产物、Pixifact 缓存与本机 env 文件；首次提交由项目使用者创建
- 项目级 `.agents/skills/pixifact/`，包含 Pixifact skill、Agent metadata 和完整离线参考，随脚手架包分发

## 生成脚本

创建完成后的终端提示会列出以下命令，在项目根目录运行：

| 命令 | 用途 |
| --- | --- |
| `bun run dev` | 启动 Web 开发服务和 Bun Inspector，均支持局域网访问 |
| `bun run build` | 构建 Web 生产版本 |
| `bun run compile` | 独立编译 `.scene` 到 `.pixifact/generated` |
| `bun run editor` | 启动 Pixifact 编辑器 |
| `bun run validate` | 校验项目 |

模板的 `.env` 默认设置 `VITE_PLATFORM=web`。`dev` 和 `build` 会自动处理 Scene 编译，也可以使用 `compile` 单独编译 Scene。

`dev` 脚本直接执行 `pixifact dev`，CLI 会自动启用 Bun Inspector 并在终端输出调试地址。用户和 Agent 直接运行 `bun run dev` 即可同时启动开发服务和调试入口。

同一局域网设备可打开启动结果 `urls.network` 中的游戏地址。远程连接 Inspector 时，将 Bun 输出的调试链接中的 `0.0.0.0` 替换为开发电脑的局域网 IP，保留端口和路径。

## 观察运行中的游戏

```bash
bun run dev
pixifact runtime tree
pixifact runtime state
pixifact runtime screenshot
```

先在浏览器打开开发页面，再运行 Runtime 命令。可从 `runtime tree` 找到 `startButtonBack` 的 Pixi `uid`，用 `runtime node <uid>` 查看其 `globalBounds`，再按中心点执行 `runtime input click --x <x> --y <y>`。`runtime state` 初始返回 `startPressed: false`，点击后返回 `true`。扩展游戏时，在 Scene 或游戏逻辑中维护明确的业务状态，并由 `registerPixiRuntime` 的 `getState` 返回。

## 环境要求

- Bun
- Git
