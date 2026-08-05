# Pixifact Runtime Observation

本文件随 Pixifact skill 安装，用于下游 Vite Web 游戏在开发模式下观察和验证真实运行行为。Runtime 直接读取当前 PixiJS `app.stage`，不依赖浏览器自动化，也不映射回 Compiler Scene。

## 接入前提

Vite 配置启用开发 transport：

```ts
import { pixifactRuntimePlugin } from 'pixifact/compiler-node';

export default defineConfig({
  plugins: [pixifactRuntimePlugin()],
});
```

游戏启动完成后注册页面唯一的 PixiJS `Application`：

```ts
if (import.meta.env.DEV) {
  const { registerPixiRuntime } = await import('pixifact/runtime-dev');

  registerPixiRuntime(app, {
    getState: () => ({
      phase: game.phase,
      player: { hp: player.hp },
    }),
  });
}
```

`getState` 可选，只在 `runtime state` 请求时同步执行。需要稳定、反复查询的业务状态放在这里；不要新增 `registerRuntimeState`，也不要让 Runtime 遍历 JavaScript 堆。

## 标准验证闭环

1. 读取 `package.json`，使用项目已有命令启动 Vite 开发服务器，并确保游戏页面已经打开。
2. 运行 `pixifact runtime list`。只有一个页面时自动选择；多个页面时记录目标 `runtimeId`，后续命令添加 `--runtime <runtime-id>`。
3. 查询 `pixifact runtime state` 和 `pixifact runtime logs`，把日志的 `latestSeq` 作为操作前基线。
4. 用 `pixifact runtime tree --output .pixifact/runtime/tree.json` 保存节点树快照，在 JSON 文件中搜索当前节点的 `uid`。需要尺寸、`globalBounds`、交互字段或类型信息时运行 `pixifact runtime node <uid>`。
5. 使用 `globalBounds` 中心点发送 click，或发送项目真实使用的键盘输入。
6. 重新查询 state、tree 或 node，并运行 `pixifact runtime logs --after <latestSeq>`。只有可观察结果符合预期，验证才完成。

页面刷新后 `runtime-id` 和 PixiJS `uid` 都可能改变，必须重新发现。不要把它们写入源码、Scene 或项目数据。

## 命令速查

```bash
pixifact runtime list
pixifact runtime tree [--output <json-path>] [--runtime <runtime-id>]
pixifact runtime node <pixi-uid> [--runtime <runtime-id>]
pixifact runtime state [--runtime <runtime-id>]
pixifact runtime logs [--after <seq>] [--level <level>] [--runtime <runtime-id>]
pixifact runtime input click --x <x> --y <y> [--runtime <runtime-id>]
pixifact runtime input move --x <x> --y <y> [--runtime <runtime-id>]
pixifact runtime input key <key> [--runtime <runtime-id>]
pixifact runtime input keydown <key> [--runtime <runtime-id>]
pixifact runtime input keyup <key> [--runtime <runtime-id>]
```

点击坐标使用 Pixi renderer screen 坐标。先查询目标节点的 `globalBounds`，使用 `x + width / 2`、`y + height / 2` 计算中心点，不要根据截图猜坐标。

`runtime tree` 默认输出完整树。节点很多或需要反复搜索时，保存一次 JSON 快照；此时终端只返回文件路径和采集元数据：

```bash
pixifact runtime tree --output .pixifact/runtime/tree.json [--runtime <runtime-id>]
```

快照包含 `schemaVersion`、`capturedAt`、`runtimeId` 和 `root`。它只代表采集时刻的 `app.stage`，不能作为 `.scene` 数据源；页面刷新后必须重新生成，快照中的 `runtimeId` 和 PixiJS `uid` 也不能长期复用。

## 状态与诊断

- `state` 回答“现在是什么状态”，只包含项目通过 `getState` 明确暴露的 JSON。
- `tree` / `node` 回答“当前显示树是什么样”，数据源始终是 `app.stage`。
- `logs` 回答“刚才发生了什么”，保留最近 500 条 `console`、`window.error` 和 `unhandledrejection` 记录。
- 私有状态不适合加入长期 `getState` 时，可在能访问该状态的源码位置临时添加日志；验证完成后删除日志。
- `state.available: false` 表示项目没有提供 `getState`，继续使用 tree、node 和 logs，不要假造业务状态。

## 边界

- Runtime 只支持 Vite Web 开发模式，不用于 production、微信小游戏或 Editor Authoring Preview。
- Runtime 不提供 eval、节点 mutation、业务状态 mutation、直接节点 click、方法调用、截图或日志持久化。
- `input` 只分发标准 pointer / keyboard 事件，不绕过 PixiJS 命中测试。
- `dispatched: true` 不代表动画、异步加载或业务流程已经稳定；由 Agent 重复查询可观察结果并控制超时。
- 程序生成的输入事件 `isTrusted` 为 `false`，不能完成全屏或音频解锁等受信任手势。
