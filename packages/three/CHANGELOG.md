# @pixifact/three

## 0.20.1

## 0.20.0

### Minor Changes

- 3c5dcd0: 新增可选 Three.js 插件，支持共享 WebGL2 的 3D 世界与 Pixifact UI 合成、UI 优先输入、普通 glTF/GLB 资源、完整 Runtime 截图，以及现有 Web / 微信 / 抖音构建和代码分包。

  支持微信和抖音小游戏代码分包，并修复 Scene 资源与代码分包的组合构建，使游戏逻辑和 Three 引擎可以按需加载。

  优化 Editor Scene 预览：按当前 Scene 依赖加载与缓存模板、脚本契约和纹理，取消过期预览等待，恢复标签时只构建当前 Scene，并缓存服务端项目索引；文件变化会精确失效，手动刷新会重新扫描资源。
