# @pixifact/platform-douyin

## 0.21.0

### Minor Changes

- 直接迁移到 TypeScript 7.1 官方 API，Editor 使用 Vue content mapper 检查模板和组件 props；固定 TypeScript 7.1.0-beta 与 @vue/content-mapper 4.0.0-alpha.3。Scene 脚本契约提取和内置契约读取改为 Promise，调用方需要 await。

  构建配置迁移到 Vite 8.3.6 的 rolldownOptions 与 Rolldown 类型，代码分包保留静态 import()、变量作用域和原始 sourcemap 行列。同步升级 Vue、Pinia、Reka、Playwright、测试和发布工具，仓库与 CI 使用 Bun 1.4.4 / Node.js 24，脚手架和示例依赖一并更新。

  渲染依赖升级到 PixiJS 8.22.0 和 Three r187；@pixifact/three 要求 three >=0.187.0 <0.188.0、pixi.js >=8.22.0 <9 与 vite >=8.3.6 <9。目标小游戏 JavaScript 引擎需原生支持 WeakRef 和 FinalizationRegistry；保留共享 WebGL2 合成、普通 glTF/GLB、资源和代码分包能力。

## 0.20.1

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.2

## 0.11.1

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

### Minor Changes

- d4e052a: 统一 Web、微信和抖音的 Vite 构建链、单入口、mode/env 与 PixiJS Assets 资源加载，并将微信和抖音 Runtime 拆为按需安装的平台包。

### Patch Changes

- 等待抖音小游戏图片的原生加载事件，避免冷启动时 PixiJS 在图片解码完成前创建纹理。
