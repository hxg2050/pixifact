# Editor Panels

正式 editor 当前按 Dockview 桌面界面固化为五个核心面板：

- `ExplorerPanel.tsx`：文件系统入口，展示项目文件、图片预览说明、Scene 双击打开、Component 文件拖拽数据。
- `HierarchyPanel.tsx`：只展示当前打开 Scene 的节点树。
- `ViewportPanel.tsx`：运行时 preview。
- `InspectorPanel.tsx`：属性编辑、属性级 lock、底部 Add Component 和 Component 文件拖拽添加。
- `AiPanel.tsx`：Agent / CLI 状态与连接引导；深度 AI 操作交给 Codex、Claude Code 等外部 agent。
- `SummaryBar.tsx` / `common.tsx`：共享展示和树遍历辅助。

不再保留旧 Alpha 的独立 Component Palette、Action、Logic、Memory、Project tab。项目数据仍以 `SceneDocument` 为 source of truth，UI 状态只保存轻量偏好；外部 AI 通过 CLI 调用受控 `SceneCommand`。
