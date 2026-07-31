# Runtime Behavior Activation

状态：完成
权威范围：Runtime 节点行为激活边界与 Editor Authoring Preview 安全性
上游文档：[./scene-binding.md](./scene-binding.md)、[../testing/TESTING.md](../testing/TESTING.md)
下游文档：Runtime / Scene 生命周期实现、Editor Authoring Preview 与布局文档
更新规则：行为激活协议、实现进度或验证方式变化时更新

## Goal

将 Runtime 节点的视觉构造与游戏行为激活分开。构造函数和属性 setter 只建立确定性的视觉、几何、布局与 mask；游戏 Scene 完成节点挂载和 parts / slots 注入后显式激活输入、Ticker 等行为；Editor Authoring Preview 只构造视觉树，永不激活游戏行为。

## Decisions

- 使用内部、幂等的 Runtime behavior hook 与树遍历，不增加公开 API。
- 游戏 Scene 在 compiled mount 和 parts / slots 注入完成后、项目 `onMounted()` 前激活整棵 Runtime 树。
- Editor Authoring Preview 不调用行为激活入口，也不增加 `editorMode` 分支。
- 第一轮只迁移当前有构造副作用的 `ScrollContainer`。
- `ScrollContainer` 构造阶段保留 content layer、mask、children 监听、布局和静态 `scrollX` / `scrollY`。
- `eventMode`、wheel / pointer 监听与由输入启动的 Ticker 只在激活后存在。
- 激活必须幂等；嵌套 Scene 已激活的子树被父 Scene 再次遍历时不得重复注册监听。
- `destroy()` 显式解除已注册的输入监听并停止 Ticker。
- 项目 Scene class、constructor、setter 和 `onMounted()` 仍不在 Editor 中执行。

## Non-Goals

- 不给纯视觉节点增加空 hook。
- 不迁移 `Label`、`BitmapLabel` 或其他没有游戏行为副作用的节点。
- 不在 Editor 中模拟 pointer、wheel、Ticker 或项目逻辑。
- 不增加 mode 参数、环境检测、兼容层或公开的手动激活 API。

## Public API / User-Facing Behavior

不新增公开 API。

- 游戏运行时的 `ScrollContainer` 继续支持 wheel、拖拽、弹性与惯性。
- Editor 中的 `ScrollContainer` 继续显示 content layer、裁剪 mask 和声明的静态滚动位置，但 pointer / wheel 不改变预览状态。
- `onMounted()` 观察到的 Runtime 树已经完成行为激活。

## Implementation Scope

- 新增 Runtime 内部行为 hook 与幂等树激活函数。
- 在 Scene decorator 的挂载生命周期中调用树激活。
- 将 `ScrollContainer` 输入注册从 constructor 移到行为 hook，并补齐销毁清理。
- 更新 Runtime、Editor preview 测试及中英文布局说明。
- 更新 BDD / TDD 行为边界。

## Test Plan

- [x] 直接构造 `ScrollContainer` 时 wheel / pointer 不改变滚动状态，也不消费事件。
- [x] decorated compiled Scene 在 `onMounted()` 前激活 `ScrollContainer`，原有 wheel、drag、弹性和惯性继续工作。
- [x] 嵌套 Scene 的 Runtime 树只激活一次，一次 wheel 只应用一次 delta。
- [x] Editor Authoring Preview 保留 `ScrollContainer` 的 mask、content 与静态 scroll，但不响应 wheel。
- [x] Runtime、Editor 和全量项目验证通过。

## Verification

```bash
rtk bunx --no-install vitest run tests/scene-compiler.test.ts tests/project-file-tree.test.ts
rtk bun run build
rtk bun run --cwd sample-projects/adventure-ui-demo build
rtk bun run editor:typecheck
rtk bun run editor:frontend:build
rtk bun run test
```

## Progress

- [x] 确认视觉构造与游戏行为激活边界。
- [x] 核对 Scene 实例化顺序和 `ScrollContainer` 当前副作用。
- [x] 写入 BDD 与失败测试。
- [x] 实现内部激活协议并迁移 `ScrollContainer`。
- [x] 更新对外布局文档。
- [x] 完成验证。
- [x] 提交相关改动。

## Resume Protocol

1. 阅读 `AGENTS.md`、`CODEX.md` 和本文件。
2. 检查 worktree，不覆盖无关用户改动。
3. 运行 Resume Notes 中的最小目标测试。
4. 从 `Next` 继续，不重新打开 Decisions 中已经确认的设计。
5. 停止时更新 Progress 与 Resume Notes。

## Resume Notes

Last updated: 2026-07-31

Done:
- 已确认内部幂等激活协议及 Scene 生命周期调用位置。
- 已确认第一轮只迁移 `ScrollContainer`。
- 已新增内部 Runtime behavior symbol 与幂等树遍历，不从 runtime barrel 导出。
- `ScrollContainer` 输入监听已从 constructor 迁移到 Runtime 激活 hook，销毁时显式清理监听和 Ticker。
- decorated compiled Scene 在 parts / slots 注入后、`onMounted()` 前激活行为；Editor Authoring Preview 不调用该入口。
- 已补齐 Runtime、嵌套 Scene、Editor preview 自动化测试与中英文文档。

Current State:
- 目标测试 95 个、全量 190 个测试通过。
- 核心包 build、Editor typecheck、Editor production build 和 adventure-ui-demo build 通过。
- Editor production build 仅有既有的 chunk size warning。
- 用户在 `sample-projects/adventure-ui-demo/src/scenes/BottomMenu.scene` 和 `Button.scene` 的改动必须保留且不得提交。

Currently Failing:
- None。

Next:
- None。
