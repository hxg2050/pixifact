# Pixifact Scene

Pixifact editor 使用 Scene 作为统一 UI / 轻场景资产。一个 `.scene` 文件保存一个 `SceneSpec` JSON。

```json
{
  "version": 1,
  "type": "scene",
  "name": "InventoryPanel",
  "root": {
    "kind": "container",
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

- `version`：Scene 格式版本，当前为 `1`。
- `type`：固定为 `scene`。
- `name`：Scene 资产名。
- `root`：Scene 根节点，必须是 `container`。
- `root.name`：根节点在层级和 Inspector 中的显示名。
- `root.key`：稳定引用 key，供 command、AI、CLI 和运行时绑定使用。
- `root.transform`：根节点的逻辑尺寸和变换。
- `root.components` / `root.children`：节点组件和子节点。

## 节点

公开节点类型固定为：

- `container`：唯一可包含子节点的节点。
- `image`：图片节点，支持 `sprite` 和 `nineSlice`。
- `text`：文字节点。
- `input`：输入节点。
- `shape`：形状节点，第一阶段支持矩形 / 圆角矩形。

所有节点都可以挂行为组件。显示能力通过节点字段表达，例如 `text.value`、`image.src`、`input.value`、`shape.color`，不通过 Graphic 组件暴露。

## 命名规则

Scene 文件名、资产名和 root key 保持一致的派生关系：

- 文件名使用 PascalCase：`InventoryPanel.scene`。
- `scene.name` 等于文件名去掉 `.scene`：`InventoryPanel`。
- `root.name` 默认等于 `scene.name`。
- `root.key` 使用 camelCase 加 `Root`：`inventoryPanelRoot`。

新建时会规范化输入：

- `inventory panel` -> `InventoryPanel.scene`
- `InventoryPanel.scene` -> `InventoryPanel.scene`
- `test` -> `Test.scene`

## 范围

当前 Pixifact Scene 支持：

- 打开 `.scene` 文件。
- 新建 `.scene` 文件。
- 在 Inspector / CLI / Agent 中修改当前 Scene。
- 保存当前 Scene 回原文件。
- 运行时通过 `instantiateScene()` 实例化为 runtime tree。

当前不做：

- Unity Scene + Prefab 双资源体系。
- Nested Prefab。
- Prefab Variant。
- 旧 `.prefab`、`PrefabSpec` 或 `type: "Group"` 兼容入口。
