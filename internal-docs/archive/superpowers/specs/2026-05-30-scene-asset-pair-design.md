# Scene Asset Pair Design

## Goal

Define the next compiler Scene authoring model around colocated `.scene` and TypeScript files. The model should keep `.scene` files as the primary Agent and Editor authoring surface while giving each Scene a nearby script for behavior and public contract.

The design replaces the current directional binding:

```txt
<Scene script="src/scenes/Hud.ts">
```

with a file-system pairing rule:

```txt
src/scenes/Hud.scene
src/scenes/Hud.ts
```

## Product Direction

Pixifact should treat a Scene as a paired asset:

- `.scene` owns visual structure, hierarchy, layout, text, image references, child Scene placement, slot content, and event wiring.
- `.ts` owns behavior, runtime state updates, public props, public events, public slots, and `@part` access to nodes declared in the `.scene`.
- The pairing is by same directory and same basename.
- The unique Scene asset id is the normalized project-relative `.scene` path.

Users should understand the model as:

```txt
Hud.scene is the visual source.
Hud.ts is the behavior source.
Together they are one Scene asset.
```

The product should not present this as a Web component class with a template path. The external user model remains Scene-first.

## Pairing Rules

A compiler Scene asset is formed by a `.scene` file and a colocated `.ts` file with the same basename:

```txt
src/ui/Button.scene
src/ui/Button.ts
```

The `.scene` file does not declare `script`. The TypeScript file does not declare a template path.

```xml
<Scene name="Button" width="188" height="48">
  ...
</Scene>
```

```ts
@scene()
export class Button extends Container {
  ...
}
```

The local names inside the pair must match:

- File basename: `Button`
- `<Scene name="Button">`
- Exported `@scene()` class: `Button`

The local name does not need to be globally unique.

## Source Roots

Scene discovery should scan configured Scene source roots instead of the entire project. The default root for new projects is:

```txt
src
```

Projects may configure additional source roots later, but unbounded project-wide scanning is not the product model. The compiler and Editor should exclude generated, dependency, build, and result directories:

```txt
node_modules
dist
.pixifact
coverage
test-results
```

Existing samples should be migrated into the chosen source root instead of preserving old top-level `scenes/` assumptions.

## Identity

Scene identity has three layers:

```txt
Local name: Button
Asset id: src/ui/Button.scene
Runtime class: Button
```

Only the asset id is globally unique. This allows same-basename assets in different directories:

```txt
src/ui/Button.scene
src/ui/Button.ts

src/menu/Button.scene
src/menu/Button.ts
```

Both assets may use:

```xml
<Scene name="Button">
```

and:

```ts
export class Button extends Container {}
```

The compiler must resolve ambiguity through asset paths and generated import aliases, not through global class names.

## Scene References

Scene instance references must use `.scene` paths, not bare names.

Project-relative reference:

```xml
<Button scene="src/ui/Button.scene" />
```

Relative reference:

```xml
<Button scene="./Button.scene" />
<Panel scene="../shared/Panel.scene" />
```

The compiler, CLI, Editor preview, validation checks, and live context should normalize references to project-relative asset ids before validation or code generation:

```txt
src/ui/Button.scene
src/shared/Panel.scene
```

Bare references such as `scene="Button"` are invalid because they are ambiguous once different directories can contain the same local name.

## Generated Output

Generated files must preserve enough path information to avoid collisions. The recommended output mirrors source directories under `.pixifact/generated`:

```txt
.pixifact/generated/src/ui/Button.scene.generated.ts
.pixifact/generated/src/menu/Button.scene.generated.ts
```

The generated registry imports all generated files and registers runtime Scenes by project-relative asset id:

```ts
registerScene('src/ui/Button.scene', ...);
registerScene('src/menu/Button.scene', ...);
```

When two source scripts export the same class name, generated code must use stable aliases:

```ts
import { Button as SceneClass_src_ui_Button } from '../../src/ui/Button';
import { Button as SceneClass_src_menu_Button } from '../../src/menu/Button';
```

Generated code should never rely on global uniqueness of `<Scene name>` or exported class name.

## Editor Flow

Creating a new Scene from the Editor creates the pair in the current folder:

```txt
Inventory.scene
Inventory.ts
```

Opening a `.scene` file loads its same-basename script contract from the same directory. The Inspector may show public props, events, slots, and script binding status, but script source editing still opens in the external code editor.

Double-click behavior:

- `.scene`: open in Pixifact Editor.
- `.ts`: open in the external code editor.
- Assets and other files: use the existing external/default open behavior.

Moving or renaming a Scene pair should be treated as a project file operation. The MVP does not need a full refactor engine, but diagnostics must clearly report broken pairings, missing scripts, class/name mismatches, and unresolved Scene references.

## Agent Flow

Agent instructions should be mechanical and path-based:

```txt
Pixifact Scene asset rules:
- A Scene asset is a pair of colocated files with the same basename.
- Example: src/scenes/Hud.scene and src/scenes/Hud.ts.
- The .scene file owns visual structure, hierarchy, layout, text, images, child Scene instances, slots, and event wiring.
- The .ts file owns behavior, runtime state updates, public props/events/slots, and @part access.
- Do not add script="..." to .scene files.
- Do not add template paths to @scene().
- Pairing is by same directory + same basename.
- The unique Scene id is the project-relative .scene path.
- Scene names and class names are local, not globally unique.
- Reference other Scenes with .scene paths, never bare names.
- Do not edit .pixifact/generated.
```

Default edit loop:

```bash
bun run pixifact -- scene inspect --project-root <project-root> --scene src/scenes/Hud.scene
bun run pixifact -- scene validate --project-root <project-root> --scene src/scenes/Hud.scene
bun run pixifact -- compile-scenes --project-root <project-root>
```

Visual changes should target `.scene`. Behavior and public contract changes should target the paired `.ts`.

## Validation

`scene validate` should verify:

- The target `.scene` lives under a configured Scene source root.
- A colocated same-basename `.ts` file exists.
- `<Scene name>` matches the `.scene` basename.
- The paired `@scene()` class name matches the `.scene` basename.
- Every `@part` references an existing node id in the `.scene`.
- Scene instance `scene` attributes resolve to valid `.scene` asset ids.
- Scene instance props, events, and slots match the referenced Scene contract.
- Bare Scene references are rejected.
- Generated directories and ignored roots are not treated as source Scenes.

Diagnostics should include the project-relative path, the failing rule, and the expected correction.

## Advanced Bindings

The default product should not require a binding manifest. A future explicit binding file can be reserved for rare cases where a project needs non-colocated or non-matching names:

```json
{
  "scenes": [
    {
      "scene": "src/ui/Button.view.scene",
      "script": "src/ui/Button.ts"
    }
  ]
}
```

This is an escape hatch, not the default authoring path. The MVP can defer this feature.

## Migration

Existing compiler samples should migrate from split directories:

```txt
scenes/Hud.scene
src/scenes/Hud.ts
```

to paired files:

```txt
src/scenes/Hud.scene
src/scenes/Hud.ts
```

Sample docs, Agent prompts, Editor helper text, and CLI examples should stop saying `scenes/*.scene` as the universal source path. They should refer to project-relative `.scene` paths instead.

Generated files remain build output and should not be edited.

## MVP Scope

Included:

- Same-directory same-basename pairing.
- Source-root Scene discovery.
- Project-relative asset ids.
- Relative and project-relative Scene references.
- Generated output path collision avoidance.
- Generated import aliasing for duplicate class names.
- Editor open/create behavior for paired assets.
- Agent prompt and CLI workflow updates.
- Sample project migration.

Excluded:

- One `.scene` bound to multiple scripts.
- One script bound to multiple `.scene` files.
- Embedded code editing in the Editor.
- A full rename/move refactor engine.
- Binding manifests as a required default workflow.
- Backward compatibility with old `<Scene script="...">` authoring.

## Verification

Implementation should include focused checks for:

- Compiling two same-basename Scene pairs in different directories.
- Validating a Scene pair with matching basename, `<Scene name>`, and class name.
- Rejecting missing paired scripts.
- Rejecting name mismatches.
- Rejecting bare Scene references.
- Resolving relative Scene references.
- Generating collision-free files under `.pixifact/generated`.
- Registering runtime Scenes by project-relative asset id.
- Editor opening a `.scene` and reading the paired script contract.
- Agent workflow examples using project-relative `.scene` paths.

Relevant commands after implementation:

```bash
bun run test
bun run build
bun run editor:frontend:build
```
