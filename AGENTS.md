# AGENTS.md

本文件是给 Codex / coding agents 的项目入口说明。进入本仓库后，先阅读本文件，再按任务需要阅读 `README.md`、`PLAN.md` 和相关源码。

## 附加行为规范

在处理本项目任何代码相关任务前，必须先读取并遵守 `CODEX.md` 中的行为规范，并与本文件规则合并执行。

- 非必须不编写主动兜底、静默默认值或主动抛错逻辑；让错误在运行或测试时自然暴露，以便定位并修复真实调用问题。
- 当前项目处于开发阶段，永远不用考虑向下兼容；不要为了旧 API、旧路径、旧协议或旧数据格式新增兼容层、别名、fallback、deprecation shim。相关改动应直接迁移调用方并删除旧入口。

## 项目概览

Pixifact 是独立的 2D UI + 轻场景开发框架。PixiJS 只作为底层渲染实现；编辑器、MCP 和外部 Agent 都应使用 Pixifact 的 Scene 语义层。

当前仓库包含：

- `packages/pixifact/`：核心 Pixifact 包，包名为 `pixifact`。
- `packages/pixifact/src/runtime/`：`Application`、`GameObject`、`Component`、布局、PixiJS bridge。
- `packages/pixifact/src/nodes/`：runtime 节点和行为组件。
- `packages/pixifact/src/scene/`：`SceneSpec`、Scene DSL、Scene 实例化、Scene 模板。
- `packages/pixifact/src/commands/`：`SceneCommand` 校验、应用、撤销基础。
- `packages/pixifact/src/authoring/`：`SceneDocument`、selection、diff、AI context、locks、actions、logic。
- `packages/pixifact-mcp/`：Pixifact MCP server，依赖 `pixifact`，不依赖桌面编辑器。
- `apps/editor/`：Pixifact 桌面编辑器产品应用。
- `apps/editor/src-tauri/`：Tauri desktop host。
- `examples/`：runtime 示例。
- `tests/`：单元测试、编辑器测试、MCP 测试。

## 核心架构规则

- `SceneDocument` 是 editor 和 Agent 修改 Scene 的唯一 source of truth。
- Zustand 只保存 UI 状态，不保存 `SceneSpec` / `SceneDocument` 的副本。
- 所有真实项目修改必须走 `SceneDocument` API 或 `SceneCommand`。
- AI / Agent 不直接修改项目，只生成结构化 `SceneCommand` / proposal。
- 当前 Alpha proposal 必须能 dry-run、review diff、apply、reject；后续产品方向是 Agent / MCP first 和 repair loop。
- JSON 是资产格式，不作为主要编辑入口。
- 不引入 Monaco，不做内嵌代码编辑器。

## Scene 规则

- 资产统一使用 `SceneSpec`，文件扩展名为 `.scene`。
- `SceneSpec.root` 必须是 `container`。
- 公开节点类型只有 `container`、`image`、`text`、`input`、`shape`。
- 只有 `container` 可以包含子节点。
- 所有节点都可以挂行为组件。
- 显示数据放在节点字段上，例如 `text.value`、`image.src`、`input.value`、`shape.color`。
- `Button`、`ProgressBar`、`ScrollView` 等是 Scene 模板，不作为基础显示节点。
- 不向用户或 Agent 暴露 `ui.TextGraphic`、`ui.ImageGraphic`、`ui.RoundedRectGraphic` 作为 authoring 组件。

## Runtime Foundation 规则

- 使用 `GameObject.instantiate(Type, parent, props?)` 创建 runtime 节点。
- runtime `Group` 是底层唯一容器节点；公开 authoring 名称使用 `container`。
- `Graphics`、`Label`、`Image`、`NineSliceImage` 等渲染叶子不应拥有子节点。
- 挂载到 `Application.root` 后才参与 ticker-driven update。
- 可复用行为放在 `Component` 子类里。
- 生命周期使用 `awake`、`start`、`update`、`onDestroy`。
- 组件清理必须在 `onDestroy` 中释放事件监听。
- 布局优先使用 `Layout`、`GridLayout`、`FlexGroup` / `Flex`。
- 尽量使用逻辑 `width` / `height` 做布局判断，不随意依赖 Pixi bounds。
- 新增 runtime 能力时，优先服务 Scene 实例化、editor workflow、Viewport 预览、Command 应用、MCP 和导出。

## Editor UI 设计原则

### 文案

主要使用中文，但不要为了中文而中文。

适合中文化：

- 用户动作：生成、预演、应用、拒绝、导入、导出、校验。
- 状态和空态：未选择节点、暂无动作、项目校验通过、导入失败。
- 面板标题：层级、检查器、组件、动作、逻辑、记忆、项目。
- 面向用户和验证流程的错误提示。

保留英文或中英混用：

- 产品和行业术语：AI-first、Prompt、Dry Run、Diff、Memory、Mock、Remote、MCP、Agent。
- 工程概念：ID、Key、Type、Scene、Command、SceneDocument、ActionRegistry、LogicGraph。
- 文件和语言名：JSON、TypeScript、TS。
- 组件 schema 的原始 display name 和 type，例如 `Button`、`ui.Button`。

### 按钮

- 工具动作可以使用 SVG 图标，或图标 + 短文本。
- 决策动作保留清晰文字。
- 纯图标按钮必须提供 `aria-label` 和 `title`。
- 图标服务于扫描效率，不替代关键语义。

当前按钮组件：

- `apps/editor/src/components/IconButton.tsx`
- `apps/editor/src/components/ActionButton.tsx`

## 目录约定

Editor 产品目录固定为：

```txt
apps/editor/
```

`apps/editor/src/EditorApp.tsx` 只负责顶层组合和文档订阅。

面板放在：

```txt
apps/editor/src/panels/
```

服务放在：

```txt
apps/editor/src/services/
```

运行时预览放在：

```txt
apps/editor/src/preview/
```

公共 React 控件放在：

```txt
apps/editor/src/components/
```

## 常用命令

优先运行最小相关验证。

```bash
bun run test
```

编辑器相关改动常用：

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run editor:frontend:build
```

runtime 或导出 API 改动常用：

```bash
bun run build
bun run example:build
```

本地启动 Tauri 桌面版：

```bash
bun run editor
```

`bun run editor` 是桌面入口别名，不启动或维护独立浏览器版。Tauri dev 内部使用的 Vite server 只服务桌面 WebView。

等价命令：

```bash
bun run desktop
```

打包 Tauri 桌面版：

```bash
bun run desktop:build
```

本地启动 MCP server：

```bash
bun run editor:mcp
```

本地启动真实 gateway adapter 样例：

```bash
bun run editor:gateway
```

## 工作方式

- 优先保持改动小而聚焦。
- 后续需求必须朝最终目标一步到位：实现前先明确完整交互、数据流、边界状态和验证方式，不要先交付半成品再依赖后续反复补齐。
- 不要重写 unrelated 文件。
- 不要 revert 用户已有改动。
- 不要把 React state 变成项目数据源。
- 不要为了 UI 美化破坏 Alpha 核心流程测试。
- 新增面板或服务时，优先复用现有 `SceneDocument`、command、serializer、validator。
- 运行测试或构建后，避免提交 `apps/editor/dist`、`packages/pixifact/dist`、`test-results`、`apps/editor/src-tauri/target` 等临时产物。
- 每次代码或文档改动完成并通过相关验证后，自动提交 tracked 变动；不要提交未跟踪文件，除非用户明确要求。
