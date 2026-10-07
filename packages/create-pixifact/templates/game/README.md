# Pixifact 基础游戏模板

这是可以直接复制开发新游戏的 Web 项目。默认设计尺寸为 `750 × 1334`，包含主菜单、游戏页、暂停弹窗、结算页、最高分保存，以及可替换外观的基础 UI 库。

本模板使用 Bun `1.3.13` 验证；需要本机安装 Bun 和 Git。

## 运行

```bash
bun install
bun run dev
```

打开终端输出的地址。点击「开始游戏」，收集 8 份星光即可结算；可以暂停、继续、返回菜单和重玩。暂停期间不能得分。最高记录保存在当前浏览器，同一地址刷新后仍可读取；页面切到后台时自动暂停。

```bash
bun run validate
bun run compile
bun run typecheck
bun run build
bun run editor
```

`dev` / `build` 自动编译 Scene；独立执行 `compile` 便于检查生成结果。生成目录 `.pixifact/` 和构建目录 `dist/` 不作为源码维护。

## 基础代码

| 位置 | 职责 |
| --- | --- |
| `src/main.ts` | Application、Assets、Scene 准备、视口适配、后台暂停、开发期 Runtime |
| `src/GameApp.ts` | 连接游戏状态、页面事件、暂停弹窗和存档 |
| `src/core/GameSession.ts` | 纯 TypeScript 规则和状态，可替换为自己的玩法 |
| `src/core/ScreenManager.ts` | 页面替换、断开外部订阅、销毁旧节点；共享纹理继续复用 |
| `src/core/WebRecordStore.ts` | 显式读写最高分；使用 Web 原生 localStorage |
| `src/screens/` | 页面 `.scene` 外观和同名 `.ts` 行为契约 |
| `src/ui/` | 当前生效的基础 UI Scene 与脚本 |
| `assets/ui/` | 当前生效的按钮和面板九宫格 SVG 图片 |
| `ui-kits/` | paper / mint 两套配对 Scene 与资源，用于替换外观 |

开始开发自己的游戏时，先修改 `GameSession` 中的规则，再修改 `PlayScreen` 的视觉和公开事件，最后在 `GameApp` 中连接数据流。游戏规则不读取 UI 内部节点。给新页面增加同目录同 basename 的 `.scene/.ts`，启动前用 `prepareSceneClass()` 准备，再交给 `ScreenManager.replace()`。

`ScreenManager.track(event.connect(handler))` 注册当前页面的外部连接，必须在 `replace()` 之后调用。移除页面和关闭弹窗时会统一取消这些连接。页面尺寸由项目设计分辨率和 frame layout 控制；切换设计分辨率时同步修改页面与 Dialog 的根尺寸、GameApp 盒子尺寸。

## UI 库契约

| 组件 | 公开契约 | 组合方式 |
| --- | --- | --- |
| Button | `text`、`disabled`，`clicked` 事件 | `icon` slot；禁用状态禁止触发事件 |
| Panel | `title` | `content` slot |
| Dialog | `title`、`message`、`confirmText`、`cancelText`；`confirmed` / `cancelled` 事件 | 全屏遮罩和居中面板，用于模态操作 |
| ProgressBar | `setProgress(value, max)`，`max > 0` | 可改变宽高；填充比例保持不变 |

例如，在自己的页面 `.scene` 中使用：

```xml
<Button id="startButton" scene="../ui/Button.scene"
  horizontal="0" top="400" width="420" height="88"
  text="开始游戏" @clicked="start" />
```

页面的 `start()` action 负责发出业务事件。文字通过 Prop Binding 更新，父页面依赖公开事件和 slot，不依赖 Button 背景、Panel 内部节点等实现细节。

## 替换整套 UI

```bash
bun run ui:apply mint
bun run validate
bun run compile
bun run typecheck
bun run build
```

恢复默认外观使用 `bun run ui:apply paper`。命令覆盖 `src/ui/*.scene` 和 `assets/ui/` 中的同名图片，保留行为脚本 `src/ui/*.ts` 和全部游戏代码。更换后重启开发服务。

`paper` 是暖色纸感外观，`mint` 是清爽薄荷外观；两套均采用浅色背景，与示例页面的深色文字搭配。`ui-kits/<name>/src/ui/` 中保留配对 `.ts` 作为契约参考，安装外观时不复制这些脚本。

自定义 UI 时，可以复制一套 kit 为自己的目录，保留组件文件名、公开 Props / Events / Slots 和脚本使用的 `@part` 节点 ID，再自由调整 `.scene` 的视觉结构、字体、颜色和静态图片引用。如果换成深色背景，同时调整 `src/screens/*.scene` 内的内容文字颜色。更换同路径 SVG / PNG 时可保持 Scene 引用不变；图片路径使用静态 `texture="assets/ui/..."`，更改后执行校验和编译。

每个 `.scene` 与同目录同名 `.ts` 配对；`@scene()` 类继承 `Group`，不声明自定义构造参数。非 Prop 依赖用显式方法传入。新增视觉节点或修改事件后运行 `pixifact scene validate --all`，避免外观替换破坏组件契约。

## Agent 观察

开发服务运行且浏览器打开后，在项目根目录执行：

```bash
pixifact runtime state
pixifact runtime tree
pixifact runtime screenshot
```

业务快照包含 `phase`、`score`、`goal`、`bestScore`、`modalOpen`。可以结合真实节点树检查页面切换、暂停和最高分保存。

首版入口和存档使用 Web API。接入微信／抖音时，按 Pixifact 的平台文档接入现有平台包，并将 DOM 入口、visibility 事件和 WebRecordStore 替换为对应平台实现。
