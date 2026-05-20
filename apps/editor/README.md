# Pixifact AI-first Game Editor

`apps/editor` 是 Pixifact 桌面版的 React / Vite 前端界面。正式产品形态是 Tauri 桌面版，桌面 host 位于：

```txt
apps/editor/src-tauri/
```

项目不再启动或维护独立浏览器版。Vite 只作为 Tauri dev/build 的内部前端服务。`apps/editor` 用于预览、审查和人工微调外部 Agent 通过 Pixifact CLI 产出的 Scene 修改：

```txt
Codex / Claude Code -> Pixifact CLI -> Dry Run -> Diff Review -> Apply -> Editor Preview -> Manual Refine
```

Pixifact 不把 editor 内置聊天作为主要 AI 路径。Codex、Claude Code 等外部 coding agent 是用户的 AI 入口；CLI 是 Agent 的工具接口；Editor 是审查台和可视化工作台。

## 启动

在仓库根目录运行：

```bash
bun install
bun run desktop
```

`desktop` 会启动 Tauri，并由 Tauri 启动内部 Vite 前端服务。

`editor` 是同一个桌面入口的别名：

```bash
bun run editor
```

打包桌面版：

```bash
bun run desktop:build
```

开发和打包桌面版需要本机 Rust / Cargo 工具链。最终用户安装打包后的桌面 App，不需要配置 Bun 环境。

## CLI / Agent 使用

外部 Agent 应通过 Pixifact CLI 修改 Scene。文件模式不要求 editor 已启动：

```bash
bun run pixifact -- summary --project-root /path/to/project
bun run pixifact -- scene get --project-root /path/to/project --scene scenes/main.scene
bun run pixifact -- commands dry-run --project-root /path/to/project --scene scenes/main.scene --commands commands.json
bun run pixifact -- commands apply --project-root /path/to/project --scene scenes/main.scene --commands commands.json
```

需要操作当前打开的 editor Scene 时使用 live CLI：

```bash
bun run pixifact -- live scene get
bun run pixifact -- live commands dry-run --commands commands.json
bun run pixifact -- live commands apply --commands commands.json
```

完整 Agent 流程见：

```txt
docs/AGENT_CLI_WORKFLOW.md
```

## Scene

Editor 使用 Scene 作为统一 UI / 轻场景资产。格式、命名规则和当前支持范围见：

```txt
apps/editor/SCENE.md
```

## Remote AI / Gateway

先启动 AI gateway：

```bash
bun run editor:gateway
```

再启动 editor：

```bash
bun run desktop
```

Gateway 是结构化 proposal 的本地 adapter 样例，不是主要用户入口。需要验证旧 proposal 协议时，可在 editor 的 `AI` tab 中切换到 `Remote`，endpoint 默认指向：

```txt
http://localhost:8788/proposal
```

Remote 路径用于验证 `pixifact.aiProposal.v1` 协议，但仍然不会让 AI 直接修改项目。AI 只返回 proposal，editor 仍然负责校验并应用合法 command。

## Gateway Adapter 样例

真实 AI gateway 的协议和 adapter 样例在：

```txt
apps/editor/src/gateway/
```

如果要接真实模型，先创建本机私有配置：

```bash
cp apps/editor/ai-gateway.config.example.json apps/editor/ai-gateway.config.local.json
```

然后在 `apps/editor/ai-gateway.config.local.json` 里填一次真实 key。这个文件命中 `*.local` 忽略规则，不会提交到仓库。

也可以只用环境变量：

```bash
OPENAI_API_KEY=your-key bun run editor:gateway
```

启动 adapter：

```bash
bun run editor:gateway
```

在 editor 的 `AI` tab 中切换到 `Remote`：

- Endpoint: `http://localhost:8788/proposal`
- Timeout: `300000`
- 不需要在 editor 里填写 API key。

当前默认预设适配 `ylscode`：

```txt
API: Responses
Model endpoint: https://code.ylsagi.com/codex/v1/responses
Model: gpt-5.5
Reasoning: medium
Service tier: fast
Store: false
Auth header: authorization
Auth prefix: Bearer
```

Responses 模式下 gateway 不主动发送 temperature，适配当前 `ylscode` 上游。

Remote 的 provider mode、gateway endpoint、timeout 和 auth header 会保存在 Tauri WebView localStorage，方便下次打开 editor 继续使用。真实模型 API key 放在 gateway 本地配置或环境变量里，不会写入 WebView localStorage，也不会写入 `.ai-editor.json`。

真实模型请求仍然经过 gateway。Gateway 只返回 proposal，不直接修改项目；editor 仍然负责 Dry Run、Diff Review 和 Apply。

## 核心使用流程

建议按以下流程验证 CLI-first 核心编辑闭环：

1. 打开 editor。
2. 在 Codex / Claude Code 中提出任务，例如：

   ```txt
   使用 Pixifact CLI 修改当前 Scene，创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。先 dry-run，通过后再 apply。
   ```

3. Agent 运行 `summary` / `scene get` 获取上下文。
4. Agent 生成 `SceneCommand[]`。
5. Agent 运行 `commands dry-run` 查看 diff 和错误。
6. dry-run 通过后运行 `commands apply`。
7. 回到 editor，确认 viewport 更新。
8. 在 `检查器` 中手动调整必要字段。
9. 保存 `.scene`，由 runtime 在游戏中加载。

## 导出文件

Editor 会通过桌面应用导出文件：

- `.ai-editor.json`：完整项目资产。
- `logic-handlers.ts`：LogicGraph 生成的 TypeScript handler 摘要。
- `pixifact-memory.json`：偏好记忆文件。

这些是用户下载产物，不属于仓库源码。不要把它们提交到 repo。

## 验证

编辑器相关改动至少运行：

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run test
bun run editor:frontend:build
```

桌面主流程改动使用 `bun run desktop` 手动验证；后续自动化测试应走桌面 host，不再维护浏览器 Playwright 入口。

## UI 文案和按钮原则

- 主要使用中文，但不要为了中文而中文。
- 保留 `AI-first`、`Prompt`、`Dry Run`、`Diff`、`Memory`、`Mock`、`Remote`、`CLI`、`Agent`、`ID`、`Key`、`Type`、`Scene`、`TS` 等术语。
- 工具动作可用 SVG 图标或图标 + 短文本。
- 决策动作保留文字，例如生成、预演、应用、拒绝、保存动作。
- 纯图标按钮必须提供 `aria-label` 和 `title`。

## 架构边界

- `SceneDocument` 是唯一 source of truth。
- Zustand 只保存 UI 状态。
- React panel 不保存项目树副本。
- 项目修改必须走 `SceneDocument` API 或 `SceneCommand`。
- AI 只生成 proposal，不直接修改项目。
- JSON 只是资产格式，不作为普通用户主编辑界面。
- 不引入 Monaco，不做内嵌代码编辑器。
