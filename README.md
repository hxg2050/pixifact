# Pixifact

Pixifact 是一个独立的 2D UI + 轻场景开发框架。PixiJS 是底层渲染实现，Pixifact 对外暴露 Scene、节点、行为组件、Command 和 authoring document 语义。

编辑器、MCP server 和外部 Agent 都是 Pixifact 语义层的使用方。当前桌面编辑器位于 `apps/editor/`，用于搭建 UI / 基础场景、预览 AI 或 Agent 生成结果、手动调整，并通过 MCP 向 Codex、Claude Code 等工具开放受控编辑能力。

[English](./README.en.md)

## 核心模型

Pixifact 使用 Godot-style 统一 `Scene` 资产，不做 Unity 式 Scene + Prefab 双资源体系。

```txt
Prompt / Agent -> SceneCommand -> Validate / Dry Run -> SceneDocument -> instantiateScene -> Runtime Preview
```

- `.scene` 文件保存 `SceneSpec`。
- `SceneSpec.root` 必须是 `container`。
- 公开节点类型只有 `container`、`image`、`text`、`input`、`shape`。
- 只有 `container` 可以包含子节点。
- 所有节点都可以挂行为组件。
- Button、ProgressBar、ScrollView 等作为 Scene 模板，不作为基础显示节点。
- `ui.TextGraphic`、`ui.ImageGraphic`、`ui.RoundedRectGraphic` 只是内部 runtime 实现细节，不是 authoring API。

## 目录

```txt
packages/pixifact/              核心 Pixifact 包，包名为 pixifact
packages/pixifact/src/runtime/  Application、GameObject、Component、布局、PixiJS bridge
packages/pixifact/src/nodes/    runtime 节点和行为组件
packages/pixifact/src/scene/    SceneSpec、DSL、Scene 实例化、Scene 模板
packages/pixifact/src/commands/ SceneCommand 校验、应用、撤销基础
packages/pixifact/src/authoring/SceneDocument、selection、diff、AI context、locks、actions、logic
packages/pixifact-mcp/          MCP server，依赖 pixifact，不依赖桌面编辑器
apps/editor/                    Pixifact 桌面编辑器 React / Vite 前端
apps/editor/src-tauri/          Tauri desktop host
examples/                       runtime 示例
tests/                          单元测试、编辑器测试、MCP 测试
sample-projects/                样例 Pixifact 项目
skills/                         本仓库维护的 Codex skills
```

## 启动

```bash
bun install
bun run desktop
```

`bun run editor` 是 `bun run desktop` 的别名。项目不再提供或维护浏览器版编辑器入口；Tauri 开发模式内部启动的 Vite server 只服务桌面 WebView。

同样可以使用别名：

```bash
bun run editor
```

打包桌面版：

```bash
bun run desktop:build
```

开发和打包桌面版需要 Rust / Cargo。最终安装桌面 App 的用户不需要配置 Bun 或 Rust 环境。

## MCP

启动 MCP server：

```bash
bun run editor:mcp
```

MCP tools 读写 `SceneCommand` 和 `.scene` / `pixifact.aiEditorProject` 文件。Live Editor 连接存在时会操作当前打开的编辑器；没有连接时会直接读写本地项目文件。

## AI Gateway

本地启动真实 gateway adapter 样例：

```bash
bun run editor:gateway
```

也可以只用环境变量传入真实模型 key：

```bash
OPENAI_API_KEY=your-key bun run editor:gateway
```

默认 Remote endpoint：

```txt
http://localhost:8788/proposal
```

Gateway 只返回结构化 proposal，不直接修改 `SceneDocument`，也不写项目文件。

## Package 入口

```ts
import { Application, GameObject, Group } from 'pixifact/runtime';
import { SceneDocument } from 'pixifact/authoring';
import { applySceneCommand, validateSceneCommand } from 'pixifact/commands';
import { container, scene, shape, text, instantiateScene } from 'pixifact/scene';
```

根入口 `pixifact` 也会导出公开语义层，方便 editor、MCP 和测试直接使用。

## 验证

优先运行最小相关验证。

```bash
bun run test
```

编辑器相关改动：

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run editor:frontend:build
```

runtime 或导出 API 改动：

```bash
bun run build
bun run example:build
```

## Codex Skills

仓库维护的 Codex skill 位于：

```txt
skills/pixifact-editor
```

源码仓库内安装：

```bash
bun run skills:install
```

从已发布包安装：

```bash
bunx --package pixifact pixifact-skills --replace
```

## 许可证

MIT
