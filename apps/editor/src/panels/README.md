# Editor Panels

本目录放置 Pixif AI-first editor 的面板。面板只负责 React UI 呈现和用户交互编排，不持有项目数据副本。

## 职责边界

- `ExplorerPanel.tsx`：左侧资源管理器 shell，提供层级 / 资源两个视图；资源视图从 `EditorDocument` 生成只读项目目录。
- `HierarchyPanel.tsx`：展示 `PrefabSpec` 节点树，并通过 `EditorDocument.setSelection()` 更新选择；`HierarchyTree` 可被左侧 shell 复用。
- `ViewportPanel.tsx`：承载真实 Pixif runtime preview，不直接修改项目结构。
- `InspectorPanel.tsx`：基于 `document.getInspectorModel()` 编辑节点、Transform 和组件属性；所有修改必须走 command。
- `AiPanel.tsx`：Prompt、provider mode、proposal、dry-run、diff、apply、reject 和 history。
- `ComponentPalettePanel.tsx`：从 `ComponentRegistry` schema 列出可添加组件，并通过 `addComponent` command 添加。
- `ActionRegistryPanel.tsx`：维护 action registry，供事件字段和 LogicGraph 引用。
- `LogicGraphPanel.tsx`：展示、校验和导出结构化 LogicGraph，不提供内嵌代码编辑器。
- `MemoryPanel.tsx`：展示、接受、启用、停用、删除、导入和导出 preference memory。
- `ProjectPanel.tsx`：项目导入、导出、校验和摘要，不提供 JSON 主编辑区。
- `RightPanel.tsx`：右侧 tab shell，只负责选择当前 panel。
- `SummaryBar.tsx`：顶部项目摘要。
- `common.tsx`：面板间共享的小型展示和格式化 helper。

## 状态规则

- `EditorDocument` 是唯一 source of truth。
- Zustand 只保存 UI 状态，例如当前 tab、provider mode、prompt。
- 资源管理器第一版只索引当前项目状态，不直接扫描或写入磁盘文件。
- 面板内 `useState` 只用于局部草稿、loading、error、message 等临时 UI 状态。
- 项目修改必须调用 `document.apply()`、`document.loadState()` 或明确的 `EditorDocument` API。
- 修改锁、memory、action、logic graph 后需要触发 `refreshEditorDocument()`，让 React shell 刷新。

## UI 规则

- 主要使用中文，但不要为了中文而中文。
- 保留 `AI-first`、`ID`、`Key`、`Type`、`Prefab`、`Dry Run`、`Diff`、`TS` 等工程和行业术语。
- 工具动作优先用 `IconButton` 或 `ActionButton`。
- 决策动作保留文字按钮，例如生成、预演、应用、拒绝、保存动作。
- 纯图标按钮必须提供 `aria-label` 和 `title`。
- 不要把 JSON textarea 或代码编辑器作为主要交互。

## 验证

编辑器面板变更后至少运行：

```bash
pnpm exec tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
pnpm test
pnpm editor:build
```

影响 Alpha 核心流程时运行：

```bash
pnpm editor:e2e
```
