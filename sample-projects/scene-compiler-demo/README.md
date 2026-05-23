# Pixifact Scene Compiler Demo

这个示例展示新的 Pixifact Compiler 方向：

- `.scene` 使用受限 XML / Vue-like template。
- Scene Script 继承 PixiJS `Container`。
- `@scene`、`@part`、`@prop`、`@event`、`@slot` 描述脚本和 scene contract。
- Button / Panel 是 `.scene + script`，不是 Pixifact runtime component。
- Panel 通过 slots 接收外部内容；Button 对外只暴露 label / click / icon slot。
- MainMenu 直接作为 Scene Script 使用，事件从 `.scene` 里的 `@click="startGame"` 绑定到脚本方法。
- 外部用 `mount(target, child, slot?)` 投放 slot 内容，不访问内部 slot host。

运行：

```bash
cd sample-projects/scene-compiler-demo
bun run dev
```

构建：

```bash
cd sample-projects/scene-compiler-demo
bun run build
```

`dev` / `build` 会先执行 `bun run compile:scenes`，把 `scenes/*.scene` 生成到 `src/generated/`，并为绑定脚本生成 `*.scene.interface.json`。
实际扫描和生成逻辑由 `pixifact/compiler-node` 的 `compileScenes()` 提供；本示例通过 Pixifact CLI 的 `compile-scenes` 命令调用它。
