# Editor Panels

浏览器 Editor 当前按固定三栏组织核心区域：

- `HierarchyPanel.vue`：左栏当前 Scene 节点树，负责添加、复制、删除、同级排序和更换父节点。
- `AssetsPanel.vue`：左栏项目内已有 Scene 与图片索引。
- `SceneCanvas.vue`：中央长驻 Pixi Application / Canvas 与运行时节点增量更新。
- `InspectorPanel.vue`：右栏 schema-driven 属性编辑，输入 preview，失焦或 Enter 提交。
- `EditorApp.vue`：顶层文档绑定、Scene 打开、Undo / Redo 和同步状态。

项目数据以 compiler `.scene` 文件为 source of truth，Pinia 只保存轻量 UI 状态。
层级操作直接提交 Compiler Scene Command，自动保存并进入 Undo / Redo；节点通过整行 Pointer Events 拖动，不依赖浏览器原生 Drag and Drop。结构变化由预览层替换 Scene root，不重建 Pixi Application 或 Canvas。
