# Douyin Mini Game Builds

Status: Active
Authority: Pixifact Douyin Mini Game configuration, runtime, resource delivery, validation, and build boundaries
Upstream: [./index.md](./index.md), [../../README.en.md](../../README.en.md)
Example: [../../sample-projects/wechat-minigame-demo](../../sample-projects/wechat-minigame-demo)

The Pixifact Douyin target is for the ordinary JavaScript Mini Game runtime, not the Unity Mini Game solution. It shares `.scene` files, paired Scene scripts, and game logic with Web and WeChat. Platform differences remain in `tt` APIs, entrypoints, native configuration, resource delivery, and package limits.

Pixifact generates a directory that can be imported into Douyin Mini Game Developer Tools. It does not upload, submit for review, or publish builds.

## Support

- PixiJS WebGL 1 / WebGL 2 and a DOM-free runtime adapter.
- Regular `Text`, `Graphics`, Pixifact runtime nodes, and compiler Scenes.
- Touch events mapped to Pixi pointer events using `screenX` / `screenY`.
- Ticker pause/resume on background and foreground transitions.
- Local resources, Douyin subpackages, and HTTPS remote resources.
- Development / production builds, watch mode, and package-size checks.

SVG Scene textures, `HTMLText`, and `DOMContainer` are not supported in the first target version.

## CLI

```bash
pixifact validate --target douyin
pixifact build --target douyin
pixifact build --target douyin --mode development
pixifact dev --target douyin
```

The output directory is controlled by `targets.douyin.outDir` and can be imported into Douyin Mini Game Developer Tools.

`platforms/douyin/project.config.json` belongs to Douyin Developer Tools. The sample leaves `appid` empty as a placeholder; replace it with the project's real AppID before importing the build.

## Package limits

- Without subpackages: the complete code package is limited to 20 MiB.
- With subpackages: the main package is limited to 4 MiB and the complete package to 20 MiB; an individual subpackage is limited to 20 MiB.

See the Chinese document for the full configuration and verification boundary.
