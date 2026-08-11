# Pixifact

Pixifact 是基于 PixiJS v8、面向 AI 可编辑 `.scene` 工作流的 Scene / UI / 轻场景语义层。

## 安装

```bash
bun add pixifact pixi.js
bun add -d pixifact-cli vite
```

只在需要时安装小游戏平台包：

```bash
bun add @pixifact/platform-wechat
bun add @pixifact/platform-douyin
```

## Vite

```ts
import { defineConfig } from 'vite';
import { pixifact } from 'pixifact/compiler-node';

export default defineConfig({ plugins: [pixifact()] });
```

Web、微信和抖音共享 `src/main.ts`。平台由当前 Vite mode env 中的 `VITE_PLATFORM=web|wechat|douyin` 选择；小游戏还需要 `VITE_APP_ID`。

```ts
import 'pixifact:scenes';
import { Assets } from 'pixi.js';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';

const app = await createApplication();
await Assets.init({ manifest });
```

`createApplication()` 返回原生 PixiJS `Application`，不隐式初始化 Assets。Scene 纹理和业务 JSON、音频、字体、资源包都沿用 PixiJS `Assets.load()` / `Assets.loadBundle()`。

## Scene 工作流

```bash
pixifact scene validate --all
pixifact compile-scenes
pixifact validate --mode production
pixifact build --mode production
```

项目相对 `.scene` 是 source of truth；不要编辑 `.pixifact/generated/**`。解析、校验和生成 API 位于 `pixifact/compiler`，Node/Vite 插件位于 `pixifact/compiler-node`，runtime 与 Scene API 分别位于 `pixifact/runtime` 和 `pixifact/scene`。

微信和抖音构建配置见仓库文档：[微信小游戏](https://github.com/hxg2050/pixifact/blob/main/docs/zh/wechat-minigame.md)、[抖音小游戏](https://github.com/hxg2050/pixifact/blob/main/docs/zh/douyin-minigame.md)。

## 环境要求

- Bun
- PixiJS v8
- Vite 6 或更高版本
