# 抖音小游戏构建

抖音与 Web、微信共用 Vite、`pixifact.project.json` version 2、`src/main.ts` 和 PixiJS Assets 心智。平台由 mode env 中的 `VITE_PLATFORM=douyin` 选择。

## 安装与配置

```bash
bun add pixifact pixi.js @pixifact/platform-douyin
bun add -d pixifact-cli vite
```

`vite.config.ts`：

```ts
import { defineConfig } from 'vite';
import { pixifact } from 'pixifact/compiler-node';

export default defineConfig({ plugins: [pixifact()] });
```

`.env.douyin`：

```ini
VITE_PLATFORM=douyin
VITE_APP_ID=tt123456
```

也可以使用 `.env.game1` 等任意 Vite mode 文件，再通过 `--mode game1` 构建。env 的加载顺序、`.local` 覆盖和 `import.meta.env.MODE` 都遵循 Vite 默认规则。

Bun 项目根目录使用 `bunfig.toml` 中的 `env = false` 禁止 Bun 提前读取 `.env`，env 文件统一交给 Vite 加载。`create-pixifact` 会自动生成该配置。

抖音原生模板位于：

```txt
platforms/douyin/game.json
platforms/douyin/project.config.json
```

Pixifact 从 `VITE_APP_ID` 写入输出 `project.config.json`，并根据本地 `resourcePacks` 生成抖音的 `subPackages`。源 `game.json` 不得重复声明 `subPackages`。

资源包配置、远程 HTTPS 包和 `pixifact:assets` 用法与[微信小游戏构建](./wechat-minigame.md)一致。所有业务资源都通过 PixiJS `Assets.init()`、`Assets.load()` 和 `Assets.loadBundle()` 加载；分包由 adapter 在首次读取前自动准备。

## 单一入口

```ts
import 'pixifact:scenes';
import { Assets } from 'pixi.js';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';

const app = await createApplication();
await Assets.init({ manifest });
await Assets.loadBundle('chapter1');
```

`createApplication()` 返回原生 PixiJS `Application`。共享逻辑不直接依赖 `tt`；确实需要抖音开放能力时，从 `@pixifact/platform-douyin` 静态导入对应 API，并用 `import.meta.env.VITE_PLATFORM === 'douyin'` 分支保护。

## 命令与产物

```bash
pixifact validate --mode douyin
pixifact build --mode douyin
pixifact dev --mode douyin
```

默认输出为 `dist/douyin/`，包含单一主代码 `game.js`、原生配置、主包资源和 `subpackages/<pack>/`。抖音构建目标固定为 ES2018，避免真机编译器无法解析较新语法。没有分包时检查 20 MiB 总包；存在分包时同时检查 4 MiB 主包和 20 MiB 总包。

把 `dist/douyin/` 导入抖音小游戏开发者工具。修改已纳入项目的 Scene、脚本、资源或原生配置时，`dev` 由 Vite watch 重建。Pixifact 不负责上传、审核和发布。

## 支持边界

- 支持 PixiJS WebGL、Text、Graphics、Pixifact runtime 节点、触摸、生命周期、本地资源、资源分包和 HTTPS 远程包。
- Scene 纹理支持 PNG、JPEG 和 WebP；拒绝 SVG、HTMLText 和 DOMContainer。
- 平台包顶层 import 不读取 `tt` 或执行初始化。
- 登录、分享、广告、支付和开放数据域不属于统一 Application API。
