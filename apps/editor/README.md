# Pixif AI-first Game Editor

`apps/editor` 是 Pixif 的产品级 AI-first 编辑器。它用于使用和验证：

```txt
Prompt -> AI Proposal -> Dry Run -> Diff Review -> Apply -> Manual Refine -> Memory -> Export / Import
```

## 启动

在仓库根目录运行：

```bash
pnpm install
pnpm editor
```

也可以使用 Bun：

```bash
bun install
bun run bun:editor
```

Vite 会输出本地访问地址，通常是：

```txt
http://localhost:5173/
```

如果默认端口已被占用，Vite 会自动换到下一个可用端口，以终端输出为准。

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

## Remote AI 使用

先启动 mock AI server：

```bash
pnpm editor:ai
```

再启动 editor：

```bash
pnpm editor
```

在 editor 的 `AI` tab 中切换到 `Remote`，endpoint 默认指向：

```txt
http://localhost:8788/proposal
```

Remote 路径用于验证 `pixif.aiProposal.v1` 协议，但仍然不会让 AI 直接修改项目。AI 只返回 proposal，用户仍需 dry-run、review、apply 或 reject。

## Gateway Adapter 样例

真实 AI gateway 的协议和 adapter 样例在：

```txt
apps/editor/src/gateway/
```

启动 adapter：

```bash
pnpm editor:gateway
```

使用 Bun 启动 adapter：

```bash
bun run bun:editor:gateway
```

在 editor 的 `AI` tab 中切换到 `Remote`：

- Endpoint: `http://localhost:8788/proposal`
- Timeout: `300000`
- Auth header: `Authorization`
- Auth token: `Bearer local-test`

如果要接真实模型，在 `Model` 区域填写 API、endpoint、model name、model token、timeout、auth header、auth prefix、reasoning、service tier、store 和 temperature。没有填写 Model endpoint 时，adapter 默认返回空 command 的示例 proposal。

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

如果启动 gateway 的终端里已经有 `OPENAI_API_KEY`，可以不填 `Model token`。否则只需要在 `Model token` 中填 `OPENAI_API_KEY` 对应的真实 key。
Responses 模式下 gateway 不主动发送 temperature，以兼容当前 `ylscode` 上游。

Remote 的 gateway/model endpoint、timeout、auth header、model name 和 temperature 会保存在浏览器 localStorage，方便下次打开 editor 继续使用。Gateway token 和 model token 不会持久化，也不会写入 `.ai-editor.json`。

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
- `pixif-memory.json`：偏好记忆文件。

这些是用户下载产物，不属于仓库源码。不要把它们提交到 repo。

## 验证

编辑器相关改动至少运行：

```bash
pnpm exec tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
pnpm test
pnpm editor:build
```

Bun 路径可运行：

```bash
bun run bun:test
bun run bun:editor:build
```

Alpha 核心流程改动运行：

```bash
pnpm editor:e2e
```

Playwright 配置会启动：

```txt
http://127.0.0.1:5176
```

如果本地沙箱或系统策略阻止绑定端口，`editor:e2e` 可能会在 web server 启动阶段失败。这种情况不是 UI 断言失败；可先用 `pnpm editor` 手动跑通 Alpha 核心使用流程，再在允许本地端口绑定的环境复跑 E2E。

## UI 文案和按钮原则

- 主要使用中文，但不要为了中文而中文。
- 保留 `AI-first`、`Prompt`、`Dry Run`、`Diff`、`Memory`、`Mock`、`Remote`、`ID`、`Key`、`Type`、`Prefab`、`TS` 等术语。
- 工具动作可用 SVG 图标或图标 + 短文本。
- 决策动作保留文字，例如生成、预演、应用、拒绝、保存动作。
- 纯图标按钮必须提供 `aria-label` 和 `title`。

## 架构边界

- `EditorDocument` 是唯一 source of truth。
- Zustand 只保存 UI 状态。
- React panel 不保存项目树副本。
- 项目修改必须走 `EditorDocument` API 或 command。
- AI 只生成 proposal，不直接修改项目。
- JSON 只是资产格式，不作为普通用户主编辑界面。
- 不引入 Monaco，不做内嵌代码编辑器。
