# Scene Compiler Handoff

本文用于新会话快速接续 Pixifact compiler 方向。完整当前方向见：

```txt
docs/AI_SCENE_AUTHORING.md
```

核心结论：

- Pixifact 的 Agent authoring 主路径是 `.scene` 源文件。
- 外部 Agent 可以在没有 Editor 的情况下完整开发：编辑 `.scene`、运行 `scene validate`、运行 `compile-scenes`、再运行项目最小验证。
- Editor 是能力增强：preview、assets、diagnostics、current selection、live context。
- `.scene proposal` 是可选保险，不是默认路径。
- Editor live bridge 是只读上下文，不提供 mutation action。
- Git、任务编排、CI、PR 和长期项目管理交给外部工具。

不要重新引入独立的 Agent mutation 协议、内置模型服务、模拟 Agent 服务或 editor 内置模型路径。
