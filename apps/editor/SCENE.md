# Pixifact Scene

Pixifact editor 当前只打开和编辑 compiler `.scene` 文本资产。

`.scene` 文件由同目录同 basename 的 `.ts` 脚本配对，例如：

```txt
src/scenes/Hud.scene
src/scenes/Hud.ts
```

`.scene` 保存视觉结构、层级、布局和事件绑定；`.ts` 通过 `@scene()`、`@part()`、`@prop()`、`@event()` 和 `@slot()` 暴露运行时契约。

运行时根节点使用 `Group`，PixiJS `Container` 仍保持原生语义。
