# Pixifact AI-first Game Editor

`apps/editor` 是 Pixifact 桌面版的 React / Vite 前端界面，也是当前开发预览入口。正式产品形态是 Tauri 桌面版，桌面 host 位于：

```txt
apps/editor/src-tauri/
```

浏览器 Web 入口只用于开发预览和 Playwright 自动化测试，不作为最终产品形态。`apps/editor` 用于使用和验证：

```txt
Prompt -> AI Proposal -> Dry Run -> Diff Review -> Apply -> Manual Refine -> Memory -> Export / Import
```

## 启动

在仓库根目录运行：

```bash
bun install
bun run desktop
```

`desktop` 会启动 Tauri，并由 Tauri 启动 Vite 开发服务器。

只启动浏览器开发预览：

```bash
bun run editor
```

Vite 会输出本地访问地址，通常是：

```txt
http://localhost:5173/
```

浏览器预览如果默认端口已被占用，Vite 会自动换到下一个可用端口，以终端输出为准。

打包桌面版：

```bash
bun run desktop:build
```

开发和打包桌面版需要本机 Rust / Cargo 工具链。最终用户安装打包后的桌面 App，不需要配置 Bun 环境。

## Mock AI 使用

默认 provider mode 是 `Mock`，不需要额外服务。

使用流程：

1. 打开 editor。
2. 进入右侧 `AI` tab。
3. 输入或保留默认 prompt。
4. 点击“生成”。
5. 点击“预演”查看 diff 和 warning。
6. 点击“应用”更新项目和 viewport。

Mock provider 适合离线使用和本地测试。

## Scene

Editor 使用 Scene 作为统一 UI / 轻场景资产。格式、命名规则和当前支持范围见：

```txt
apps/editor/SCENE.md
```

## Remote AI 使用

先启动 AI gateway：

```bash
bun run editor:gateway
```

再启动 editor：

```bash
bun run editor
```

在 editor 的 `AI` tab 中切换到 `Remote`，endpoint 默认指向：

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

Remote 的 provider mode、gateway endpoint、timeout 和 auth header 会保存在浏览器 localStorage，方便下次打开 editor 继续使用。真实模型 API key 放在 gateway 本地配置或环境变量里，不会写入浏览器 localStorage，也不会写入 `.ai-editor.json`。

真实模型请求仍然经过 gateway。Gateway 只返回 proposal，不直接修改项目；editor 仍然负责 Dry Run、Diff Review 和 Apply。

## Alpha 核心使用流程

建议按以下流程验证核心编辑闭环：

1. 打开 editor。
2. 在 `AI` tab 输入：

   ```txt
   创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。
   ```

3. 点击“生成”。
4. 查看 proposal 说明、风险和 command 列表。
5. 点击“预演”，查看 diff。
6. 点击“应用”，确认 viewport 更新。
7. 切到 `动作` tab，确认或新增 `useInventoryItem` action。
8. 切到 `逻辑` tab，点击“添加默认流程”。
9. 切到 `检查器` tab，手动调整一个字段。
10. 切到 `记忆` tab，接受 memory suggestion。
11. 切到 `项目` tab，导出 `.ai-editor.json`。
12. 再导入刚导出的项目，确认 UI、actions、logicGraph、memory、locks 恢复。

## 导出文件

Editor 会通过浏览器下载文件：

- `.ai-editor.json`：完整项目资产。
- `logic-handlers.ts`：LogicGraph 生成的 TypeScript handler 摘要。
- `pixifact-memory.json`：偏好记忆文件。

这些是用户下载产物，不属于仓库源码。不要把它们提交到 repo。

## 验证

编辑器相关改动至少运行：

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run test
bun run editor:build
```

Alpha 核心流程改动运行：

```bash
bun run editor:e2e
```

Playwright 配置会启动：

```txt
http://127.0.0.1:5176
```

如果本地沙箱或系统策略阻止绑定端口，`editor:e2e` 可能会在 web server 启动阶段失败。这种情况不是 UI 断言失败；可先用 `bun run editor` 手动跑通 Alpha 核心使用流程，再在允许本地端口绑定的环境复跑 E2E。

## UI 文案和按钮原则

- 主要使用中文，但不要为了中文而中文。
- 保留 `AI-first`、`Prompt`、`Dry Run`、`Diff`、`Memory`、`Mock`、`Remote`、`MCP`、`Agent`、`ID`、`Key`、`Type`、`Scene`、`TS` 等术语。
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
