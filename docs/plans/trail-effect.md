# 项目级拖尾效果原型

## Goal

在 `adventure-ui-demo` 中验证基于 PixiJS `MeshRope` 的连续拖尾效果，为后续是否提升为 Pixifact Runtime 能力提供真实视觉和运行时数据依据。

## Decisions

- 拖尾实现放在示例项目 `src/effects/TrailEffect.ts`，暂不新增 `pixifact/runtime` 节点。
- 使用固定容量环形缓冲区保存采样点，按最小距离采样，并对高速位移进行插值。
- 轨迹点使用目标的世界坐标采样，再转换到拖尾容器的本地坐标。
- 使用项目资源中的水平透明渐变纹理实现连续带状轨迹的年龄渐隐。
- 只在显式调用 `start()` 后订阅传入的 PixiJS Ticker；`stop()` 和 `destroy()` 必须解除订阅。
- 示例入口使用一个沿椭圆轨迹移动的探针验证效果，不修改 Editor 或 Compiler。

## Non-Goals

- 不新增 `.scene` 标签、Inspector 属性或官方 Runtime API。
- 不实现 Editor 内预览、真实游戏启动或自定义 Mesh shader。
- 不引入第三方依赖。

## Public API / User-Facing Behavior

- 示例项目出现一个移动探针及其渐隐拖尾，作为项目级效果原型。
- `TrailEffect` 提供 `attach(target)`、`start()`、`stop()` 和 `destroy()` 生命周期方法。

## Implementation Scope

- `sample-projects/adventure-ui-demo/src/effects/TrailEffect.ts`
- `sample-projects/adventure-ui-demo/src/main.ts`
- `sample-projects/adventure-ui-demo/src/scenes/Main.ts`
- `sample-projects/adventure-ui-demo/src/scenes/Main.scene`
- `sample-projects/adventure-ui-demo/assets/effects/trail.svg`
- `tests/trail-effect.test.ts`

## Test Plan

- [ ] 覆盖最小距离采样和固定容量淘汰。
- [ ] 覆盖高速位移的插值点。
- [ ] 覆盖生命周期过期、`stop()` 不再更新和 `destroy()` 清理 Ticker。
- [ ] 运行拖尾单测、示例项目验证和生产构建。

## Verification

```bash
rtk bunx --no-install vitest run tests/trail-effect.test.ts
rtk bun run --cwd sample-projects/adventure-ui-demo validate
rtk bun run --cwd sample-projects/adventure-ui-demo build
```

## Progress

- [x] 确认 `MeshRope` 的点更新方式和示例入口。
- [x] 完成项目级拖尾实现和最小演示。
- [x] 完成自动化测试与浏览器视觉确认。

## Resume Protocol

1. 阅读本文件和仓库 `AGENTS.md`、`CODEX.md`。
2. 检查 worktree，保留用户已有的 `docs/plans/` 文件。
3. 运行 Verification 中的最小相关测试。
4. 从 Resume Notes 的 Next 继续。

## Resume Notes

Last updated: 2026-09-13

Done:
- 已确定使用项目级 `MeshRope` 原型，不接入官方 Runtime、Compiler 或 Editor。
- 已完成固定容量环形采样、最小距离插值、生命周期淘汰、目标销毁监听和 Ticker 清理。
- Adventure UI 示例已加入移动探针、独立效果层和拖尾纹理，浏览器中确认探针与拖尾可见。
- 已通过拖尾单测、全量 Vitest、示例 validate、示例 TypeScript 检查和生产构建。

Current State:
- 拖尾原型已完成，当前只作为 `adventure-ui-demo` 项目级效果存在。

Currently Failing:
- 无。

Next:
1. 等待真实玩法接入后评估是否需要将拖尾提升为官方 Runtime 节点。
