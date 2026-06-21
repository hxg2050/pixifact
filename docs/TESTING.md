# Pixifact Testing

Pixifact 的测试文档分为 BDD 和 TDD 两部分：

- [BDD.md](./BDD.md)：产品行为、验收场景、当前测试缺口和优先级。
- [TDD.md](./TDD.md)：测试边界、测试地图、Red / Green / Refactor 流程、需求类型到测试的映射和验证命令。

Agent authoring 方向见 [AI_SCENE_AUTHORING.md](./AI_SCENE_AUTHORING.md)。

运行真实游戏的 MVP 闭环和完整示例项目计划见 [RUN_MVP_PLAN.md](./RUN_MVP_PLAN.md)。

工作顺序固定为：

1. 先用 BDD 明确用户或 Agent 行为、系统边界和失败状态。
2. 再用 TDD 选择最小测试边界，写失败测试。
3. 做最小实现，让测试通过。
4. 只清理本次改动产生的重复或死代码。
5. 运行最小相关验证；跨边界改动再扩大验证范围。

核心约束：

- Compiler `.scene` 源文件是外部 Agent 和 editor 共享的 source of truth。
- 外部 Agent 默认直接编辑 `.scene`，然后运行 `scene validate`、`compile-scenes` 和项目最小相关验证。
- Editor live bridge 只提供 summary、scene get、node inspect 等只读上下文能力。
- Zustand 只保存 UI 状态，不保存 `.scene` 模板副本作为项目数据源。
- 不为旧 API、旧路径、旧协议或旧数据格式新增兼容测试。

常用验证：

```bash
bun run test
```

编辑器相关改动：

```bash
bunx --no-install tsc -p apps/editor/tsconfig.json
bun run editor:frontend:build
```

runtime 或导出 API 改动：

```bash
bun run build
```
