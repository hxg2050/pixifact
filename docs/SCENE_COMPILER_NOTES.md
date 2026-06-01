# Pixifact Compiler Notes

本文是早期 compiler 讨论的归档入口，不再作为实施计划。当前 Agent authoring 方向以 [Agent Scene Authoring](./AI_SCENE_AUTHORING.md) 为准。

当前结论：

- `.scene` 源文件是外部 Agent 和 editor 共享的 source of truth。
- 外部 Agent 默认直接编辑 `.scene`，再运行 `scene validate` 和 `compile-scenes`。
- 生成的 TypeScript 是 build artifact，不是 Agent 编辑目标。
- Editor live bridge 只提供 summary、scene get、node inspect 等只读上下文。
- Pixifact 不提供内置模型服务、模拟 Agent 服务、Git 管理、任务编排、CI 或 PR 能力。

后续设计和实现请更新：

```txt
docs/AI_SCENE_AUTHORING.md
docs/BDD.md
docs/TDD.md
```
