# Pixifact Compiler Notes

本文是早期 compiler 讨论的归档入口，不再作为实施计划。当前 Agent authoring 方向以 [Agent Scene Authoring](../../docs/zh/agent-scene-authoring.md) 为准。

当前结论：

- `.scene` 源文件是外部 Agent 和 editor 共享的 source of truth。
- 外部 Agent 默认直接编辑 `.scene`，再运行 `scene validate` 和 `compile-scenes`。
- 生成的 TypeScript 是 build artifact，不是 Agent 编辑目标。
- `editor context` 只提供只读 Editor 状态；旧 `live ...` CLI 与固定端口 bridge 已删除。
- Pixifact 不提供内置模型服务、模拟 Agent 服务、Git 管理、任务编排、CI 或 PR 能力。

后续设计和实现请更新：

```txt
docs/zh/agent-scene-authoring.md
internal-docs/testing/BDD.md
internal-docs/testing/TDD.md
```
