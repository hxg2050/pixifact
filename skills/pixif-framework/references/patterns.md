# pixif Implementation Patterns

## Application And Updates

`Application` extends PixiJS `Application`. After `await app.init(...)`, it creates `app.root` as a pixif `Group` backed by the Pixi stage.

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

## Container Model

`Group` owns `children`, `addChild`, `addChildAt`, `removeChild`, and `removeChildren`.

Render leaves render content and should stay leaf-like:

- `Graphics`
- `Label`
- `Image`
- `NineSliceImage`

Do not add new child-management APIs to leaves unless the architecture is intentionally being changed.

## Component Lifecycle

Components receive their host `gameObject` in the constructor. Use:

- `awake()` for setup after attachment.
- `update(dt)` for frame work.
- `onDestroy()` for listener cleanup and teardown.

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
- Keep viewport resize and scroll synchronization.
- Use `getGlobalTransform()` for current global matrix reads.
- Preserve pointer focus behavior on desktop and touch devices.

## Testing Expectations

Add or update Vitest coverage when changing:

- Parent/child ownership.
- Component lifecycle.
- Ticker registration.
- Layout recomputation.
- DOM input focus, sizing, or transform synchronization.
