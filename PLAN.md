# Pixifact Scene Migration Plan

本文档记录当前 Pixifact 最终目标和迁移状态。项目已经从 editor-only 目标收敛为 `pixifact` framework + editor + MCP：核心包提供 Scene 语义，编辑器和 Agent 都通过相同命令协议修改 Scene。

## 1. 最终定位

- Pixifact 是独立的 2D UI + 轻场景开发框架。
- PixiJS 只作为底层渲染实现，不作为用户 authoring 心智。
- 编辑器用于搭建 UI / 基础场景、预览 AI 生成结果和手动调整。
- MCP 将 Pixifact Scene 能力开放给 Codex、Claude Code 等 Agent。
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
- 命令协议：`SceneCommand`、`validateSceneCommand`、`applySceneCommand`、`instantiateScene`。
- Authoring document：`SceneDocument` 是 editor 和 Agent 修改 Scene 的 source of truth。

## 3. 当前结构

```txt
packages/pixifact/src/runtime/    runtime foundation
packages/pixifact/src/nodes/      runtime nodes and behavior components
packages/pixifact/src/scene/      SceneSpec、DSL、instantiateScene、templates
packages/pixifact/src/commands/   SceneCommand validate / apply / undo
packages/pixifact/src/authoring/  SceneDocument、AI context、diff、memory、logic
packages/pixifact-mcp/            MCP server
apps/editor/                      desktop editor frontend
apps/editor/src-tauri/            Tauri host
```

## 4. 已完成

- [x] 根目录迁移为 Bun workspace。
- [x] 核心包移动到 `packages/pixifact`，包名保持 `pixifact`。
- [x] MCP server 移动到 `packages/pixifact-mcp`。
- [x] Tauri host 移动到 `apps/editor/src-tauri`。
- [x] `SceneSpec` / `.scene` / `scene` kind 落地。
- [x] 基础 authoring 节点收敛为 `container/image/text/input/shape`。
- [x] `SceneCommand`、`validateSceneCommand`、`applySceneCommand` 和 `setNodeData` 落地。
- [x] `SceneDocument` 成为编辑器和 Agent 的 source of truth。
- [x] `instantiateScene` 将 Scene 节点映射到 runtime。
- [x] 编辑器创建项、Hierarchy、Inspector、Viewport 基于 Scene 语义工作。
- [x] MCP tools 使用 `scenePath`、`get_scene` 和 `SceneCommand`。
- [x] AI context 只暴露 Scene 节点和行为组件 schema。

## 5. 下一阶段

- [ ] 将 editor 主流程从 Alpha proposal 审查器继续收敛为 Agent / MCP first 工作流。
- [ ] 继续优化桌面版本机能力：文件打开、外部程序、代码跳转。
- [ ] 扩充 Scene 模板库：Button、ProgressBar、ScrollView、常用 HUD 组合。
- [ ] 让 Inspector 更贴近具体节点类型，而不是暴露内部 runtime 实现。
- [ ] 增加 `.scene` 创建、保存、MCP 修改和 editor 预览的 E2E 覆盖。

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
