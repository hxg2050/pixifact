# Pixifact 基础游戏模板

这是可以直接复制开发新游戏的 Web 项目。默认设计尺寸为竖屏 `1080 × 1920`，适配模式为 `fixedWidth`。启动首页集中展示可替换外观的基础 UI 组件，并附带游戏、暂停、结算和最高分保存的代码示例。

本模板使用 Bun `1.3.13` 验证；需要本机安装 Bun 和 Git。

## 运行

```bash
bun install
bun run dev
```

打开终端输出的地址，先在组件展台试用：

- **Button**：大、中、小三种尺寸、轻微按压回弹、图标、禁用状态、启用／禁用切换与点击计数。
- **ProgressBar**：每次增减 25%，到达 0% 或 100% 后禁用对应方向的按钮。
- **Panel**：标题和内容区组合；展台各区块也复用同一个 Panel。
- **Dialog**：确认／取消、结果反馈与模态遮罩；弹窗期间不能操作底层组件，关闭后保留展台状态。

点击底部「体验游戏流程」，收集 8 份星光即可结算；可以暂停、继续、返回组件展台和重玩。暂停期间不能得分。最高记录保存在当前浏览器，同一地址刷新后仍可读取；页面切到后台时自动暂停。返回展台会创建新的展示页，组件演示状态恢复初始值。

```bash
bun run validate
bun run compile
bun run typecheck
bun run build
bun run editor
```

`dev` / `build` 自动编译 Scene；独立执行 `compile` 便于检查生成结果。生成目录 `.pixifact/` 和构建目录 `dist/` 不作为源码维护。

`fixedWidth` 使用屏幕宽度除以 1080 作为缩放比例，再由屏幕高度反推 Scene 的可用高度。页面背景和弹窗遮罩随视口铺满；组件展台和游戏示例的内容在短窗口中可以纵向滚动。

## 基础代码

| 位置 | 职责 |
| --- | --- |
| `src/main.ts` | Application、Assets、Scene 准备、视口适配、后台暂停、开发期 Runtime |
| `src/GameApp.ts` | 连接组件预览弹窗、游戏状态、页面事件、暂停和存档 |
| `src/core/GameSession.ts` | 纯 TypeScript 规则和状态，可替换为自己的玩法 |
| `src/core/ScreenManager.ts` | 页面替换、断开外部订阅、销毁旧节点；共享纹理继续复用 |
| `src/core/WebRecordStore.ts` | 显式读写最高分；使用 Web 原生 localStorage |
| `src/screens/` | 页面 `.scene` 外观和同名 `.ts` 行为契约 |
| `src/screens/MainMenu.scene/.ts` | 默认组件展台、演示状态和次要游戏入口 |
| `src/ui/` | 当前生效的基础 UI Scene 与脚本 |
| `assets/ui/` | 当前生效的按钮和面板九宫格 PNG 图片（96 × 96，透明 RGBA） |
| `ui-kits/` | paper / mint 两套配对 Scene 与资源，用于替换外观 |

开始开发自己的游戏时，先修改 `GameSession` 中的规则，再修改 `PlayScreen` 的视觉和公开事件，最后在 `GameApp` 中连接数据流。游戏规则不读取 UI 内部节点。给新页面增加同目录同 basename 的 `.scene/.ts`，启动前用 `prepareSceneClass()` 准备，再交给 `ScreenManager.replace()`。

`ScreenManager.track(event.connect(handler))` 注册当前页面的外部连接，必须在 `replace()` 之后调用。移除页面和关闭弹窗时会统一取消这些连接。GameApp 的初始尺寸读取项目设计分辨率；页面、模态管理器和当前 Scene 通过 frame layout 跟随可用视口。切换设计分辨率时同步修改页面与 Dialog 的根尺寸及页面内容坐标。

## UI 库契约

| 组件 | 公开契约 | 组合方式 |
| --- | --- | --- |
| Button | `text`、`disabled`、`size`，`clicked` 事件 | `icon` slot；禁用状态禁止触发事件和按压动画 |
| Panel | `title` | `content` slot |
| Dialog | `title`、`message`、`confirmText`、`cancelText`；`confirmed` / `cancelled` 事件 | 全屏遮罩和居中面板，用于模态操作 |
| ProgressBar | `setProgress(value, max)`，`max > 0` | 可改变宽高；填充比例保持不变 |

例如，在自己的页面 `.scene` 中使用：

```xml
<Button id="startButton" scene="../ui/Button.scene"
  horizontal="0" top="400" width="360" height="96" size="large"
  text="开始游戏" @clicked="start" />
```

`size` 默认为 `medium`，可在 Scene 中指定或在脚本中赋值。三种尺寸同步调整按钮默认宽高、字号和图标区域：

| size | 默认宽 × 高 | 字号 | 图标区域 |
| --- | --- | --- | --- |
| `large` | 360 × 96 | 42 | 36 × 36 |
| `medium` | 280 × 80 | 36 | 32 × 32 |
| `small` | 200 × 64 | 32 | 28 × 28 |

Scene 的 `width` / `height` 或 frame layout 可覆盖默认宽高。按下时视觉缩小到 97%，松开后约 140ms 平滑回到原位；移出按钮、在按钮外松开或取消触摸也会复位。动画仅缩放内部 `visual` 节点，按钮布局和命中区域保持稳定；节点移除后不再执行渲染回调。

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

自定义 UI 时，可以复制一套 kit 为自己的目录，保留组件文件名、公开 Props / Events / Slots 和脚本使用的 `@part` 节点 ID，再自由调整 `.scene` 的视觉结构、字体、颜色和静态图片引用。如果换成深色背景，同时调整 `src/screens/*.scene` 内的内容文字颜色。素材统一使用透明 PNG；更换同路径 `button.png` / `panel.png` 时可保持 Scene 引用不变。默认素材为 96 × 96，九宫格四边各 24 个设计单位；图片路径使用静态 `texture="assets/ui/..."`，更改后执行校验和编译。

每个 `.scene` 与同目录同名 `.ts` 配对；`@scene()` 类继承 `Group`，不声明自定义构造参数。非 Prop 依赖用显式方法传入。新增视觉节点或修改事件后运行 `pixifact scene validate --all`，避免外观替换破坏组件契约。

## Agent 观察

开发服务运行且浏览器打开后，在项目根目录执行：

```bash
pixifact runtime state
pixifact runtime tree
pixifact runtime screenshot
```

业务快照包含 `phase`、`score`、`goal`、`bestScore`、`modalOpen`；首页额外提供 `showcase`，包含 `buttonClicks`、`previewDisabled`、`progress`、`dialogResult`，进入游戏后为 `null`。可以结合真实节点树检查组件状态、弹窗隔离、页面切换、暂停和最高分保存。

首版入口和存档使用 Web API。接入微信／抖音时，按 Pixifact 的平台文档接入现有平台包，并将 DOM 入口、visibility 事件和 WebRecordStore 替换为对应平台实现。
