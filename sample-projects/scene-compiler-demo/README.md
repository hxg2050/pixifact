# Pixifact Scene Compiler Demo

这个示例展示新的 Pixifact Compiler 方向：

- `.scene` 使用受限 XML / Vue-like template。
- Scene Script 继承 PixiJS `Container`。
- `@scene`、`@prop`、`@event`、`@slot` 描述 public contract。
- Button / Panel 是 `.scene + script`，不是 Pixifact runtime component。
- Panel 通过 slots 接收外部内容；Button 对外只暴露 label / click / icon slot。

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

当前 `src/generated/*.scene.generated.ts` 是手写的 compiler 目标形态，用来直观看实际运行效果。后续 compiler 成熟后应由 `.scene` 自动生成。
