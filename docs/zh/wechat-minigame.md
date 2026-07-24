# 微信小游戏构建

状态：活跃  
权威范围：Pixifact 游戏项目的微信小游戏配置、运行时、资源交付、校验和构建边界  
上游文档：[./index.md](./index.md)、[../../README.md](../../README.md)  
示例：[../../sample-projects/wechat-minigame-demo](../../sample-projects/wechat-minigame-demo)  
更新规则：微信 target 配置、CLI、平台 runtime、支持矩阵或构建产物变化时更新

[English](../en/wechat-minigame.md)

Pixifact 把微信小游戏作为游戏项目的一等构建目标。同一份 `.scene`、同名 Scene 脚本和游戏逻辑可以同时用于 Web 与微信；平台差异集中在入口、PixiJS adapter、资源 delivery 和原生配置中。

最终产物是一个可直接导入微信开发者工具的目录。Pixifact 不负责上传代码、生成体验版、提交审核或发布。

## 支持范围

当前微信 target 提供：

- PixiJS WebGL 1 / WebGL 2 初始化和无 DOM runtime adapter。
- 普通 `Text`，包括中文文字；真机没有 `Intl` 时，构建产物会让 PixiJS 使用自身的字符分段降级路径。
- `Graphics`、Pixifact runtime 节点和 compiler Scene。
- 微信触摸事件到 PixiJS pointer event 的桥接，包括拖动所需的 `globalpointermove`。
- 前后台切换时停止和恢复 ticker，并在隐藏时取消活动触摸。
- 本地资源、微信资源分包和 HTTPS 远程资源。
- development / production 构建、watch 开发模式和代码包体积检查。

当前明确不支持：

- SVG 资源。构建不会自动转换 SVG，项目应在源资产阶段提供 PNG、JPEG 或 WebP。
- `HTMLText`。
- `DOMContainer`。

Scene 纹理支持 `.png`、`.jpg`、`.jpeg` 和 `.webp`。target 校验会在构建前报告不支持的节点、纹理和资源包内容。

普通中文、拉丁文字和单码点字符不依赖 `Intl`。当真机没有 `Intl.Segmenter` 时，PixiJS 会按 Unicode 码点拆分文字；如果游戏依赖由多个码点组成的 emoji 或组合字符精确换行，应在目标真机上验证排版。

## 项目配置

在 `pixifact.project.json` 中声明资源包和微信 target：

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

字段含义：

| 字段 | 含义 |
| --- | --- |
| `entry` | 微信小游戏 TypeScript 入口 |
| `configDir` | 原生 `game.json` 和 `project.config.json` 所在目录 |
| `outDir` | 可导入微信开发者工具的构建目录，不能是项目根或包含项目输入文件 |
| `resourcePacks` | 每个项目资源包在微信目标上的 delivery |
| `subpackage.root` | 输出目录内的微信资源分包根目录 |
| `remote.baseUrl` | HTTPS CDN 基础地址，不带末尾 `/` |

项目没有资源包时，`resourcePacks` 使用空对象。target 中引用的每个名字都必须先在顶层 `resourcePacks` 中声明；顶层声明的每个资源包也必须选择微信 delivery。

`platforms/wechat/game.json` 中的分包名和 root 必须与 target 一致：

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

`project.config.json` 属于微信开发者工具配置。正式项目应填写自己的 AppID；示例使用 `touristappid`。

## Scene 与入口

Scene 脚本从运行时专用入口导入 decorator：

```ts
import { scene } from 'pixifact/scene';
import { Group } from 'pixifact/runtime';

@scene()
export class Main extends Group {}
```

游戏实例化 Scene 之前必须异步准备它。准备过程会先准备嵌套 Scene，再加载目标 manifest 中的纹理：

```ts
import { prepareSceneClass } from 'pixifact/scene';
import { Main } from './scenes/Main';

await prepareSceneClass(Main);
const scene = new Main();
```

微信入口先导入生成的 Scene registry，再创建平台 Application：

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

`createWechatPixiApplication()` 返回 `stage`、`renderer`、`ticker`、`screen`、`canvas`、`start()`、`stop()` 和 `destroy()`。游戏共享逻辑不应直接依赖 `wx`；把平台启动和平台 API 留在 `src/wechat` 边界内。

## 资源交付

`compile-scenes` 生成逻辑资源 ID 清单，Web 和微信构建分别把这些 ID 映射到平台 URL：

- 未放入资源包的 Scene 纹理复制到微信主包 `assets/`，文件名带内容 hash。
- `subpackage` 资源包完整复制到指定分包。Scene 首次准备该包内纹理时会先调用 `wx.loadSubpackage()`。
- `remote` 资源包不复制到代码包，Scene 纹理映射到 `baseUrl`。CDN 域名还需要在微信公众平台配置合法域名。
- JSON、音频等非 Scene 资源也可以放入资源包。代码手动读取分包资源前，应先调用 `loadWechatSubpackage(name)`。

例如：

```ts
import {
  fetchWechatResource,
  loadWechatSubpackage,
} from 'pixifact/platform/wechat';

await loadWechatSubpackage('chapter1');
const level = await fetchWechatResource('subpackages/chapter1/level.json')
  .then((response) => response.json());
```

不要把同一资源放入多个嵌套或重叠资源包，否则资源 delivery 会产生歧义。

## CLI

先做目标校验：

```bash
pixifact validate --target wechat
```

生产构建默认压缩：

```bash
pixifact build --target wechat
```

需要可读代码和 source map 时：

```bash
pixifact build --target wechat --mode development
```

开发时持续监听项目变化并重建：

```bash
pixifact dev --target wechat
```

`dev` 固定使用 development mode。微信开发者工具直接导入 `targets.wechat.outDir`，并开启其文件变化监听即可。

## 构建产物

典型输出：

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

production 不生成 `game.js.map`。builder 会检查：

- 主包不超过 4 MiB。
- 全部代码包合计不超过 20 MiB。

报告按实际输出文件计算，source map 和 `project.config.json` 不计入代码包大小。超限时构建失败，并报告主包、各分包和总包字节数。

## 示例

仓库示例位于 `sample-projects/wechat-minigame-demo`，覆盖共享 `.scene`、普通中文 `Text`、`Graphics`、`ScrollContainer`、触摸输入和资源分包：

```bash
cd sample-projects/wechat-minigame-demo
bun run dev
bun run build:web
bun run validate:wx
bun run build:wx
bun run dev:wx
```

Web 产物位于 `dist/web`，微信产物位于 `dist/wechat`，两个目标互不清理。
