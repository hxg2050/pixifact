# Pixifact Testing

Pixifact 的测试文档分为 BDD 和 TDD 两部分：

- [BDD.md](./BDD.md)：产品行为、验收场景、当前测试缺口和优先级。
- [TDD.md](./TDD.md)：测试边界、测试地图、Red / Green / Refactor 流程、需求类型到测试的映射和验证命令。

CLI 使用说明见 [CLI_MIGRATION.md](./CLI_MIGRATION.md)，Agent 固定流程见 [AGENT_CLI_WORKFLOW.md](./AGENT_CLI_WORKFLOW.md)。

工作顺序固定为：

1. 先用 BDD 明确用户或 Agent 行为、系统边界和失败状态。
2. 再用 TDD 选择最小测试边界，写失败测试。
3. 做最小实现，让测试通过。
4. 只清理本次改动产生的重复或死代码。
5. 运行最小相关验证；跨边界改动再扩大验证范围。

核心约束：

- `SceneDocument` 是 editor 和 Agent 修改 Scene 的唯一 source of truth。
- 真实项目修改必须走 `SceneDocument` API 或 `SceneCommand`。
- AI / Agent 只生成结构化 `SceneCommand` / proposal。
- dry-run 不改变源 Scene，apply 才改变 Scene。
- Zustand 只保存 UI 状态，不保存 `SceneSpec` / `SceneDocument` 副本。
- 不为旧 API、旧路径、旧协议或旧数据格式新增兼容测试。

常用验证：

```bash
bun run test
```

编辑器相关改动：

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run editor:frontend:build
```

runtime 或导出 API 改动：

```bash
bun run build
bun run example:build
```
