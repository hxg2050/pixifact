# AGENTS.md

本文件是给 Codex / coding agents 的项目入口说明。进入本仓库后，先阅读本文件，再按任务需要阅读 `README.md`、`PLAN.md`、`AI_FIRST_GAME_EDITOR_PLAN.md` 和相关源码。

## 📌 附加行为规范

在处理本项目任何代码相关任务前，必须先读取并遵守 `CODEX.md` 中的行为规范，并与本文件规则合并执行。

-   非必须不编写主动兜底、静默默认值或主动抛错逻辑；让错误在运行或测试时自然暴露，以便定位并修复真实调用问题。

## 项目概览

`pixif` 是基于 PixiJS v8 的轻量 TypeScript 框架，提供更接近 UI / GameObject 的开发模型。

当前仓库同时包含：

- `src/`：pixif framework core、UI 组件、Prefab、Command、EditorDocument、AI proposal 等核心能力。
- `apps/editor/`：Pixif AI-first Game Editor 产品应用。
- `examples/`：框架示例，不承载 editor 产品。
- `tests/`：单元测试和编辑器相关测试。
- `tests/e2e/`：Playwright Alpha 主流程测试。

## 核心架构规则

- `EditorDocument` 是 editor 项目的唯一 source of truth。
- Zustand 只保存 UI 状态，不保存 PrefabSpec / EditorDocument 的副本。
- 所有真实项目修改必须走 `EditorDocument` API 或 command。
- AI 不直接修改项目，只生成可审查的 proposal。
- Proposal 必须能 dry-run、review diff、apply、reject。
- JSON 只是资产格式，不作为主要编辑入口。
- 不引入 Monaco，不做内嵌代码编辑器。

## Pixif 框架规则

- 使用 `GameObject.instantiate(Type, parent, props?)` 创建 pixif 节点。
- `Group` 是唯一容器节点。
- `Graphics`、`Label`、`Image`、`NineSliceImage` 等渲染叶子不应拥有子节点。
- 挂载到 `Application.root` 后才参与 ticker-driven update。
- 可复用行为放在 `Component` 子类里。
- 生命周期使用 `awake`、`start`、`update`、`onDestroy`。
- 组件清理必须在 `onDestroy` 中释放事件监听。
- 布局优先使用 `Layout`、`GridLayout`、`FlexGroup` / `Flex`。
- 尽量使用逻辑 `width` / `height` 做布局判断，不随意依赖 Pixi bounds。

## Editor UI 设计原则

### 文案

主要使用中文，但不要为了中文而中文。

适合中文化：

- 用户动作：生成、预演、应用、拒绝、导入、导出、校验。
- 状态和空态：未选择节点、暂无动作、项目校验通过、导入失败。
- 面板标题：层级、检查器、组件、动作、逻辑、记忆、项目。
- 面向用户和验证流程的错误提示。

保留英文或中英混用：

- 产品和行业术语：AI-first、Prompt、Dry Run、Diff、Memory、Mock、Remote。
- 工程概念：ID、Key、Type、Prefab、Command、EditorDocument、ActionRegistry、LogicGraph。
- 文件和语言名：JSON、TypeScript、TS。
- 组件 schema 的原始 display name 和 type，例如 `Button`、`Rounded Rect`、`ui.Button`。

### 按钮

- 工具动作可以使用 SVG 图标，或图标 + 短文本。
- 决策动作保留清晰文字。
- 纯图标按钮必须提供 `aria-label` 和 `title`。
- 图标服务于扫描效率，不替代关键语义。

适合图标化：

- 撤销、重做。
- 锁定、解锁。
- 导入、导出、校验。
- 添加、编辑、删除。

保留文字：

- 生成。
- 预演。
- 应用。
- 拒绝。
- 保存动作。

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
pnpm test
```

编辑器相关改动常用：

```bash
pnpm exec tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
pnpm editor:build
pnpm editor:e2e
```

框架或导出 API 改动常用：

```bash
pnpm build
pnpm example:build
```

本地启动 editor：

```bash
pnpm editor
```

本地启动 mock AI server：

```bash
pnpm editor:ai
```

本地启动真实 gateway adapter 样例：

```bash
pnpm editor:gateway
```

## 工作方式

- 优先保持改动小而聚焦。
- 后续需求必须朝最终目标一步到位：实现前先明确完整交互、数据流、边界状态和验证方式，不要先交付半成品再依赖后续反复补齐。
- 不要重写 unrelated 文件。
- 不要 revert 用户已有改动。
- 不要把 React state 变成项目数据源。
- 不要为了 UI 美化破坏 Alpha 核心流程测试。
- 新增面板或服务时，优先复用现有 `EditorDocument`、command、serializer、validator。
- 运行测试或构建后，避免提交 `apps/editor/dist`、`test-results`、`playwright-report` 等临时产物。
