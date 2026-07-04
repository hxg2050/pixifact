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
```

Compiler Scene 项目通常还会安装 CLI：

```bash
bun add -d pixifact-cli
```

然后校验和编译 `.scene` 文件：

```bash
pixifact scene validate --all
pixifact compile-scenes
```

## Scene 工作流

Pixifact 把项目相对 `.scene` 文件作为 source of truth。外部 Agent 直接编辑 `.scene` 源文件，然后运行校验和编译。

`.pixifact/generated/**` 等生成文件是构建产物，不要手写修改。

## 环境要求

- Bun
- PixiJS v8

桌面编辑器不包含在 npm runtime 包中。
