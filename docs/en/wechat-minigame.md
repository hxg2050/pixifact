# WeChat Mini Game Builds

Pixifact uses Vite for Web, WeChat, and Douyin builds. A single `src/main.ts` binds to the platform selected by `VITE_PLATFORM` in the active Vite mode. There is no target schema or separate WeChat entry in `pixifact.project.json`.

## Install

Install the optional platform package when the project builds for WeChat:

```bash
bun add pixifact pixi.js @pixifact/platform-wechat
bun add -d pixifact-cli vite
```

`@pixifact/platform-wechat` is bundled into the WeChat build. It is absent from Web and Douyin production bundles.

## Vite and Modes

`vite.config.ts` is the only build configuration entry:

```ts
import { defineConfig } from 'vite';
import { pixifact } from 'pixifact/compiler-node';

export default defineConfig({ plugins: [pixifact()] });
```

For example, `.env.wechat` contains:

```ini
VITE_PLATFORM=wechat
VITE_APP_ID=wx123456
```

Pixifact follows Vite's standard `.env`, `.env.local`, `.env.[mode]`, and `.env.[mode].local` rules. A mode can have any non-empty name, so `.env.game1` may also select WeChat. Every `VITE_*` value is a public client string; do not store secrets there.

Bun normally preloads `.env`, which makes those values look like existing process variables to Vite and lets them override a mode file. Bun projects should keep the scaffolded root `bunfig.toml`:

```toml
env = false
```

This disables only Bun's automatic dotenv loading. Vite still loads every env file in its standard order, while variables explicitly supplied by the shell retain the highest priority.

## Project and Native Config

`pixifact.project.json` uses schema version 2 and contains only Pixifact domain data:

```json
{
  "version": 2,
  "name": "My Game",
  "scenes": { "main": "src/scenes/Main.scene" },
  "resourcePacks": ["chapter1", "common"],
  "remoteResourcePacks": {
    "common": "https://cdn.example.com/common"
  }
}
```

Local packs live in `resources/<pack-name>/`. Every remote mapping must reference a declared pack and use HTTPS. Remote packs appear in the Pixi manifest but are not written to build output.

Native templates live at:

```txt
platforms/wechat/game.json
platforms/wechat/project.config.json
```

Pixifact copies these templates, writes `VITE_APP_ID`, and generates WeChat `subpackages` from local resource packs and code packages. The source `game.json` must not declare `subpackages` itself.

## Single Entry and Assets

All platforms share the same entry:

```ts
import 'pixifact:scenes';
import { Assets } from 'pixi.js';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';

const app = await createApplication({ backgroundColor: 0x09111a });
await Assets.init({ manifest });
await Assets.loadBundle('chapter1');
const level = await Assets.load('resources/chapter1/level.json');
```

`createApplication()` returns a native PixiJS `Application`. It prepares the platform, Canvas, renderer, input, and lifecycle, but never calls `Assets.init()` implicitly. Initialize the manifest once at the point appropriate for the game.

Use project-relative logical paths without a leading `/`. Before PixiJS reads a subpackage path, the WeChat fetch adapter loads that subpackage automatically. Game code does not call `loadSubpackage()` or a Pixifact-specific resource loader.

Import genuine platform APIs directly from the optional package and protect their use with a Vite constant branch. Constant folding and tree-shaking remove the branch from non-target production bundles. Pixifact does not currently provide share, login, ads, or payment facades.

## Code Subpackages

With Vite 8, declare package names and project-relative entries in `vite.config.ts`:

```ts
export default defineConfig({
  plugins: [pixifact({
    codePackages: {
      game: 'src/game.ts',
      chapter2: 'src/chapters/chapter2.ts',
    },
  })],
});
```

Keep standard dynamic imports in the shared application, including normal TypeScript export inference:

```ts
// src/main.ts: call enterGame() when the game is needed.
async function enterGame() {
  const { startGame } = await import('./game');
  await startGame();
}
```

The WeChat build calls `wx.loadSubpackage()` before executing the module. Concurrent imports share the download and module instance. Download failures reject the import and allow a later retry. Resource and code loaders also share the same native package download.

With code packages enabled, the main entry is CommonJS `game.js`, package entries are `subpackages/<name>/game.js`, and shared chunks remain in the main package's `chunks/` directory. Shared engines are not copied into each package. Code and a local resource pack with the same name share one native declaration; asset manifests and paths remain unchanged.

Names contain letters, digits, hyphens, and underscores, beginning with a letter or digit. Entries must be inside the project, cannot be reused by another package, and cannot be the application entry. Import package entries with literal-path `import()` calls from the main package; eager static imports and direct references between packages are rejected. Unconfigured dynamic modules and shared dependencies stay in the main package under Vite's chunking rules; declare additional code entries for modules that need their own native package.

Web keeps native Vite dynamic imports, without Mini Game code packages or `wx`. Mini Game watch rebuilds track code entries and their dependencies. Without `codePackages`, output remains one IIFE main script.

## Commands and Output

```bash
pixifact validate --mode wechat
pixifact build --mode wechat
pixifact dev --mode wechat
```

Without `--mode`, `dev` defaults to `development`; `build` and `validate` default to `production`. Mini Game `dev` uses Vite build watch and rebuilds when tracked Scenes, paired scripts, resources, or native configs change.

The default output is `dist/wechat/`; override it with Vite `build.outDir`. It contains the main `game.js`, native config, main-package resources, and `subpackages/<pack>/`, plus main-package shared `chunks/` when code packages are enabled. Code packages count toward package reports and limits. Pixifact enforces the 4 MiB main-package and 20 MiB total limits; source maps and `project.config.json` are excluded from the report.

Import `dist/wechat/` into WeChat DevTools. Pixifact does not upload, submit, review, or publish the game.

## Support Boundary

- Supports PixiJS WebGL, Text, Graphics, Pixifact runtime nodes, touch, foreground/background lifecycle, local assets, resource subpackages, and HTTPS remote packs.
- Scene textures support PNG, JPEG, and WebP. SVG, HTMLText, and DOMContainer are rejected.
- Importing the package does not read `wx` or register lifecycle handlers; initialization starts in `createApplication()`.
