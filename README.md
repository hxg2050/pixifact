# Pixifact

Pixifact 是面向 AI 完整游戏开发的 Scene / UI / 轻场景与项目资产管理层。PixiJS 是底层渲染实现，Pixifact 对外暴露 Scene、节点、行为组件、Command 和 authoring document 语义。

Codex、Claude Code 等 coding agent 是主要 AI 入口。Pixifact CLI 是 Agent 操作 Scene 的受控工具层；桌面编辑器位于 `apps/editor/`，用于预览、审查和人工微调 Agent 产出的 Scene 修改；runtime 负责在游戏中加载 `.scene`。

[English](./README.en.md)

## 核心模型

Pixifact 使用 Godot-style 统一 `Scene` 资产，不做 Unity 式 Scene + Prefab 双资源体系。

当前存在两条 Scene authoring 路线：

- Legacy `SceneSpec`：`SceneCommand[]` 是 Agent 修改入口，适用于现有 `container` / `image` / `text` / `input` / `shape` 语义层。
- Compiler `.scene`：`.scene` 源文件是 Agent 修改入口，Agent 产出 `.scene proposal`，Pixifact 执行 parse / normalize / validate / diff / apply，再编译 generated TypeScript。详见 [Agent Scene Authoring](./docs/AI_SCENE_AUTHORING.md)。

```txt
Codex / Claude Code -> Pixifact CLI -> SceneCommand -> Validate / Dry Run -> SceneDocument -> Editor Preview -> Runtime
```

上面的链路描述 legacy `SceneSpec` 流程。Compiler scene 的目标链路是：

```txt
Codex / Claude Code -> Pixifact CLI -> .scene proposal -> Check -> Apply -> Compile -> Editor Preview -> Runtime
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
packages/pixifact-cli/          Pixifact CLI，依赖 pixifact，不依赖桌面编辑器
apps/editor/                    Pixifact 桌面编辑器 React / Vite 前端
apps/editor/src-tauri/          Tauri desktop host
examples/                       runtime 示例
tests/                          单元测试、编辑器测试、CLI 测试
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

## CLI

CLI 是外部 Agent 操作 Pixifact 项目的主入口。Pixifact 不把内置聊天作为主要 AI 路径。

Legacy `SceneSpec` 流程中，Agent 应先读取上下文，生成结构化 `SceneCommand[]`，dry-run 通过后再 apply：

读取项目摘要：

```bash
bun run pixifact -- summary --project-root /path/to/project
```

CLI 命令读写 `SceneCommand` 和 `.scene` / `pixifact.aiEditorProject` 文件。Live mode 会操作当前打开的编辑器；文件模式会直接读写本地项目文件。

Legacy Agent 流程见：

```txt
docs/AGENT_CLI_WORKFLOW.md
```

Compiler `.scene` 的目标 Agent 流程见：

```txt
docs/AI_SCENE_AUTHORING.md
```

## 项目资产边界

Pixifact Editor 提供项目资产浏览、轻量预览、资源引用和校验，但不负责资源编辑。

- Scene 文件在 Editor 内打开和编辑。
- 图片、音频、字体、数据文件等资源可以轻量预览，用于确认内容和引用路径。
- 双击具体资源时调用系统默认程序打开。
- 脚本文件不在 Editor 内编辑；打开脚本时调用外部代码编辑器。
- Codex / Claude Code 仍负责完整游戏代码开发，Pixifact 负责 Scene、UI、轻场景和资源引用这层可视化资产。

## Legacy Gateway 样例

Gateway 不是 compiler `.scene` 的主 Agent 路径。当前推荐用户通过 Codex / Claude Code 等外部 Agent 调用 Pixifact CLI；本节仅保留 legacy gateway adapter 样例。

本地启动 gateway adapter 样例：

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

Gateway 只返回 legacy 结构化 proposal，不直接修改 `SceneDocument`，也不写项目文件。

## Package 入口

```ts
import { Application, GameObject, Group } from 'pixifact/runtime';
import { SceneDocument } from 'pixifact/authoring';
import { applySceneCommand, validateSceneCommand } from 'pixifact/commands';
import { container, scene, shape, text, instantiateScene } from 'pixifact/scene';
```

根入口 `pixifact` 也会导出公开语义层，方便 editor、CLI 和测试直接使用。

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

项目级测试策略、BDD 和 TDD 规范见：

```txt
docs/TESTING.md
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
