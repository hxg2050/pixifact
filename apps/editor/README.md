# Pixifact Desktop Editor

`apps/editor` 是 Pixifact 桌面版的 React / Vite 前端界面。正式产品形态是 Tauri 桌面版，桌面 host 位于：

```txt
apps/editor/src-tauri/
```

项目不启动或维护独立浏览器版。Vite 只作为 Tauri dev/build 的内部前端服务。

Editor 是外部 Agent 的能力增强层：预览 `.scene`、展示资产和校验状态、暴露当前打开 Scene 与选中节点、支持人工微调。没有 Editor 时，Agent 仍然可以通过文件编辑和 Pixifact CLI 完整开发。

```txt
Codex / Claude Code -> edit .scene -> scene validate -> compile-scenes -> Editor preview
```

## 启动

在仓库根目录运行：

```bash
bun install
bun run desktop
```

`editor` 是同一个桌面入口的别名：

```bash
bun run editor
```

打包桌面版：

```bash
bun run desktop:build
```

开发和打包桌面版需要本机 Rust / Cargo 工具链。最终用户安装打包后的桌面 App，不需要配置 Bun 环境。

## CLI / Agent 使用

外部 Agent 的默认流程是直接编辑 compiler `.scene` 源文件，再运行 Pixifact CLI 验证和编译：

```bash
bun run pixifact -- summary --project-root /path/to/project
bun run pixifact -- scene inspect --project-root /path/to/project --scene src/scenes/Main.scene
bun run pixifact -- scene validate --project-root /path/to/project --scene src/scenes/Main.scene
bun run pixifact -- scene validate --project-root /path/to/project --all
bun run pixifact -- compile-scenes --project-root /path/to/project
```

小范围改动可以校验当前 Scene；批量改动或不确定影响范围时用 `scene validate --all` 校验所有 compiler Scene。

Scene 脚本按同目录同 basename 自动配对，例如 `src/scenes/Main.scene` 与 `src/scenes/Main.ts`。不要在 `.scene` 中写 `script="..."`，不要编辑 `.pixifact/generated`。

需要读取当前 editor 上下文时使用 live CLI。live CLI 是只读上下文能力，不负责修改项目：

```bash
bun run pixifact -- live summary
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node 0:content/0:label
```

完整方向见：

```txt
docs/AI_SCENE_AUTHORING.md
```

## Scene

Editor 使用 Scene 作为统一 UI / 轻场景资产。格式、命名规则和当前支持范围见：

```txt
apps/editor/SCENE.md
```

## 项目资产浏览

Editor 可以浏览项目文件、轻量预览资源、管理 Scene 引用和展示校验状态，但不编辑源资源。

- `.scene` 文件在 Editor 内打开、预览和轻量编辑。
- 图片、音频、字体、数据文件等资源只做轻量预览。
- 双击具体资源调用系统默认程序查看。
- 脚本文件不在 Editor 内编辑；打开脚本时调用外部代码编辑器。
- 资源修改由系统默认程序、专业资源工具或外部代码编辑器完成。

## 核心使用流程

建议按以下流程验证 CLI-first 核心闭环：

1. 打开 editor。
2. 打开目标项目相对 `.scene`，例如 `src/scenes/Main.scene`。
3. 在 Codex / Claude Code 中提出任务，例如：

   ```txt
   修改当前 Pixifact .scene，创建一个适配竖屏的 HUD。编辑 src/scenes/Main.scene 后运行 scene validate 和 compile-scenes。
   ```

4. Agent 读取 `.scene`，必要时运行 `live scene get` 获取当前选择。
5. Agent 直接编辑 `.scene` 源文件。
6. Agent 运行 `scene validate` 和 `compile-scenes`。
7. 回到 editor，确认 viewport 自动刷新。
8. 在 `检查器` 中手动微调必要字段。
9. 保存 `.scene`，由 runtime 在游戏中加载。

## 导出文件

Editor 会通过桌面应用导出文件：

- `.ai-editor.json`：完整项目资产。
- `logic-handlers.ts`：LogicGraph 生成的 TypeScript handler 摘要。
- `pixifact-memory.json`：偏好记忆文件。

这些是用户下载产物，不属于仓库源码。不要把它们提交到 repo。

## 验证

编辑器相关改动至少运行：

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run test
bun run editor:frontend:build
```

桌面主流程改动使用 `bun run desktop` 手动验证；后续自动化测试应走桌面 host，不维护浏览器 Playwright 入口。

## UI 文案和按钮原则

- 主要使用中文，但不要为了中文而中文。
- 保留 `AI-first`、`Prompt`、`Dry Run`、`Diff`、`Memory`、`CLI`、`Agent`、`ID`、`Key`、`Type`、`Scene`、`TS` 等术语。
- 工具动作可用 SVG 图标或图标 + 短文本。
- 决策动作保留文字，例如检查、应用、拒绝、保存。
- 纯图标按钮必须提供 `aria-label` 和 `title`。

## 架构边界

- Compiler `.scene` 源文件是外部 Agent 和 editor 共享的 source of truth。
- Zustand 只保存 UI 状态，不保存 `.scene` 模板副本作为项目数据源。
- React panel 不保存项目树副本。
- Agent 默认直接编辑 `.scene` 文件，再通过 CLI 验证和编译。
- Editor live bridge 只提供 summary、scene get、node inspect 等上下文能力。
- JSON 只是资产格式，不作为普通用户主编辑界面。
- 不引入 Monaco，不做内嵌代码编辑器。
