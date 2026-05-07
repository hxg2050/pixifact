# Pixifact AI-first Game Editor

Pixifact 是一个以编辑器为核心的 AI-first 游戏 UI / 轻量玩法创作工具。

本仓库的主目标不是继续打磨一个通用 PixiJS 封装库，而是交付一个可用、可验证、可扩展的本地桌面编辑器产品。当前产品方向是 Tauri desktop-first；浏览器 Web 入口只作为开发预览和自动化测试承载。`pixifact` 运行时和 `src/` 下的组件、Prefab、Command、EditorDocument 等能力是编辑器的底座，不再是项目本身的中心。

[English](./README.en.md)

## 核心定位

Pixifact 的主创作路径是：

```txt
Prompt -> EditorCommand -> Validate / Repair -> EditorDocument -> Runtime Preview -> Export / Import
```

当前 Alpha 仍保留 `Proposal -> Dry Run -> Diff -> Apply` 的审查流程，用于验证 command、diff、undo 和导入导出闭环。后续产品方向是“发送即执行”：用户输入自然语言，AI 生成结构化 command，编辑器自动校验和修正，合法后写入 `EditorDocument`。

## 产品边界

- `apps/editor/` 是仓库的核心产品目录。
- `EditorDocument` 是项目唯一 source of truth。
- Zustand 只保存 UI 状态，不保存 PrefabSpec / EditorDocument 副本。
- AI 不能直接修改项目，只能产出结构化 command / proposal。
- 所有真实项目修改必须走 `EditorDocument` API 或 command。
- JSON 是资产格式，不是主要编辑入口。
- 不引入 Monaco，不在编辑器内嵌 TypeScript 代码编辑器。
- runtime 是编辑器预览和 Prefab 实例化底座，不再作为仓库路线的主目标。

## 目录

```txt
apps/editor/                  AI-first editor 产品应用
apps/editor-dockview-prototype/  最终 IDE 面板交互原型
src-tauri/                    Tauri 桌面版 host，本机文件和外部程序能力
src/                          编辑器领域模型、command、prefab、runtime 基础能力
src/editor/                   EditorDocument、AI context、diff、memory、logic 等编辑器领域模型
src/commands/                 EditorCommand validation / apply / undo 基础能力
src/prefab/                   PrefabSpec、DSL、模板和 runtime instantiate
examples/                     runtime 能力示例，不承载编辑器产品
tests/                        单元测试和编辑器领域测试
tests/e2e/                    Playwright Alpha 主流程测试
sample-projects/              编辑器可导入的样例项目
skills/                       本仓库维护的 Codex skills
```

## 启动编辑器

桌面版开发入口：

```bash
bun install
bun run desktop
```

只启动浏览器开发预览：

```bash
bun run editor
```

Vite 会输出本地访问地址，通常是：

```txt
http://localhost:5173/
```

打包桌面版：

```bash
bun run desktop:build
```

开发和打包桌面版需要 Rust / Cargo。最终安装桌面 App 的用户不需要配置 Bun 或 Rust 环境。

## AI Gateway

本地启动真实 gateway adapter 样例：

```bash
bun run editor:gateway
```

也可以只用环境变量传入真实模型 key：

```bash
OPENAI_API_KEY=your-key bun run editor:gateway
```

默认 Remote endpoint：

```txt
http://localhost:8788/proposal
```

Gateway 只返回结构化 proposal，不直接修改 `EditorDocument`，也不写项目文件。

## 验证

优先运行最小相关验证。

编辑器相关改动：

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
bun run test
bun run editor:build
```

Alpha 主流程改动：

```bash
bun run editor:e2e
```

Runtime / 导出入口改动：

```bash
bun run build
bun run example:build
```

## Package 入口

当前 npm 包名是 `pixifact`。公开入口按 editor-first 结构直接暴露 runtime 和编辑器领域能力：

```ts
import { Application, GameObject, Group } from 'pixifact';
import { Button, Input, ScrollView, Textarea } from 'pixifact/ui';
import { Layout, GridLayout } from 'pixifact/core';
```

Editor-first 领域入口：

```ts
import { EditorDocument } from 'pixifact/editor';
import { applyCommand } from 'pixifact/commands';
import { instantiate } from 'pixifact/prefab';
```

这些 API 是编辑器 runtime foundation。新增能力应优先服务编辑器工作流、Prefab 实例化、viewport 预览、command 应用和导出，而不是扩展成独立通用框架。

## Codex Skills

仓库维护的 Codex skill 位于：

```txt
skills/pixifact-editor
```

该 skill 面向 Pixifact editor 和底层 runtime 约定。

源码仓库内安装：

```bash
bun run skills:install
```

从已发布包安装：

```bash
bunx --package pixifact pixifact-skills --replace
```

## 许可证

MIT
