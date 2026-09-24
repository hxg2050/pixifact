# Pixifact

Pixifact 是面向 AI 完整游戏开发的 Scene / UI / 轻场景与项目资产管理层。PixiJS 是底层渲染实现，Pixifact 对外提供 `.scene` 源文件、校验、编译、预览和运行时加载能力。

Codex、Claude Code 等外部 coding agent 是主要 AI 入口。Pixifact CLI 帮助 Agent 理解、修改、校验和编译 Scene；浏览器 Editor 位于 `apps/editor/`，用于预览、资产浏览、Inspector 和人工微调。

Pixifact 只专注提供 AI 可操作的 Scene 能力。Agent 编排、Git 分支 / commit / revert、任务管理、CI、PR 和长期项目管理交给外部专业工具。

[English](./README.en.md)

可玩的 Web 竖屏示例见 [追星九宫格](./sample-projects/star-game-demo/README.md)；固定 Agent 开发任务见 [评测协议](./internal-docs/testing/AGENT_GAME_EVAL.md)。

## 从哪里开始读

- [文档入口](./docs/zh/index.md)：按工作场景查找当前中文文档。
- [Layout](./docs/zh/layout.md)：设计分辨率、视口适配、frame layout、编辑器布局对齐。
- [Agent Scene Authoring](./docs/zh/agent-scene-authoring.md)：外部 Agent 如何编辑 `.scene`。
- [Agent Runtime](./docs/zh/runtime-agent.md)：外部 Agent 如何观察和操作运行中的 Vite Web 游戏。
- [微信小游戏构建](./docs/zh/wechat-minigame.md)：Vite mode、可选平台包、资源分包和构建产物。
- [抖音小游戏构建](./docs/zh/douyin-minigame.md)：Vite mode、可选平台包、资源分包和构建产物。
- [内部文档](./internal-docs/index.md)：仓库维护、测试、发布、计划和历史规格。

## npm 快速开始

Pixifact 当前发布包：

- `pixifact`：runtime 扩展、项目配置和 compiler API。
- `@pixifact/platform-wechat`：按需安装的微信小游戏 PixiJS adapter。
- `@pixifact/platform-douyin`：按需安装的抖音小游戏 PixiJS adapter。
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
bun add -d pixifact-cli vite
```

常用 CLI：

```bash
pixifact scene create src/scenes/Hud.scene
pixifact scene validate --all
pixifact compile-scenes
pixifact editor
```

构建微信小游戏：

```bash
bun add @pixifact/platform-wechat
pixifact validate --mode wechat
pixifact build --mode wechat
pixifact dev --mode wechat
```

构建抖音小游戏：

```bash
bun add @pixifact/platform-douyin
pixifact validate --mode douyin
pixifact build --mode douyin
pixifact dev --mode douyin
```

平台由标准 Vite mode env 文件中的 `VITE_PLATFORM` 选择，小游戏 AppID 来自 `VITE_APP_ID`。Web、微信和抖音共享 `src/main.ts`；资源统一通过 PixiJS `Assets` 加载。

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

- 四栏依次展示项目公共资产、当前 Scene 层级、长驻 Pixi Canvas 和 schema-driven Inspector；资产栏从顶栏下方延伸到底部，Scene 标签只占右侧编辑区域。侧栏可拖动调宽或收起，设置位于资产面板底部。
- 界面采用 macOS 风格的系统字体与控件层次；可在设置中选择跟随系统、浅色或深色外观，默认深色，偏好保存在当前项目中。
- 层级支持搜索节点、按类别添加、复制、删除，以及拖拽节点行调整同级顺序或更换父节点；右键节点可打开添加、复制、粘贴、删除菜单，容器末尾添加子节点，非容器在同级后方添加；操作可 Undo / Redo。
- 画布显示 Scene 设计尺寸与缩放比例；Inspector 将变换、布局、节点属性和低频显示属性分组，布局控制的字段会提示对应约束。
- 结构变化只替换 Scene 预览 root，Pixi Application 和 Canvas 保持长驻。
- Inspector 输入时原地更新运行时节点，不重建 Pixi Application 或 Canvas。
- Inspector 失焦或按 Enter 后提交当前编辑；默认显示“未保存”，通过顶部“保存”或 Ctrl/Cmd+S 写回 `.scene`。
- 左侧栏底部“设置”可开启自动保存；设置保存在当前项目的 Editor UI 状态中，默认关闭。开启时会保存已有未保存修改，此后编辑和 Undo / Redo 会自动写回。
- 一个 Editor 可打开多个 Scene 标签；切换时各自保留未保存修改、Undo / Redo、选择和画布视图。关闭未保存标签时可保存、放弃或取消；刷新页面会提示未保存修改。
- 标签列表和活动标签保存在项目 Editor UI 状态中，刷新后从磁盘重新打开；未保存草稿不会跨页面恢复。
- 写入携带文件版本；外部修改干净标签时自动更新，脏标签保留草稿，保存遇到版本冲突时可比较、覆盖或放弃草稿。
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
pixifact scene create src/scenes/Button.scene
pixifact scene inspect --scene src/scenes/Button.scene
pixifact scene validate --scene src/scenes/Button.scene
pixifact scene validate --all
pixifact compile-scenes
```

默认项目根目录是当前工作目录；不在项目根目录运行时再加 `--project-root <path>`。小范围改动可以校验单个 `.scene`；批量改动或不确定影响范围时使用 `scene validate --all` 校验所有 compiler Scene。

检查任意 Scene 的静态画面不需要启动 Editor 或运行游戏：

```bash
pixifact scene screenshot --scene src/scenes/Button.scene --output /tmp/button.png
```

命令从磁盘读取 `.scene`、配对脚本接口和项目资源，使用与 Editor 相同的 Authoring Preview 输出设计尺寸 PNG；它需要本机安装 Google Chrome，但不会打开 Editor 窗口或执行项目脚本。

Editor 运行且 Scene 已同步时，外部 Agent 可以读取当前 Scene 和选择：

```bash
pixifact editor context
pixifact editor screenshot --output /tmp/scene.png
```

`context` 返回项目、当前 Scene revision、selection，以及全部打开标签的路径和同步状态；当前 Scene 未同步时仍拒绝返回 context。`screenshot` 将当前 ready 的 Authoring Scene 以设计尺寸写为 PNG，不包含 Editor UI，也不受画布缩放和平移影响。两者都不修改 `.scene` 或执行项目 runtime。Agent 仍然直接修改 `.scene`，再运行文件校验命令。旧 `live ...` 命令和固定端口 bridge 已删除。

## Agent Runtime

Vite Web 游戏可以选择启用开发期 Runtime，让外部 Agent 不依赖浏览器工具读取真实 PixiJS 节点树、显式业务状态和日志，并通过 renderer 坐标或键盘操作游戏：

```bash
pixifact runtime list
pixifact runtime tree --output .pixifact/runtime/tree.json
pixifact runtime screenshot
pixifact runtime state
pixifact runtime logs --after 42
pixifact runtime input click --x 640 --y 360
```

游戏只需在 Vite 配置加入 `pixifactRuntimePlugin`，并在开发启动后调用一次 `registerPixiRuntime(app, { getState? })`。Runtime 直接遍历 `app.stage`，不建立 Scene Instance 树，不提供 eval 或状态 mutation，也不接入 Editor Authoring Preview。`runtime screenshot` 默认将当前 Pixi Canvas 保存到项目根下的 `.pixifact/runtime/frame.png`，也可通过 `--output <png-path>` 覆盖；截图不包含浏览器 UI 或 HTML/CSS。完整接入和边界见 [Agent Runtime](./docs/zh/runtime-agent.md)。

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
import { pixifact } from 'pixifact/compiler-node';
import { createApplication } from 'pixifact:platform';
import manifest from 'pixifact:assets';
import { parsePixifactProjectConfig } from 'pixifact';
```

根入口 `pixifact` 导出项目配置、runtime 扩展和常用错误提示；Scene decorator、事件、slot 和异步准备从 `pixifact/scene` 导出；compiler API 通过 `pixifact/compiler` 导出。Vite 配置使用 `pixifact()`；业务入口通过虚拟模块 `pixifact:platform` 和 `pixifact:assets` 获取当前平台 Application 与 Pixi manifest。

## 仓库目录

```txt
packages/pixifact/              核心 Pixifact 包，包名为 pixifact
packages/platform-wechat/       可选微信小游戏平台包
packages/platform-douyin/       可选抖音小游戏平台包
packages/pixifact/src/runtime/  Pixifact runtime 扩展节点
packages/pixifact/src/scene/    Scene 运行时公开入口
packages/pixifact/src/platform/ Web 与小游戏公共 runtime
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
