# Editor Panels

正式 editor 当前按 Dockview 桌面界面固化为五个核心面板：

- `ExplorerPanel.tsx`：文件系统入口，展示项目文件、轻量资源预览说明、Scene 双击打开、具体资源双击系统默认程序打开、脚本外部编辑器打开、Component 文件拖拽数据。
- `HierarchyPanel.tsx`：只展示当前打开 Scene 的节点树。
- `ViewportPanel.tsx`：运行时 preview。
- `InspectorPanel.tsx`：节点类型专属属性编辑、属性级 lock、底部 Add Component 和 Component 文件拖拽添加。
- `AiPanel.tsx`：Agent / CLI 状态与当前项目、当前 Scene 的命令引导；支持粘贴 `.scene proposal`，先检查 diff 和 compiler 校验，再确认应用到当前 `.scene`。
- `SummaryBar.tsx` / `common.tsx`：共享展示和树遍历辅助。

不再保留旧 Alpha 的独立 Component Palette、Action、Logic、Memory、Project tab。项目数据仍以 `SceneDocument` 或 compiler `.scene` 文件为 source of truth，UI 状态只保存轻量偏好；外部 AI 通过 CLI 和 `.scene proposal` 调用受控验证、审查和编译边界。
