# Agent Runtime

状态：实验性
权威范围：Vite Web 开发模式中的 Pixifact Runtime 接入、CLI 观测和输入边界
上游文档：[./index.md](./index.md)、[../../README.md](../../README.md)
更新规则：Runtime 注册 API、Vite transport、CLI 命令或安全边界变化时更新

Pixifact Runtime 让外部 Agent 在不依赖 Playwright、Browser MCP 或浏览器开发者工具的情况下观察并操作正在运行的 PixiJS 游戏。它只用于开发环境，不是游戏状态系统或远程调试器。

## 接入

在 Vite 配置中启用 Runtime transport：

```ts
import { defineConfig } from 'vite';
import { pixifactRuntimePlugin } from 'pixifact/compiler-node';

export default defineConfig({
  plugins: [pixifactRuntimePlugin()],
});
```

游戏启动完成后注册当前页面唯一的 PixiJS `Application`：

```ts
if (import.meta.env.DEV) {
  const { registerPixiRuntime } = await import('pixifact/runtime-dev');

  registerPixiRuntime(app, {
    getState: () => ({
      phase: game.phase,
      player: {
        hp: player.hp,
        coins: player.coins,
      },
    }),
  });
}
```

`getState` 可选。没有业务状态需要暴露时只调用 `registerPixiRuntime(app)`。

`getState` 只在 CLI 请求 `runtime state` 时执行，必须同步返回 JSON 数据。回调可以读取其正常 JavaScript 作用域内的闭包或类私有状态；Pixifact 不遍历 JavaScript 堆，也不会自动识别 `hp`、背包或关卡等业务语义。

## CLI

在游戏项目根目录执行：

```bash
pixifact runtime list
pixifact runtime tree --output .pixifact/runtime/tree.json
pixifact runtime node <pixi-uid>
pixifact runtime state
pixifact runtime logs
```

一个页面只注册一个 Application。打开多个游戏页面时先运行 `runtime list`，再显式选择：

```bash
pixifact runtime state --runtime <runtime-id>
```

页面刷新后 `runtime-id` 和 PixiJS `uid` 都可能变化。Agent 应从当前 `runtime list` 和 `runtime tree` 重新获取，不要把它们保存成项目数据。

`runtime tree` 默认把完整节点树输出到终端。需要反复搜索或避免终端截断时，可以改为保存 JSON 快照，此时终端只返回文件路径和采集元数据：

```bash
pixifact runtime tree --output .pixifact/runtime/tree.json
```

CLI 会创建目标目录，并在快照中写入 `schemaVersion`、`capturedAt`、`runtimeId` 和 `root`。快照是一次性的运行时观测文件，不是 `.scene` 的数据源；页面刷新后必须重新生成。

## PixiJS 节点树

`runtime tree` 每次请求都现场遍历 `app.stage`，保留 PixiJS `children` 顺序。它返回 PixiJS `uid`、构造函数类型、`label`、child index、position、scale、rotation、显示字段、交互字段和 children。

Scene 在这里仅表现为普通 `Container` 子树。Runtime 不返回 `.scene` 路径、Compiler locator、Props 或 Binding，也不维护第二棵 Scene Instance 树。

`runtime node <uid>` 返回当前节点的详细 transform、宽高、local/global bounds、global alpha、tint、blend mode、交互字段，以及 Sprite、Text 和 BitmapText 的有限类型信息。Graphics 只返回 bounds，不序列化绘制指令。

## 状态与日志

```bash
pixifact runtime state
pixifact runtime logs --after 42
pixifact runtime logs --level error
```

`state` 用于回答“现在是什么状态”。`logs` 用于回答“刚才发生了什么”。Runtime 自动捕获开发页面已有的 `console.debug/log/info/warn/error`、`window.error` 和 `unhandledrejection`，保留最近 500 条内存日志；页面刷新后清空。

日志带单调递增 `seq`。Agent 可以在操作前记住当前序号，操作后用 `--after` 只读取新增日志。关键且需要随时查询的状态应放在 `getState`；临时诊断可以由 Agent 在能够访问私有状态的源码位置添加日志，验证完成后删除。

## 输入

```bash
pixifact runtime input click --x 640 --y 360
pixifact runtime input move --x 420 --y 280
pixifact runtime input key Space
pixifact runtime input keydown ArrowLeft
pixifact runtime input keyup ArrowLeft
```

指针坐标使用 Pixi renderer screen 坐标。Agent 可以先读取节点的 `globalBounds`，计算中心点后点击；浏览器 Runtime 负责按 Canvas DOM bounds 换算 client 坐标。

输入命令只分发标准 pointer 和 keyboard 事件，不直接调用 PixiJS 节点方法，不绕过命中测试，也不修改节点或业务状态。命令成功仅表示事件已经分发，不表示动画或异步流程已经结束；Agent 应继续查询 tree、state 和 logs 判断结果。

程序生成的浏览器事件 `isTrusted` 为 `false`，不能代替用户完成全屏、音频解锁等要求受信任手势的浏览器操作。

## 边界

- 仅支持 Vite Web 开发模式和 loopback 开发服务器。
- Transport 复用 Vite HMR WebSocket，并通过系统临时目录中的项目 descriptor 与私有 token 供 CLI 发现；不使用固定端口或额外 Runtime Host。
- 不接入 Editor Authoring Preview，不执行 Editor 中的项目游戏逻辑。
- 不支持 eval、节点 mutation、业务状态 mutation、直接节点 click、Scenario、断言、状态订阅、历史、截图或日志持久化。
- 第一版不支持微信小游戏、production build、手柄、多指触摸或网络抓包。
