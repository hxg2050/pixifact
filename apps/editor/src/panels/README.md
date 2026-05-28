# Editor Panels

正式 editor 当前按固定 Scene workbench 组织核心区域：

- `ProjectShelf.tsx`：底部项目资源架，统一展示 folder / Scene / asset / script；Scene 可拖到层级树，具体资源双击系统默认程序打开，脚本外部编辑器打开。
- `HierarchyPanel.tsx`：只展示当前打开 Scene 的节点树。
- `ViewportPanel.tsx`：运行时 preview。
- `InspectorPanel.tsx`：节点类型专属属性编辑、属性级 lock、底部 Add Component 和 Component 文件拖拽添加。
- `AgentPanel.tsx`：Proposal 审查与应用入口；主路径仍是帮助外部 Agent 直接编辑 `.scene` 后运行 inspect / validate / compile / build。
- `SummaryBar.tsx` / `common.tsx`：共享展示和树遍历辅助。

不再保留旧 Alpha 的独立 Component Palette、Action、Logic、Memory、Project tab。项目数据仍以 `SceneDocument` 或 compiler `.scene` 文件为 source of truth，UI 状态只保存轻量偏好；外部 AI 通过 CLI 调用 Pixifact 的 Scene inspect、validate、compile、preview 和 diagnostics 能力。Git、Agent 编排、任务管理和 CI 由外部工具负责。
