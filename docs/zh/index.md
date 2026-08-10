# Pixifact 中文文档

状态：活跃
权威范围：Pixifact 中文对外文档入口、查找路线和文档归属
上游文档：[../../README.md](../../README.md)、[../index.md](../index.md)
下游文档：[./layout.md](./layout.md)、[./scene-objects.md](./scene-objects.md)、[./agent-scene-authoring.md](./agent-scene-authoring.md)、[./runtime-agent.md](./runtime-agent.md)、[./wechat-minigame.md](./wechat-minigame.md)、[./douyin-minigame.md](./douyin-minigame.md)
更新规则：新增、移动、归档中文对外文档，或 README 的中文文档入口发生变化时更新

[English](../en/index.md)

## 先读什么

如果你第一次了解 Pixifact，先读：

1. [README](../../README.md)
2. [Layout](./layout.md)
3. [Scene Objects](./scene-objects.md)
4. [Agent Scene Authoring](./agent-scene-authoring.md)
5. [微信小游戏构建](./wechat-minigame.md)
6. [抖音小游戏构建](./douyin-minigame.md)

如果你要让外部 AI 修改下游游戏项目，先读：

1. [Agent Scene Authoring](./agent-scene-authoring.md)
2. [Scene Objects](./scene-objects.md)
3. [Layout](./layout.md)
4. [Agent Runtime](./runtime-agent.md)

如果你要维护 Pixifact 仓库本身，先读 [内部文档入口](../../internal-docs/index.md)。

## 当前活跃文档

| 文档 | 负责什么 |
| --- | --- |
| [Layout](./layout.md) | 设计分辨率、视口适配、frame layout、布局容器和编辑器布局编辑行为 |
| [Scene Objects](./scene-objects.md) | `.scene` 可写对象、通用属性、对象专属属性、适用场景和示例 |
| [Agent Scene Authoring](./agent-scene-authoring.md) | 外部 Agent 直接编辑 `.scene` 的规则、契约和校验边界 |
| [Agent Runtime](./runtime-agent.md) | 外部 Agent 观察和操作 Vite Web 真实游戏的 Runtime 接入、CLI 与边界 |
| [微信小游戏构建](./wechat-minigame.md) | 微信 target 配置、平台 runtime、资源交付、CLI 和产物边界 |
| [抖音小游戏构建](./douyin-minigame.md) | 抖音 target 配置、平台 runtime、资源交付、CLI 和产物边界 |

## 权威归属

- 产品总览以 [README](../../README.md) 为准。
- 布局协议、设计分辨率、视口模式和 Layout Inspector 行为以 [Layout](./layout.md) 为准。
- `.scene` 可写对象、对象属性和对象使用建议以 [Scene Objects](./scene-objects.md) 为准。
- Agent 编辑 `.scene` 的流程以 [Agent Scene Authoring](./agent-scene-authoring.md) 为准。
- Agent 观察和操作运行中游戏的流程以 [Agent Runtime](./runtime-agent.md) 为准。
- 微信小游戏支持矩阵、配置和构建边界以 [微信小游戏构建](./wechat-minigame.md) 为准。
- 抖音小游戏支持矩阵、配置和构建边界以 [抖音小游戏构建](./douyin-minigame.md) 为准。
- 仓库维护、测试、发布和历史规格以 [内部文档入口](../../internal-docs/index.md) 为准。
