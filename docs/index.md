# Pixifact Docs

状态：活跃
权威范围：Pixifact 文档入口、查找路线和文档归属
上游文档：[../README.md](../README.md)
下游文档：[./LAYOUT.md](./LAYOUT.md)、[./AI_SCENE_AUTHORING.md](./AI_SCENE_AUTHORING.md)、[./TESTING.md](./TESTING.md)
更新规则：新增、移动、归档重要文档，或 README 的文档入口发生变化时更新

## 先读什么

如果你第一次了解 Pixifact，先读：

1. [README](../README.md)
2. [Layout](./LAYOUT.md)
3. [Agent Scene Authoring](./AI_SCENE_AUTHORING.md)

如果你要让外部 AI 修改下游游戏项目，先读：

1. [Agent Scene Authoring](./AI_SCENE_AUTHORING.md)
2. [Layout](./LAYOUT.md)
3. [Testing](./TESTING.md)

如果你要维护本仓库功能，先读：

1. [../AGENTS.md](../AGENTS.md)
2. [../CODEX.md](../CODEX.md)
3. [Testing](./TESTING.md)

## 当前活跃文档

| 文档 | 负责什么 |
| --- | --- |
| [Layout](./LAYOUT.md) | 设计分辨率、视口适配、frame layout、布局容器和编辑器布局编辑行为 |
| [Agent Scene Authoring](./AI_SCENE_AUTHORING.md) | 外部 Agent 直接编辑 `.scene` 的规则、契约和校验边界 |
| [Testing](./TESTING.md) | 测试入口、TDD / BDD 工作方式和常用验证命令 |
| [BDD](./BDD.md) | 用户可观察行为场景 |
| [TDD](./TDD.md) | 测试优先开发清单 |
| [npm Publishing](./NPM_PUBLISHING.md) | npm 发布流程 |

## 计划与历史

| 位置 | 用途 |
| --- | --- |
| [plans](./plans/index.md) | 当前和近期实现计划、续作记录 |
| [releases](./releases/index.md) | 发布记录 |
| [superpowers](./superpowers/index.md) | 历史设计、迁移和规格资料 |

## 权威归属

- 产品总览以 [README](../README.md) 为准。
- 布局协议、设计分辨率、视口模式和 Layout Inspector 行为以 [Layout](./LAYOUT.md) 为准。
- Agent 编辑 `.scene` 的流程以 [Agent Scene Authoring](./AI_SCENE_AUTHORING.md) 为准。
- 测试和验证方式以 [Testing](./TESTING.md) 为准。
- `docs/plans/` 下的文件是具体任务的决策和续作记录；当实现完成后，当前行为应沉淀到对应活跃文档。

如果发现同一结论在多处冲突，优先更新上面的权威文档，其他位置保留摘要和链接。
