# Plans

状态：活跃
权威范围：实现计划、历史决策和续作记录的目录入口
上游文档：[../index.md](../index.md)
下游文档：本目录内计划文件
更新规则：新增计划、完成计划或计划状态变化时更新

## 当前计划

| 文档 | 负责什么 |
| --- | --- |
| [editor-vnext.md](./editor-vnext.md) | 浏览器 Editor vNext 的产品边界、数据流、实现范围和续作记录 |
| [scene-binding.md](./scene-binding.md) | Scene 静态 Prop、Variant、声明式绑定、Runtime 构造与 Editor Authoring 预览 |

继续 Editor vNext 时，先读取对应计划的 `Resume Notes`，不要从旧 Tauri Editor 或归档工作台方案重新推导产品边界。

## 已完成计划

| 文档 | 负责什么 |
| --- | --- |
| [adventure-ui-demo.md](./adventure-ui-demo.md) | 示例项目计划 |
| [viewport-adaptation-v1.md](./viewport-adaptation-v1.md) | 视口适配第一版 |
| [scroll-container-runtime.md](./scroll-container-runtime.md) | ScrollContainer runtime |
| [grid-container-runtime.md](./grid-container-runtime.md) | GridContainer runtime |
| [image-runtime-nodes.md](./image-runtime-nodes.md) | Image / NineImage / TileImage runtime |
| [rect-runtime-node.md](./rect-runtime-node.md) | Rect runtime |
| [documentation-split.md](./documentation-split.md) | 对外文档和内部文档分层迁移 |
| [documentation-foundation.md](./documentation-foundation.md) | README、文档入口和 Layout 文档整理 |
| [public-docs-i18n.md](./public-docs-i18n.md) | 对外文档中英文目录拆分 |

## 使用规则

计划文件记录任务级决策、验证方式和续作入口。实现完成后，当前行为应沉淀到活跃文档，例如 [../../docs/zh/layout.md](../../docs/zh/layout.md) 或 [../../docs/zh/agent-scene-authoring.md](../../docs/zh/agent-scene-authoring.md)。
