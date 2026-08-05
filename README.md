# Pixifact

Pixifact 是面向 AI 完整游戏开发的 Scene / UI / 轻场景与项目资产管理层。PixiJS 是底层渲染实现，Pixifact 对外提供 `.scene` 源文件、校验、编译、预览和运行时加载能力。

Codex、Claude Code 等外部 coding agent 是主要 AI 入口。Pixifact CLI 帮助 Agent 理解、修改、校验和编译 Scene；浏览器 Editor 位于 `apps/editor/`，用于预览、资产浏览、Inspector 和人工微调。

Pixifact 只专注提供 AI 可操作的 Scene 能力。Agent 编排、Git 分支 / commit / revert、任务管理、CI、PR 和长期项目管理交给外部专业工具。

[English](./README.en.md)

## 从哪里开始读

- [文档入口](./docs/zh/index.md)：按工作场景查找当前中文文档。
- [Layout](./docs/zh/layout.md)：设计分辨率、视口适配、frame layout、编辑器布局对齐。
- [Agent Scene Authoring](./docs/zh/agent-scene-authoring.md)：外部 Agent 如何编辑 `.scene`。
- [Agent Runtime](./docs/zh/runtime-agent.md)：外部 Agent 如何观察和操作运行中的 Vite Web 游戏。
- [微信小游戏构建](./docs/zh/wechat-minigame.md)：游戏项目的微信 target、平台 runtime、资源分包和构建产物。
- [内部文档](./internal-docs/index.md)：仓库维护、测试、发布、计划和历史规格。

## npm 快速开始

Pixifact 当前发布包：

- `pixifact`：runtime 扩展、项目配置和 compiler API。
- `pixifact-cli`：Bun-first Scene 自动化 CLI。
- `create-pixifact`：Bun-first 项目脚手架。

创建新项目：

```bash
bun create pixifact my-game
cd my-game
bun install
bun run build
```

在已有 Bun 项目中使用 runtime 和 compiler：

```bash
bun add pixifact pixi.js
bun add -d pixifact-cli
```

常用 CLI：

```bash
pixifact scene validate --all
pixifact compile-scenes
pixifact editor
```

构建微信小游戏：

```bash
pixifact validate --target wechat
pixifact build --target wechat
pixifact dev --target wechat
```

当前 `pixifact-cli` 和 `create-pixifact` 都是 Bun-first 工具，需要本机安装 Bun。

## 核心心智

Pixifact 使用 Godot-style 统一 `Scene` 资产，不做 Unity 式 Scene + Prefab 双资源体系。

当前 Agent authoring 主路径是 compiler `.scene`：

```txt
Codex / Claude Code -> inspect .scene -> edit .scene -> scene validate -> compile-scenes -> repair until valid
```

Editor 是能力增强：提供当前打开 Scene、当前选中节点、预览和资产上下文。没有 Editor 时，Agent 仍然可以通过文件编辑和 CLI 完整开发。

`.scene` 是源文件，生成的 TypeScript 是构建产物：

```txt
.scene = source of truth
同目录同 basename 的 .ts = 行为脚本与公开契约
.pixifact/generated = compiler 输出，不手写
```

一个 Scene 资产通常由同目录同名文件组成，例如 `src/scenes/Hud.scene` 与 `src/scenes/Hud.ts`。`.scene` 保存视觉结构、层级、布局、图片、文字、子 Scene 实例、slot 和事件绑定；`.ts` 保存行为、运行时状态更新、公开 `@prop` / `@event` / `@slot` 和 `@part` 访问。

## Scene 示例

下面是一个面向竖屏移动端的典型 Scene 结构。项目设计分辨率由 `pixifact.project.json` 的 `resolution` 决定；未配置时默认是 `750 x 1334`。

```xml
<Scene name="Main" width="750" height="1334">
  <Image id="background" texture="assets/bg/forest.png" left="0" right="0" top="0" bottom="0" fit="cover" />
  <Hud id="hud" scene="./Hud.scene" left="0" right="0" top="0" height="188" />
  <InventoryPanel id="inventoryPanel" scene="./InventoryPanel.scene" horizontal="0" top="252" width="690" height="650" />
  <BottomMenu id="bottomMenu" scene="./BottomMenu.scene" left="0" right="0" bottom="0" height="154" />
</Scene>
```

布局属性是通用协议，不要求每个 Scene 脚本都声明 `@prop`：

- `left` / `right` / `horizontal` 负责横向定位。
- `top` / `bottom` / `vertical` 负责纵向定位。
- `left + right` 或 `top + bottom` 表示在该轴上拉伸。
- `width` / `height` 仍表示节点自身盒子尺寸。

详细规则见 [Layout](./docs/zh/layout.md)。

## Runtime 节点

Pixifact runtime 从 `pixifact/runtime` 导出当前官方基础节点：

- `Group`：Pixifact 盒子尺寸容器，也是 Scene 根节点的基础心智。
- `Control`：继承 `Group` 的布局基础类型，承载 `left/right/top/bottom/horizontal/vertical`。
- `Label`：带独立布局盒的 UI 文本控件，宽高、字号和整体缩放语义分离。
- `BitmapLabel`：使用 PixiJS bitmap font 渲染、同时保留独立布局盒的文本控件。
- `Rect`：绘制矩形、圆角矩形、填充和边框，不作为容器。
- `Image`：普通图片盒子，支持 `stretch`、`contain`、`cover`、`none`。
- `NineImage`：九宫格图片，用于可缩放 UI 背板。
- `TileImage`：平铺图片，用于重复背景或纹理。
- `HBoxContainer` / `VBoxContainer`：横向 / 纵向顺序排列容器。
- `GridContainer`：固定列数网格容器。
- `ScrollContainer`：可拖拽滚动容器，支持弹性和惯性。

PixiJS 原生 `Container` 语义保持不变，尤其是 `width` / `height` 的 bounds / scale 语义。需要 Pixifact 盒子尺寸和 authoring 容器心智时使用 `Group` 或继承自 `Group` 的 runtime 节点。

`.scene` 中可以直接使用的官方对象、通用属性、对象专属属性和示例见 [Scene Objects](./docs/zh/scene-objects.md)。

## Editor

浏览器 Editor 由 `pixifact editor` 启动。CLI 在当前项目上启动仅绑定 `127.0.0.1` 的 Bun 服务并打开系统浏览器；`.scene` 始终是 source of truth，Pinia 只保存 UI 状态。

当前第一条可用闭环：

- 固定三栏展示当前 Scene 的可编辑层级、长驻 Pixi Canvas 和 schema-driven Inspector。
- 层级支持添加、复制、删除，以及拖拽节点行调整同级顺序或更换父节点；每次操作自动保存并可 Undo / Redo。
- 结构变化只替换 Scene 预览 root，Pixi Application 和 Canvas 保持长驻。
- Inspector 输入时原地更新运行时节点，不重建 Pixi Application 或 Canvas。
- 失焦或 Enter 后自动写回 `.scene`，Undo / Redo 后也会自动保存。
- 写入携带文件版本；外部修改导致版本不一致时显示同步冲突，不静默覆盖。
- 资产面板只索引项目内已有的 `.scene` 和图片，不提供图片导入或源资源编辑。

在目标项目根目录启动：

```bash
pixifact editor
```

维护本仓库时使用：

```bash
bun install
bun run editor
```

## CLI

CLI 是外部 Agent 操作 Pixifact 项目的主入口。Pixifact 不把内置聊天或内置模型服务作为主要 AI 路径。

常用命令：

```bash
pixifact summary
pixifact scene inspect --scene src/scenes/Button.scene
pixifact scene validate --scene src/scenes/Button.scene
pixifact scene validate --all
pixifact compile-scenes
```

默认项目根目录是当前工作目录；不在项目根目录运行时再加 `--project-root <path>`。小范围改动可以校验单个 `.scene`；批量改动或不确定影响范围时使用 `scene validate --all` 校验所有 compiler Scene。

Editor 运行且 Scene 已同步时，外部 Agent 可以读取当前 Scene 和选择：

```bash
pixifact editor context
pixifact editor screenshot --output /tmp/scene.png
```

`context` 返回项目、Scene revision、同步状态和当前 selection；`screenshot` 将当前 ready 的 Authoring Scene 以设计尺寸写为 PNG，不包含 Editor UI，也不受画布缩放和平移影响。两者都不修改 `.scene` 或执行项目 runtime。Agent 仍然直接修改 `.scene`，再运行文件校验命令。旧 `live ...` 命令和固定端口 bridge 已删除。

## Agent Runtime

Vite Web 游戏可以选择启用开发期 Runtime，让外部 Agent 不依赖浏览器工具读取真实 PixiJS 节点树、显式业务状态和日志，并通过 renderer 坐标或键盘操作游戏：

```bash
pixifact runtime list
pixifact runtime tree --output .pixifact/runtime/tree.json
pixifact runtime state
pixifact runtime logs --after 42
pixifact runtime input click --x 640 --y 360
```

游戏只需在 Vite 配置加入 `pixifactRuntimePlugin`，并在开发启动后调用一次 `registerPixiRuntime(app, { getState? })`。Runtime 直接遍历 `app.stage`，不建立 Scene Instance 树，不提供 eval 或状态 mutation，也不接入 Editor Authoring Preview。完整接入和边界见 [Agent Runtime](./docs/zh/runtime-agent.md)。

## 项目资产边界

Pixifact Editor 提供项目资产浏览、轻量预览、资源引用和校验，但不负责资源编辑。

- `.scene` 文件在 Editor 内打开、预览和轻量编辑。
- 图片、音频、字体、数据文件等资源可以轻量预览，用于确认内容和引用路径。
- 双击具体资源时调用系统默认程序打开。
- 脚本文件不在 Editor 内编辑；打开脚本时调用外部代码编辑器。
- Codex / Claude Code 仍负责完整游戏代码开发，Pixifact 负责 Scene、UI、轻场景和资源引用这层可视化资产。

## Package 入口

```ts
import { createSceneRevision, parseSceneTemplate } from 'pixifact/compiler';
import { Group, Control, Rect, Image, HBoxContainer } from 'pixifact/runtime';
import { registerPixiRuntime } from 'pixifact/runtime-dev';
import { prepareSceneClass, scene } from 'pixifact/scene';
import { createWechatPixiApplication } from 'pixifact/platform/wechat';
import { parsePixifactProjectConfig } from 'pixifact';
```

根入口 `pixifact` 导出项目配置、runtime 扩展和常用错误提示；Scene decorator、事件、slot、异步准备和资源加载从 `pixifact/scene` 导出；compiler API 通过 `pixifact/compiler` 导出；微信平台 runtime 从 `pixifact/platform/wechat` 导出。

## 仓库目录

```txt
packages/pixifact/              核心 Pixifact 包，包名为 pixifact
packages/pixifact/src/runtime/  Pixifact runtime 扩展节点
packages/pixifact/src/scene/    Scene 运行时公开入口
packages/pixifact/src/platform/ 游戏目标平台 runtime
packages/pixifact/src/project/  pixifact.project.json 解析和项目摘要
packages/pixifact/src/compiler/ compiler .scene 解析、校验、生成
packages/pixifact-cli/          Pixifact CLI 与浏览器 Editor 本地服务
apps/editor/                    Pixifact 浏览器 Editor Vue / Vite 前端
tests/                          单元测试、编辑器测试、CLI 测试
skills/                         本仓库维护的 Codex skills
```

## 验证

优先运行最小相关验证。

```bash
bun run test
```

编辑器相关改动：

```bash
bun run editor:typecheck
bun run editor:frontend:build
```

runtime 或导出 API 改动：

```bash
bun run build
```

项目级测试策略见 [internal-docs/testing/TESTING.md](./internal-docs/testing/TESTING.md)。

## Codex Skills

仓库维护的 Codex skill 位于：

```txt
skills/pixifact
```

源码仓库内安装：

```bash
bun run skills:install
```

从已发布包安装将由后续独立的 `pixifact-skills` 包提供；当前公开 npm 包只包含 runtime、CLI 和项目脚手架。

## 许可证

MIT
