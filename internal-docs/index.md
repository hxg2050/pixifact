# Pixifact Internal Docs

状态：活跃
权威范围：Pixifact 仓库内部维护文档入口、查找路线和文档归属
上游文档：[../AGENTS.md](../AGENTS.md)、[../README.md](../README.md)
下游文档：[./testing/index.md](./testing/index.md)、[./plans/index.md](./plans/index.md)、[./specs/index.md](./specs/index.md)、[./releases/index.md](./releases/index.md)、[./archive/index.md](./archive/index.md)
更新规则：新增、移动、归档内部文档，或仓库维护入口发生变化时更新

## 先读什么

如果你要维护本仓库功能，先读：

1. [../AGENTS.md](../AGENTS.md)
2. [../CODEX.md](../CODEX.md)
3. [Testing](./testing/TESTING.md)

如果你要继续已有任务，先读：

1. [Plans](./plans/index.md)
2. 对应计划文件的 `Resume Notes`
3. 相关源码和测试

如果你要查历史设计，先读：

1. [Specs](./specs/index.md)
2. [Archive](./archive/index.md)

## 当前目录

| 目录 | 负责什么 |
| --- | --- |
| [testing](./testing/index.md) | BDD / TDD / 验证命令和测试策略 |
| [plans](./plans/index.md) | 当前和近期实现计划、续作记录 |
| [specs](./specs/index.md) | 内部规格、交接和专题设计资料 |
| [releases](./releases/index.md) | npm 发布流程和发布记录 |
| [archive](./archive/index.md) | 历史资料归档 |

## 与对外文档的边界

- `docs/` 只放对外文档，面向下游用户和外部 Agent 使用者。
- `internal-docs/` 放仓库维护文档，面向 Pixifact 框架开发。
- 当前产品行为应沉淀到 [../docs/zh/index.md](../docs/zh/index.md) 和 [../docs/en/index.md](../docs/en/index.md) 指向的对外文档。
- 任务过程、测试策略、发布流程和历史规格应留在本目录。
