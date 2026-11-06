# Three.js 插件

状态：实验性
权威范围：`@pixifact/three` 接口、渲染组合、输入、资源和出包
上游文档：[文档入口](./index.md)、[README](../../README.md)
更新规则：插件公共接口、Three 版本范围、平台适配或验证边界变化时更新

`@pixifact/three` 是可选包：Three 绘制 3D 世界，Pixifact / PixiJS 绘制 2D UI，共享一个 WebGL2 context、Canvas 和 Application ticker。没有导入插件的 2D 项目不会打入 Three。

## 安装和构建

```bash
bun add @pixifact/three three@0.186.1
bun add -d @types/three@0.186.0
```

继续使用现有 `pixifact()`、Vite mode 与平台包：

```ts
import { defineConfig } from 'vite';
import { pixifact } from 'pixifact/compiler-node';
import { three } from '@pixifact/three/vite';

export default defineConfig({
  plugins: [
    pixifact({ codePackages: { game: 'src/game.ts' } }),
    three(),
  ],
});
```

`VITE_PLATFORM=web/wechat/douyin` 的选择方式、`pixifact validate/build/dev --mode <mode>` 与原有出包流程相同。微信和抖音分别安装对应的 `@pixifact/platform-*` 包。小游戏适配基于 Three r186 源码 loader，peer 版本限制为 `>=0.186.1 <0.187.0`；PixiJS 使用 `>=8.18.1 <9`。

## 创建 3D 世界

主入口先创建共享 Application，再动态导入游戏：

```ts
import 'pixifact:scenes';
import { createApplication } from 'pixifact:platform';

const app = await createApplication({ preference: 'webgl' });
if (import.meta.env.VITE_PLATFORM === 'web') document.body.appendChild(app.canvas);
const { startGame } = await import('./game');
const game = startGame(app);
```

在 `src/game.ts` 中使用原生 Three API：

```ts
import { createThreeLayer } from '@pixifact/three';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Application } from 'pixi.js';

export function startGame(app: Application) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 5;
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: 0xe2b367 }));
  scene.add(mesh);
  const layer = createThreeLayer(app, { scene, camera });
  const controls = new OrbitControls(camera, layer.input);
  return { layer, controls, mesh };
}
```

UI 挂在 `app.stage`。`.scene` 仍以 `Group` 为根，负责 2D HUD / 菜单；3D 场景保留在 TypeScript。Editor 的 Scene 预览和节点树展示 2D authoring 内容。

`createThreeLayer` 替换 Application 的 render 回调，ticker 仍由 Application 驱动，小游戏隐藏/恢复继续沿用平台生命周期。每帧先重置 Three 状态并绘制世界，再重置 Pixi 状态并用 `clear:false` 绘制 UI。使用 `app.ticker.add` 更新游戏和控件；不要再启动独立的 Three `setAnimationLoop`。

`app.renderer.resize(width, height, resolution?)` 会在下一帧同步 Three 绘制缓冲区；透视相机 aspect 自动更新。自定义投影或多 pass 使用：

```ts
createThreeLayer(app, {
  scene, camera,
  rendererOptions: { antialias: true },
  onResize(width, height) { /* 更新正交相机或游戏布局 */ },
  renderScene(renderer, scene, camera) { renderer.render(scene, camera); },
});
```

Canvas/context 的创建参数来自 Application；`rendererOptions` 不能更换共享 Canvas/context。微信/抖音窗口 resize 会更新 Application 和输入视口。设备需要 WebGL2。

## 输入和拾取

将 `layer.input` 交给 OrbitControls 等指针控件。它是局部输入对象，接收经过 Pixi 命中判断的 pointer/wheel 事件，不替换宿主 Canvas/document。交互 UI 的手势从按下到抬起都归 UI；从世界开始的拖动跨过 UI 后仍由世界接收。UI 节点需按常规设置 `eventMode="static"` / `"dynamic"` 和命中区域。

```ts
layer.input.addEventListener('pointerdown', (event) => {
  const hits = layer.raycast(event as PointerEvent, [mesh]);
  if (hits.length) mesh.material.color.setHex(0x65b9d0);
});
```

拾取使用 Canvas CSS 坐标和当前 camera，不受屏幕像素比影响。需要 Web 键盘控制时，可显式把真实键盘事件目标传给控件的 `listenToKeyEvents`。

## 资源

先按现有资源流程初始化 manifest，再把解析出的 URL 传给 Three loader：

```ts
import { Assets } from 'pixi.js';
import manifest from 'pixifact:assets';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

await Assets.init({ manifest });
const url = Assets.resolver.resolve('resources/models/world.gltf').src!;
const gltf = await new GLTFLoader().loadAsync(url);
scene.add(gltf.scene);
```

`models` 放在 `pixifact.project.json.resourcePacks`，文件放在 `resources/models/`；外部 `.bin` / 纹理保留模型内相对目录。HTTPS 资源包沿用项目已有 `remoteResourcePacks`。Web 使用 Three 原生 loader；小游戏 FileLoader / ImageLoader 使用现有 DOMAdapter、文件与网络读取，并在图片访问前加载原生资源分包。GLB bufferView / data URI 图片写入用户目录临时文件，解码完成或失败后删除。

Pixi Texture 与 Three Texture 分别管理；不要把 Pixi Texture 直接赋给 Three 材质。普通 glTF/GLB 支持几何、材质、外部和内嵌 PNG/JPEG 图片；WASM 物理引擎、Draco、KTX2 等解码链路不在首版范围内。浏览器 DOM / Worker 专用的其他 addons 需要单独适配。

## 分包和释放

只在 `src/game.ts` 及其依赖里导入 `three` / `@pixifact/three`，主入口通过 `import('./game')` 进入。若首页或全局注册的 `.scene` 脚本静态导入 Three，引擎会按真实依赖进入主包。代码与模型可分别放在 `game`、`models` 分包；同名代码/资源包也沿用现有合并规则。

切换游戏时移除自己的 ticker / UI 监听，执行 `controls.dispose()`、`layer.destroy()`，再释放 geometry、material、texture。`layer.destroy()` 只销毁插件的 renderer 与输入绑定并恢复 Pixi render；不会遍历和销毁业务模型，不移除 Canvas，也不调用 `forceContextLoss()`。销毁 Application 时会自动先销毁它挂载的 layer。

## Runtime 截图

Web 开发模式启用 `pixifactRuntimePlugin()` 后：

```ts
const { registerPixiRuntime } = await import('pixifact/runtime-dev');
registerPixiRuntime(app, { captureScreenshot: layer.captureScreenshot });
```

`pixifact runtime screenshot` 将同步重绘并捕获完整 3D + UI，输出 `app.screen` 的逻辑尺寸 PNG。Runtime 的节点树仍表示 Pixi UI，业务 3D 状态可通过 `getState` 暴露。

可运行项目见 [three-demo](../../sample-projects/three-demo/README.md)。三端真实构建、小游戏产物执行和普通 glTF/GLB 加载纳入自动测试；小游戏真机 GPU 表现仍需用开发者工具和设备验收。
