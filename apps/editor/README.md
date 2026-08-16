# Pixifact Browser Editor

`apps/editor` 是 Pixifact 浏览器 Editor 的 Vue 3 / Vite 前端。用户在项目根目录运行 `pixifact editor`，CLI 启动只绑定 `127.0.0.1` 的本地 Bun 服务并打开系统浏览器。

Editor 用于打开和预览 compiler `.scene`、浏览项目内已有 Scene 与图片、通过 Inspector 人工微调属性。`.scene` 文件始终是 Editor、compiler 和外部 Agent 共享的 source of truth。

## 启动

维护本仓库时在根目录运行：

```bash
bun install
bun run editor
```

下游项目安装 Pixifact CLI 后，在项目根目录直接运行：

```bash
pixifact editor
```

一个项目只注册一个 Editor Host，一个 Host 同时只接受一个浏览器 Editor 页面；不提供欢迎页、项目选择器或跨项目状态。

## 当前结构

- `src/EditorApp.vue`：固定三栏工作区、Scene 打开、手动刷新、Undo / Redo 和同步状态。
- `src/document/SceneDocument.ts`：Scene template、Command Stack、自动保存和文件版本。
- `src/panels/`：层级、资产与 Inspector。
- `src/preview/`：长驻 Pixi Application、运行时 Scene root 和 locator 节点索引。
- `src/services/editorApi.ts`：浏览器前端与本地 Bun 服务之间的 HTTP / WebSocket API。
- `packages/pixifact-cli/src/editorServer.ts`：项目索引、受项目根约束的文件读取、versioned Scene write 和文件通知。

Pinia 只保存当前 Scene、selection 和左侧 Tab 等 UI 状态，不保存 `.scene` template 或项目数据副本。

顶栏刷新按钮会重新读取项目索引、Scene interface 和当前 Scene，并重建 authoring preview 以重新加载图片；它不是保存按钮。

## 资产边界

- `.scene` 在 Editor 内打开、预览和轻量编辑。
- 资产面板只索引项目内已有的 `.scene` 与图片。
- 资产目录首次只展开当前 Scene 的所在路径；用户调整后的展开状态保存在本地 Git 忽略的 UI 状态中。
- 图片由用户或外部 Agent 放入项目；Editor 不导入、复制、移动、重命名或删除图片源文件。
- 脚本与其他源资源不在 Editor 内编辑。

## 外部 Agent

外部 Agent 直接编辑项目相对 `.scene` 与配对脚本，再通过 Pixifact CLI 校验和编译：

```bash
pixifact summary
pixifact scene inspect --scene src/scenes/Main.scene
pixifact scene validate --scene src/scenes/Main.scene
pixifact scene validate --all
pixifact compile-scenes
```

Editor 正在运行且 Scene 已同步时，可以读取当前 Scene 和 selection：

```bash
pixifact editor context
pixifact editor screenshot --output /tmp/scene.png
```

两个命令都只读，不提供 Scene mutation。截图只捕获当前 ready 的 Authoring Scene，不包含 Editor UI，也不执行项目 runtime。

Scene 脚本按同目录同 basename 配对，例如 `src/scenes/Main.scene` 与 `src/scenes/Main.ts`。不要编辑 `.pixifact/generated`。

## 验证

```bash
bun run editor:typecheck
bun run editor:frontend:build
bun run test
```

浏览器主流程使用 `bun run editor` 启动后验收。
