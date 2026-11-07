# @pixifact/three

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
