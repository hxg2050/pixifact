# Pixifact Scene Migration Plan

本文档记录当前 Pixifact 最终目标和迁移状态。项目已经从 editor-only 目标收敛为面向 AI 完整游戏开发的 `pixifact` framework + CLI + editor + runtime：核心包提供 Scene 语义，外部 Agent 通过 CLI 理解、修改、验证和编译 Scene，编辑器负责预览、资产浏览、校验结果展示和人工微调。

## 1. 最终定位

- Pixifact 是面向 AI 完整游戏开发的 Scene / UI / 轻场景与项目资产管理层。
- PixiJS 只作为底层渲染实现，不作为用户 authoring 心智。
- Codex、Claude Code 等 coding agent 是主要 AI 入口。
- Pixifact 只提供 AI 可操作的 Scene 能力：inspect、edit、validate、compile、preview 和 diagnose。
- CLI 是 Agent 操作 Pixifact Scene 能力的主入口。
- Git 分支 / commit / revert、Agent 编排、任务管理、CI、PR 和长期项目管理交给外部专业工具。
- 编辑器用于预览、资产浏览、校验结果展示和手动调整。
- 编辑器提供轻量资产预览、资源引用和校验，但不编辑图片、音频、脚本等源资源。
- 双击具体资源调用系统默认程序；打开脚本调用外部代码编辑器。
- Runtime 在游戏中加载 `.scene`。
- 资产模型统一为 Godot-style `Scene`，不做 Scene + Prefab 双资源体系。

## 2. Public Model

- 资产扩展名：`.scene`。
- 资产格式：`SceneSpec`。
- 根节点：必须是 `container`。
- 节点类型：`container`、`image`、`text`、`input`、`shape`。
- 子节点规则：只有 `container` 可以拥有 `children`。
- 组件规则：所有节点都可以挂行为组件。
- 显示规则：显示数据在节点字段上，例如 `text.value`、`image.src`、`input.value`、`shape.color`。
- 组合控件：Button、ProgressBar、ScrollView 等是 Scene 模板，不是基础显示节点。
- Compiler `.scene`：外部 Agent 和 editor 共享的 source of truth。
- `SceneCommand`：保留为 `SceneDocument` 内部命令、校验、应用和撤销基础，不作为外部 Agent 修改协议。

## 3. 当前结构

```txt
packages/pixifact/src/runtime/    runtime foundation
packages/pixifact/src/nodes/      runtime nodes and behavior components
packages/pixifact/src/scene/      SceneSpec、DSL、instantiateScene、templates
packages/pixifact/src/commands/   SceneDocument internal command validate / apply / undo
packages/pixifact/src/compiler/   compiler .scene parse / validate / generate
packages/pixifact/src/authoring/  SceneDocument、diff、memory、logic
packages/pixifact-cli/            Pixifact CLI
apps/editor/                      desktop editor frontend
apps/editor/src-tauri/            Tauri host
```

## 4. 已完成

- [x] 根目录迁移为 Bun workspace。
- [x] 核心包移动到 `packages/pixifact`，包名保持 `pixifact`。
- [x] Pixifact CLI 落地到 `packages/pixifact-cli`。
- [x] Tauri host 移动到 `apps/editor/src-tauri`。
- [x] `SceneSpec` / `.scene` / `scene` kind 落地。
- [x] 基础 authoring 节点收敛为 `container/image/text/input/shape`。
- [x] `SceneCommand`、`validateSceneCommand`、`applySceneCommand` 和 `setNodeData` 作为内部编辑命令落地。
- [x] Compiler `.scene` 成为外部 Agent 的 source of truth。
- [x] `instantiateScene` 将 Scene 节点映射到 runtime。
- [x] 编辑器创建项、Hierarchy、Inspector、Viewport 基于 Scene 语义工作。
- [x] CLI 提供 `scene inspect`、`scene validate`、`scene validate --all` 和 `compile-scenes`。
- [x] Editor live bridge 提供只读 `summary`、`scene get`、`node inspect` 上下文能力。
- [x] Inspector 按公开节点类型展示专属字段，不暴露内部 runtime authoring 组件。
- [x] Scene 模板库包含 Button、ProgressBar、ScrollView，并通过 editor template library 创建。

## 5. 下一阶段

- [x] 跑通运行真实游戏的 MVP 闭环，详见 `docs/RUN_MVP_PLAN.md`。
- [x] 新增完整示例游戏 `sample-projects/space-hud-game`，作为运行、Scene 集成和 Agent 工作流的黄金路径。
- [ ] 继续完善 Agent / CLI-first 的 Scene 预览、校验反馈、诊断展示和自动刷新工作流。
- [ ] 继续优化桌面版本机能力：文件打开、系统默认程序打开、外部代码编辑器跳转。
- [ ] 落地官方 Flex Scene 布局：`FlexLayout` / `FlexItem`，详见 `docs/FLEX_SCENE_LAYOUT.md`。
- [ ] 扩充 Scene 模板库：常用 HUD 组合。
- [ ] 增加 `.scene` 创建、保存、CLI 修改和 editor 预览的 E2E 覆盖。

## 6. 验证策略

优先运行最小相关验证。

详细测试策略、BDD 分层和 TDD 映射见：

```txt
docs/TESTING.md
```

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

桌面主流程改动使用 Tauri 手动验证或后续桌面自动化测试；不再维护浏览器 Playwright 入口。
