# @pixifact/three

Pixifact 可选 Three.js 插件。Three 绘制 3D 世界，Pixifact / PixiJS 绘制 2D UI，共用一个 WebGL2 Canvas 和 Application ticker。

```bash
bun add @pixifact/three three@0.187.0
bun add -d @types/three@0.187.0
```

在现有 Vite 配置中注册：

```ts
import { pixifact } from 'pixifact/compiler-node';
import { three } from '@pixifact/three/vite';

export default {
  plugins: [pixifact({ codePackages: { game: 'src/game.ts' } }), three()],
};
```

在 `src/game.ts` 中创建 3D 层：

```ts
import { createThreeLayer } from '@pixifact/three';
import { PerspectiveCamera, Scene } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Application } from 'pixi.js';

export function startGame(app: Application) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 5;
  const layer = createThreeLayer(app, { scene, camera });
  const controls = new OrbitControls(camera, layer.input);
  return { layer, controls };
}
```

主入口使用 `pixifact:platform` 的 `createApplication({ preference: 'webgl' })`，再调用 `import('./game')`。沿用 `pixifact build --mode web/wechat/douyin`，引擎随游戏代码进入分包。

- 原生 Three Scene、Camera、Mesh 与 `.scene` UI 可以组合使用。
- UI 优先接收输入；`layer.input` 提供世界手势，`layer.raycast(event, objects)` 用于拾取。
- 普通 glTF/GLB、外部纹理和内嵌图片支持小游戏资源通道及资源分包。资源 URL 可从 `Assets.resolver.resolve(alias).src` 获取。
- Web 开发 Runtime 注册时传入 `captureScreenshot: layer.captureScreenshot`，截图包含 3D 和 UI。
- `layer.destroy()` 释放插件 renderer 和输入，恢复 Pixi 绘制；共享 Canvas/context 保留。控件、模型 geometry/material/texture 按 Three 原生规则 dispose。
- 需要 WebGL2 和原生 `WeakRef` / `FinalizationRegistry`；小游戏 loader 适配 Three r187。WASM、Draco/KTX2、3D 可视化编辑不在此版本范围内。

[完整接入文档](https://github.com/hxg2050/pixifact/blob/main/docs/zh/three.md) · [三端示例](https://github.com/hxg2050/pixifact/tree/main/sample-projects/three-demo)
