# Pixifact Prefab

Pixifact Prefab 是 Pixifact editor 的可复用 UI / GameObject 树资产。它借用 Unity 的 Prefab 心智模型，但不是 Unity Prefab 格式。

一个 `.prefab` 文件保存一个 `PrefabSpec` JSON。当前版本固定为：

```json
{
  "version": 1,
  "type": "prefab",
  "name": "InventoryPanel",
  "root": {
    "type": "Group",
    "name": "InventoryPanel",
    "key": "inventoryPanelRoot",
    "transform": {
      "width": 320,
      "height": 180
    },
    "children": []
  }
}
```

## 字段

- `version`：Prefab 格式版本，当前为 `1`。
- `type`：固定为 `prefab`。
- `name`：Prefab 资产名。
- `root`：Prefab 根节点，必须是 `Group`。
- `root.name`：根节点在层级和 Inspector 中的显示名。
- `root.key`：稳定引用 key，供 command、AI proposal 和运行时绑定使用。
- `root.transform`：根节点的逻辑尺寸和变换。
- `root.components` / `root.children`：节点组件和子节点。

## 命名规则

Prefab 文件名、资产名和 root key 必须保持一致的派生关系：

- 文件名使用 PascalCase：`InventoryPanel.prefab`。
- `prefab.name` 等于文件名去掉 `.prefab`：`InventoryPanel`。
- `root.name` 默认等于 `prefab.name`。
- `root.key` 使用 camelCase 加 `Root`：`inventoryPanelRoot`。

新建时会规范化输入：

- `inventory panel` -> `InventoryPanel.prefab`
- `InventoryPanel.prefab` -> `InventoryPanel.prefab`
- `test` -> `Test.prefab`

## 范围

当前 Pixifact Prefab 支持：

- 打开 `.prefab` 文件。
- 新建 `.prefab` 文件。
- 在 Inspector / AI 对话中修改当前 Prefab。
- 保存当前 Prefab 回原文件。
- 运行时实例化为 runtime `Group` 树。

当前不承诺：

- Unity Prefab 格式。
- Nested Prefab。
- Prefab Variant。
- Scene 实例和 Prefab asset 的完整 override 同步。
