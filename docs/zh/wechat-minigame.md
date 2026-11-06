# 微信小游戏构建

Pixifact 使用 Vite 同时构建 Web、微信和抖音。一份 `src/main.ts` 根据 Vite mode 中的 `VITE_PLATFORM` 绑定当前平台，不再在 `pixifact.project.json` 中声明 target 或维护微信专用入口。

## 安装

Web 项目只需要核心包；需要构建微信时额外安装平台包：

```bash
bun add pixifact pixi.js @pixifact/platform-wechat
bun add -d pixifact-cli vite
```

`@pixifact/platform-wechat` 是业务依赖，会进入微信产物。它不会被 Web 或抖音 production bundle 引入。

## Vite 与 mode

`vite.config.ts` 是唯一构建配置入口：

```ts
import { defineConfig } from 'vite';
import { pixifact } from 'pixifact/compiler-node';

export default defineConfig({
  plugins: [pixifact()],
});
```

例如创建 `.env.wechat`：

```ini
VITE_PLATFORM=wechat
VITE_APP_ID=wx123456
```

Pixifact 完全遵循 Vite 的 `.env`、`.env.local`、`.env.[mode]` 和 `.env.[mode].local` 规则。`--mode` 可以是任意非空名称；例如 `.env.game1` 也可以声明 `VITE_PLATFORM=wechat`。所有 `VITE_*` 值都是会进入客户端的公开字符串，不要放密钥。

Bun 会默认提前读取 `.env`，这会让其中的变量被 Vite 视为已有进程变量并覆盖 mode 文件。Bun 项目应在根目录保留脚手架生成的 `bunfig.toml`：

```toml
env = false
```

这只关闭 Bun 的自动 dotenv；Vite 仍按上述标准顺序加载全部 env 文件，shell 显式传入的变量仍具有最高优先级。

## 项目与原生配置

`pixifact.project.json` 使用 version 2，只保存 Pixifact 领域配置：

```json
{
  "version": 2,
  "name": "My Game",
  "scenes": {
    "main": "src/scenes/Main.scene"
  },
  "resourcePacks": ["chapter1", "common"],
  "remoteResourcePacks": {
    "common": "https://cdn.example.com/common"
  }
}
```

本地资源包目录固定为 `resources/<pack-name>/`。`remoteResourcePacks` 的 key 必须先出现在 `resourcePacks` 中，URL 必须是 HTTPS；远程包只进入 Pixi manifest，不写入构建产物。

微信原生模板位于：

```txt
platforms/wechat/game.json
platforms/wechat/project.config.json
```

Pixifact 把模板复制到产物，写入 `VITE_APP_ID`，并根据本地 resource pack 和代码分包生成 `subpackages`。源 `game.json` 不得自行声明 `subpackages`。

## 单一入口与 Assets

三个平台共享同一入口：

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

`createApplication()` 返回原生 PixiJS `Application`，只初始化平台、Canvas、renderer、输入和生命周期，不隐式调用 `Assets.init()`。应用应在合适时机初始化一次 manifest。

逻辑资源路径使用无前导 `/` 的项目相对路径。微信 fetch adapter 会在 PixiJS 首次读取分包路径前自动加载对应分包；业务代码不调用 `loadSubpackage()`，也不使用 Pixifact 专属资源加载 API。

平台专属开放能力直接从平台包导入，并用 Vite 常量分支保护；非目标 production build 会通过常量折叠和 tree-shaking 删除该分支。Pixifact 当前不提供分享、登录、广告或支付 facade。

## 代码分包

使用 Vite 8，在 `vite.config.ts` 的 `pixifact()` 中声明分包名和项目相对入口：

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

业务代码继续使用标准动态导入，模块导出及 TypeScript 类型推断保留：

```ts
// src/main.ts，在需要进入游戏时调用 enterGame()。
async function enterGame() {
  const { startGame } = await import('./game');
  await startGame();
}
```

微信构建自动先调用 `wx.loadSubpackage()`，再执行对应模块。并发导入共享下载和模块实例；下载失败时 `import()` 拒绝，再次导入可重试。资源加载与代码加载也共享同一个原生分包下载。

开启代码分包后，应用入口为 CommonJS `game.js`，分包入口为 `subpackages/<name>/game.js`，共享代码位于主包 `chunks/`，不会为每个分包复制一份引擎。代码与同名本地资源包合并成一个原生分包，`Assets` manifest 和资源路径沿用。

分包名使用字母、数字、连字符和下划线，并以字母或数字开头；入口必须位于项目内，同一入口不能分配给多个分包，也不能使用应用主入口。主包应通过字面量路径的 `import()` 加载分包入口，不能提前静态导入；分包之间不能直接引用代码，应由主包控制切换。未声明的动态模块及共享依赖由 Vite 放在主包中，需按需移出主包的模块应声明为代码分包入口。

Web 使用同一份业务代码及配置，保持 Vite 原生动态导入，不生成小游戏代码分包，也不引入 `wx`。`pixifact dev --mode wechat` 会追踪并重建分包源码及依赖。未配置 `codePackages` 时继续生成单个 IIFE 主脚本。

## 命令与产物

```bash
pixifact validate --mode wechat
pixifact build --mode wechat
pixifact dev --mode wechat
```

未传 `--mode` 时，`dev` 默认 `development`，`build` / `validate` 默认 `production`。小游戏 `dev` 使用 Vite build watch；修改已纳入项目的 Scene、配对脚本、资源或原生配置会触发重建。

默认输出是 `dist/wechat/`，可通过 Vite `build.outDir` 修改。产物包含主入口 `game.js`、原生配置、主包资源和 `subpackages/<pack>/`；配置代码分包时还包含主包共享 `chunks/`。微信检查 4 MiB 主包和 20 MiB 总包限制，代码分包也计入分包和总包报告；source map 与 `project.config.json` 不计入报告。

把 `dist/wechat/` 导入微信开发者工具即可调试。Pixifact 不负责上传、体验版、审核或发布。

## 支持边界

- 支持 PixiJS WebGL、Text、Graphics、Pixifact runtime 节点、触摸、前后台生命周期、本地资源、资源分包和 HTTPS 远程包。
- Scene 纹理支持 PNG、JPEG 和 WebP；拒绝 SVG、HTMLText 和 DOMContainer。
- 平台包顶层 import 不读取 `wx` 或注册生命周期；实际初始化发生在 `createApplication()`。
