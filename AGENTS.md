# AGENTS.md

本文件是给 Codex / coding agents 的项目入口说明。进入本仓库后，先阅读本文件，再按任务需要阅读 `README.md`、`PLAN.md` 和相关源码。

## 附加行为规范

在处理本项目任何代码相关任务前，必须先读取并遵守 `CODEX.md` 中的行为规范，并与本文件规则合并执行。

- 非必须不编写主动兜底、静默默认值或主动抛错逻辑；让错误在运行或测试时自然暴露，以便定位并修复真实调用问题。
- 当前项目处于开发阶段，永远不用考虑向下兼容；不要为了旧 API、旧路径、旧协议或旧数据格式新增兼容层、别名、fallback、deprecation shim。相关改动应直接迁移调用方并删除旧入口。
- 始终使用中文与用户交流，包括解释、分析、方案讨论和进度汇报。


## 在开始编码前先思考
- 这个功能是不是真的需要，要是根本没人用，就直接跳过，别为了假象的需求写没用的代码。
- 编程语言自带的标准库能不能满足需求，能的话就直接用现成的，不用自己实现。
- 开发平台本身的原生功能能不能覆盖，可以的话就不用重复造轮子。
- 已经装好的现有依赖能不能实现，够的话就别在引入新的依赖。

## 项目概览

Pixifact 是面向 AI 完整游戏开发的 Scene / UI / 轻场景与项目资产管理层。PixiJS 只作为底层渲染实现；Codex、Claude Code 等外部 Agent 通过 Pixifact CLI 使用 `.scene` 语义层，编辑器负责预览、资产浏览、live context、校验结果展示和人工微调。

Pixifact 只专注提供 AI 可操作的 Scene 能力：inspect、edit、validate、compile、preview 和 diagnose。Agent 编排、Git 分支 / commit / revert、任务管理、CI、PR 和长期项目管理交给外部专业工具，不在 Pixifact 内重复实现。

当前仓库包含：

- `packages/pixifact/`：核心 Pixifact 包，包名为 `pixifact`。
- `packages/pixifact/src/runtime/`：`Application`、`GameObject`、`Component`、布局、PixiJS bridge。
- `packages/pixifact/src/nodes/`：runtime 节点和行为组件。
- `packages/pixifact/src/scene/`：`SceneSpec`、Scene DSL、Scene 实例化、Scene 模板。
- `packages/pixifact/src/commands/`：`SceneDocument` 内部 `SceneCommand` 校验、应用、撤销基础。
- `packages/pixifact/src/compiler/`：compiler `.scene` 解析、校验、生成。
- `packages/pixifact/src/authoring/`：`SceneDocument`、selection、diff、locks、actions、logic。
- `packages/pixifact-cli/`：Pixifact CLI，依赖 `pixifact`，不依赖桌面编辑器。
- `apps/editor/`：Pixifact 桌面编辑器产品应用。
- `apps/editor/src-tauri/`：Tauri desktop host。
- `examples/`：runtime 示例。
- `tests/`：单元测试、编辑器测试、CLI 测试。

## 核心架构规则

- Compiler `.scene` 源文件是外部 Agent 和 editor 共享的 source of truth。
- `SceneDocument` 服务 legacy SceneSpec 和 editor 内部命令/undo，不作为外部 Agent 修改协议。
- Zustand 只保存 UI 状态，不保存 `SceneSpec` / `SceneDocument` 的副本。
- Compiler `.scene` 的默认 Agent 路径是直接编辑 `.scene` 源文件，然后运行 Pixifact CLI 的 `scene validate`、`compile-scenes` 和项目最小相关验证。
- Editor live bridge 只提供 summary、scene get、node inspect 等上下文能力，不提供旧 `SceneCommand` mutation 入口。
- JSON 是资产格式，不作为主要编辑入口。
- 不引入 Monaco，不做内嵌代码编辑器。
- Editor 可以做项目资产浏览、轻量预览、资源引用和校验，但不编辑图片、音频、脚本等源资源。
- 双击具体资源调用系统默认程序；打开脚本调用外部代码编辑器。

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
- 新增 runtime 能力时，优先服务 Scene 实例化、editor workflow、Viewport 预览、Command 应用、CLI 和导出。

## Editor UI 设计原则

### 文案

Pixifact 主要面向中国用户。默认 Editor 界面、README 主文档、CLI 用户提示、release notes 和 npm 包 README 都应中文优先；英文内容作为补充，例如 `README.en.md` 或明确的英文语言切换。

主要使用中文，但不要为了中文而中文。

适合中文化：

- 用户动作：生成、预演、应用、拒绝、导入、导出、校验。
- 状态和空态：未选择节点、暂无动作、项目校验通过、导入失败。
- 面板标题：层级、检查器、组件、动作、逻辑、记忆、项目。
- 面向用户和验证流程的错误提示。

保留英文或中英混用：

- 产品和行业术语：AI-first、Prompt、Dry Run、Diff、Memory、CLI、Agent。
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

## 工作方式

- 优先保持改动小而聚焦。
- 后续需求必须朝最终目标一步到位：实现前先明确完整交互、数据流、边界状态和验证方式，不要先交付半成品再依赖后续反复补齐。
- 不要重写 unrelated 文件。
- 不要 revert 用户已有改动。
- 不要把 React state 变成项目数据源。
- 不要为了 UI 美化破坏 Alpha 核心流程测试。
- 新增面板或服务时，优先复用现有 `.scene` parser、serializer、validator、compiler scene document 和必要的 `SceneDocument` 内部能力。
- 运行测试或构建后，避免提交 `apps/editor/dist`、`packages/pixifact/dist`、`test-results`、`apps/editor/src-tauri/target` 等临时产物。
- 每次代码或文档改动完成并通过相关验证后，自动提交 tracked 变动；不要提交未跟踪文件，除非用户明确要求。
