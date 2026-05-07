# Pixifact Dockview Editor Prototype

这是使用 `dockview` 实现的 Pixifact 编辑器 Docking UI 原型。

和 `apps/editor-ui-prototype` 不同，这个原型不是纯静态布局，而是使用 Dockview 提供真实的面板拖动、停靠、合并成 tab、拆分和浮动能力。

## 启动

```bash
bun run editor:dockview
```

打开 Vite 输出的地址。

## 当前包含

- 文件系统
- UI 资源 / 节点树
- Viewport
- AI 对话
- Inspector

当前仍然不接真实编辑器逻辑，只用于验证 VSCode 风格面板系统。
