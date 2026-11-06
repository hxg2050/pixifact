# Three.js Plugin

Status: Experimental
Authority: Optional Three.js integration, composition, input, assets, and builds
Upstream: [Docs](./index.md)

`@pixifact/three` renders a native Three world beneath Pixifact / PixiJS UI on the same WebGL2 canvas and Application ticker. It stays out of projects that do not import it.

```bash
bun add @pixifact/three three@0.187.0
bun add -d @types/three@0.187.0
```

Register the optional Vite plugin alongside Pixifact:

```ts
import { pixifact } from 'pixifact/compiler-node';
import { three } from '@pixifact/three/vite';

export default {
  plugins: [pixifact({ codePackages: { game: 'src/game.ts' } }), three()],
};
```

Create the Application through `pixifact:platform` with `preference: 'webgl'`, then enter the game with `import('./game')`. In that game module:

```ts
import { createThreeLayer } from '@pixifact/three';
import { PerspectiveCamera, Scene } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new Scene();
const camera = new PerspectiveCamera(45, 1, 0.1, 100);
camera.position.z = 5;
const layer = createThreeLayer(app, { scene, camera });
const controls = new OrbitControls(camera, layer.input);
```

Add native Three objects to `scene` and Pixifact UI to `app.stage`. The plugin renders Three first and Pixi with `clear:false`, resetting renderer state at each handoff. Use `app.ticker` to update the game and controls; the platform's existing lifecycle pauses and resumes that ticker. `app.renderer.resize()` updates the drawing buffer and perspective camera aspect on the next frame. `onResize` and `renderScene` options support custom camera projections and render passes.

`layer.input` supplies pointer/wheel input to OrbitControls after Pixi UI hit testing. A gesture belongs to the UI or world from its initial press until release. Use `layer.raycast(event, objects)` with CSS client coordinates to pick models. Web keyboard controls can explicitly use a real keyboard event target through `listenToKeyEvents`.

Initialize the normal `pixifact:assets` manifest with `Assets.init()`, resolve a model URL with `Assets.resolver.resolve('resources/models/world.gltf').src!`, then pass it to a native `GLTFLoader`. Keep external buffers and textures relative to the model. Mini Game loaders use the existing DOMAdapter resource transport and native resource subpackages; embedded GLB/data URI images use temporary files removed after decode or failure. Engine texture objects remain separate.

Web, WeChat and Douyin keep the same `pixifact build --mode <mode>` commands and Vite mode configuration. Import Three and the plugin only from the game code package to keep them there. Imports from the main entry or globally registered `.scene` scripts place those dependencies in the main package.

`layer.destroy()` releases its renderer and input, restores Pixi rendering, and preserves the shared canvas/context. Dispose controls and game-owned geometry/material/texture resources separately. Application destruction automatically detaches the layer.

For Web development Runtime screenshots, pass `captureScreenshot: layer.captureScreenshot` to `registerPixiRuntime`. The screenshot includes the full 3D + UI frame at logical screen dimensions. Runtime trees and Editor previews continue to describe 2D Pixi content; `.scene` does not gain 3D object tags.

The Mini Game loader integration targets Three r187 (`>=0.187.0 <0.188.0`) and PixiJS `>=8.22.0 <9`, and requires WebGL2. Three r187 WebGLRenderer also requires native `WeakRef` and `FinalizationRegistry` support in the target Mini Game JavaScript engine. WASM, Draco/KTX2 decoders, and DOM/Worker-specific addons are outside this release. Native device GPU validation remains a separate acceptance step.

See the [working three-platform sample](../../sample-projects/three-demo/README.md) and [detailed Chinese guide](../zh/three.md).
