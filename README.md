# Pixifact

Pixifact 是面向 AI 完整游戏开发的 Scene / UI / 轻场景与项目资产管理层。PixiJS 是底层渲染实现，Pixifact 对外提供 `.scene` 源文件、验证、编译、预览和运行时加载能力。

Codex、Claude Code 等外部 coding agent 是主要 AI 入口。Pixifact CLI 是 Agent 理解、修改、验证和编译 Scene 的工具层；桌面编辑器位于 `apps/editor/`，用于预览、资产浏览、live context、校验反馈和人工微调。

Pixifact 只专注提供 AI 可操作的 Scene 能力。Agent 编排、Git 分支 / commit / revert、任务管理、CI、PR 和长期项目管理交给外部专业工具。

[English](./README.en.md)

## npm 快速开始

Pixifact 的第一版 npm 包已发布：

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

常用 npm 安装形态命令：

```bash
pixifact scene validate --project-root . --all
pixifact compile-scenes --project-root .
```

当前 `pixifact-cli` 和 `create-pixifact` 都是 Bun-first 工具，需要本机安装 Bun。

## 0.1.3 发布说明

`v0.1.3` 是 Pixifact 的首个 npm 发布版本，包含：

- `pixifact@0.1.3`
- `pixifact-cli@0.1.3`
- `create-pixifact@0.1.3`

发布后已验证 `bun create pixifact npm-smoke`、`bun install` 和 `bun run build` 可以从 npm registry 完整跑通。

## 核心模型

Pixifact 使用 Godot-style 统一 `Scene` 资产，不做 Unity 式 Scene + Prefab 双资源体系。

当前 Agent authoring 主路径是 compiler `.scene`：

```txt
Codex / Claude Code -> inspect .scene -> edit .scene -> scene validate -> compile-scenes -> repair until valid
```

Editor 是能力增强：提供当前打开 Scene、当前选中节点、预览和资产上下文。没有 Editor 时，Agent 仍然可以通过文件编辑和 CLI 完整开发。

Pixifact 的默认闭环到 `scene validate`、`compile-scenes` 和可选 live context 为止。Git diff、commit、revert、PR、CI 和任务编排由外部工具负责，不是 Pixifact 内建能力。

## 目录

```txt
packages/pixifact/              核心 Pixifact 包，包名为 pixifact
packages/pixifact/src/runtime/  Pixifact runtime 扩展节点，例如 Group
packages/pixifact/src/project/  pixifact.project.json 解析和项目摘要
packages/pixifact/src/compiler/ compiler .scene 解析、校验、生成
packages/pixifact-cli/          Pixifact CLI，依赖 pixifact，不依赖桌面编辑器
apps/editor/                    Pixifact 桌面编辑器 React / Vite 前端
apps/editor/src-tauri/          Tauri desktop host
tests/                          单元测试、编辑器测试、CLI 测试
sample-projects/                样例 Pixifact 项目
skills/                         本仓库维护的 Codex skills
```

## 启动

```bash
bun install
bun run desktop
```

`bun run editor` 是 `bun run desktop` 的别名。项目不提供独立浏览器版编辑器入口；Tauri 开发模式内部启动的 Vite server 只服务桌面 WebView。

打包桌面版：

```bash
bun run desktop:build
```

开发和打包桌面版需要 Rust / Cargo。最终安装桌面 App 的用户不需要配置 Bun 或 Rust 环境。

## CLI

CLI 是外部 Agent 操作 Pixifact 项目的主入口。Pixifact 不把内置聊天或内置模型服务作为主要 AI 路径。

常用命令：

```bash
bun run pixifact -- summary --project-root /path/to/project
bun run pixifact -- scene inspect --project-root /path/to/project --scene src/scenes/Button.scene
bun run pixifact -- scene validate --project-root /path/to/project --scene src/scenes/Button.scene
bun run pixifact -- scene validate --project-root /path/to/project --all
bun run pixifact -- compile-scenes --project-root /path/to/project
```

小范围改动可以校验单个 `.scene`；批量改动或不确定影响范围时使用 `scene validate --all` 校验所有 compiler Scene。

Scene 资产由同目录同名的 `.scene` 和 `.ts` 成对组成，例如 `src/scenes/Hud.scene` 与 `src/scenes/Hud.ts`。`.scene` 保存视觉结构、层级、布局和事件绑定，行为脚本按同目录同 basename 自动配对；不要在 `.scene` 中写 `script="..."`，也不要编辑 `.pixifact/generated`。

Editor live context 只读：

```bash
bun run pixifact -- live summary
bun run pixifact -- live scene get
bun run pixifact -- live node inspect --node 0:content/0:label
```

有 Editor 时，`live scene get` 可额外返回当前选中节点和最近一次外部 `.scene` 刷新/校验结果，帮助 Agent 判断直接编辑是否需要修复；它不修改项目文件。

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
import { Group } from 'pixifact/runtime';
import { parsePixifactProjectConfig } from 'pixifact';
```

根入口 `pixifact` 导出项目配置、runtime 扩展和常用错误提示；compiler API 通过 `pixifact/compiler` 导出。

## 验证

优先运行最小相关验证。

```bash
bun run test
```

编辑器相关改动：

```bash
bunx --no-install tsc -p apps/editor/tsconfig.json
bun run editor:frontend:build
```

runtime 或导出 API 改动：

```bash
bun run build
bun run example:build
```

项目级测试策略见：

```txt
docs/TESTING.md
```

## Codex Skills

仓库维护的 Codex skill 位于：

```txt
skills/pixifact
```

源码仓库内安装：

```bash
bun run skills:install
```

从已发布包安装将由后续独立的 `pixifact-skills` 包提供；第一版 npm 发布只包含 runtime、CLI 和项目脚手架。

## 许可证

MIT
