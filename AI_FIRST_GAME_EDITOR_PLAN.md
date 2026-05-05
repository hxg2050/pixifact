# Pixif AI-first Game Editor Plan

本文档是 Pixif AI-first 游戏编辑器的产品、架构和执行计划。

核心结论：

- 编辑器是产品级应用，目录固定为 `apps/editor`。
- `examples` 只放框架示例，不承载编辑器产品。
- AI-first 是第一原则，自然语言是主要创作入口。
- AI 不直接修改项目，只提交可审查的 proposal。
- 开发者通过 Diff、Dry Run、Lock、Inspector、Undo、Memory 控制最终结果。
- 不内嵌代码编辑器，不使用 Monaco，不把 JSON textarea 作为主要交互。
- Pixif 原生组件树、Command、EditorDocument、PrefabSpec 是真正的 source of truth。

## 1. 产品定位

产品名称：

```txt
Pixif AI-first Game Editor
```

一句话定位：

```txt
一个面向游戏 UI、交互和轻量玩法逻辑的 AI-first 编辑器。
设计师用自然语言描述目标，AI 生成可编辑的 Pixif 原生组件树；
开发者通过可视化审查、属性锁定、命令回放和项目记忆保持工程控制权。
```

这不是传统 UI 编辑器，也不是在传统编辑器旁边加一个 AI 聊天框。

它的主创作方式是：

```txt
Prompt -> AI Proposal -> Dry Run -> Diff Review -> Apply -> Manual Refine -> Memory
```

编辑器本质上是 AI 的受控沙箱：

- AI 可以理解当前项目结构、组件 schema、设计 token、事件、逻辑图和偏好记忆。
- AI 的输出必须被转成结构化 command proposal。
- 所有 proposal 都可以预演、比较、拒绝、应用和回滚。
- 人工修改会被记录为 override，并可沉淀为可启用/禁用的 memory。

## 2. 目标用户

### 2.1 独立游戏开发者

诉求：

- 快速生成游戏 UI。
- 少写重复样板代码。
- 保持项目可导出、可维护、可版本管理。

价值：

- 用自然语言快速得到可运行界面。
- 用 Inspector 精修样式和交互。
- 用 Project Export 把结果纳入工程流程。

### 2.2 小型游戏团队

诉求：

- 设计师能直接表达界面意图。
- 程序员能控制数据结构和行为入口。
- 团队规范能被持续遵守。

价值：

- AI 按项目组件库和 token 生成。
- 程序员定义 ActionRegistry，设计师只绑定已声明行为。
- Memory 记录团队偏好，但可以审查和禁用。

### 2.3 可扩展团队 / 私有化用户

诉求：

- 可私有化。
- 可控生成。
- 可审计。
- 能接入已有组件库和设计系统。

价值：

- AI gateway 可替换成本地或云端实现。
- proposal / command / memory 全部结构化。
- 可做审计日志、权限、团队策略和企业部署。

## 3. 产品原则

### 3.1 AI-first

自然语言是主入口，不是辅助入口。

用户应该能输入：

```txt
创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。
```

系统输出：

- 可编辑的 Pixif 原生组件树。
- 可解释的布局和样式说明。
- 可审查的 command list。
- 可 dry-run 的 diff。
- 可绑定到 ActionRegistry 的行为入口。

### 3.2 Developer-controlled

AI 的每一次修改都必须可控。

必须具备：

- Dry Run：应用前预演。
- Diff：展示新增、删除、修改。
- Risk：展示潜在风险。
- Lock：人工锁定属性，AI 不得覆盖。
- Undo / Redo：所有已应用 command 可回滚。
- Reject：proposal 可拒绝且不产生副作用。
- History：proposal 的生命周期可追踪。

### 3.3 Native-first

AI 生成的是 Pixif 原生结构，不是中间页面、HTML mock 或无法维护的 JSON 文本。

真实资产模型：

```txt
EditorDocument
  PrefabSpec
    NodeSpec
      ComponentSpec[]
  ActionRegistry
  LogicGraph
  DesignToken
  Locks
  Overrides
  PreferenceMemory
  ProposalHistory
```

### 3.4 No Code Editor

不内嵌代码编辑器。

不做：

- Monaco。
- VS Code-like editor。
- 大段 TypeScript 编辑区。
- 大段 JSON textarea 作为主工作流。

可以做：

- 生成 TypeScript 文件。
- 导出逻辑摘要。
- 展示只读代码预览。
- 由外部 IDE 接管代码深度编辑。

原因：

- 本产品的核心价值不是替代 IDE。
- 内嵌代码编辑器会把产品重心拉回传统开发工具。
- AI-first 编辑器更应该把代码隐藏在结构化行为和可视化逻辑后面。

### 3.5 JSON Is Asset Format

JSON 只作为资产格式存在。

用途：

- Import Project。
- Export Project。
- Validate Project。
- 自动化测试。
- 版本 diff。
- AI gateway payload。

不作为：

- 普通用户主要编辑入口。
- 编辑器中心面板。
- AI 输出的最终展示方式。

## 4. 当前仓库事实

### 4.1 当前分支状态

当前实验分支：

```txt
experiment/unity-like-ui-components
```

当前 editor 产品目录：

```txt
apps/editor/
```

状态：

```txt
apps/editor 已重建为产品级 React / Vite 编辑器应用，并已跑通 Alpha 核心编辑闭环。
```

当前 editor 应用入口：

```txt
apps/editor/index.html
apps/editor/src/main.tsx
apps/editor/src/EditorApp.tsx
```

当前 editor 应用结构：

```txt
apps/editor/src/
  document/
  mock/
  panels/
  preview/
  services/
  editorStore.ts
  styles.css
```

当前验证状态：

```txt
pnpm test
pnpm editor:build
pnpm build
pnpm editor:e2e
```

以上命令已通过；E2E 覆盖 prompt -> dry-run -> apply -> manual refine -> memory -> export -> import 的 Alpha 核心流程。

### 4.2 已有核心底座

这些能力已经在 `src/` 下实现，并且不依赖 `apps/editor`：

```txt
src/core/component/
  ComponentRegistry.ts
  decorators.ts

src/ui/components/
  Button.ts
  InputField.ts
  ProgressBar.ts
  ScrollRect.ts
  Selectable.ts

src/ui/graphics/
  Graphic.ts
  RoundedRectGraphic.ts
  TextGraphic.ts

src/ui/prefab/
  spec.ts
  dsl.ts
  uiDsl.ts
  instantiate.ts
  templates.ts

src/ui/commands/
  Command.ts
  CommandStack.ts
  applyCommand.ts
  validateCommand.ts
  utils.ts

src/ui/editor/
  EditorDocument.ts
  EditorProjectState.ts
  EditorSelection.ts
  RuntimePreview.ts
  InspectorModel.ts
  AiProposal.ts
  AiProposalProvider.ts
  MockAiProposal.ts
  AiContext.ts
  ProposalRunner.ts
  DiffModel.ts
  DesignToken.ts
  OverrideJournal.ts
  PreferenceMemory.ts
  ProposalHistory.ts
  ComponentPalette.ts
  ActionRegistry.ts
  LogicGraph.ts
```

已有能力覆盖：

- `@ComponentMeta` / `@Prop` 装饰器。
- `ComponentRegistry` schema。
- `PrefabSpec` / `NodeSpec` / `ComponentSpec`。
- `Group` 作为唯一层级容器。
- `Component` 表达能力。
- `Graphic` 表达显示。
- `instantiate(PrefabSpec)` 生成真实 Pixif runtime tree。
- Command 协议和 `CommandStack`。
- Command validation。
- Undo / redo。
- Dry-run。
- AI proposal。
- Diff model。
- Risk / annotation。
- Lock / OverrideJournal。
- DesignToken warning。
- EditorProjectState。
- AI context。
- ComponentPalette。
- ActionRegistry。
- LogicGraph MVP。
- PreferenceMemory。
- Remote AI proposal protocol：`pixif.aiProposal.v1`。
- Mock AI proposal provider。

### 4.3 当前不应恢复的旧方向

不要恢复：

- `examples/editor` 作为产品入口。
- 单文件编辑器壳。
- Monaco。
- 内嵌代码编辑器。
- JSON textarea 主界面。
- 让 React state 成为项目 source of truth。

## 5. 技术栈决策

### 5.1 Editor Shell

采用：

```txt
React + Vite + TypeScript
```

职责：

- 面板布局。
- Prompt 输入。
- Diff / Risk / History 展示。
- Inspector 表单。
- Hierarchy。
- Palette。
- Project import / export。
- LogicGraph 可视化。

React 只做 shell，不持有真实项目状态。

### 5.2 UI-only State

采用：

```txt
Zustand
```

只保存 UI 状态：

- 当前激活面板。
- 右侧 tab。
- provider mode。
- remote endpoint。
- 当前 prompt 输入。
- viewport tool mode。
- panel 展开状态。
- loading / error。

禁止保存：

- `PrefabSpec` 的独立副本。
- `EditorDocument` 的独立副本。
- command 应用后的影子项目树。

### 5.3 Source of Truth

唯一 source of truth：

```txt
EditorDocument
```

所有真实项目修改必须走：

- `EditorDocument.apply(command)`。
- `EditorDocument` 已提供的项目 API。
- `ProposalRunner` 的 dry-run / apply 工作流。

不得绕过 command 直接改 runtime tree。

### 5.4 Runtime Viewport

采用：

```txt
Pixif / PixiJS canvas
```

渲染路径：

```txt
PrefabSpec -> instantiate() -> RuntimePreview -> Pixif runtime tree -> canvas
```

Runtime tree 只用于：

- 预览。
- 命中测试。
- selection bounds。
- 拖拽反馈。

Runtime tree 不作为保存来源。

### 5.5 Logic Graph UI

采用：

```txt
@xyflow/react
```

职责：

- 编辑事件-条件-动作图。
- 展示 flow 节点和边。
- 对接 `LogicGraphSpec`。

不做：

- 内嵌 TS 编辑器。
- 直接把图数据写成非结构化脚本。

### 5.6 Runtime Validation

采用：

```txt
Zod
```

用于校验：

- `.ai-editor.json` import。
- AI proposal response。
- Remote provider response。
- Memory import。
- LogicGraph import。
- Design token import。

原因：

- AI 和用户导入数据不可信。
- TypeScript 只能保证编译期。
- Alpha 可用性需要清晰的错误报告和兼容策略。

### 5.7 AI Gateway

采用：

```txt
HTTP JSON protocol
```

协议名：

```txt
pixif.aiProposal.v1
```

AI provider 形态：

- Local mock provider。
- Remote HTTP provider。
- Cloud provider later。
- Enterprise local provider later。

原则：

- provider 只返回 proposal。
- provider 不直接访问 runtime。
- provider 不直接写文件。
- editor 负责验证、dry-run、diff 和 apply。

### 5.8 Desktop Packaging

后续采用：

```txt
Tauri v2
```

先不做桌面壳。

引入时机：

- Web editor alpha 稳定。
- 需要本地文件系统。
- 需要桌面菜单和快捷键。
- 需要企业本地部署。

### 5.9 Testing

当前：

```txt
Vitest
```

后续：

```txt
Playwright
```

测试层级：

- Core unit tests：commands、document、proposal、logic graph、memory。
- Editor shell tests：panel interaction、store、provider controller。
- E2E tests：prompt -> dry-run -> apply -> export -> import。

## 6. 目标目录结构

### 6.1 Product App

```txt
apps/editor/
  index.html
  src/
    main.tsx
    EditorApp.tsx
    editorStore.ts
    styles.css
    document/
      createInitialDocument.ts
      editorDocumentController.ts
    panels/
      ExplorerPanel.tsx
      HierarchyPanel.tsx
      InspectorPanel.tsx
      ViewportPanel.tsx
      AiPanel.tsx
      ComponentPalettePanel.tsx
      ActionRegistryPanel.tsx
      LogicGraphPanel.tsx
      MemoryPanel.tsx
      ProjectPanel.tsx
    preview/
      PixifViewport.tsx
      selectionBounds.ts
      hitTestRuntimeNode.ts
    services/
      aiProviderController.ts
      projectSerializer.ts
      projectValidator.ts
    mock/
      mock-ai-server.mjs
      mockAiServerCore.mjs
```

### 6.2 Framework Core

继续保留在：

```txt
src/
```

原则：

- `src/` 提供框架、文档模型、command、proposal、runtime preview。
- `apps/editor/` 提供产品 UI。
- `apps/editor/` 可以依赖 `src/`。
- `src/` 不依赖 `apps/editor/`。

## 7. 核心产品模块

### 7.1 AI Composer

目标：

```txt
自然语言生成 Pixif 原生组件树和可审查 command proposal。
```

输入：

- Prompt。
- 当前 PrefabSpec 摘要。
- ComponentRegistry schema。
- DesignToken。
- ActionRegistry。
- LogicGraph 摘要。
- Locks。
- Enabled Memory。
- 用户可选参考图片 later。

输出：

- `AiProposal`。
- explanation。
- commands。
- annotations。
- risks。
- suggested locks / memory later。

关键交互：

- Generate。
- Dry Run。
- Review Diff。
- Apply。
- Reject。
- View History。

### 7.2 Viewport

目标：

```txt
让用户看到真实 Pixif runtime，而不是 HTML mock。
```

能力：

- 渲染当前 PrefabSpec。
- 点击选择节点。
- 显示 selection bounds。
- command 后自动 rebuild。
- later 支持拖拽移动、缩放、对齐线。

### 7.3 Hierarchy

目标：

```txt
展示和管理 Pixif 原生节点树。
```

能力：

- 显示 `NodeSpec` 树。
- 选择节点。
- 创建节点。
- 删除节点。
- 重排。
- reparent。
- later 支持搜索和过滤。

### 7.4 Inspector

目标：

```txt
schema-driven 属性编辑。
```

能力：

- Transform 编辑。
- Node prop 编辑。
- Component prop 编辑。
- Lock / unlock 单个字段。
- DesignToken warning。
- 事件字段只允许选择已声明 Action。

所有修改必须转换为 command。

### 7.5 Component Palette

目标：

```txt
基于 ComponentRegistry 添加能力组件。
```

能力：

- 列出可用 component。
- 显示分类、描述、默认值。
- 添加 component。
- 禁止重复添加 `disallowMultiple` component。
- later 支持依赖提示和自动补齐。

### 7.6 Action Registry

目标：

```txt
把交互入口结构化，避免 UI 直接引用不存在的函数。
```

能力：

- 声明 action。
- 删除 action。
- 为 action 添加描述和 payload schema later。
- Inspector event prop 只能绑定已声明 action。
- AI proposal 引用 action 时必须通过 validation。

### 7.7 Logic Weaver

目标：

```txt
用结构化 LogicGraph 表达轻量玩法逻辑。
```

能力：

- 基于 action 创建 flow。
- 可视化事件-条件-动作节点。
- 校验节点引用。
- 生成 TypeScript 文件或摘要。
- 测试回放 later。

不做：

- 内嵌代码编辑。
- 复杂通用脚本 IDE。

### 7.8 Design Guardian

目标：

```txt
让 AI 和人工编辑都受到设计系统约束，但允许例外。
```

能力：

- 导入 / 定义 design token。
- AI context 注入 token。
- Inspector 修改时给出 warning。
- 例外修改进入 OverrideJournal。
- later 支持一键规范化。

### 7.9 Collaborative Memory

目标：

```txt
把人工修改沉淀成可审查的偏好，而不是不可控地“自动学习”。
```

能力：

- 从 OverrideJournal 生成 memory suggestion。
- 用户手动 accept。
- memory 可 enable / disable。
- memory 可 delete。
- memory 可 import / export。
- enabled memory 进入 AI context。

原则：

- 不做隐式自动学习。
- 不把用户每次操作偷偷送给 AI。
- memory 必须可见、可解释、可关闭。

### 7.10 Project Panel

目标：

```txt
项目资产管理，而不是 JSON 编辑器。
```

能力：

- Export `.ai-editor.json`。
- Import `.ai-editor.json`。
- Validate Project。
- 展示项目摘要。

项目摘要包括：

- node count。
- component count。
- action count。
- logic flow count。
- memory count。
- lock count。
- proposal history count。

### 7.11 Interface Design System

目标：

```txt
让编辑器看起来像专业工具，而不是工程原型，同时保持信息密度和操作准确性。
```

文案原则：

```txt
主要使用中文，但不要为了中文而中文。
```

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

按钮原则：

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

当前实现：

- `apps/editor/src/components/IconButton.tsx`：纯 SVG 图标按钮。
- `apps/editor/src/components/ActionButton.tsx`：SVG 图标 + 文本按钮。
- 顶栏撤销 / 重做已使用 `IconButton`。
- Inspector 锁定 / 解锁已使用 `IconButton`。
- ProjectPanel 导入 / 导出 / 校验已使用 `ActionButton`。
- LogicGraphPanel 添加默认流程 / 校验 / 导出 TS 已使用 `ActionButton`。

## 8. 数据流

### 8.1 AI 生成流程

```txt
User Prompt
  -> buildAiContext(EditorDocument)
  -> AiProposalProvider.generate(context, prompt)
  -> validate AiProposal
  -> document.recordProposal(generated)
  -> ProposalRunner.dryRun(proposal)
  -> Diff / Risk / Warning
  -> User Apply / Reject
  -> document.apply(command)
  -> RuntimePreview rebuild
  -> OverrideJournal / ProposalHistory update
```

### 8.2 人工编辑流程

```txt
Inspector / Viewport / Hierarchy operation
  -> EditorCommand
  -> validateCommand
  -> EditorDocument.apply(command, 'manual')
  -> CommandStack stores inverse
  -> OverrideJournal records before/after
  -> RuntimePreview rebuild
  -> Memory suggestion available
```

### 8.3 导入导出流程

```txt
Export:
  EditorProjectState
    -> runtime validation
    -> .ai-editor.json

Import:
  .ai-editor.json
    -> Zod validation
    -> EditorProjectState
    -> EditorDocument.load
    -> RuntimePreview rebuild
```

## 9. AI 协议边界

AI provider 请求应包含：

- protocol。
- prompt。
- project summary。
- component schemas。
- current prefab。
- selection。
- design tokens。
- actions。
- logic graph。
- locks。
- enabled memory。

AI provider 响应只能包含：

- protocol。
- proposal id。
- title。
- summary。
- explanation。
- commands。
- annotations。
- risks。

AI provider 不能：

- 直接修改文件。
- 直接修改 EditorDocument。
- 直接调用 runtime API。
- 返回需要用户手写的代码片段作为唯一结果。

## 10. 分阶段执行计划

当前执行状态：

```txt
Phase 0 - Phase 12 已完成，并已通过单元测试、编辑器构建、库构建和 Playwright E2E。
Phase 13 是当前下一步。
```

以下 Phase 0 - Phase 12 保留为已执行计划和验收依据。

### Phase 0: Repository Baseline

状态：已完成。

目标：

```txt
确认清理后的仓库可测试、可构建，避免在坏基线上继续实现。
```

任务：

- 确认 `apps/editor` 为空。
- 确认 `package.json` 暂无 stale editor scripts。
- 跑 `pnpm test`。
- 跑 `pnpm build`。

验收：

- `pnpm test` 通过。
- `pnpm build` 通过。

### Phase 1: React App Scaffold

状态：已完成。

目标：

```txt
从空的 apps/editor 重建产品级 editor shell。
```

任务：

- 安装 `react`、`react-dom`、`zustand`。
- 创建 `apps/editor/index.html`。
- 创建 `apps/editor/src/main.tsx`。
- 创建 `apps/editor/src/EditorApp.tsx`。
- 创建 `apps/editor/src/editorStore.ts`。
- 创建 `apps/editor/src/styles.css`。
- 恢复 package scripts：
  - `editor`: `vite apps/editor`
  - `editor:build`: `vite build apps/editor`
- 建立基础三栏布局。
- 接入 `EditorDocument`。
- 加载默认 Button prefab。

验收：

- `pnpm editor` 可启动。
- `pnpm editor:build` 通过。
- 页面不是空白。
- 能显示基础 editor shell。

### Phase 2: Runtime Viewport

状态：已完成。

目标：

```txt
在 editor shell 中显示真实 Pixif runtime preview。
```

任务：

- 实现 `PixifViewport.tsx`。
- 创建 Pixif `Application`。
- 使用 `EditorDocument.rebuildPreview()`。
- 将 preview 挂载到 canvas。
- 监听 document change 后刷新。
- 实现最小 selection bounds。

验收：

- 默认 Button prefab 可见。
- command 修改后 viewport 同步。
- 销毁组件时 Pixi application 正确清理。

### Phase 3: Hierarchy + Selection

状态：已完成。

目标：

```txt
建立节点树选择闭环。
```

任务：

- 实现 `HierarchyPanel.tsx`。
- 展示 PrefabSpec 节点树。
- 点击 hierarchy node 更新 selection。
- 点击 viewport runtime node 更新 selection。
- selection 在 Hierarchy / Inspector / Viewport 间同步。

验收：

- 选择任一节点后三个面板一致。
- 无 selection 时 Inspector 显示空状态。

### Phase 4: Inspector

状态：已完成。

目标：

```txt
恢复 schema-driven 属性编辑。
```

任务：

- 实现 `InspectorPanel.tsx`。
- 使用 `buildInspectorModel()`。
- Transform 字段编辑走 `setTransform` command。
- Node prop 字段编辑走 `setNodeProp` command。
- Component prop 字段编辑走 `setComponentProp` command。
- 支持 lock / unlock 字段。
- 显示 DesignToken warning。

验收：

- 可修改 Button 文案、尺寸、颜色。
- Undo / redo 生效。
- lock 后 AI dry-run 不能覆盖该字段。

### Phase 5: AI Proposal Panel

状态：已完成。

目标：

```txt
恢复 AI-first 主工作流，不展示 JSON 编辑器。
```

任务：

- 实现 `AiPanel.tsx`。
- Prompt 输入。
- Provider mode：Mock / Remote。
- Generate。
- Dry Run。
- Diff list。
- Risk list。
- Command rows。
- Apply。
- Reject。
- Proposal history。

验收：

- Prompt “创建背包界面”能生成 proposal。
- Dry Run 能显示 diff。
- Apply 后 prefab 和 viewport 更新。
- Reject 不修改项目。
- 已 lock 字段不会被 proposal 覆盖。

### Phase 6: Project Panel

状态：已完成。

目标：

```txt
项目可保存、可恢复、可校验。
```

任务：

- 实现 `ProjectPanel.tsx`。
- Export `.ai-editor.json`。
- Import `.ai-editor.json`。
- Validate Project。
- 展示项目摘要。
- 引入 Zod 做 runtime validation。

验收：

- 导出的项目可重新导入。
- 导入非法项目时显示明确错误。
- 不出现大段 JSON 编辑区。

### Phase 7: Component Palette

状态：已完成。

目标：

```txt
让用户通过面板给节点添加能力组件。
```

任务：

- 实现 `ComponentPalettePanel.tsx`。
- 使用 `listPaletteComponents()`。
- 使用 `createComponentSpecFromSchema()`。
- Add Component 走 `addComponent` command。
- `disallowMultiple` 时禁用重复添加。

验收：

- 可给选中节点添加 Text / RoundedRect / Button 等组件。
- 重复 Button 被禁用。
- 添加后 Inspector 立即出现新组件字段。

### Phase 8: Action Registry

状态：已完成。

目标：

```txt
建立 UI 事件和逻辑行为的显式契约。
```

任务：

- 实现 `ActionRegistryPanel.tsx`。
- 新增 action。
- 删除 action。
- Inspector 中 event prop 使用 action 下拉选择。
- command validation 检查 action 是否存在。

验收：

- `onClick=missingAction` 被 dry-run 拒绝。
- `onClick=useInventoryItem` 在 action 声明后通过。

### Phase 9: Logic Graph

状态：已完成。

目标：

```txt
可视化编辑轻量玩法逻辑。
```

任务：

- 安装 `@xyflow/react`。
- 实现 `LogicGraphPanel.tsx`。
- 将 `LogicGraphSpec` 映射为 graph nodes / edges。
- 支持添加默认 `useInventoryItem` flow。
- 支持 graph validation。
- 支持导出生成 TS 文件。
- 支持只读 TS 摘要展示。

验收：

- 可视化看到 action -> condition -> effect。
- graph 校验通过。
- 可导出 TS。
- 不提供内嵌代码编辑器。

### Phase 10: Memory Panel

状态：已完成。

目标：

```txt
让项目偏好可见、可审查、可控制。
```

任务：

- 实现 `MemoryPanel.tsx`。
- 展示 memory suggestions。
- Accept suggestion。
- Enable / disable memory。
- Delete memory。
- Import / export memory。

验收：

- 人工修改后出现 memory suggestion。
- 接受后进入 enabled memory。
- 禁用后不进入 AI context。
- 重新生成 proposal 时 memory 可影响生成。

### Phase 11: Mock AI Server

状态：已完成。

目标：

```txt
提供本地远程 AI 协议样例，方便本地验证和测试。
```

任务：

- 添加 mock server。
- 恢复 package script：
  - `editor:ai`: `node apps/editor/src/mock/mock-ai-server.mjs`
- Remote provider 支持请求本地 mock server。
- 增加 mock server 测试。

验收：

- `pnpm editor:ai` 可启动。
- editor 切换 Remote 后可生成 proposal。
- `pnpm test` 覆盖 mock server core。

### Phase 12: E2E Alpha Scenario

状态：已完成。

目标：

```txt
完成可验证的 Alpha 核心编辑闭环。
```

任务：

- 引入 Playwright。
- 编写主流程 E2E。
- 测试 prompt -> dry-run -> apply -> manual refine -> memory -> export -> import。
- 修复 UI 尺寸、状态、空态、错误态。

验收：

- E2E 自动跑通 Alpha 核心使用场景。
- 本地核心流程不依赖人工手动修复。

### Phase 13: Alpha Usability / 编辑器可用性收口

状态：已完成。

目标：

```txt
把已跑通的 Alpha 闭环整理成稳定、可用、可维护的编辑器状态。
```

任务：

- 已全量检查 editor UI 文案，确保中文优先，但不过度翻译工程术语。
- 已保留 `AI-first`、`ID`、`Key`、`Type`、`Prefab`、`Dry Run`、`Diff`、`TS`、`Mock`、`Remote` 等工程和行业术语。
- 已建立工具动作图标按钮体系，决策动作保留文字按钮。
- 已检查并修正空态、错误态、按钮禁用态和导入失败状态。
- 已给拆分后的 `apps/editor/src/panels/` 添加维护说明，明确每个面板的职责边界。
- 已整理本地使用流程：`pnpm editor`、`pnpm editor:ai`、`pnpm editor:e2e`。
- 已检查 Alpha E2E 覆盖核心使用路径和关键失败路径。
- 已复查构建产物和测试报告；`apps/editor/dist`、`dist`、`test-results` 为本地验证产物，按 `.gitignore` 规则避免误提交。

验收：

- 新开发者能按文档在本地启动 editor。
- 使用者能按文档跑通 Mock / Remote 两种 AI proposal 路径。
- UI 主要用户动作、错误提示、空态为中文；工程术语保持英文或中英混用。
- 工具动作按钮支持 SVG 图标或图标 + 文本，且纯图标按钮具备 `aria-label` 和 `title`。
- `pnpm test`、`pnpm editor:build`、`pnpm editor:e2e`、`pnpm build` 通过。

### Phase 14: Real AI Gateway / 真实 AI 网关接入

状态：进行中，真实 ylsagi Responses 模型链路已打通，进入真实输出质量收紧阶段。

目标：

```txt
让 editor 可以安全接入真实 AI gateway，同时保持 AI 只返回 proposal、项目修改仍由 editor 审查和应用。
```

已完成：

- Remote provider 支持 `endpoint`、`timeoutMs` 和动态 headers。
- AI 面板增加 Remote 配置区：gateway endpoint、timeout、auth header、auth token。
- AI 面板增加 Model 配置区：API、model endpoint、model name、model token、timeout、auth header、auth prefix、reasoning effort、service tier、store、temperature。
- Gateway token 和 model token 只保存在本地 UI 状态，不写入 localStorage，也不写入 `.ai-editor.json` 项目资产。
- Remote provider 覆盖成功、HTTP 失败、timeout 和协议不合法测试。
- E2E 覆盖 Remote provider 失败态和 auth header 请求透传。
- 已定义 gateway 请求、鉴权、错误码和超时策略。
- 已提供 `apps/editor/src/gateway/ai-gateway-adapter.mjs` 样例。
- 已补充 gateway adapter core 测试。
- 已增加 Remote provider 成功路径 E2E，覆盖生成、Dry Run、Apply。
- 已修复普通 `string` prop 被误按 `event` prop 校验 ActionRegistry 的问题。
- 已将 Remote endpoint、timeout、auth header 持久化到浏览器 localStorage。
- 已将 Remote gateway/model 的非敏感配置持久化到浏览器 localStorage。
- 已明确 gateway token 和 model token 不持久化，不写入 `.ai-editor.json`。
- 已实现 `apps/editor/src/gateway/modelAdapter.mjs`，支持 OpenAI-compatible HTTP 上游。
- 已支持从 editor UI 随 `pixif.aiProposal.v1` 请求传入 model API、endpoint、token、model、timeout、auth header、auth prefix、reasoning effort、service tier、store 和 temperature。
- 已支持 OpenAI-compatible `Responses` 和 `Chat Completions` 两种上游请求体。
- 已将默认 Model 预设为 `ylscode`：`Responses`、`https://code.ylsagi.com/codex/v1/responses`、`gpt-5.5`、`medium`、`fast`、`store=false`。
- 已保持环境变量作为 gateway adapter 的开发/CI fallback，但真实模型联调优先走界面配置。
- 已在转发给模型的 prompt 中移除 `request.model`，避免把模型 token 放进模型上下文。
- 已支持上游返回 `AiProposal`、`{ proposal }` 或 OpenAI-compatible `choices[].message.content` JSON。
- 已补充 model adapter 单元测试，覆盖 sample fallback、请求体、鉴权 header、上游错误和 timeout。
- 已补充 UI 模型配置测试，覆盖请求体传递、非敏感配置持久化和 token 不持久化。
- 已完成真实 `ylscode` / `gpt-5.5` / Responses API 手动联调：`Editor -> Gateway -> ylsagi Responses -> AiProposal -> Dry Run / Apply`。
- 已支持 Responses base URL 自动规范化：`https://code.ylsagi.com/codex` 会转为 `/v1/responses`。
- 已将 Remote 和 Model timeout 默认提升到 `300000ms`，并将默认 reasoning effort 调整为 `medium`，避免交互路径长时间卡在 `xhigh`。
- 已补充 `commandSchemas` 和 `commandSummary` 到 AI context，明确可用 EditorCommand 协议。
- 已在 gateway system prompt 中明确要求模型使用 `context.commandSchemas` / `context.commandSummary`，不再声明缺少命令规范。
- 已增加真实模型输出修复：兼容 `type -> op`、`nodeId -> node`、`componentId -> component`、`parentId -> parent`。
- 已增加“模型误称缺少命令规范”时的 gateway 自动纠偏重试。

剩余任务：

- 根据真实输出继续收紧 prompt、schema 和 proposal 修复策略。
- 提高 Inventory Panel 复杂 UI 生成的稳定性，减少无效命令和字段别名。
- 为真实模型典型输出补充更细的 E2E / fixture 测试。

## 11. Alpha 核心使用场景

Alpha 必须完整跑通：

```txt
1. 用户打开 apps/editor。
2. 输入：“创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。”
3. AI 生成 Inventory Panel proposal。
4. 用户 Dry Run，看到 diff、风险和 command rows。
5. 用户 Apply。
6. Viewport 出现可编辑 Inventory Panel。
7. 用户创建或确认 useInventoryItem action。
8. 用户添加默认 Use Item LogicGraph。
9. 用户手动调整按钮位置或样式。
10. 系统生成 memory suggestion。
11. 用户接受 memory。
12. 用户导出 `.ai-editor.json`。
13. 用户重新导入项目。
14. UI、actions、logicGraph、memory、locks 全部恢复。
```

成功标准：

- 从自然语言到可预览 Inventory UI 小于 10 分钟。
- AI 修改全部可 dry-run。
- AI 修改全部可 reject。
- 人工修改全部可 undo。
- 项目可 export / import。
- AI context 包含 schema、actions、logicGraph、locks、memory。
- 不要求用户手写 JSON。
- 不要求用户手写 TypeScript。

## 12. Later: 商业化路径

当前阶段先不推进商业化。本章节只保留为 later 方向，不作为 Phase 13 的执行依据。

### 12.1 开源核心

保留开源：

- Pixif runtime。
- Component model。
- PrefabSpec。
- Command protocol。
- EditorDocument core。
- Basic mock provider。

目的：

- 建立开发者信任。
- 让 AI 生成结果可审查。
- 让社区扩展组件和模板。

### 12.2 Pro 版本方向

可能适合放到 Pro 形态的能力：

- 更强的 AI provider。
- 项目级 memory。
- 团队共享 memory。
- Design token import / enforcement。
- 更完整 LogicGraph。
- E2E test generation。
- 高级 diff / merge。
- 多 prefab 管理。
- 组件库管理。

### 12.3 Enterprise 版本方向

企业能力：

- 本地 AI gateway。
- 私有模型适配。
- 审计日志。
- 权限控制。
- 团队策略。
- 私有组件库。
- CI validation。
- Tauri desktop packaging。
- 私有部署。

### 12.4 早期价值验证

优先验证：

- AI 生成 UI 是否真实节省时间。
- 设计师是否愿意用 prompt 开始工作。
- 程序员是否接受 command / diff / lock 的控制模型。
- 团队是否愿意沉淀 memory。
- 项目是否能稳定 export / import。

不优先验证：

- 大型通用 IDE。
- 完整代码编辑器。
- 大而全游戏引擎。
- 复杂 3D 场景编辑。

## 13. 风险和约束

### 13.1 AI 生成不可控

应对：

- AI 只返回 proposal。
- validation 必须在 apply 前运行。
- dry-run 必须可见。
- lock 必须强约束。
- reject 必须无副作用。

### 13.2 React state 和项目状态分裂

应对：

- `EditorDocument` 是唯一 source of truth。
- Zustand 只保存 UI 状态。
- React 通过订阅 document event 刷新。

### 13.3 编辑器变成传统 IDE

应对：

- 不内嵌代码编辑器。
- LogicGraph 走结构化模型。
- TS 只导出或只读预览。

### 13.4 JSON 对用户不友好

应对：

- JSON 只做资产格式。
- ProjectPanel 只做导入、导出、校验和摘要。
- ExplorerPanel 是左侧资源管理器入口，类似 VSCode 的目录区；第一版展示层级、Prefab、脚本动作、逻辑流、资源引用和组件类型，但不内嵌代码编辑器，也不直接写磁盘文件。
- 所有日常编辑都通过面板、viewport、AI proposal 完成。

### 13.5 范围过大

应对：

- Alpha 只聚焦 UI + interaction + light logic 的核心可用性。
- 不做完整游戏引擎。
- 不做完整代码 IDE。
- 不做多人实时协作。

## 14. 当前下一步

从当前仓库状态看，下一步应执行：

```txt
Phase 14: Real AI Gateway / 真实 AI 网关接入
```

具体顺序：

```txt
1. 继续收集真实 `ylscode` / `gpt-5.5` 输出失败样本。
2. 将常见错误沉淀为 proposal repair、prompt 约束或单元测试 fixture。
3. 优先提升 Inventory Panel 生成稳定性：createNode 结构、Button onClick、TextGraphic / RoundedRectGraphic props。
4. 保持 gateway/model token 不写入 localStorage 或 `.ai-editor.json`。
5. 保持 AI 只返回 proposal，仍由 editor 负责 validation、Dry Run、Diff 和 Apply。
```
