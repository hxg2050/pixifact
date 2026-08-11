# @pixifact/platform-wechat

Pixifact 微信小游戏 PixiJS 平台适配器。

```bash
bun add @pixifact/platform-wechat
```

在 Vite 配置启用 `pixifact()`，并在 mode env 中声明：

```ini
VITE_PLATFORM=wechat
VITE_APP_ID=wx123456
```

游戏入口通过 `pixifact:platform` 使用统一 API：

```ts
import { createApplication } from 'pixifact:platform';

const app = await createApplication();
```

返回值是原生 PixiJS `Application`。包的顶层 import 不读取 `wx` 或执行平台初始化；Canvas、输入、生命周期和资源 adapter 在 `createApplication()` 时安装。资源继续使用 PixiJS `Assets`，分包在首次读取前自动加载。

完整配置见 [微信小游戏构建](https://github.com/hxg2050/pixifact/blob/main/docs/zh/wechat-minigame.md)。
