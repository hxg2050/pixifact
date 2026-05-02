# pixif

pixif 是一个基于 PixiJS v8 的轻量 TypeScript 封装，目标是为 Pixi 场景提供更接近 UI/游戏对象的开发模型。

它保留 PixiJS 的渲染能力，同时补充了 `GameObject`、`Group`、组件生命周期、布局组件和 DOM 输入组件，适合构建交互式 2D 场景、工具界面和轻量 UI。

[English](./README.en.md)

## 特性

- 基于 PixiJS v8，支持 Pixi 的 `Application`、`Container`、`Graphics`、`Text`、纹理等生态。
- 提供 `GameObject.instantiate()` 创建和挂载对象。
- 使用 `Group` 作为唯一容器节点，叶子节点不再承担子节点管理职责。
- `Application` 统一驱动需要更新的对象和组件，避免每个对象直接注册全局 ticker。
- 提供 `Layout`、`GridLayout`、`FlexGroup` 等布局能力。
- 提供 `Button`、`ScrollView`、`Input`、`Textarea` 等 UI 组件。
- 提供 Rollup 构建、Vitest 测试和 Vite 示例。

## 安装

```bash
pnpm add pixif pixi.js
```

如果在当前仓库内开发：

```bash
pnpm install
```

## 快速开始

```ts
import {
    Application,
    GameObject,
    Graphics,
    Group,
    Label,
    LabelStyle,
    Layout,
} from 'pixif';

const app = new Application();

await app.init({
    resizeTo: window,
    backgroundColor: 0xf4f0e6,
    antialias: true,
});

document.body.append(app.canvas);

const stage = app.root;

const panel = GameObject.instantiate(Group, stage, {
    width: 360,
    height: 220,
    anchorX: 0.5,
    anchorY: 0.5,
});

panel.addComponent(Layout, {
    centerX: 0,
    centerY: 0,
});

GameObject.instantiate(Graphics, panel)
    .roundRect(0, 0, panel.width, panel.height, 12)
    .fill(0xffffff)
    .stroke({ width: 1, color: 0x2f3437, alpha: 0.18 });

GameObject.instantiate(Label, panel, {
    value: 'Hello pixif',
    x: 24,
    y: 24,
    style: new LabelStyle({
        fill: 0x23272a,
        fontSize: 24,
        fontWeight: '700',
    }),
});
```

## 核心概念

### Application

`Application` 继承自 PixiJS `Application`，初始化后会创建 `app.root` 作为 pixif 的根 `Group`。

对象只有挂载到 `app.root` 这棵树上，并且自身或组件需要 `update` 时，才会被 `app.ticker` 驱动。

### GameObject

`GameObject` 是 pixif 的基础对象模型，负责：

- 维护 Pixi display 对象。
- 同步位置、缩放、旋转、透明度等常用属性。
- 管理组件。
- 派发添加、移除、尺寸变化、位置变化和 ticker 事件。

推荐通过 `GameObject.instantiate()` 创建对象：

```ts
const group = GameObject.instantiate(Group, app.root, {
    x: 100,
    y: 80,
    width: 200,
    height: 120,
});
```

### Group 和叶子节点

`Group` 是当前唯一的容器节点，用于挂载子对象。

`Graphics`、`Label`、`Image`、`NineSliceImage` 等是叶子节点，负责具体渲染，不提供子节点管理能力。

复杂 UI 可以写成 `Group` 子类，并在 `render()` 中组装内部子树。`GameObject.instantiate()` 会先应用传入 props，再调用 `render()`，因此内部结构可以读取初始化参数：

```ts
class UserCard extends Group {
    title = '';
    titleLabel!: Label;

    render() {
        this.titleLabel = GameObject.instantiate(Label, this, {
            value: this.title,
        });
    }
}

const card = GameObject.instantiate(UserCard, stage, {
    title: 'pixif',
    width: 240,
    height: 80,
});
```

### Component

组件可以挂载到 `GameObject` 上：

```ts
import { Component, Group } from 'pixif';

class Spinner extends Component<Group> {
    speed = 0.02;

    update(dt: number) {
        this.gameObject.rotation += this.speed * dt;
    }
}

group.addComponent(Spinner);
```

组件的 `start()` 会在首次 `update()` 前执行一次；`update()` 会在对象挂载到 `Application.root` 后由 `app.ticker` 统一驱动。

## 布局

### Layout

`Layout` 用于相对父级定位，支持居中、贴边和拉伸：

```ts
panel.addComponent(Layout, {
    centerX: 0,
    centerY: 0,
});
```

```ts
child.addComponent(Layout, {
    left: 20,
    right: 20,
    top: 10,
    bottom: 10,
    minWidth: 80,
    minHeight: 40,
});
```

### GridLayout

`GridLayout` 用于网格排列子节点：

```ts
grid.addComponent(GridLayout, {
    col: 3,
    gridWidth: 120,
    gridHeight: 80,
    gapHorizontal: 16,
    gapVertical: 16,
});
```

### FlexGroup

`FlexGroup` 用于弹性排列子节点，适合横向或纵向列表。

## UI 组件

### Button

`Button` 是一个可交互按钮，支持文字、默认图形背景、可选九宫格纹理、禁用状态和按压缩放反馈：

```ts
const button = GameObject.instantiate(Button, panel, {
    x: 24,
    y: 150,
    width: 130,
    height: 42,
    value: 'Confirm',
});

button.emitter.on('tap', () => {
    console.log('clicked');
});
```

按压缩放只作用于按钮内部视觉容器，按钮自身的布局尺寸和命中区域保持不变。

### Input / Textarea

`Input` 和 `Textarea` 使用真实 HTML 元素承载输入，再把 DOM 元素同步到 Pixi canvas 的位置上。

```ts
const input = GameObject.instantiate(Input, form, {
    x: 18,
    y: 88,
    width: 174,
    height: 44,
    fontSize: 16,
});

input.value = 'pixif';
```

注意：

- 输入组件需要与目标 canvas 对齐，默认使用页面中的第一个 `canvas`。
- 如页面中存在多个 canvas，可通过 `canvas` 属性指定。
- DOM 输入组件会监听窗口 resize 和 scroll 来刷新位置。
- 当前实现保留自维护 DOM overlay，没有迁移到 PixiJS v8 experimental `DOMContainer`。

### ScrollView

`ScrollView` 是一个可滚动容器，内部暴露 `content` 节点用于挂载内容：

```ts
const scroll = GameObject.instantiate(ScrollView, stage, {
    width: 720,
    height: 480,
});

GameObject.instantiate(Label, scroll.content, {
    value: 'Scrollable content',
});

scroll.refreshContentHeight();
```

支持滚轮和拖拽滚动，并提供 `scrollY`、`maxScrollY`、`scrollTo()`、`scrollBy()`、`refreshContentHeight()`。

## 示例

运行基础示例：

```bash
pnpm example
```

构建基础示例：

```bash
pnpm example:build
```

示例代码位于：

```text
examples/basic/src/main.ts
```

## Codex Skills

pixif 的 npm 包会随包发布项目专用 Codex skill：

```text
skills/pixif-framework
```

未 clone 仓库时，可直接从 npm 包安装到当前用户的 Codex skills 目录：

```bash
npm exec --package pixif -- pixif-skills --replace
```

如果 pixif 已作为当前项目依赖安装：

```bash
pnpm exec pixif-skills --replace
```

在 pixif 源码仓库内开发时：

```bash
pnpm skills:install
```

默认安装目标是 `${CODEX_HOME:-$HOME/.codex}/skills`。如需安装到其他目录：

```bash
node scripts/install-skills.mjs --target /path/to/skills --replace
```

安装后可以在 Codex 中使用 `$pixif-framework`，用于处理 pixif 的组件、布局、示例、测试和发布入口等项目约定。

## 开发脚本

```bash
pnpm test
```

运行 Vitest 测试。

```bash
pnpm build
```

使用 Rollup 构建 `dist`。

```bash
pnpm example
```

启动 Vite 示例。

```bash
pnpm skills:install
```

从源码仓库安装当前维护的 Codex skills。

```bash
pnpm example:build
```

构建示例项目。

## 包入口

```ts
import { Application, GameObject, Group } from 'pixif';
import { Button, Input, ScrollView, Textarea } from 'pixif/ui';
import { Layout, GridLayout } from 'pixif/core';
```

当前导出入口：

- `pixif`
- `pixif/core`
- `pixif/ui`

## 许可证

MIT
