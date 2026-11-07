# pixifact

## 0.21.0

### Minor Changes

- 直接迁移到 TypeScript 7.1 官方 API，Editor 使用 Vue content mapper 检查模板和组件 props；固定 TypeScript 7.1.0-beta 与 @vue/content-mapper 4.0.0-alpha.3。Scene 脚本契约提取和内置契约读取改为 Promise，调用方需要 await。

  构建配置迁移到 Vite 8.3.6 的 rolldownOptions 与 Rolldown 类型，代码分包保留静态 import()、变量作用域和原始 sourcemap 行列。同步升级 Vue、Pinia、Reka、Playwright、测试和发布工具，仓库与 CI 使用 Bun 1.4.4 / Node.js 24，脚手架和示例依赖一并更新。

  渲染依赖升级到 PixiJS 8.22.0 和 Three r187；@pixifact/three 要求 three >=0.187.0 <0.188.0、pixi.js >=8.22.0 <9 与 vite >=8.3.6 <9。目标小游戏 JavaScript 引擎需原生支持 WeakRef 和 FinalizationRegistry；保留共享 WebGL2 合成、普通 glTF/GLB、资源和代码分包能力。

## 0.20.1

## 0.20.0

### Minor Changes

- 3c5dcd0: 新增可选 Three.js 插件，支持共享 WebGL2 的 3D 世界与 Pixifact UI 合成、UI 优先输入、普通 glTF/GLB 资源、完整 Runtime 截图，以及现有 Web / 微信 / 抖音构建和代码分包。

  支持微信和抖音小游戏代码分包，并修复 Scene 资源与代码分包的组合构建，使游戏逻辑和 Three 引擎可以按需加载。

  优化 Editor Scene 预览：按当前 Scene 依赖加载与缓存模板、脚本契约和纹理，取消过期预览等待，恢复标签时只构建当前 Scene，并缓存服务端项目索引；文件变化会精确失效，手动刷新会重新扫描资源。

## 0.19.0

## 0.18.0

### Patch Changes

- 修复 Runtime 在通配地址监听、IPv6 本机会话和局域网普通 HTTP 页面中的初始化，使局域网预览可正常注册 Runtime、读取状态、分发输入和热更新。

## 0.17.0

## 0.16.0

## 0.15.0

### Minor Changes

- 支持在 Scene 根节点编辑 Group 属性、公开 Prop 默认值和原生事件绑定；默认值支持实例、Scene 和脚本三层优先级及结构化字段合并。Editor 新增右键拖动画布，并修复根属性重复提交影响撤销与重做、部分字符串默认值保存后无法重新解析的问题。

## 0.14.0

## 0.13.0

## 0.12.0

### Minor Changes

- 为 Runtime 节点提供 `.scene` 来源与 locator，便于 Agent 从运行画面定位源文件；修正 Runtime 截图对游戏视口变换的处理。

## 0.11.2

## 0.11.1

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

### Patch Changes

- 新增 `pixifact runtime screenshot`，可捕获已注册 PixiJS Application 的 Canvas PNG；省略 `--output` 时默认写入项目根下 `.pixifact/runtime/frame.png`。

## 0.7.0

### Minor Changes

- d4e052a: 统一 Web、微信和抖音的 Vite 构建链、单入口、mode/env 与 PixiJS Assets 资源加载，并将微信和抖音 Runtime 拆为按需安装的平台包。

### Patch Changes

- 修复小游戏 Vite 构建的资源 URL：保持相对路径，并在构建时去重 PixiJS，避免平台产物包含重复运行时。

## 0.6.1

## 0.6.0

### Patch Changes

- 3bc36d6: 新增 `pixifact editor screenshot --output <png-path>`，通过当前活动浏览器的 Authoring Preview 输出设计尺寸 PNG；新增 Agent Runtime 观测、标准输入和 `runtime tree --output <json-path>` 节点树快照；同时明确 Compiler locator 来源并精简 `scene validate --all` 的成功输出。

## 0.5.0

### Minor Changes

- 发布 AI-first Scene authoring 闭环：浏览器 Editor、Scene Binding、Label / BitmapLabel、只读 Editor context、外部文件同步、画布与层级编辑，以及真实 npm tarball 的下游项目发布验收。

## 0.4.0

### Minor Changes

- 00ca569: 新增微信小游戏一等构建目标、平台 runtime、Scene 跨平台资源 manifest、资源分包与远程 delivery、目标校验、开发监听、文档和完整示例项目；Scene 运行时 API 迁移到 `pixifact/scene`。微信构建兼容缺少 `Intl`、`navigator`、`TextEncoder` 和 `TextDecoder` 的真机运行时，并支持拖动所需的全局 pointer move 事件。

## 0.3.0

### Minor Changes

- e21b1b9: Allow direct `<Group>` nodes in `.scene` files for explicit box sizing and frame layout.

## 0.2.2

## 0.2.1

### Patch Changes

- 更新 AI-first CLI 主路径、Scene authoring 文档和 Pixifact skill 离线参考。

## 0.2.0

### Minor Changes

- 发布 runtime 布局与资源节点更新：新增 Rect、Image、NineImage、TileImage、ScrollContainer、GridContainer 和栈布局容器，补充 viewport 适配能力，改进 Scene 尺寸、节点移动/缩放和示例项目体验。

## 0.1.5

### Patch Changes

- 修复 Editor 预览使用裸 Group 作为根节点导致 Scene action 找不到脚本方法的问题，并修复层级面板右键添加节点子菜单 hover 空隙。

## 0.1.4

### Patch Changes

- 2820b52: 简化 monorepo 发布流程，并让 create-pixifact 生成的 Scene 默认继承 Group。
