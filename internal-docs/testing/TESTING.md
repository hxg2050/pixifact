# Pixifact Testing

Pixifact 的测试文档分为 BDD 和 TDD 两部分：

- [BDD.md](./BDD.md)：产品行为、验收场景、当前测试缺口和优先级。
- [TDD.md](./TDD.md)：测试边界、测试地图、Red / Green / Refactor 流程、需求类型到测试的映射和验证命令。
- [AGENT_GAME_EVAL.md](./AGENT_GAME_EVAL.md)：固定 Web 游戏开发任务、验收标准和 Agent 完成率记录。

Agent authoring 方向见 [Agent Scene Authoring](../../docs/zh/agent-scene-authoring.md)。

运行真实游戏的 MVP 闭环和完整示例项目计划见 [RUN_MVP_PLAN.md](../specs/RUN_MVP_PLAN.md)。

工作顺序固定为：

1. 先用 BDD 明确用户或 Agent 行为、系统边界和失败状态。
2. 再用 TDD 选择最小测试边界，写失败测试。
3. 做最小实现，让测试通过。
4. 只清理本次改动产生的重复或死代码。
5. 运行最小相关验证；跨边界改动再扩大验证范围。

核心约束：

- Compiler `.scene` 源文件是外部 Agent 和 editor 共享的 source of truth。
- 外部 Agent 默认直接编辑 `.scene`，然后运行 `scene validate`、`compile-scenes` 和项目最小相关验证。
- `editor context` 只提供只读 Editor 状态，不提供 mutation；旧 `live ...` 命令保持删除。
- Pinia 只保存 UI 状态，不保存 `.scene` 模板副本作为项目数据源。
- 不为旧 API、旧路径、旧协议或旧数据格式新增兼容测试。

常用验证：

```bash
bun run test
```

编辑器相关改动：

当前工具链固定为 `typescript@7.1.0-beta` 与 `@vue/content-mapper@4.0.0-alpha.3`，均为预发布版本；Vue runtime 仍为 3.5。仓库和 CI 使用 Bun 1.3.13、Node.js 24。Editor 直接通过 `tsc --runExternalCode` 加载 Vue content mapper，不再使用 `vue-tsc` 或 TypeScript 桥接包。mapper 的选项放在 `apps/editor/tsconfig.json` 的顶层 `contentMappers[].options`。

```bash
bun run editor:typecheck
bun run editor:frontend:build
```

`editor-vue-ui.test.ts` 会运行真实的原生 TypeScript CLI：正确的 Vue 模板和组件 props 应通过，错误的组件 prop 与模板表达式必须报告原 `.vue` 文件中的位置。`unified-vite-platform.test.ts` 同时检查分包包装不捕获业务变量，以及合并后的 sourcemap 能映射回原始入口行列。

Scene 脚本契约提取和内置契约读取直接使用 `typescript/async`，调用方必须 `await`；每批源码共用一个 API 实例，解析租约和原生进程都在 `finally` 释放。不要在 Bun CLI 中改用依赖 Node 私有管道句柄的同步 API。

runtime 或导出 API 改动：

```bash
bun run build
```
