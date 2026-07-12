# 场景单元 V1

状态：已完成

## Goal

让已注册的 `@scene()` 场景类在独立实例化后保有自身 `.scene` 节点的 locator 索引，并通过 `getSceneNode(scene, locator)` 查询运行时节点。

## Decisions

- 场景实例本身就是运行单元：`@scene()` 类继承的 `Group` 不再额外包一层 runtime instance。
- 生成的 Scene mount 函数返回当前 `.scene` 直接声明节点和 slot 内容的 locator 索引。
- 嵌套 Scene 是边界：父 Scene 可索引子 Scene 实例和自己放入其 slot 的节点，不索引子 Scene 的内部节点。
- `getSceneNode` 是本版本唯一新增的运行时查询 API；节点属性写入留给下一步 Editor 直接操作。
- 场景继续使用 Pixi 原生 `addChild`、`removeChild` 和 `destroy({ children: true })`，不引入新的 mount/unmount/dispose 包装。

## Non-Goals

- 不实现原始 `.scene` 解释器。
- 不修改 Editor Preview 刷新或 Inspector 属性同步。
- 不新增 Scene 属性热更新 API。
- 不改变 `@prop`、`@part`、`@event`、`@slot` 契约。

## Implementation Scope

- 扩展 compiler Scene mount result，携带 locator 节点索引。
- 在生成的 mount 函数中记录当前 Scene 自己声明的可渲染节点。
- 在 Scene runtime 中保存实例与 mount result 的关联，并导出 `getSceneNode`。
- 更新手写 `registerScene` 测试夹具和 compiler/runtime 测试。

## Test Plan

- 先覆盖 `getSceneNode` 从独立 `@scene()` 实例读取其节点索引。
- 覆盖生成代码记录普通节点、嵌套 Scene 实例和父 Scene slot 内容。
- 覆盖父 Scene 不暴露嵌套 Scene 内部 locator。

## Verification

```bash
rtk bunx --no-install vitest run tests/scene-compiler.test.ts
rtk bunx --no-install tsc -p packages/pixifact/tsconfig.json
rtk bun run build
```

## Progress

- [x] 补充失败测试。
- [x] 实现节点索引和查询 API。
- [x] 运行验证并提交。

## Resume Protocol

1. 阅读本文件、`AGENTS.md`、`CODEX.md`。
2. 检查 worktree。
3. 运行 `rtk bunx --no-install vitest run tests/scene-compiler.test.ts`。
4. 从第一个未完成项继续。

## Resume Notes

Last updated: 2026-07-12

Done:
- 确认现有 `@scene()` 类已经在构造时通过已注册 mount 函数创建节点树。
- `SceneMountResult` 现在携带当前 Scene 的 locator 节点索引。
- `getSceneNode(scene, locator)` 可读取独立场景实例的节点。
- 生成代码记录普通节点、嵌套 Scene 实例和父 Scene 的 slot 内容，不记录子 Scene 内部节点。
- `rtk bunx --no-install vitest run tests/scene-compiler.test.ts` 通过。
- `rtk bunx --no-install tsc -p packages/pixifact/tsconfig.build.json` 通过。
- `rtk bun run build` 通过。

Current State:
- 已完成。

Next:
- None.
