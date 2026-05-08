# Pixifact Runtime Implementation Patterns

These patterns describe the runtime foundation used by Pixifact Scene instantiation, the editor, MCP, and exported runtime code. Keep runtime changes aligned with Scene semantics, viewport preview, command application, and export.

## Application And Updates

`Application` extends PixiJS `Application`. After `await app.init(...)`, it creates `app.root` as a runtime `Group` backed by the Pixi stage.

Objects and components are updated only when mounted under `app.root` and when they have update work. The application owns a single ticker callback and tracks active targets internally.

## GameObject Creation

Prefer:

```ts
const panel = GameObject.instantiate(Group, app.root, {
    width: 360,
    height: 220,
    anchorX: 0.5,
    anchorY: 0.5,
});
```

Use `setProps`/constructor property assignment patterns already present in the repo. Keep parent types narrowed to container-capable objects.

`GameObject.instantiate()` applies props before calling `render()`, then attaches the object to the parent. This lets compound `Group` subclasses read initialized fields while creating child nodes:

```ts
class StatusCard extends Group {
    title = '';
    titleLabel!: Label;

    render() {
        this.titleLabel = GameObject.instantiate(Label, this, {
            value: this.title,
        });
    }
}
```

## Container Model

`Group` owns `children`, `addChild`, `addChildAt`, `removeChild`, and `removeChildren`.

Render leaves render content and should stay leaf-like:

- `Graphics`
- `Label`
- `Image`
- `NineSliceImage`

Do not add new child-management APIs to leaves unless the architecture is intentionally being changed.

## Compound UI Components

Build reusable multi-node UI as `Group` subclasses with a `render()` method. Keep internal render leaves private or protected unless callers need to attach children or control them.

- `Button` owns its background, optional nine-slice visual, label, pointer events, disabled state, and centered press-scale visual container.
- `ScrollView` owns its mask, content group, scrollbar, wheel and drag handlers. Add scrollable children to `scrollView.content` and refresh content height when needed.
- Do not hard-code project asset paths in reusable UI components. Accept textures or style props from callers and keep a graphics fallback when practical.
- Avoid new package dependencies for small UI interactions unless they remove substantial complexity.

## Component Lifecycle

Components receive their host `gameObject` in the constructor. Use:

- `awake()` for setup after attachment.
- `start()` for work that should run once immediately before the first update tick.
- `update(dt)` for frame work.
- `onDestroy()` for listener cleanup and teardown.

If `start()` removes the component, its first `update()` must not run. Components that only define `start()` still wait for the next update tick and then unregister.

When a component subscribes to `GameObject.emitter`, Pixi events, DOM events, or window events, unsubscribe in `onDestroy()`.

## Layout Components

`Layout` performs parent-relative positioning:

- `centerX` overrides `left`/`right`.
- `centerY` overrides `top`/`bottom`.
- `left + right` stretches width.
- `top + bottom` stretches height.
- `minWidth` and `minHeight` clamp stretched dimensions.

`FlexGroup` arranges children in row or column direction. `Flex` on a child controls proportional growth. Keep child resize and child add/remove listeners synchronized.

## DOM-backed Inputs

`Input` and `Textarea` use real HTML elements, then align them to the Pixi canvas with transforms. Their current overlay approach is intentional because PixiJS v8 `DOMContainer` remains experimental.

When changing these components:

- Keep support for explicit `canvas`.
- Use `GameObject.Event.TRANSFORM_CHANGE` to observe transform changes instead of relying on subclass `x` / `y` / `scale` setters. Layout components may call `transform.setPosition()` directly.
- Keep viewport resize and scroll synchronization.
- Use `getGlobalTransform()` for current global matrix reads.
- Preserve pointer focus behavior on desktop and touch devices.

## Testing Expectations

Add or update Vitest coverage when changing:

- Parent/child ownership.
- Component lifecycle.
- Ticker registration.
- Layout recomputation.
- Compound UI components such as `Button` and `ScrollView`.
- DOM input focus, sizing, or transform synchronization.
