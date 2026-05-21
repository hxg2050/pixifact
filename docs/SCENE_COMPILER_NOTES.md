# Pixifact Compiler Notes

本文记录关于 Pixifact 代码层定位的阶段性讨论结论，暂不作为实施计划，不改动当前 runtime / editor / CLI 代码。

## 定位

Pixifact 后续更贴近 `Pixifact Compiler`：

- `.scene` 是可编辑、可预览、AI 可理解、可读取、可操作的结构源文件。
- Pixifact 负责编译 `.scene` 到 PixiJS TypeScript 代码。
- PixiJS 是最终运行时心智，不再让用户围绕 Pixifact 自定义 runtime framework 编程。
- Editor / CLI / SceneCommand / dry-run / diff / apply 仍然是 Pixifact 的 authoring 和 AI 操作价值。

## Scene 与脚本

每个 `.scene` 可以绑定一个对应的 TypeScript 脚本。

- `.scene` 描述完整的可视化结构。
- 脚本继承 PixiJS `Container`。
- 脚本可以定义自定义属性、方法和事件入口。
- `.scene` 编译出的内部结构只由对应脚本访问和操作。
- 对外部调用方来说，一个 Scene 实例是完整且独立的对象，例如一个按钮、面板或 HUD。

示意：

```txt
scenes/Button.scene
src/scenes/Button.ts
src/generated/pixifact/Button.scene.generated.ts
```

外部使用时只面对脚本公开 API：

```ts
const button = new Button({ label: 'Start' });
button.label = 'Restart';
button.onClick(startGame);
stage.addChild(button);
```

外部不应依赖 Button 的内部背景、文字、图标等节点结构。

## 编译产物

编译器生成内部 mount 函数和 typed parts。

```txt
Button.scene -> Button.scene.generated.ts
```

生成代码负责：

- 创建 PixiJS `Container` / `Graphics` / `Text` / `Sprite` 等对象。
- 按 `.scene` 描述挂载内部节点。
- 返回脚本可访问的 typed parts。

用户脚本负责：

- 继承 PixiJS `Container`。
- 调用生成的 mount 函数。
- 保存私有 parts。
- 暴露稳定的属性、方法和事件接口。

示意：

```ts
export class Button extends Container {
  #parts: ButtonParts;

  constructor(props?: ButtonProps) {
    super();
    this.#parts = mountButtonScene(this);
  }

  set label(value: string) {
    this.#parts.label.text = value;
  }

  onClick(handler: () => void) {
    this.eventMode = 'static';
    this.on('pointertap', handler);
  }
}
```

## 内部隔离

脚本继承 `Container` 后，外部技术上仍可访问 PixiJS 的 `children` 等公共 API，但 Pixifact 语义上约定：

- 外部只使用 Scene Script 暴露的属性和方法。
- `.scene` 内部节点不是外部 API。
- 内部节点通过脚本私有 `parts` 使用。
- AI / editor 在编辑该 `.scene` 本身时可以理解和操作内部结构；在父级 Scene 使用它时默认把它视作整体。

## Slots

Scene 可以参考 Vue 的 slot 心智。

- 无 slots 的 Scene 更像叶子组件，例如 `Button`、`Icon`、`HpBar`。
- 有 slots 的 Scene 更像容器组件，例如 `Panel`、`Dialog`、`Window`。

slot 是 `.scene` 中声明的受控挂载点，不是随意暴露全部内部结构。

示意：

```txt
Panel.scene
  background
  title
  slot: default
  slot: footer
```

脚本可以选择暴露受控容器：

```ts
panel.content.addChild(child);
panel.footer.addChild(confirmButton);
```

这样外部可以组合内容，但仍不需要知道 `Panel.scene` 的完整内部节点树。

## 后续讨论点

- `.scene` 中如何声明脚本绑定。
- `.scene` 中如何声明 parts 和 slots。
- 生成文件的目录和命名约定。
- 是否要求每个 `.scene` 必须有脚本，或允许默认脚本。
- Scene instance 在 editor hierarchy 中的默认展示和展开规则。
- CLI / compiler 命令形态。
- 当前 `GameObject` / `Component` / `instantiateScene` runtime 路径如何迁移或降级。
