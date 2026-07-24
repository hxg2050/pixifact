# Pixifact

Pixifact 是基于 PixiJS v8 的 Scene / UI / 轻场景语义层，面向 AI 可直接编辑的 `.scene` 工作流。

`pixifact` 包提供项目配置解析、runtime 节点、compiler API 和生成 Scene 的运行时支持。CLI 和项目脚手架分别由 `pixifact-cli`、`create-pixifact` 提供。

## 安装

```bash
bun add pixifact pixi.js
```

## 使用

```ts
import { parseSceneTemplate } from 'pixifact/compiler';
import { Group } from 'pixifact/runtime';
import { prepareSceneClass, scene } from 'pixifact/scene';
import { createWechatPixiApplication } from 'pixifact/platform/wechat';
```

`pixifact/compiler` 只包含解析、校验和生成 API。游戏运行时使用 `pixifact/runtime`、`pixifact/scene` 和具体平台入口，不要从 compiler 入口导入 Scene decorator 或运行时加载 API。

Compiler Scene 项目通常还会安装 CLI：

```bash
bun add -d pixifact-cli
```

然后校验和编译 `.scene` 文件：

```bash
pixifact scene validate --all
pixifact compile-scenes
```

声明 `targets.wechat` 后，可校验和构建微信小游戏：

```bash
pixifact validate --target wechat
pixifact build --target wechat
pixifact dev --target wechat
```

完整配置见仓库文档 [微信小游戏构建](https://github.com/hxg2050/pixifact/blob/main/docs/zh/wechat-minigame.md)。

## Scene 工作流

Pixifact 把项目相对 `.scene` 文件作为 source of truth。外部 Agent 直接编辑 `.scene` 源文件，然后运行校验和编译。

`.pixifact/generated/**` 等生成文件是构建产物，不要手写修改。

## 环境要求

- Bun
- PixiJS v8

桌面编辑器不包含在 npm runtime 包中。
