# Douyin Mini Game Builds

Douyin shares Vite, `pixifact.project.json` schema version 2, `src/main.ts`, and the PixiJS Assets model with Web and WeChat. The active mode selects it through `VITE_PLATFORM=douyin`.

## Install and Configure

```bash
bun add pixifact pixi.js @pixifact/platform-douyin
bun add -d pixifact-cli vite
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { pixifact } from 'pixifact/compiler-node';

export default defineConfig({ plugins: [pixifact()] });
```

`.env.douyin`:

```ini
VITE_PLATFORM=douyin
VITE_APP_ID=tt123456
```

You may use any Vite mode name, such as `.env.game1` with `--mode game1`. Env precedence, `.local` overrides, and `import.meta.env.MODE` keep their standard Vite behavior.

Bun projects use `env = false` in the root `bunfig.toml` so Bun does not preload `.env`; Vite remains the only env loader. `create-pixifact` generates this setting automatically.

Native templates live at:

```txt
platforms/douyin/game.json
platforms/douyin/project.config.json
```

Pixifact writes `VITE_APP_ID` into the output `project.config.json` and generates Douyin `subPackages` from local `resourcePacks`. The source `game.json` must not duplicate `subPackages`.

Resource pack configuration, remote HTTPS packs, and `pixifact:assets` follow [WeChat Mini Game Builds](./wechat-minigame.md). Game assets use only PixiJS `Assets.init()`, `Assets.load()`, and `Assets.loadBundle()`; the adapter prepares a subpackage before its first read.

## Single Entry

```ts
import 'pixifact:scenes';
import { Assets } from 'pixi.js';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';

const app = await createApplication();
await Assets.init({ manifest });
await Assets.loadBundle('chapter1');
```

`createApplication()` returns a native PixiJS `Application`. Shared logic should not depend on `tt`. Import genuine Douyin APIs from `@pixifact/platform-douyin` and guard their use with `import.meta.env.VITE_PLATFORM === 'douyin'`.

## Commands and Output

```bash
pixifact validate --mode douyin
pixifact build --mode douyin
pixifact dev --mode douyin
```

Default output is `dist/douyin/`, containing one main `game.js`, native config, main-package resources, and `subpackages/<pack>/`. Douyin output targets ES2018 so its device compiler does not receive unsupported newer syntax. Without subpackages Pixifact checks the 20 MiB total limit; with subpackages it also checks the 4 MiB main-package limit.

Import `dist/douyin/` into Douyin DevTools. Vite watch rebuilds when tracked Scenes, scripts, resources, or native configs change. Pixifact does not upload, review, or publish the game.

## Support Boundary

- Supports PixiJS WebGL, Text, Graphics, Pixifact runtime nodes, touch, lifecycle, local assets, resource subpackages, and HTTPS remote packs.
- Scene textures support PNG, JPEG, and WebP. SVG, HTMLText, and DOMContainer are rejected.
- Importing the package does not read `tt` or initialize the platform.
- Login, sharing, ads, payments, and open-data capabilities are not part of the unified Application API.
