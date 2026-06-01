# Pixifact Scene Compiler Demo

这个示例展示新的 Pixifact Compiler 方向：

- `.scene` 使用受限 XML / Vue-like template。
- Scene Script 继承 PixiJS `Container`。
- `.scene` 与同目录同名 `.ts` 自动配对，脚本用 `@scene()` 声明自己是 Scene 类。
- `@part`、`@prop`、`@event`、`@slot` 描述脚本 contract，Editor 和 compiler 从脚本即时提取。
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

`dev` / `build` 会先执行 `bun run compile:scenes`，把 `src/scenes/*.scene` 生成到 `.pixifact/generated/`。
实际扫描和生成逻辑由 `pixifact/compiler-node` 的 `compileScenes()` 提供；本示例通过 Pixifact CLI 的 `compile-scenes` 命令调用它。

## Agent 修改流程

Codex / Claude Code 修改这个示例时，默认直接编辑项目相对 `.scene` 路径，例如 `src/scenes/Button.scene`。不要在 `.scene` 中写 `script="..."`，不要编辑 `.pixifact/generated/*.scene.generated.ts` 或 `.pixifact/generated/scenes.generated.ts`，这些文件由 compiler 生成。

推荐流程：

```bash
bun run pixifact -- scene inspect --project-root sample-projects/scene-compiler-demo --scene src/scenes/Button.scene
# 编辑 sample-projects/scene-compiler-demo/src/scenes/Button.scene
bun run pixifact -- scene validate --project-root sample-projects/scene-compiler-demo --scene src/scenes/Button.scene
bun run pixifact -- scene validate --project-root sample-projects/scene-compiler-demo --all
bun run pixifact -- compile-scenes --project-root sample-projects/scene-compiler-demo
cd sample-projects/scene-compiler-demo && bun run build
```

示例任务：

```txt
把 Button.scene 里的 Text#labelText 文案从 "Button" 改成 "Play"。
只修改 src/scenes/Button.scene。
修改后运行 scene validate、compile-scenes 和 sample build。
不要手动修改 .pixifact/generated。
```
