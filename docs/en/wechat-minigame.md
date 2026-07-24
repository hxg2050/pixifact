# WeChat Mini Game Builds

Status: Active  
Authority: WeChat Mini Game configuration, runtime, resource delivery, validation, and build boundaries for Pixifact game projects  
Upstream: [./index.md](./index.md), [../../README.en.md](../../README.en.md)  
Sample: [../../sample-projects/wechat-minigame-demo](../../sample-projects/wechat-minigame-demo)  
Update rule: Update when the WeChat target config, CLI, platform runtime, support matrix, or build output changes.

[中文](../zh/wechat-minigame.md)

Pixifact treats WeChat Mini Games as a first-class game build target. The same `.scene` files, paired Scene scripts, and game logic can run on Web and WeChat. Platform differences stay in the entry point, PixiJS adapter, resource delivery, and native configuration.

The output is a directory that can be imported directly into WeChat DevTools. Pixifact does not upload code, create trial builds, submit reviews, or publish releases.

## Supported Surface

The current target provides:

- PixiJS WebGL 1 / WebGL 2 initialization with a DOM-free runtime adapter.
- Regular `Text`, including Chinese text.
- `Graphics`, Pixifact runtime nodes, and compiler Scenes.
- WeChat touch event forwarding to PixiJS pointer events.
- Ticker pause/resume and active touch cancellation across hide/show lifecycle events.
- Local assets, WeChat resource subpackages, and HTTPS remote assets.
- Development and production builds, watch mode, and package-size checks.

The following are explicitly unsupported:

- SVG assets. The build does not convert SVG automatically; provide PNG, JPEG, or WebP source assets.
- `HTMLText`.
- `DOMContainer`.

Scene textures support `.png`, `.jpg`, `.jpeg`, and `.webp`. Target validation reports unsupported nodes, textures, and resource-pack contents before the build.

## Project Configuration

Declare resource packs and the WeChat target in `pixifact.project.json`:

```json
{
  "version": 1,
  "name": "My Game",
  "resolution": {
    "width": 750,
    "height": 1334
  },
  "viewport": {
    "mode": "fixedWidth"
  },
  "scenes": {
    "main": "src/scenes/Main.scene"
  },
  "resourcePacks": {
    "chapter1": {
      "root": "resources/chapter1"
    },
    "common": {
      "root": "resources/common"
    }
  },
  "targets": {
    "wechat": {
      "entry": "src/wechat/main.ts",
      "configDir": "platforms/wechat",
      "outDir": "dist/wechat",
      "resourcePacks": {
        "chapter1": {
          "delivery": "subpackage",
          "root": "subpackages/chapter1"
        },
        "common": {
          "delivery": "remote",
          "baseUrl": "https://cdn.example.com/common"
        }
      }
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `entry` | WeChat Mini Game TypeScript entry point |
| `configDir` | Directory containing native `game.json` and `project.config.json` |
| `outDir` | WeChat DevTools import directory; it cannot be the project root or contain project inputs |
| `resourcePacks` | Delivery strategy for each project resource pack |
| `subpackage.root` | WeChat resource-subpackage root inside the output directory |
| `remote.baseUrl` | HTTPS CDN base URL without a trailing slash |

Use an empty `resourcePacks` object when the project has no resource packs. Every target pack name must first be declared in the top-level `resourcePacks`, and every top-level pack must select a WeChat delivery strategy.

Names and roots in `platforms/wechat/game.json` must match the target:

```json
{
  "deviceOrientation": "portrait",
  "subpackages": [
    {
      "name": "chapter1",
      "root": "subpackages/chapter1"
    }
  ]
}
```

`project.config.json` belongs to WeChat DevTools. Use your own AppID in a real project; the sample uses `touristappid`.

## Scenes And Entry Point

Scene scripts import decorators from the runtime-only entry point:

```ts
import { scene } from 'pixifact/scene';
import { Group } from 'pixifact/runtime';

@scene()
export class Main extends Group {}
```

A Scene must be prepared asynchronously before instantiation. Preparation handles nested Scenes first and then loads textures from the target manifest:

```ts
import { prepareSceneClass } from 'pixifact/scene';
import { Main } from './scenes/Main';

await prepareSceneClass(Main);
const scene = new Main();
```

The WeChat entry imports the generated registry before creating the platform Application:

```ts
import 'pixifact:scenes';
import { createWechatPixiApplication } from 'pixifact/platform/wechat';
import { startGame } from '../startGame';

const app = await createWechatPixiApplication({ backgroundColor: 0x09111a });
await startGame({
  stage: app.stage,
  width: app.screen.width,
  height: app.screen.height,
});
```

`createWechatPixiApplication()` returns `stage`, `renderer`, `ticker`, `screen`, `canvas`, `start()`, `stop()`, and `destroy()`. Shared game logic should not depend directly on `wx`; keep platform startup and platform APIs inside the `src/wechat` boundary.

## Resource Delivery

`compile-scenes` emits logical resource IDs. Web and WeChat builds map those IDs to platform URLs independently:

- Scene textures outside resource packs are copied to main-package `assets/` with content-hashed names.
- A `subpackage` resource pack is copied in full. Preparing a Scene texture in that pack first calls `wx.loadSubpackage()`.
- A `remote` pack is not copied into the code package. Scene textures map to `baseUrl`. Configure the CDN as an allowed domain in the WeChat console as well.
- JSON, audio, and other non-Scene assets can also live in resource packs. Call `loadWechatSubpackage(name)` before manually reading a subpackage asset.

```ts
import {
  fetchWechatResource,
  loadWechatSubpackage,
} from 'pixifact/platform/wechat';

await loadWechatSubpackage('chapter1');
const level = await fetchWechatResource('subpackages/chapter1/level.json')
  .then((response) => response.json());
```

Do not place the same resource in nested or overlapping resource packs; that makes delivery ambiguous.

## CLI

Validate the target first:

```bash
pixifact validate --target wechat
```

Production builds are minified by default:

```bash
pixifact build --target wechat
```

Generate readable code and a source map when needed:

```bash
pixifact build --target wechat --mode development
```

Watch the project and rebuild during development:

```bash
pixifact dev --target wechat
```

`dev` always uses development mode. Import `targets.wechat.outDir` into WeChat DevTools and leave its file watcher enabled.

## Build Output

Typical output:

```txt
dist/wechat/
├── game.js
├── game.js.map
├── game.json
├── project.config.json
├── assets/
└── subpackages/
    └── chapter1/
        ├── game.js
        └── ...
```

Production builds omit `game.js.map`. The builder enforces:

- Main package at or below 4 MiB.
- All code packages combined at or below 20 MiB.

The report uses emitted file sizes. Source maps and `project.config.json` do not count toward code-package size. A build that exceeds a limit fails with main-package, subpackage, and total byte counts.

## Sample

`sample-projects/wechat-minigame-demo` demonstrates a shared `.scene`, regular Chinese `Text`, `Graphics`, `ScrollContainer`, touch input, and a resource subpackage:

```bash
cd sample-projects/wechat-minigame-demo
bun run dev
bun run build:web
bun run validate:wx
bun run build:wx
bun run dev:wx
```

Web output goes to `dist/web`; WeChat output goes to `dist/wechat`. The targets do not clean each other's output.
