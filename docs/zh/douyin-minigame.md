# 抖音小游戏构建

状态：活跃
权威范围：Pixifact 抖音小游戏配置、Runtime、资源交付、校验和构建边界
上游文档：[./index.md](./index.md)、[../../README.md](../../README.md)
示例：[../../sample-projects/wechat-minigame-demo](../../sample-projects/wechat-minigame-demo)

Pixifact 抖音 target 面向抖音普通小游戏 JavaScript Runtime，不是 Unity 小游戏方案。它与 Web、微信共享 `.scene`、同名 Scene 脚本和游戏逻辑，平台差异集中在 `tt` API、入口、原生配置、资源 delivery 和包体规则。

Pixifact 只生成可直接导入抖音小游戏开发者工具的目录，不负责上传、预览版、审核或发布。

## 支持范围

- PixiJS WebGL 1 / WebGL 2 初始化和无 DOM Runtime adapter。
- 普通 `Text`、`Graphics`、Pixifact Runtime 节点和 compiler Scene。
- 抖音触摸事件到 Pixi pointer event 的桥接，触摸坐标使用 `screenX` / `screenY`。
- 前后台切换时停止和恢复 ticker，并在隐藏时取消活动触摸。
- 本地资源、抖音资源分包和 HTTPS 远程资源。
- development / production 构建、watch 开发模式和代码包体积检查。

首版不支持 SVG Scene 纹理、`HTMLText` 或 `DOMContainer`。抖音允许上传 SVG 不代表当前 PixiJS 无 DOM 图片链路支持 SVG。

## 项目配置

在 `pixifact.project.json` 中声明 `targets.douyin`，字段结构与微信 target 对齐。`platforms/douyin/game.json` 使用抖音的 `subPackages` 字段。

`platforms/douyin/project.config.json` 属于抖音开发者工具配置。仓库示例的 `appid` 是空占位，导入开发者工具前必须替换为项目的真实 AppID。

入口使用抖音平台 Runtime：

```ts
import 'pixifact:scenes';
import { createDouyinPixiApplication } from 'pixifact/platform/douyin';
```

## CLI

```bash
pixifact validate --target douyin
pixifact build --target douyin
pixifact build --target douyin --mode development
pixifact dev --target douyin
```

输出目录由 `targets.douyin.outDir` 决定，可直接导入抖音小游戏开发者工具。

## 资源交付

- 未放入资源包的 Scene 纹理复制到主包 `assets/`，文件名带内容 hash。
- `subpackage` 资源包复制到 `subPackages` 声明的目录，并在 Scene 首次准备时调用 `tt.loadSubpackage()`。
- `remote` 资源包映射到 HTTPS `baseUrl`。通过 `tt.request` 读取远程 JSON 时，还需要在抖音开放平台配置合法域名。
- 不要把同一资源放入多个重叠资源包。

## 包体规则

- 未配置分包：整体代码包不超过 20 MiB。
- 配置分包：主包不超过 4 MiB，整体代码包不超过 20 MiB，单个分包不超过 20 MiB。
- `project.config.json` 和 development source map 不计入 Pixifact 的包体报告。

## 验证

先运行仓库自动测试和示例构建，再把 `dist/douyin` 导入抖音开发者工具。至少验证启动、WebGL、中文 Text、纹理、触摸拖动、前后台恢复、本地 JSON、分包和远程资源；最终在 Android 和 iOS 真机各验证一次。
