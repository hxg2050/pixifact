# Pixifact Public Docs

状态：活跃
权威范围：Pixifact 对外文档入口、查找路线和文档归属
上游文档：[../README.md](../README.md)
下游文档：[./LAYOUT.md](./LAYOUT.md)、[./AI_SCENE_AUTHORING.md](./AI_SCENE_AUTHORING.md)
更新规则：新增、移动、归档对外文档，或 README 的对外文档入口发生变化时更新

## 先读什么

如果你第一次了解 Pixifact，先读：

1. [README](../README.md)
2. [Layout](./LAYOUT.md)
3. [Agent Scene Authoring](./AI_SCENE_AUTHORING.md)

如果你要让外部 AI 修改下游游戏项目，先读：

1. [Agent Scene Authoring](./AI_SCENE_AUTHORING.md)
2. [Layout](./LAYOUT.md)

如果你要维护 Pixifact 仓库本身，先读 [内部文档入口](../internal-docs/index.md)。

## 当前活跃文档

| 文档 | 负责什么 |
| --- | --- |
| [Layout](./LAYOUT.md) | 设计分辨率、视口适配、frame layout、布局容器和编辑器布局编辑行为 |
| [Agent Scene Authoring](./AI_SCENE_AUTHORING.md) | 外部 Agent 直接编辑 `.scene` 的规则、契约和校验边界 |

## 不放在这里的文档

| 位置 | 用途 |
| --- | --- |
| [internal-docs](../internal-docs/index.md) | 仓库维护、计划、测试、发布、历史规格和归档资料 |

## 权威归属

- 产品总览以 [README](../README.md) 为准。
- 布局协议、设计分辨率、视口模式和 Layout Inspector 行为以 [Layout](./LAYOUT.md) 为准。
- Agent 编辑 `.scene` 的流程以 [Agent Scene Authoring](./AI_SCENE_AUTHORING.md) 为准。
- 仓库维护、测试、发布和历史规格以 [内部文档入口](../internal-docs/index.md) 为准。

如果发现同一结论在多处冲突，优先更新上面的权威文档，其他位置保留摘要和链接。
