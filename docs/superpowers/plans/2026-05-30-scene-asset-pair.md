# Scene Asset Pair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Scene Asset Pair model where compiler Scenes are paired by colocated same-basename `.scene` and `.ts` files, and project-relative `.scene` paths are the unique Scene ids.

**Architecture:** Add shared compiler path utilities first, then update compiler parsing, validation, generation, CLI, Editor binding, preview, samples, and docs to use those utilities. Keep `.scene` as the primary authoring surface and remove old `<Scene script="...">` authoring rather than preserving compatibility shims.

**Tech Stack:** TypeScript, Bun, Vitest, PixiJS v8, Pixifact compiler, Pixifact CLI, React editor services.

---

## File Structure

Core compiler changes:

- Create `packages/pixifact/src/compiler/sceneAssetPair.ts`: pure path and pairing helpers used by compiler, CLI, and editor.
- Modify `packages/pixifact/src/compiler/spec.ts`: remove script binding from `SceneTemplate` options and add generated import alias option types.
- Modify `packages/pixifact/src/compiler/templateParser.ts`: reject root `script`, keep parsing child Scene `scene` attributes.
- Modify `packages/pixifact/src/compiler/templateSerializer.ts`: stop serializing root `script`.
- Modify `packages/pixifact/src/compiler/sceneProposal.ts`: normalize and validate child Scene references by current scene path.
- Modify `packages/pixifact/src/compiler/typescriptCompiler.ts`: use asset-path-based import aliases for root and child Scene script classes.
- Modify `packages/pixifact/src/compiler/compileScenes.ts`: discover `src/**/*.scene`, pair scripts, validate names and `@part`, normalize child refs, mirror generated output.

CLI changes:

- Modify `packages/pixifact-cli/src/automation.ts`: build compiler Scene contract index from paired assets instead of top-level `scenes/`.
- Modify `packages/pixifact-cli/src/pixifact-cli.ts`: update compile error mapping for missing pair and name mismatch messages.

Editor changes:

- Modify `apps/editor/src/services/sceneBindingIndex.ts`: bind `.scene` to same-directory same-basename script.
- Modify `apps/editor/src/services/projectFileTree.ts`: create same-directory Scene pairs and open paired scripts.
- Modify `apps/editor/src/services/compilerSceneBindingSync.ts`: refresh when any `.scene` or `.ts` source changes.
- Modify `apps/editor/src/services/compilerSceneExternalSync.ts`: validate using normalized Scene refs and paired contract index.
- Modify `apps/editor/src/preview/CompilerSceneViewport.tsx`: resolve child Scene references relative to the containing `.scene` path.
- Modify `apps/editor/src/document/compilerSceneDocumentController.ts`: remove script mutation from compiler Scene document state.
- Modify `apps/editor/src/panels/InspectorPanel.tsx`: show inferred paired script status and open the paired script without editing a root `script` field.
- Modify `apps/editor/src/panels/agentWorkflow.ts`: update AI prompt with Scene Asset Pair rules.
- Modify `apps/editor/src/panels/agentProposalReview.ts`: validate proposals using paired Scene contract index.

Scaffold, samples, docs, tests:

- Modify `packages/create-pixifact/templates/minimal/**`: move `MainMenu.scene` into `src/scenes/`, remove `script`, update prompt text and config.
- Modify `tests/scene-compiler.test.ts`, `tests/pixifact-cli.test.ts`, `tests/scene-script-interface.test.ts`, `tests/project-file-tree.test.ts`, `tests/agent-proposal-review.test.ts`, `tests/agent-panel-ui.test.ts`, `tests/editor-workbench-ui.test.ts`, `tests/create-pixifact.test.ts`, and sample tests touched by path changes.
- Modify `sample-projects/scene-compiler-demo/**` and `sample-projects/space-hud-game/**`: colocate `.scene` files with matching scripts under `src/scenes/`.
- Modify README and editor docs that still tell agents to edit `scenes/*.scene`.

---

### Task 1: Add Shared Scene Asset Pair Path Utilities

**Files:**
- Create: `packages/pixifact/src/compiler/sceneAssetPair.ts`
- Modify: `packages/pixifact/src/compiler/index.ts`
- Test: `tests/scene-compiler.test.ts`

- [ ] **Step 1: Add failing tests for path helpers**

Append these tests inside `describe('Pixifact scene compiler spike', () => { ... })` in `tests/scene-compiler.test.ts`:

```ts
it('normalizes compiler Scene asset paths and paired script paths', () => {
    expect(normalizeSceneAssetId('src\\ui\\Button.scene')).toBe('src/ui/Button.scene');
    expect(pairedSceneScriptPath('src/ui/Button.scene')).toBe('src/ui/Button.ts');
    expect(sceneLocalName('src/features/shop/Button.scene')).toBe('Button');
    expect(generatedSceneModulePath('src/features/shop/Button.scene')).toBe('src/features/shop/Button.scene.generated.ts');
    expect(sceneClassAlias('src/features/shop/Button.scene')).toBe('SceneClass_src_features_shop_Button');
});

it('resolves relative and project-relative Scene references from a containing scene', () => {
    expect(resolveSceneReference('src/menu/MainMenu.scene', './Button.scene')).toBe('src/menu/Button.scene');
    expect(resolveSceneReference('src/menu/MainMenu.scene', '../ui/Button.scene')).toBe('src/ui/Button.scene');
    expect(resolveSceneReference('src/menu/MainMenu.scene', 'src/shared/Panel.scene')).toBe('src/shared/Panel.scene');
    expect(() => resolveSceneReference('src/menu/MainMenu.scene', 'Button')).toThrow('Scene references must use .scene paths.');
});
```

Add imports at the top of the test file:

```ts
import {
    generatedSceneModulePath,
    normalizeSceneAssetId,
    pairedSceneScriptPath,
    resolveSceneReference,
    sceneClassAlias,
    sceneLocalName,
} from 'pixifact/compiler';
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
bunx vitest run tests/scene-compiler.test.ts -t "Scene asset paths|relative and project-relative"
```

Expected: FAIL because the exported helper functions do not exist.

- [ ] **Step 3: Create the helper module**

Create `packages/pixifact/src/compiler/sceneAssetPair.ts`:

```ts
import path from 'node:path';

export const defaultSceneSourceRoots = ['src'] as const;
export const ignoredSceneSourceDirectories = new Set([
    'node_modules',
    'dist',
    '.pixifact',
    'coverage',
    'test-results',
]);

export function toPosixPath(value: string) {
    return value.replaceAll(path.sep, '/').replaceAll('\\', '/');
}

export function normalizeSceneAssetId(value: string) {
    const normalized = toPosixPath(value).replace(/^\.\/+/, '').replace(/^\/+/, '');
    const parts = normalized.split('/').filter(Boolean);
    if (parts.includes('..')) {
        throw new Error(`Scene path "${value}" must stay inside projectRoot.`);
    }
    if (!normalized.endsWith('.scene')) {
        throw new Error(`Scene path "${value}" must end with .scene.`);
    }
    return parts.join('/');
}

export function isIgnoredSceneSourceDirectory(name: string) {
    return ignoredSceneSourceDirectories.has(name);
}

export function sceneLocalName(scenePath: string) {
    return path.posix.basename(normalizeSceneAssetId(scenePath), '.scene');
}

export function pairedSceneScriptPath(scenePath: string) {
    const assetId = normalizeSceneAssetId(scenePath);
    return `${assetId.slice(0, -'.scene'.length)}.ts`;
}

export function generatedSceneModulePath(scenePath: string) {
    return `${normalizeSceneAssetId(scenePath).slice(0, -'.scene'.length)}.scene.generated.ts`;
}

export function generatedSceneModuleImport(scenePath: string) {
    return `./${generatedSceneModulePath(scenePath).replace(/\.ts$/, '')}`;
}

export function sceneClassAlias(scenePath: string) {
    const base = normalizeSceneAssetId(scenePath)
        .slice(0, -'.scene'.length)
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `SceneClass_${base}`;
}

export function resolveSceneReference(fromScenePath: string, reference: string) {
    const value = reference.trim();
    if (!value.endsWith('.scene')) {
        throw new Error('Scene references must use .scene paths.');
    }
    if (value.startsWith('./') || value.startsWith('../')) {
        const baseDir = path.posix.dirname(normalizeSceneAssetId(fromScenePath));
        return normalizeSceneAssetId(path.posix.normalize(path.posix.join(baseDir, value)));
    }
    return normalizeSceneAssetId(value);
}
```

- [ ] **Step 4: Export the helpers**

Modify `packages/pixifact/src/compiler/index.ts` and add:

```ts
export * from './sceneAssetPair';
```

- [ ] **Step 5: Run helper tests and verify they pass**

Run:

```bash
bunx vitest run tests/scene-compiler.test.ts -t "Scene asset paths|relative and project-relative"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/pixifact/src/compiler/sceneAssetPair.ts packages/pixifact/src/compiler/index.ts tests/scene-compiler.test.ts
git commit -m "feat: add scene asset pair path helpers"
```

---

### Task 2: Remove Root Script Binding From Template Parse, Inspect, and Serialize

**Files:**
- Modify: `packages/pixifact/src/compiler/spec.ts`
- Modify: `packages/pixifact/src/compiler/templateParser.ts`
- Modify: `packages/pixifact/src/compiler/templateSerializer.ts`
- Modify: `packages/pixifact/src/compiler/sceneProposal.ts`
- Test: `tests/scene-compiler.test.ts`

- [ ] **Step 1: Update parser and serializer tests first**

In `tests/scene-compiler.test.ts`, update the existing inspect test input to remove `script`:

```ts
<Scene name="Button" width="180">
```

Update its expected summary to remove `script`.

Update the parser test named `parses a restricted XML scene template with scene props and slot outlet`:

```ts
expect('script' in template).toBe(false);
```

Remove the old expected `{ path: 'src/scenes/Button.ts' }`.

Add this test:

```ts
it('rejects root script attributes because Scene scripts are paired by file path', () => {
    expect(() => parseSceneTemplate('<Scene name="Button" script="src/scenes/Button.ts" />'))
        .toThrow('Scene script binding is inferred from the colocated TypeScript file.');
});
```

Update the serialization test to use:

```ts
<Scene name="MainMenu" width="960" height="540">
```

and assert:

```ts
expect(source).toContain('<Scene name="MainMenu" width="960" height="540">');
expect(source).not.toContain('script=');
```

- [ ] **Step 2: Run focused parser tests and verify they fail**

Run:

```bash
bunx vitest run tests/scene-compiler.test.ts -t "restricted XML|root script|serializes"
```

Expected: FAIL because parser still accepts and serializer still emits root `script`.

- [ ] **Step 3: Remove script from compiler template types**

Modify `packages/pixifact/src/compiler/spec.ts`:

```ts
export interface SceneTemplate {
    version: 2;
    name: string;
    props: Record<string, SceneTemplateValue>;
    interface: SceneTemplateInterface;
    children: SceneTemplateNode[];
}
```

Remove `SceneTemplateScript`.

Update `CompileSceneTemplateOptions` import-related types to this form for later tasks:

```ts
export interface SceneTemplateScriptImport {
    exportName: string;
    localName: string;
    source: string;
}

export interface CompileSceneTemplateOptions {
    functionName?: string;
    actionsParameter?: string;
    registrationPath?: string;
    scriptImport?: SceneTemplateScriptImport;
    sceneImports?: SceneTemplateScriptImport[];
    sceneClassAliases?: Record<string, string>;
    textureImports?: Record<string, string>;
}
```

- [ ] **Step 4: Reject root script in parser**

Modify `packages/pixifact/src/compiler/templateParser.ts`:

```ts
if (root.attributes.script !== undefined) {
    throw new Error('Scene script binding is inferred from the colocated TypeScript file.');
}
```

Remove creation of the `script` object and return the template without `script`.

- [ ] **Step 5: Stop serializing root script**

Modify `packages/pixifact/src/compiler/templateSerializer.ts` root attributes:

```ts
const rootAttributes: TemplateAttribute[] = [
    ['name', template.name],
    ...Object.entries(template.props),
];
```

- [ ] **Step 6: Remove script from inspection output**

Modify `packages/pixifact/src/compiler/sceneProposal.ts`:

```ts
export interface SceneTemplateInspection {
    name: string;
    props: Record<string, SceneTemplateValue>;
    nodeCount: number;
    nodes: SceneProposalNodeSummary[];
}
```

and return:

```ts
return {
    name: template.name,
    props: template.props,
    nodeCount: nodes.length,
    nodes,
};
```

- [ ] **Step 7: Run focused parser tests and verify they pass**

Run:

```bash
bunx vitest run tests/scene-compiler.test.ts -t "restricted XML|root script|serializes|inspects compiler"
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add packages/pixifact/src/compiler/spec.ts packages/pixifact/src/compiler/templateParser.ts packages/pixifact/src/compiler/templateSerializer.ts packages/pixifact/src/compiler/sceneProposal.ts tests/scene-compiler.test.ts
git commit -m "feat: infer scene scripts from asset pairs"
```

---

### Task 3: Compile Scene Asset Pairs With Recursive Source Discovery

**Files:**
- Modify: `packages/pixifact/src/compiler/compileScenes.ts`
- Modify: `packages/pixifact/src/compiler/typescriptCompiler.ts`
- Test: `tests/scene-compiler.test.ts`

- [ ] **Step 1: Add compiler integration tests**

Replace the existing test `generates scene registry files from a project scenes directory` with a new test that writes two same-basename Scene pairs in different directories:

```ts
it('generates scene registry files from colocated Scene asset pairs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
    try {
        await mkdir(join(root, 'src', 'ui'), { recursive: true });
        await mkdir(join(root, 'src', 'menu'), { recursive: true });
        await mkdir(join(root, 'src', 'assets'), { recursive: true });
        await writeFile(join(root, 'src', 'assets', 'btn.png'), 'fake-png');
        await writeFile(join(root, 'src', 'ui', 'Button.scene'), `
            <Scene name="Button" width="120" height="40">
              <Text id="labelText" text="Button" />
              <Sprite id="icon" texture="src/assets/btn.png" />
            </Scene>
        `);
        await writeFile(join(root, 'src', 'ui', 'Button.ts'), `
            import { Container, Text } from 'pixi.js';
            import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

            @scene()
            export class Button extends Container {
                @part()
                protected declare labelText: Text;

                @prop({ type: 'string', default: 'Button' })
                accessor label = 'Button';

                @event()
                readonly click = createEvent();

                @slot()
                icon!: Container;
            }
        `);
        await writeFile(join(root, 'src', 'menu', 'Button.scene'), '<Scene name="Button" />');
        await writeFile(join(root, 'src', 'menu', 'Button.ts'), `
            import { Container } from 'pixi.js';
            import { scene } from 'pixifact/compiler';

            @scene()
            export class Button extends Container {}
        `);

        await compileScenes({ projectRoot: root });

        const uiGenerated = await readFile(join(root, '.pixifact', 'generated', 'src', 'ui', 'Button.scene.generated.ts'), 'utf8');
        const menuGenerated = await readFile(join(root, '.pixifact', 'generated', 'src', 'menu', 'Button.scene.generated.ts'), 'utf8');
        const registry = await readFile(join(root, '.pixifact', 'generated', 'scenes.generated.ts'), 'utf8');

        expect(uiGenerated).toContain('registerScene("src/ui/Button.scene"');
        expect(uiGenerated).toContain('registerSceneClass(SceneClass_src_ui_Button, "src/ui/Button.scene");');
        expect(uiGenerated).toContain('import { Button as SceneClass_src_ui_Button } from "../../../src/ui/Button";');
        expect(uiGenerated).toContain('import __pixifactTextureUrl1 from "../../../src/assets/btn.png?url";');
        expect(menuGenerated).toContain('registerScene("src/menu/Button.scene"');
        expect(menuGenerated).toContain('import { Button as SceneClass_src_menu_Button } from "../../../src/menu/Button";');
        expect(registry).toContain("import './src/ui/Button.scene.generated';");
        expect(registry).toContain("import './src/menu/Button.scene.generated';");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
```

Add a second test:

```ts
it('rejects missing paired scripts and mismatched local names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pixifact-scenes-'));
    try {
        await mkdir(join(root, 'src', 'ui'), { recursive: true });
        await writeFile(join(root, 'src', 'ui', 'Button.scene'), '<Scene name="PrimaryButton" />');

        await expect(compileScenes({ projectRoot: root }))
            .rejects.toThrow('Scene "src/ui/Button.scene" name "PrimaryButton" must match file basename "Button".');

        await writeFile(join(root, 'src', 'ui', 'Button.scene'), '<Scene name="Button" />');
        await expect(compileScenes({ projectRoot: root }))
            .rejects.toThrow('Scene "src/ui/Button.scene" requires paired script "src/ui/Button.ts".');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
```

- [ ] **Step 2: Run compiler integration tests and verify they fail**

Run:

```bash
bunx vitest run tests/scene-compiler.test.ts -t "colocated Scene asset pairs|missing paired scripts"
```

Expected: FAIL because compile still scans `scenes/` and expects `script`.

- [ ] **Step 3: Update generated imports and aliases**

Modify `packages/pixifact/src/compiler/typescriptCompiler.ts`:

```ts
for (const sceneImport of this.options.sceneImports ?? []) {
    lines.push(`import { ${sceneImport.exportName} as ${sceneImport.localName} } from ${JSON.stringify(sceneImport.source)};`);
}
if (this.options.scriptImport) {
    lines.push(`import { ${this.options.scriptImport.exportName} as ${this.options.scriptImport.localName} } from ${JSON.stringify(this.options.scriptImport.source)};`);
}
```

Update registration:

```ts
registerSceneClass(${this.options.scriptImport.localName}, ${JSON.stringify(this.options.registrationPath)});
```

Add a helper in `CompileContext`:

```ts
#sceneConstructorName(node: SceneInstanceTemplateNode) {
    return this.options.sceneClassAliases?.[node.scene] ?? node.type;
}
```

Use it in `#compileSceneInstance` and `#compileSlottedNode`:

```ts
const constructorName = this.#sceneConstructorName(node);
this.#lines.push(`  const ${variable} = new ${constructorName}();`);
```

Use `constructorName` for generated part type collection when `node.kind === 'sceneInstance'`.

- [ ] **Step 4: Rewrite compile scene discovery around asset pairs**

Modify `packages/pixifact/src/compiler/compileScenes.ts` to use:

```ts
import {
    defaultSceneSourceRoots,
    generatedSceneModuleImport,
    generatedSceneModulePath,
    isIgnoredSceneSourceDirectory,
    normalizeSceneAssetId,
    pairedSceneScriptPath,
    resolveSceneReference,
    sceneClassAlias,
    sceneLocalName,
    toPosixPath,
} from './sceneAssetPair';
```

Replace `CompileScenesOptions.scenesDir` with:

```ts
sourceRoots?: string[];
```

Add recursive collection:

```ts
async function collectSceneAssetIds(projectRoot: string, sourceRoots = defaultSceneSourceRoots) {
    const scenes: string[] = [];
    for (const sourceRoot of sourceRoots) {
        const absoluteRoot = path.resolve(projectRoot, sourceRoot);
        if (!await exists(absoluteRoot)) {
            continue;
        }
        await collectScenesInDirectory(projectRoot, absoluteRoot, scenes);
    }
    return scenes.sort();
}

async function collectScenesInDirectory(projectRoot: string, directory: string, scenes: string[]) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!isIgnoredSceneSourceDirectory(entry.name)) {
                await collectScenesInDirectory(projectRoot, path.join(directory, entry.name), scenes);
            }
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.scene')) {
            scenes.push(normalizeSceneAssetId(toPosixPath(path.relative(projectRoot, path.join(directory, entry.name)))));
        }
    }
}

async function exists(filePath: string) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}
```

Add pair validation:

```ts
function assertSceneLocalName(scenePath: string, template: SceneTemplate) {
    const expected = sceneLocalName(scenePath);
    if (template.name !== expected) {
        throw new Error(`Scene "${scenePath}" name "${template.name}" must match file basename "${expected}".`);
    }
}
```

Read paired script:

```ts
const scriptPath = pairedSceneScriptPath(scenePath);
const absoluteScriptPath = path.resolve(projectRoot, scriptPath);
if (!await exists(absoluteScriptPath)) {
    throw new Error(`Scene "${scenePath}" requires paired script "${scriptPath}".`);
}
const descriptor = extractSceneScriptInterface(await readFile(absoluteScriptPath, 'utf8'), absoluteScriptPath, { scene: scenePath });
```

Validate descriptor class name:

```ts
if (descriptor.className !== template.name) {
    throw new Error(`Scene "${scenePath}" name "${template.name}" must match @scene class "${descriptor.className}".`);
}
```

- [ ] **Step 5: Normalize child Scene references before validation and generation**

In `compileScenes.ts`, add:

```ts
function normalizeSceneReferences(scenePath: string, template: SceneTemplate): SceneTemplate {
    const next = structuredClone(template);
    function visit(node: SceneTemplateNode) {
        if (node.kind === 'slotOutlet') {
            return;
        }
        if (node.kind === 'pixi') {
            node.children.forEach(visit);
            return;
        }
        node.scene = resolveSceneReference(scenePath, node.scene);
        for (const children of Object.values(node.slots)) {
            children.forEach(visit);
        }
    }
    next.children.forEach(visit);
    return next;
}
```

Use the normalized template in the `templates` map.

- [ ] **Step 6: Generate mirrored output paths**

When writing generated files:

```ts
const outputFile = generatedSceneModulePath(scenePath);
await mkdir(path.dirname(path.join(generatedDir, outputFile)), { recursive: true });
await writeFile(path.join(generatedDir, outputFile), code);
registryImports.push(`import ${JSON.stringify(generatedSceneModuleImport(scenePath))};`);
```

Build imports:

```ts
scriptImport: {
    exportName: template.name,
    localName: sceneClassAlias(scenePath),
    source: importSourceFor(path.resolve(projectRoot, pairedSceneScriptPath(scenePath)), generatedFileDir),
},
sceneImports: sceneImportsFor(template, templates, projectRoot, generatedFileDir),
sceneClassAliases: sceneClassAliasesFor(template),
```

Use helper:

```ts
function importSourceFor(sourcePath: string, generatedFileDir: string) {
    const source = path.relative(generatedFileDir, sourcePath).replaceAll(path.sep, '/').replace(/\.ts$/, '');
    return source.startsWith('.') ? source : `./${source}`;
}
```

- [ ] **Step 7: Run compiler integration tests**

Run:

```bash
bunx vitest run tests/scene-compiler.test.ts -t "colocated Scene asset pairs|missing paired scripts|scene registry"
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add packages/pixifact/src/compiler/compileScenes.ts packages/pixifact/src/compiler/typescriptCompiler.ts tests/scene-compiler.test.ts
git commit -m "feat: compile colocated scene asset pairs"
```

---

### Task 4: Update Scene Validation and CLI Contract Indexing

**Files:**
- Modify: `packages/pixifact/src/compiler/sceneProposal.ts`
- Modify: `packages/pixifact-cli/src/automation.ts`
- Modify: `packages/pixifact-cli/src/pixifact-cli.ts`
- Test: `tests/pixifact-cli.test.ts`

- [ ] **Step 1: Update CLI compiler fixture**

Modify `createCompilerSceneProject()` in `tests/pixifact-cli.test.ts`:

```ts
function createCompilerSceneProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-compiler-cli-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'src', 'scenes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'scenes', 'Button.scene'), [
        '<Scene name="Button">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(root, 'src', 'scenes', 'Button.ts'), [
        'import { Container } from "pixi.js";',
        'import { scene } from "pixifact/compiler";',
        '',
        '@scene()',
        'export class Button extends Container {}',
        '',
    ].join('\n'), 'utf8');
    return root;
}
```

Update all CLI compiler scene paths in this file from `scenes/Button.scene` to `src/scenes/Button.scene`. Remove `script="src/scenes/Button.ts"` from compiler `.scene` source strings. Keep legacy JSON Scene tests untouched.

- [ ] **Step 2: Add CLI tests for source-root and bare reference validation**

Add:

```ts
it('rejects compiler scene validation outside source roots', async () => {
    const projectRoot = createCompilerSceneProject();
    fs.mkdirSync(path.join(projectRoot, 'scenes'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'scenes', 'Button.scene'), [
        '<Scene name="Button">',
        '</Scene>',
        '',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'scenes', 'Button.ts'), [
        'import { Container } from "pixi.js";',
        'import { scene } from "pixifact/compiler";',
        '',
        '@scene()',
        'export class Button extends Container {}',
        '',
    ].join('\n'), 'utf8');

    const result = await runCli([
        'scene',
        'validate',
        '--project-root',
        projectRoot,
        '--scene',
        'scenes/Button.scene',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.json).toMatchObject({
        ok: false,
        scene: 'scenes/Button.scene',
        error: 'Scene validation failed.',
        diagnostics: [{
            path: '__scene__',
            prop: 'path',
            expected: 'Scene under source root "src/"',
            actual: 'scenes/Button.scene',
            hint: 'Move the .scene/.ts pair under src/ or configure an explicit Scene source root.',
        }],
    });
});

it('rejects bare child scene references', async () => {
    const projectRoot = createCompilerSceneProject();
    fs.writeFileSync(path.join(projectRoot, 'src', 'scenes', 'Button.scene'), [
        '<Scene name="Button">',
        '  <Button id="child" scene="Button" />',
        '</Scene>',
        '',
    ].join('\n'), 'utf8');

    const result = await runCli([
        'scene',
        'validate',
        '--project-root',
        projectRoot,
        '--scene',
        'src/scenes/Button.scene',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.json).toMatchObject({
        ok: false,
        scene: 'src/scenes/Button.scene',
        error: 'Scene validation failed.',
        diagnostics: [{
            path: '0:child',
            prop: 'scene',
            expected: 'project-relative or relative .scene path',
            actual: 'Button',
        }],
    });
});
```

- [ ] **Step 3: Run CLI tests and verify they fail**

Run:

```bash
bunx vitest run tests/pixifact-cli.test.ts -t "compiler scene|bare child"
```

Expected: FAIL because CLI still builds contract indexes from `scenes/` and old script attributes.

- [ ] **Step 4: Normalize Scene references in validation**

Modify `ValidateSceneContentOptions` and `CheckSceneProposalOptions` in `sceneProposal.ts`:

```ts
sceneInterfaces?: Record<string, SceneTemplateInterface>;
normalizeSceneReference?: (scene: string) => string;
```

In `validateSceneInstanceNodeProposal`, before contract lookup:

```ts
let scene = node.scene;
try {
    scene = context.normalizeSceneReference ? context.normalizeSceneReference(node.scene) : node.scene;
} catch (error) {
    return [{
        path,
        prop: 'scene',
        expected: 'project-relative or relative .scene path',
        actual: node.scene,
        hint: error instanceof Error ? error.message : 'Use a .scene path.',
    }];
}
const sceneInterface = context.sceneInterfaces?.[scene];
```

Use `scene` in expected messages:

```ts
expected: `public prop declared by ${scene}`,
```

- [ ] **Step 5: Update CLI scene interface collection**

In `packages/pixifact-cli/src/automation.ts`, replace `collectCompilerSceneInterfaces` and `readCompilerSceneInterface` with recursive paired-asset collection:

```ts
function collectCompilerSceneInterfaces(root: string, skippedScene?: string) {
    const interfaces: Record<string, SceneTemplateInterface> = {};
    for (const scenePath of collectCompilerScenePaths(root)) {
        if (scenePath === skippedScene) {
            continue;
        }
        const template = parseSceneTemplate(readTextFile(path.join(root, scenePath)));
        const scriptPath = pairedSceneScriptPath(scenePath);
        const absoluteScriptPath = path.join(root, scriptPath);
        if (!fs.existsSync(absoluteScriptPath)) {
            continue;
        }
        interfaces[scenePath] = extractSceneScriptInterface(readTextFile(absoluteScriptPath), absoluteScriptPath, { scene: scenePath }).interface;
    }
    return interfaces;
}
```

Add:

```ts
function collectCompilerScenePaths(root: string) {
    const results: string[] = [];
    for (const sourceRoot of defaultSceneSourceRoots) {
        const absoluteSourceRoot = path.join(root, sourceRoot);
        if (fs.existsSync(absoluteSourceRoot)) {
            collectCompilerScenePathsIn(root, absoluteSourceRoot, results);
        }
    }
    return results.sort();
}

function collectCompilerScenePathsIn(root: string, directory: string, results: string[]) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!isIgnoredSceneSourceDirectory(entry.name)) {
                collectCompilerScenePathsIn(root, path.join(directory, entry.name), results);
            }
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.scene')) {
            results.push(normalizeSceneAssetId(path.relative(root, path.join(directory, entry.name))));
        }
    }
}
```

Import helpers from `pixifact/compiler`:

```ts
defaultSceneSourceRoots,
isIgnoredSceneSourceDirectory,
normalizeSceneAssetId,
pairedSceneScriptPath,
resolveSceneReference,
```

- [ ] **Step 6: Validate target Scene source roots and pass reference normalizers**

Add a source-root diagnostic helper in `automation.ts`:

```ts
function compilerSceneSourceRootDiagnostic(scenePath: string) {
    const normalized = normalizeSceneAssetId(scenePath);
    const insideRoot = defaultSceneSourceRoots.some((sourceRoot) => normalized.startsWith(`${sourceRoot}/`));
    if (insideRoot) {
        return undefined;
    }
    return {
        path: '__scene__',
        prop: 'path',
        expected: 'Scene under source root "src/"',
        actual: normalized,
        hint: 'Move the .scene/.ts pair under src/ or configure an explicit Scene source root.',
    };
}
```

In `validateCompilerScene`, before `validateSceneContent`, return a structured failure when the target is outside source roots:

```ts
const sourceRootDiagnostic = compilerSceneSourceRootDiagnostic(loaded.scenePath);
if (sourceRootDiagnostic) {
    return {
        ok: false,
        scene: loaded.scenePath,
        error: 'Scene validation failed.',
        diagnostics: [sourceRootDiagnostic],
    };
}
```

In `validateCompilerScene`, pass:

```ts
normalizeSceneReference: (scene) => resolveSceneReference(loaded.scenePath, scene),
```

In proposal check/apply, parse the proposal content to identify the target scene path and pass:

```ts
normalizeSceneReference: (scene) => resolveSceneReference(loaded.scenePath, scene),
```

- [ ] **Step 7: Update compile error mapping**

In `packages/pixifact-cli/src/pixifact-cli.ts`, add handling for:

```ts
const missingPair = message.match(/^Scene "([^"]+)" requires paired script "([^"]+)"\.$/);
```

Return:

```ts
{
    ok: false,
    scene,
    error: 'Scene compile failed.',
    diagnostics: [{
        path: '__scene__',
        prop: 'script',
        expected: `paired script "${scriptPath}"`,
        actual: 'missing script',
        hint: 'Create a colocated TypeScript file with the same basename as the .scene file.',
    }],
    hint: 'Fix the listed diagnostics, then run compile-scenes again.',
}
```

- [ ] **Step 8: Run CLI tests**

Run:

```bash
bunx vitest run tests/pixifact-cli.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add packages/pixifact/src/compiler/sceneProposal.ts packages/pixifact-cli/src/automation.ts packages/pixifact-cli/src/pixifact-cli.ts tests/pixifact-cli.test.ts
git commit -m "feat: validate scene asset pair contracts in cli"
```

---

### Task 5: Update Editor Scene Pair Binding and Preview

**Files:**
- Modify: `apps/editor/src/services/sceneBindingIndex.ts`
- Modify: `apps/editor/src/services/projectFileTree.ts`
- Modify: `apps/editor/src/services/compilerSceneBindingSync.ts`
- Modify: `apps/editor/src/services/compilerSceneExternalSync.ts`
- Modify: `apps/editor/src/preview/CompilerSceneViewport.tsx`
- Modify: `apps/editor/src/document/compilerSceneDocumentController.ts`
- Modify: `apps/editor/src/panels/InspectorPanel.tsx`
- Test: `tests/project-file-tree.test.ts`
- Test: `tests/agent-proposal-review.test.ts`

- [ ] **Step 1: Update project tree tests for colocated pairs**

In `tests/project-file-tree.test.ts`, update scene fixtures so compiler scenes and scripts live together:

```ts
src: host.directory({
    scenes: host.directory({
        'Button.scene': host.file('<Scene name="Button"><Text id="labelText" text="Button" /></Scene>'),
        'Button.ts': buttonSceneScript(),
    }),
}),
```

Update `createAndOpenSceneFile` expectations:

```ts
expect(host.createProjectFile).toHaveBeenCalledWith(
    '/tmp/GameProject',
    'GameProject/src/scenes',
    'Inventory.scene',
    expect.stringContaining('<Scene name="Inventory"')
);
expect(host.createProjectFile).toHaveBeenCalledWith(
    '/tmp/GameProject',
    'GameProject/src/scenes',
    'Inventory.ts',
    expect.stringContaining('export class Inventory')
);
```

Add a focused test:

```ts
it('opens compiler scene scripts from the colocated asset pair', async () => {
    host.reset({
        src: host.directory({
            scenes: host.directory({
                'Button.scene': host.file('<Scene name="Button" />'),
                'Button.ts': buttonSceneScript(),
            }),
        }),
    });
    const tree = await readHostTree();
    const file = findFileByPath(tree, 'GameProject/src/scenes/Button.scene')!;
    const opened = await openCompilerSceneFile(tree, file);

    await openCompilerSceneScriptFile(tree, opened.template, file);

    expect(host.openHostCodeFile).toHaveBeenCalledWith('/tmp/GameProject', 'src/scenes/Button.ts');
});
```

- [ ] **Step 2: Run project tree tests and verify they fail**

Run:

```bash
bunx vitest run tests/project-file-tree.test.ts -t "compiler scene|colocated|script"
```

Expected: FAIL because editor still reads `template.script`.

- [ ] **Step 3: Update scene binding index**

In `apps/editor/src/services/sceneBindingIndex.ts`, import:

```ts
import { pairedSceneScriptPath, resolveSceneReference } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
```

Replace the `template.script` requirement with:

```ts
const scriptPath = pairedSceneScriptPath(scenePath);
const scriptFile = findFileByPath(projectTree, `${projectTree.path}/${scriptPath}`);
if (!scriptFile) {
    throw new Error(`找不到 Scene 脚本 ${scriptPath}。`);
}
```

Keep class/name validation:

```ts
if (descriptor.className !== template.name) {
    throw new Error(`Scene ${file.name} 的 name "${template.name}" 必须等于脚本 @scene 类名 "${descriptor.className}"。`);
}
```

Update `sceneInterfacesForCompilerTemplate` to normalize child references:

```ts
export function sceneInterfacesForCompilerTemplate(
    index: CompilerSceneBindingIndex,
    nodes: readonly SceneTemplateNode[],
    ownerScenePath?: string,
) {
    return Object.fromEntries(
        [...collectSceneInstancePaths(nodes, ownerScenePath)]
            .filter((scenePath) => index[scenePath])
            .map((scenePath) => [scenePath, index[scenePath].interface]),
    );
}
```

Update collection to call `resolveSceneReference(ownerScenePath, node.scene)` when `ownerScenePath` is provided.

- [ ] **Step 4: Update project file creation and script opening**

In `apps/editor/src/services/projectFileTree.ts`:

Remove `script` from `createBlankCompilerScene`.

Change script path creation:

```ts
const scriptPath = `${directory.path}/${scriptFileName}`;
```

Remove `ensureProjectDirectoryPath(projectTree, ['src', 'scenes'])`.

Create both files in `directory.path`:

```ts
await createHostProjectFile(projectRootPath, directory.path, fileName, content);
await createHostProjectFile(projectRootPath, directory.path, scriptFileName, createBlankCompilerSceneScript(name));
```

Change `openCompilerSceneScriptFile` signature:

```ts
export async function openCompilerSceneScriptFile(
    projectTree: ProjectFileTreeNode,
    template: SceneTemplate,
    sceneFile?: ProjectFileTreeNode,
)
```

Resolve paired script from `sceneFile` when provided, or from the current opened scene path in callers.

Implement the script resolution as:

```ts
const sceneRelativePath = sceneFile
    ? projectFileRelativePath(projectTree, sceneFile)
    : undefined;
if (!sceneRelativePath) {
    throw new ProjectFileOperationError(`Scene ${template.name} 缺少文件路径，无法推导脚本。`);
}
const scriptPath = pairedSceneScriptPath(sceneRelativePath);
const scriptFile = findFileByPath(projectTree, `${projectTree.path}/${scriptPath}`);
if (!scriptFile) {
    throw new ProjectFileOperationError(`找不到 Scene 脚本 ${scriptPath}。`);
}
await openProjectCodeFile(projectTree, scriptFile);
```

- [ ] **Step 5: Remove root script editing from compiler document and Inspector**

In `apps/editor/src/document/compilerSceneDocumentController.ts`, remove the `SceneTemplateScript` import and remove `script` from `updateCompilerSceneTemplate`:

```ts
export function updateCompilerSceneTemplate(updates: {
    name?: string;
    props?: Record<string, SceneTemplateValue | undefined>;
}) {
```

Delete this block:

```ts
if ('script' in updates) {
    template.script = updates.script;
}
```

In `apps/editor/src/panels/InspectorPanel.tsx`, import paired path helpers and the relative-path helper:

```ts
import { pairedSceneScriptPath } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import {
    findFileByPath,
    openCompilerSceneScriptFile,
    assetDragDataType,
    projectFileRelativePath,
    resolveProjectAssetReference,
} from '../services/projectFileTree';
```

Remove `commitCompilerSceneScriptPath` and remove the editable `script` field from the Scene section:

```tsx
<FieldRow label="script" value={compilerBindingStatus?.scriptPath} />
```

Update `readCompilerSceneBindingStatus` so the script path is inferred from the opened scene file:

```ts
const sceneFile = findFileByPath(projectTree, scenePath);
const scriptPath = sceneFile
    ? pairedSceneScriptPath(projectFileRelativePath(projectTree, sceneFile))
    : undefined;
```

Use `scriptPath` in status return objects instead of `template.script?.path`, and call script opening with the scene file:

```ts
const sceneFile = findFileByPath(projectTree, compilerDocument.scenePath);
await openCompilerSceneScriptFile(projectTree, compilerDocument.template, sceneFile);
```

Remove `compilerDocument?.template.script?.path` from the `useEffect` dependency list.

- [ ] **Step 6: Update external sync source change detection**

In `apps/editor/src/services/compilerSceneBindingSync.ts`:

```ts
export function isCompilerBindingSourceChange(event: { path: string; kind: string }) {
    return event.kind === 'scene' || event.path.endsWith('.ts') || event.path.endsWith('.tsx');
}
```

- [ ] **Step 7: Update preview Scene reference resolution**

In `CompilerSceneViewport.tsx`, replace `sceneRootPath` with `currentScenePath` in `RenderContext`.

Use:

```ts
function projectAbsoluteScenePath(projectTree: ProjectFileTreeNode, scenePath: string) {
    return scenePath.startsWith(`${projectTree.path}/`)
        ? scenePath
        : `${projectTree.path}/${scenePath}`;
}

function normalizedSceneReference(context: RenderContext, scene: string) {
    const ownerRelative = context.currentScenePath.startsWith(`${context.projectTree.path}/`)
        ? context.currentScenePath.slice(context.projectTree.path.length + 1)
        : context.currentScenePath;
    return projectAbsoluteScenePath(context.projectTree, resolveSceneReference(ownerRelative, scene));
}
```

When rendering nested scenes, call:

```ts
const normalizedPath = normalizedSceneReference(context, node.scene);
const template = await loadSceneTemplate(context, node.scene);
const rendered = await renderScene(template, { ...context, currentScenePath: normalizedPath });
```

- [ ] **Step 8: Update proposal review and external validation normalizers**

In `agentProposalReview.ts` and `compilerSceneExternalSync.ts`, pass:

```ts
sceneInterfaces: sceneInterfacesForCompilerTemplate(bindingIndex, template.children, target.scenePath),
normalizeSceneReference: (scene) => resolveSceneReference(target.scenePath, scene),
```

Use the local variable names already present in each file.

- [ ] **Step 9: Run editor service tests**

Run:

```bash
bunx vitest run tests/project-file-tree.test.ts tests/agent-proposal-review.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 5**

```bash
git add apps/editor/src/services/sceneBindingIndex.ts apps/editor/src/services/projectFileTree.ts apps/editor/src/services/compilerSceneBindingSync.ts apps/editor/src/services/compilerSceneExternalSync.ts apps/editor/src/preview/CompilerSceneViewport.tsx apps/editor/src/document/compilerSceneDocumentController.ts apps/editor/src/panels/InspectorPanel.tsx tests/project-file-tree.test.ts tests/agent-proposal-review.test.ts
git commit -m "feat: bind editor scenes by colocated script pairs"
```

---

### Task 6: Update Agent Workflow Text, Scaffold, Samples, and Docs

**Files:**
- Modify: `apps/editor/src/panels/agentWorkflow.ts`
- Modify: `apps/editor/src/i18n.ts`
- Modify: `packages/create-pixifact/templates/minimal/**`
- Modify: `sample-projects/scene-compiler-demo/**`
- Modify: `sample-projects/space-hud-game/**`
- Modify: `README.md`, `docs/AI_SCENE_AUTHORING.md`, `apps/editor/README.md`, `apps/editor/src/agent/README.md`, `skills/pixifact/SKILL.md`, `skills/pixifact/references/compiler-scene-agent.md`
- Test: `tests/create-pixifact.test.ts`
- Test: `tests/agent-panel.test.ts`
- Test: `tests/space-hud-game.test.ts`

- [ ] **Step 1: Update agent prompt tests**

In `tests/agent-panel.test.ts`, update expected commands to use `src/scenes/Hud.scene`. Add expectations that the prompt includes:

```ts
expect(workflow.agentPrompt).toContain('A Scene asset is a pair of colocated files with the same basename.');
expect(workflow.agentPrompt).toContain('Do not add script="..." to .scene files.');
expect(workflow.agentPrompt).toContain('The unique Scene id is the project-relative .scene path.');
```

- [ ] **Step 2: Update `createAgentCliWorkflow` prompt**

In `apps/editor/src/panels/agentWorkflow.ts`, replace the current prompt array with the mechanical rules from the design:

```ts
agentPrompt: [
    'You are editing a Pixifact project.',
    'Pixifact Scene asset rules:',
    '- A Scene asset is a pair of colocated files with the same basename.',
    '- The .scene file owns visual structure, hierarchy, layout, text, images, child Scene instances, slots, and event wiring.',
    '- The .ts file owns behavior, runtime state updates, public props/events/slots, and @part access.',
    '- Do not add script="..." to .scene files.',
    '- Do not add template paths to @scene().',
    '- Pairing is by same directory + same basename.',
    '- The unique Scene id is the project-relative .scene path.',
    '- Scene names and class names are local, not globally unique.',
    '- Reference other Scenes with .scene paths, never bare names.',
    '- Do not edit .pixifact/generated.',
    `Current Scene: ${scene}`,
    `After editing, run: bun run pixifact -- scene validate --project-root ${projectRootArg} --scene ${sceneArg}`,
    `Then run: bun run pixifact -- compile-scenes --project-root ${projectRootArg}`,
    'Finally run the smallest relevant build or test.',
].join('\n'),
```

- [ ] **Step 3: Update scaffold template**

Move:

```txt
packages/create-pixifact/templates/minimal/scenes/MainMenu.scene
```

to:

```txt
packages/create-pixifact/templates/minimal/src/scenes/MainMenu.scene
```

Remove `script="src/scenes/MainMenu.ts"` from the Scene root.

Update `packages/create-pixifact/templates/minimal/pixifact.project.json`:

```json
"scenes": {
  "mainMenu": "src/scenes/MainMenu.scene"
}
```

Update the hint text inside `MainMenu.scene` from `Edit scenes/MainMenu.scene` to `Edit src/scenes/MainMenu.scene`.

- [ ] **Step 4: Update scaffold test**

In `tests/create-pixifact.test.ts`:

```ts
expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.scene')).not.toContain('script=');
expect(await readProjectFile(projectRoot, 'src/scenes/MainMenu.ts')).toContain('export class MainMenu');
expect(JSON.parse(await readProjectFile(projectRoot, 'pixifact.project.json'))).toMatchObject({
    scenes: {
        mainMenu: 'src/scenes/MainMenu.scene',
    },
});
```

- [ ] **Step 5: Update sample project tests and migrate sample scenes**

In `tests/space-hud-game.test.ts`, update the scene paths and remove the root script assertion:

```ts
expect(config.scenes).toMatchObject({
    mainMenu: 'src/scenes/MainMenu.scene',
    hud: 'src/scenes/Hud.scene',
    gameOver: 'src/scenes/GameOver.scene',
});

for (const scenePath of Object.values(config.scenes)) {
    const template = parseSceneTemplate(readSampleFile(scenePath));
    expect(template.props).toMatchObject({
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
    });
    expect('script' in template).toBe(false);
}
```

Then migrate the sample scene assets.

Move these files:

```txt
sample-projects/scene-compiler-demo/scenes/Button.scene -> sample-projects/scene-compiler-demo/src/scenes/Button.scene
sample-projects/scene-compiler-demo/scenes/Panel.scene -> sample-projects/scene-compiler-demo/src/scenes/Panel.scene
sample-projects/scene-compiler-demo/scenes/MainMenu.scene -> sample-projects/scene-compiler-demo/src/scenes/MainMenu.scene
sample-projects/space-hud-game/scenes/Hud.scene -> sample-projects/space-hud-game/src/scenes/Hud.scene
sample-projects/space-hud-game/scenes/MainMenu.scene -> sample-projects/space-hud-game/src/scenes/MainMenu.scene
sample-projects/space-hud-game/scenes/GameOver.scene -> sample-projects/space-hud-game/src/scenes/GameOver.scene
```

Remove root `script` attributes from all moved files.

Update child Scene references:

```xml
scene="./Panel.scene"
scene="./Button.scene"
```

where the child lives in the same `src/scenes` directory.

- [ ] **Step 6: Update sample configs, inspector copy, and docs**

Update every sample `pixifact.project.json` scene path from `scenes/*.scene` to `src/scenes/*.scene`.

Update README command examples:

```bash
bun run pixifact -- scene validate --project-root sample-projects/space-hud-game --scene src/scenes/Hud.scene
```

Update proposal JSON `scene` values and proposal contents to remove root `script`.

In `apps/editor/src/i18n.ts`, update `compilerPublicContractHint` in both languages so it no longer says `.scene` stores a `script` binding. The new text should describe `.scene` as the visual/template source and the paired `.ts` as the behavior source.

- [ ] **Step 7: Update repository docs and skill source**

Search:

```bash
rg "scenes/|script=|<Scene name=.*script" README.md docs apps/editor skills sample-projects packages/create-pixifact tests -g '*.md' -g '*.scene' -g '*.ts' -g '*.json'
```

Update user-facing docs to say:

```txt
Edit project-relative .scene paths such as src/scenes/Hud.scene.
Scene scripts are paired by same directory and same basename.
Do not edit .pixifact/generated.
```

Keep references to legacy JSON SceneSpec tests only where they are unrelated to compiler `.scene`.

- [ ] **Step 8: Run scaffold, agent panel, and sample tests**

Run:

```bash
bunx vitest run tests/create-pixifact.test.ts tests/agent-panel.test.ts tests/space-hud-game.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 6**

```bash
git add apps/editor/src/panels/agentWorkflow.ts apps/editor/src/i18n.ts packages/create-pixifact/templates/minimal sample-projects README.md docs apps/editor/README.md apps/editor/src/agent/README.md skills/pixifact tests/create-pixifact.test.ts tests/agent-panel.test.ts tests/space-hud-game.test.ts
git commit -m "docs: update scene asset pair workflows"
```

---

### Task 7: Full Verification and Cleanup

**Files:**
- Modify only files already touched by previous tasks if failures reveal gaps.

- [ ] **Step 1: Run focused compiler and CLI tests**

Run:

```bash
bunx vitest run tests/scene-compiler.test.ts tests/pixifact-cli.test.ts tests/scene-script-interface.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused editor tests**

Run:

```bash
bunx vitest run tests/project-file-tree.test.ts tests/agent-proposal-review.test.ts tests/agent-panel-ui.test.ts tests/editor-workbench-ui.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repository test suite**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 4: Run build checks**

Run:

```bash
bun run build
bun run editor:frontend:build
```

Expected: PASS.

- [ ] **Step 5: Verify sample builds**

Run:

```bash
cd sample-projects/scene-compiler-demo && bun run build
cd ../space-hud-game && bun run build
```

Expected: both builds pass and generated files appear under mirrored `.pixifact/generated/src/scenes/`.

- [ ] **Step 6: Search for removed authoring forms**

Run:

```bash
rg 'script="|scenes/[A-Za-z0-9_-]+\\.scene|\\.pixifact/generated/[^\\n]+\\.ts' README.md docs apps packages sample-projects tests skills -g '*.md' -g '*.ts' -g '*.tsx' -g '*.scene' -g '*.json'
```

Expected: no user-facing compiler `.scene` authoring example still uses root `script="..."` or top-level `scenes/*.scene` as the default path. Generated-output references are allowed only when warning not to edit generated files.

- [ ] **Step 7: Commit final cleanup**

If Step 6 required cleanup:

```bash
git add -u README.md docs apps packages sample-projects tests skills
git commit -m "chore: finish scene asset pair migration"
```

If no cleanup was needed, do not create an empty commit.
