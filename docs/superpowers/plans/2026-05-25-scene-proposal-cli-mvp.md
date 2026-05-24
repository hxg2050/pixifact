# Scene Proposal CLI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable compiler `.scene` proposal loop for external agents: inspect a compiler scene, check a `.scene proposal`, apply it after validation, and compile generated TypeScript.

**Architecture:** Add a small compiler-level proposal module that treats agent output as untrusted `.scene` source. The module parses, canonicalizes, validates, computes a semantic diff, and only writes files through the CLI apply command. CLI support lives beside the existing legacy SceneSpec automation but does not reuse `SceneCommand[]`.

**Tech Stack:** TypeScript, Bun, Vitest, Pixifact compiler parser/serializer, Pixifact CLI.

---

## File Structure

- Create `packages/pixifact/src/compiler/sceneProposal.ts`
  - Owns `SceneProposalEnvelope`, `SceneProposalCheckResult`, `SceneProposalDiffEntry`, `createSceneRevision`, `inspectSceneTemplate`, `checkSceneProposal`, and `applySceneProposal`.
  - Depends only on compiler parser/serializer/spec types and caller-provided file content.
- Modify `packages/pixifact/src/compiler/index.ts`
  - Re-export the proposal module from `pixifact/compiler`.
- Modify `packages/pixifact-cli/src/automation.ts`
  - Add compiler scene helpers that read text `.scene` files, call scene proposal APIs, and write canonical `.scene` output on apply.
  - Keep legacy SceneSpec JSON helpers unchanged.
- Modify `packages/pixifact-cli/src/pixifact-cli.ts`
  - Add `scene inspect`, `scene proposal check`, and `scene proposal apply`.
  - Keep existing `scene get/create` legacy behavior intact.
- Modify `tests/scene-compiler.test.ts`
  - Add core proposal tests close to the parser/serializer/compiler tests.
- Modify `tests/pixifact-cli.test.ts`
  - Add CLI tests for compiler scene inspect/check/apply and stale proposal rejection.
- No editor, live bridge, gateway, or UI files are part of this MVP.

## Task 1: Core Proposal Types, Revision, and Inspect

**Files:**
- Create: `packages/pixifact/src/compiler/sceneProposal.ts`
- Modify: `packages/pixifact/src/compiler/index.ts`
- Test: `tests/scene-compiler.test.ts`

- [ ] **Step 1: Write failing core inspect and revision tests**

Add imports in `tests/scene-compiler.test.ts`:

```ts
import {
    createSceneRevision,
    inspectSceneTemplate,
} from 'pixifact/compiler';
```

Add tests inside `describe('Pixifact scene compiler spike', () => { ... })`:

```ts
    it('creates stable revisions for canonical compiler scene source', () => {
        const first = createSceneRevision('<Scene name="Button"><Text id="label" text="Play" /></Scene>');
        const second = createSceneRevision(`
            <Scene name="Button">
              <Text id="label" text="Play" />
            </Scene>
        `);

        expect(first).toBe(second);
        expect(first).toMatch(/^scene:\d+:[a-f0-9]{8}$/);
    });

    it('inspects compiler scene templates for external agents', () => {
        const summary = inspectSceneTemplate(parseSceneTemplate(`
            <Scene name="Button" script="src/scenes/Button.ts" width="180">
              <Container id="root" x="10">
                <Text id="label" text="Play" />
              </Container>
            </Scene>
        `));

        expect(summary).toEqual({
            name: 'Button',
            script: 'src/scenes/Button.ts',
            props: { width: 180 },
            nodeCount: 2,
            nodes: [
                {
                    id: 'root',
                    kind: 'pixi',
                    type: 'Container',
                    path: '0:root',
                    propKeys: ['x'],
                    childCount: 1,
                },
                {
                    id: 'label',
                    kind: 'pixi',
                    type: 'Text',
                    path: '0:root/0:label',
                    propKeys: ['text'],
                    childCount: 0,
                },
            ],
        });
    });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts
```

Expected: FAIL because `createSceneRevision` and `inspectSceneTemplate` are not exported.

- [ ] **Step 3: Implement minimal types, revision, and inspect**

Create `packages/pixifact/src/compiler/sceneProposal.ts`:

```ts
import type { SceneTemplate, SceneTemplateNode, SceneTemplateValue } from './spec';
import { parseSceneTemplate } from './templateParser';
import { serializeSceneTemplate } from './templateSerializer';

export interface SceneProposalEnvelope {
    kind: 'pixifact.sceneProposal.v1';
    scene: string;
    baseRevision: string;
    content: string;
}

export interface SceneProposalNodeSummary {
    id?: string;
    kind: SceneTemplateNode['kind'];
    type: string;
    path: string;
    propKeys: string[];
    childCount: number;
}

export interface SceneTemplateInspection {
    name: string;
    script?: string;
    props: Record<string, SceneTemplateValue>;
    nodeCount: number;
    nodes: SceneProposalNodeSummary[];
}

export type SceneProposalDiffEntry =
    | { kind: 'scenePropChanged'; prop: string; before?: SceneTemplateValue; after?: SceneTemplateValue }
    | { kind: 'nodeInserted'; path: string; node: string }
    | { kind: 'nodeDeleted'; path: string; node: string }
    | { kind: 'nodeTypeChanged'; path: string; before: string; after: string }
    | { kind: 'nodePropChanged'; path: string; node: string; prop: string; before?: SceneTemplateValue; after?: SceneTemplateValue }
    | { kind: 'childrenChanged'; path: string; before: string[]; after: string[] };

export type SceneProposalCheckResult =
    | {
        ok: true;
        scene: string;
        baseRevision: string;
        nextRevision: string;
        canonicalContent: string;
        current: SceneTemplateInspection;
        proposed: SceneTemplateInspection;
        diffs: SceneProposalDiffEntry[];
    }
    | {
        ok: false;
        scene: string;
        baseRevision?: string;
        currentRevision?: string;
        error: string;
        hint?: string;
    };

export function createSceneRevision(source: string) {
    const canonical = serializeSceneTemplate(parseSceneTemplate(source));
    let hash = 0x811c9dc5;
    for (let index = 0; index < canonical.length; index += 1) {
        hash = Math.imul(hash ^ canonical.charCodeAt(index), 0x01000193);
    }
    return `scene:${canonical.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function inspectSceneTemplate(template: SceneTemplate): SceneTemplateInspection {
    const nodes: SceneProposalNodeSummary[] = [];

    function visit(node: SceneTemplateNode, path: string) {
        if (node.kind === 'slotOutlet') {
            nodes.push({
                kind: 'slotOutlet',
                type: 'slot',
                path,
                propKeys: ['name'],
                childCount: 0,
            });
            return;
        }

        if (node.kind === 'pixi') {
            nodes.push({
                id: node.id,
                kind: node.kind,
                type: node.type,
                path,
                propKeys: Object.keys(node.props).sort(),
                childCount: node.children.length,
            });
            node.children.forEach((child, index) => visit(child, `${path}/${nodePathSegment(index, child)}`));
            return;
        }

        nodes.push({
            id: node.id,
            kind: node.kind,
            type: node.type,
            path,
            propKeys: Object.keys(node.props).sort(),
            childCount: Object.values(node.slots).reduce((sum, children) => sum + children.length, 0),
        });
        for (const [slot, children] of Object.entries(node.slots)) {
            children.forEach((child, index) => visit(child, `${path}/slot:${slot}/${nodePathSegment(index, child)}`));
        }
    }

    template.children.forEach((child, index) => visit(child, nodePathSegment(index, child)));
    return {
        name: template.name,
        ...(template.script ? { script: template.script.path } : {}),
        props: template.props,
        nodeCount: nodes.length,
        nodes,
    };
}

function nodePathSegment(index: number, node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') {
        return `${index}:slot:${node.name}`;
    }
    return `${index}:${node.id ?? node.kind}`;
}
```

Modify `packages/pixifact/src/compiler/index.ts`:

```ts
export * from './sceneProposal';
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts
```

Expected: PASS for existing tests plus the new revision/inspect tests.

- [ ] **Step 5: Commit**

```bash
git add packages/pixifact/src/compiler/sceneProposal.ts packages/pixifact/src/compiler/index.ts tests/scene-compiler.test.ts
git commit -m "feat: add compiler scene proposal inspection"
```

## Task 2: Proposal Check and Semantic Diff

**Files:**
- Modify: `packages/pixifact/src/compiler/sceneProposal.ts`
- Test: `tests/scene-compiler.test.ts`

- [ ] **Step 1: Write failing proposal check tests**

Add tests:

```ts
import { checkSceneProposal } from 'pixifact/compiler';

    it('checks compiler scene proposals without applying them', () => {
        const current = serializeSceneTemplate(parseSceneTemplate(`
            <Scene name="Button" script="src/scenes/Button.ts" width="180">
              <Text id="label" text="Start" x="10" />
            </Scene>
        `));
        const proposed = `
            <Scene name="Button" script="src/scenes/Button.ts" width="180">
              <Text id="label" text="Play" x="10" />
              <Sprite id="icon" texture="assets/play.png" />
            </Scene>
        `;

        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: proposed,
            },
        });

        expect(result).toMatchObject({
            ok: true,
            scene: 'scenes/Button.scene',
            current: { name: 'Button' },
            proposed: { name: 'Button' },
        });
        expect(result.ok && result.canonicalContent).toContain('<Text id="label" text="Play" x="10" />');
        expect(result.ok && result.diffs).toEqual([
            {
                kind: 'nodePropChanged',
                path: '0:label',
                node: 'Text#label',
                prop: 'text',
                before: 'Start',
                after: 'Play',
            },
            {
                kind: 'nodeInserted',
                path: '1:icon',
                node: 'Sprite#icon',
            },
            {
                kind: 'childrenChanged',
                path: '__scene__',
                before: ['Text#label'],
                after: ['Text#label', 'Sprite#icon'],
            },
        ]);
    });

    it('rejects stale compiler scene proposals', () => {
        const current = '<Scene name="Button"><Text id="label" text="Start" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: 'sha256:stale',
                content: '<Scene name="Button"><Text id="label" text="Play" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            baseRevision: 'sha256:stale',
            currentRevision: createSceneRevision(current),
            error: 'Scene proposal baseRevision does not match current scene revision.',
        });
    });

    it('rejects proposals that change the scene name', () => {
        const current = '<Scene name="Button"><Text id="label" text="Start" /></Scene>';
        const result = checkSceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="Other"><Text id="label" text="Play" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: false,
            scene: 'scenes/Button.scene',
            error: 'Scene proposal cannot change Scene name from "Button" to "Other".',
        });
    });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts
```

Expected: FAIL because `checkSceneProposal` is not implemented.

- [ ] **Step 3: Implement `checkSceneProposal` and diff**

Modify the existing type import in `packages/pixifact/src/compiler/sceneProposal.ts` to include `SceneInstanceTemplateNode`, then append the new functions:

```ts
export interface CheckSceneProposalOptions {
    currentContent: string;
    proposal: SceneProposalEnvelope;
}

export function checkSceneProposal(options: CheckSceneProposalOptions): SceneProposalCheckResult {
    const currentRevision = createSceneRevision(options.currentContent);
    if (options.proposal.baseRevision !== currentRevision) {
        return {
            ok: false,
            scene: options.proposal.scene,
            baseRevision: options.proposal.baseRevision,
            currentRevision,
            error: 'Scene proposal baseRevision does not match current scene revision.',
            hint: 'Re-read the current .scene file and create a new proposal with the current baseRevision.',
        };
    }

    try {
        const currentTemplate = parseSceneTemplate(options.currentContent);
        const proposedTemplate = parseSceneTemplate(options.proposal.content);
        if (currentTemplate.name !== proposedTemplate.name) {
            return {
                ok: false,
                scene: options.proposal.scene,
                baseRevision: options.proposal.baseRevision,
                currentRevision,
                error: `Scene proposal cannot change Scene name from "${currentTemplate.name}" to "${proposedTemplate.name}".`,
                hint: 'Create or rename scenes through a dedicated project operation instead of a scene proposal.',
            };
        }

        const canonicalContent = serializeSceneTemplate(proposedTemplate);
        return {
            ok: true,
            scene: options.proposal.scene,
            baseRevision: options.proposal.baseRevision,
            nextRevision: createSceneRevision(canonicalContent),
            canonicalContent,
            current: inspectSceneTemplate(currentTemplate),
            proposed: inspectSceneTemplate(proposedTemplate),
            diffs: diffSceneTemplates(currentTemplate, proposedTemplate),
        };
    } catch (error) {
        return {
            ok: false,
            scene: options.proposal.scene,
            baseRevision: options.proposal.baseRevision,
            currentRevision,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function diffSceneTemplates(before: SceneTemplate, after: SceneTemplate): SceneProposalDiffEntry[] {
    return [
        ...diffProps(before.props, after.props).map((entry) => ({
            kind: 'scenePropChanged' as const,
            ...entry,
        })),
        ...diffChildren('__scene__', before.children, after.children),
    ];
}

function diffChildren(path: string, before: SceneTemplateNode[], after: SceneTemplateNode[]): SceneProposalDiffEntry[] {
    const diffs: SceneProposalDiffEntry[] = [];
    const max = Math.max(before.length, after.length);
    for (let index = 0; index < max; index += 1) {
        const beforeNode = before[index];
        const afterNode = after[index];
        if (!beforeNode && afterNode) {
            diffs.push({ kind: 'nodeInserted', path: childPath(path, index, afterNode), node: nodeLabel(afterNode) });
            continue;
        }
        if (beforeNode && !afterNode) {
            diffs.push({ kind: 'nodeDeleted', path: childPath(path, index, beforeNode), node: nodeLabel(beforeNode) });
            continue;
        }
        if (beforeNode && afterNode) {
            diffs.push(...diffNode(childPath(path, index, afterNode), beforeNode, afterNode));
        }
    }

    const beforeLabels = before.map(nodeLabel);
    const afterLabels = after.map(nodeLabel);
    if (JSON.stringify(beforeLabels) !== JSON.stringify(afterLabels)) {
        diffs.push({ kind: 'childrenChanged', path, before: beforeLabels, after: afterLabels });
    }
    return diffs;
}

function diffNode(path: string, before: SceneTemplateNode, after: SceneTemplateNode): SceneProposalDiffEntry[] {
    const beforeLabel = nodeLabel(before);
    const afterLabel = nodeLabel(after);
    if (before.kind !== after.kind || nodeType(before) !== nodeType(after)) {
        return [{ kind: 'nodeTypeChanged', path, before: beforeLabel, after: afterLabel }];
    }

    if (before.kind === 'slotOutlet' || after.kind === 'slotOutlet') {
        return before.name === after.name ? [] : [{
            kind: 'nodePropChanged',
            path,
            node: afterLabel,
            prop: 'name',
            before: before.name,
            after: after.name,
        }];
    }

    const diffs = diffProps(before.props, after.props).map((entry) => ({
        kind: 'nodePropChanged' as const,
        path,
        node: afterLabel,
        ...entry,
    }));

    if (before.kind === 'pixi' && after.kind === 'pixi') {
        return [...diffs, ...diffChildren(path, before.children, after.children)];
    }

    if (before.kind === 'sceneInstance' && after.kind === 'sceneInstance') {
        return [
            ...diffs,
            ...diffProps(before.events, after.events).map((entry) => ({
                kind: 'nodePropChanged' as const,
                path,
                node: afterLabel,
                prop: `@${entry.prop}`,
                before: entry.before,
                after: entry.after,
            })),
            ...diffSceneInstanceSlots(path, before, after),
        ];
    }

    return diffs;
}

function diffSceneInstanceSlots(path: string, before: SceneInstanceTemplateNode, after: SceneInstanceTemplateNode) {
    const diffs: SceneProposalDiffEntry[] = [];
    const slots = new Set([...Object.keys(before.slots), ...Object.keys(after.slots)]);
    for (const slot of [...slots].sort()) {
        diffs.push(...diffChildren(`${path}/slot:${slot}`, before.slots[slot] ?? [], after.slots[slot] ?? []));
    }
    return diffs;
}

function diffProps(before: Record<string, SceneTemplateValue>, after: Record<string, SceneTemplateValue>) {
    const diffs: Array<{ prop: string; before?: SceneTemplateValue; after?: SceneTemplateValue }> = [];
    const props = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const prop of [...props].sort()) {
        if (before[prop] !== after[prop]) {
            diffs.push({ prop, before: before[prop], after: after[prop] });
        }
    }
    return diffs;
}

function nodeLabel(node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') {
        return `slot:${node.name}`;
    }
    return `${nodeType(node)}${node.id ? `#${node.id}` : ''}`;
}

function nodeType(node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') return 'slot';
    return node.type;
}

function childPath(parentPath: string, index: number, node: SceneTemplateNode) {
    const segment = nodePathSegment(index, node);
    return parentPath === '__scene__' ? segment : `${parentPath}/${segment}`;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pixifact/src/compiler/sceneProposal.ts tests/scene-compiler.test.ts
git commit -m "feat: check compiler scene proposals"
```

## Task 3: Apply Proposal API

**Files:**
- Modify: `packages/pixifact/src/compiler/sceneProposal.ts`
- Test: `tests/scene-compiler.test.ts`

- [ ] **Step 1: Write failing apply API test**

Add import:

```ts
import { applySceneProposal } from 'pixifact/compiler';
```

Add test:

```ts
    it('applies compiler scene proposals by returning canonical content', () => {
        const current = '<Scene name="Button"><Text id="label" text="Start" /></Scene>';
        const result = applySceneProposal({
            currentContent: current,
            proposal: {
                kind: 'pixifact.sceneProposal.v1',
                scene: 'scenes/Button.scene',
                baseRevision: createSceneRevision(current),
                content: '<Scene name="Button"><Text id="label" text="Play" /></Scene>',
            },
        });

        expect(result).toMatchObject({
            ok: true,
            scene: 'scenes/Button.scene',
        });
        expect(result.ok && result.content).toBe('<Scene name="Button">\n  <Text id="label" text="Play" />\n</Scene>\n');
        expect(result.ok && result.diffs[0]).toMatchObject({
            kind: 'nodePropChanged',
            prop: 'text',
            before: 'Start',
            after: 'Play',
        });
    });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts
```

Expected: FAIL because `applySceneProposal` is not implemented.

- [ ] **Step 3: Implement apply API**

Append to `packages/pixifact/src/compiler/sceneProposal.ts`:

```ts
export type SceneProposalApplyResult =
    | (Extract<SceneProposalCheckResult, { ok: true }> & { content: string })
    | Extract<SceneProposalCheckResult, { ok: false }>;

export function applySceneProposal(options: CheckSceneProposalOptions): SceneProposalApplyResult {
    const result = checkSceneProposal(options);
    if (!result.ok) {
        return result;
    }
    return {
        ...result,
        content: result.canonicalContent,
    };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/pixifact/src/compiler/sceneProposal.ts tests/scene-compiler.test.ts
git commit -m "feat: apply compiler scene proposals"
```

## Task 4: CLI File Mode for Inspect, Check, and Apply

**Files:**
- Modify: `packages/pixifact-cli/src/automation.ts`
- Modify: `packages/pixifact-cli/src/pixifact-cli.ts`
- Test: `tests/pixifact-cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Add imports in `tests/pixifact-cli.test.ts`:

```ts
import { createSceneRevision } from 'pixifact/compiler';
```

Add helper:

```ts
function createCompilerSceneProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pixifact-compiler-cli-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'scenes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scenes', 'Button.scene'), [
        '<Scene name="Button" script="src/scenes/Button.ts">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n'), 'utf8');
    return root;
}

function writeSceneProposal(root: string, proposal: unknown) {
    const proposalPath = path.join(root, 'proposal.json');
    fs.writeFileSync(proposalPath, JSON.stringify(proposal), 'utf8');
    return proposalPath;
}
```

Add tests:

```ts
    it('inspects compiler scene files for external agents', async () => {
        const projectRoot = createCompilerSceneProject();

        const result = await runCli([
            'scene',
            'inspect',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json).toMatchObject({
            ok: true,
            scenePath: 'scenes/Button.scene',
            revision: createSceneRevision(fs.readFileSync(path.join(projectRoot, 'scenes', 'Button.scene'), 'utf8')),
            summary: {
                name: 'Button',
                script: 'src/scenes/Button.ts',
                nodeCount: 1,
            },
        });
    });

    it('checks compiler scene proposals without writing files', async () => {
        const projectRoot = createCompilerSceneProject();
        const scenePath = path.join(projectRoot, 'scenes', 'Button.scene');
        const current = fs.readFileSync(scenePath, 'utf8');
        const proposalPath = writeSceneProposal(projectRoot, {
            kind: 'pixifact.sceneProposal.v1',
            scene: 'scenes/Button.scene',
            baseRevision: createSceneRevision(current),
            content: '<Scene name="Button" script="src/scenes/Button.ts"><Text id="label" text="Play" /></Scene>',
        });

        const result = await runCli([
            'scene',
            'proposal',
            'check',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
            '--proposal',
            proposalPath,
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(result.json.diffs[0]).toMatchObject({
            kind: 'nodePropChanged',
            prop: 'text',
            before: 'Start',
            after: 'Play',
        });
        expect(fs.readFileSync(scenePath, 'utf8')).toBe(current);
    });

    it('applies compiler scene proposals and writes canonical source', async () => {
        const projectRoot = createCompilerSceneProject();
        const scenePath = path.join(projectRoot, 'scenes', 'Button.scene');
        const current = fs.readFileSync(scenePath, 'utf8');
        const proposalPath = writeSceneProposal(projectRoot, {
            kind: 'pixifact.sceneProposal.v1',
            scene: 'scenes/Button.scene',
            baseRevision: createSceneRevision(current),
            content: '<Scene name="Button" script="src/scenes/Button.ts"><Text id="label" text="Play" /></Scene>',
        });

        const result = await runCli([
            'scene',
            'proposal',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
            '--proposal',
            proposalPath,
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.json.ok).toBe(true);
        expect(fs.readFileSync(scenePath, 'utf8')).toBe([
            '<Scene name="Button" script="src/scenes/Button.ts">',
            '  <Text id="label" text="Play" />',
            '</Scene>',
            '',
        ].join('\n'));
    });

    it('rejects stale compiler scene proposals through the CLI', async () => {
        const projectRoot = createCompilerSceneProject();
        const proposalPath = writeSceneProposal(projectRoot, {
            kind: 'pixifact.sceneProposal.v1',
            scene: 'scenes/Button.scene',
            baseRevision: 'sha256:stale',
            content: '<Scene name="Button"><Text id="label" text="Play" /></Scene>',
        });

        const result = await runCli([
            'scene',
            'proposal',
            'apply',
            '--project-root',
            projectRoot,
            '--scene',
            'scenes/Button.scene',
            '--proposal',
            proposalPath,
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.json).toMatchObject({
            ok: false,
            error: 'Scene proposal baseRevision does not match current scene revision.',
        });
    });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts
```

Expected: FAIL because CLI commands are unknown.

- [ ] **Step 3: Add automation helpers**

Modify imports in `packages/pixifact-cli/src/automation.ts`:

```ts
import {
    applySceneProposal,
    checkSceneProposal,
    createSceneRevision,
    inspectSceneTemplate,
    parseSceneTemplate,
} from 'pixifact/compiler';
```

Extend `ToolInput`:

```ts
    proposal?: unknown;
```

Add helpers near file IO helpers:

```ts
function readTextFile(filePath: string) {
    return fs.readFileSync(filePath, 'utf8');
}

function writeTextFile(filePath: string, value: string) {
    fs.writeFileSync(filePath, value, 'utf8');
}

function assertProposal(value: unknown) {
    const proposal = assertRecord(value, 'proposal');
    if (proposal.kind !== 'pixifact.sceneProposal.v1') {
        throw new Error('proposal.kind must be "pixifact.sceneProposal.v1".');
    }
    return {
        kind: 'pixifact.sceneProposal.v1' as const,
        scene: assertString(proposal.scene, 'proposal.scene'),
        baseRevision: assertString(proposal.baseRevision, 'proposal.baseRevision'),
        content: assertString(proposal.content, 'proposal.content'),
    };
}

function loadCompilerScene(projectRoot: unknown, scenePath: unknown) {
    const { root, target } = resolveProjectPath(projectRoot, scenePath);
    const content = readTextFile(target);
    return {
        root,
        target,
        scenePath: path.relative(root, target),
        content,
    };
}
```

Add methods inside `createPixifactAutomation()`:

```ts
        inspectCompilerScene(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const template = parseSceneTemplate(loaded.content);
            return {
                ok: true,
                scenePath: loaded.scenePath,
                revision: createSceneRevision(loaded.content),
                summary: inspectSceneTemplate(template),
            };
        },

        checkCompilerSceneProposal(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const proposal = assertProposal(args.proposal);
            return checkSceneProposal({
                currentContent: loaded.content,
                proposal,
            });
        },

        applyCompilerSceneProposal(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const proposal = assertProposal(args.proposal);
            const result = applySceneProposal({
                currentContent: loaded.content,
                proposal,
            });
            if (!result.ok) {
                return result;
            }
            writeTextFile(loaded.target, result.content);
            return {
                ...result,
                scenePath: loaded.scenePath,
            };
        },
```

- [ ] **Step 4: Add CLI dispatch**

Modify `packages/pixifact-cli/src/pixifact-cli.ts`:

```ts
async function readProposal(flags: Record<string, string | true>, input: string | NodeJS.ReadableStream | undefined) {
    const proposalPath = requireFlag(flags, 'proposal');
    const text = proposalPath === '-'
        ? await readInput(input)
        : await fs.readFile(proposalPath, 'utf8');
    return JSON.parse(text);
}
```

Add branches in `executeFileCommand` before legacy `scene get/create` if needed:

```ts
    if (area === 'scene' && action === 'inspect') {
        return automation.inspectCompilerScene({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
        });
    }

    if (area === 'scene' && action === 'proposal' && subaction === 'check') {
        return automation.checkCompilerSceneProposal({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
            proposal: await readProposal(flags, input),
        });
    }

    if (area === 'scene' && action === 'proposal' && subaction === 'apply') {
        return automation.applyCompilerSceneProposal({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
            proposal: await readProposal(flags, input),
        });
    }
```

Update help command list:

```ts
'scene inspect',
'scene proposal check',
'scene proposal apply',
```

Do not add live-mode support in this task.

- [ ] **Step 5: Run CLI tests to verify pass**

Run:

```bash
bunx --no-install vitest run tests/pixifact-cli.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/pixifact-cli/src/automation.ts packages/pixifact-cli/src/pixifact-cli.ts tests/pixifact-cli.test.ts
git commit -m "feat: add compiler scene proposal CLI"
```

## Task 5: Sample Project Verification and Docs Touch-Up

**Files:**
- Modify: `docs/AI_SCENE_AUTHORING.md`
- Test: `sample-projects/scene-compiler-demo`

- [ ] **Step 1: Write a manual proposal for the sample project**

Create a temporary proposal file outside git-tracked paths, for example `/tmp/pixifact-button-proposal.json`, using the current revision from:

```bash
bun run pixifact -- scene inspect \
  --project-root sample-projects/scene-compiler-demo \
  --scene scenes/Button.scene
```

Proposal content:

```json
{
  "kind": "pixifact.sceneProposal.v1",
  "scene": "scenes/Button.scene",
  "baseRevision": "replace-with-scene-inspect-revision",
  "content": "<Scene name=\"Button\" script=\"src/scenes/Button.ts\" width=\"180\" height=\"52\"><Text id=\"labelText\" text=\"Play\" /></Scene>"
}
```

Adjust `content` to preserve the actual current `Button.scene` structure and change only one harmless text or numeric prop.

- [ ] **Step 2: Verify proposal check on the sample**

Run:

```bash
bun run pixifact -- scene proposal check \
  --project-root sample-projects/scene-compiler-demo \
  --scene scenes/Button.scene \
  --proposal - < /tmp/pixifact-button-proposal.json
```

Expected: exit code 0, `ok: true`, and at least one semantic diff.

- [ ] **Step 3: Verify proposal apply on a temp copy**

Copy the sample project to `/tmp/pixifact-scene-compiler-demo-proposal-test` and apply there:

```bash
rm -rf /tmp/pixifact-scene-compiler-demo-proposal-test
cp -R sample-projects/scene-compiler-demo /tmp/pixifact-scene-compiler-demo-proposal-test
bun run pixifact -- scene proposal apply \
  --project-root /tmp/pixifact-scene-compiler-demo-proposal-test \
  --scene scenes/Button.scene \
  --proposal - < /tmp/pixifact-button-proposal.json
```

Expected: exit code 0 and canonical `.scene` output written in the temp copy.

- [ ] **Step 4: Compile and build the temp copy**

Run:

```bash
bun run pixifact -- compile-scenes --project-root /tmp/pixifact-scene-compiler-demo-proposal-test
cd /tmp/pixifact-scene-compiler-demo-proposal-test && bun run build
```

Expected: both commands pass.

- [ ] **Step 5: Update docs command names if needed**

If implementation output differs from the current design doc, update only command names and payload examples in `docs/AI_SCENE_AUTHORING.md`. Keep the external-agent-only direction unchanged.

- [ ] **Step 6: Run focused verification**

Run:

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts tests/pixifact-cli.test.ts
bun run build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add docs/AI_SCENE_AUTHORING.md
git commit -m "docs: document compiler scene proposal CLI"
```

If `docs/AI_SCENE_AUTHORING.md` did not change, skip this commit.

## Final Verification

- [ ] Run focused tests:

```bash
bunx --no-install vitest run tests/scene-compiler.test.ts tests/pixifact-cli.test.ts
```

- [ ] Run package build:

```bash
bun run build
```

- [ ] Run sample compile/build:

```bash
cd sample-projects/scene-compiler-demo && bun run compile:scenes && bun run build
```

- [ ] Check worktree:

```bash
git status --short
```

Expected: clean after the final commit, except for any intentionally untracked temporary files outside the repository.

## Scope Not Included

- No live editor bridge proposal support.
- No gateway or integrated AI chat changes.
- No editor panel UI for reviewing semantic diffs.
- No full scene contract validation against script decorators beyond current parser/serializer invariants.
- No backwards compatibility shim for alternate proposal envelope formats.
