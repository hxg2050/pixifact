# Editor Panels

正式 editor 当前按 dockview prototype 固化为五个核心面板：

- `ExplorerPanel.tsx`：文件系统入口，展示项目文件、图片预览说明、Prefab 双击打开、Component 文件拖拽数据。
- `HierarchyPanel.tsx`：只展示当前打开 Prefab 的节点树。
- `ViewportPanel.tsx`：运行时 Pixif preview。
- `InspectorPanel.tsx`：属性编辑、属性级 lock、底部 Add Component 和 Component 文件拖拽添加。
- `AiPanel.tsx`：对话式 Prompt 入口；发送后生成 command、校验并自动应用合法命令。
- `SummaryBar.tsx` / `common.tsx`：共享展示和树遍历辅助。

不再保留旧 Alpha 的独立 Component Palette、Action、Logic、Memory、Project tab。项目数据仍以 `EditorDocument` 为 source of truth，UI 状态只保存 prompt 和远程 AI 配置。
