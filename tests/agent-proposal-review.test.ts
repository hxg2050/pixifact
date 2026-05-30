import { describe, expect, it, vi } from 'vitest';
import { createSceneRevision } from 'pixifact/compiler';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import {
    applyCurrentSceneProposal,
    checkCurrentSceneProposal,
    describeSceneProposalDiff,
} from '../apps/editor/src/panels/agentProposalReview';

const host = vi.hoisted(() => ({
    files: new Map<string, string>(),
    writes: [] as Array<{ projectRootPath: string; filePath: string; content: string }>,
}));

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    readHostProjectFileText: vi.fn(async (_projectRootPath: string, filePath: string) => {
        const content = host.files.get(filePath);
        if (content === undefined) {
            throw new Error(`Missing test file ${filePath}.`);
        }
        return content;
    }),
    writeHostProjectFileText: vi.fn(async (projectRootPath: string, filePath: string, content: string) => {
        host.writes.push({ projectRootPath, filePath, content });
        host.files.set(filePath, content);
    }),
}));

function projectTree(): ProjectFileTreeNode {
    return {
        id: 'GameProject',
        name: 'GameProject',
        path: 'GameProject',
        kind: 'folder',
        depth: 0,
        systemPath: '/repo/GameProject',
        projectRootPath: '/repo/GameProject',
        children: [{
            id: 'GameProject/assets',
            name: 'assets',
            path: 'GameProject/assets',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/assets/play.png',
                name: 'play.png',
                path: 'GameProject/assets/play.png',
                kind: 'asset',
                depth: 2,
            }],
        }, {
            id: 'GameProject/src',
            name: 'src',
            path: 'GameProject/src',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/src/scenes',
                name: 'scenes',
                path: 'GameProject/src/scenes',
                kind: 'folder',
                depth: 2,
                children: [{
                    id: 'GameProject/src/scenes/Button.scene',
                    name: 'Button.scene',
                    path: 'GameProject/src/scenes/Button.scene',
                    kind: 'scene',
                    depth: 3,
                }, {
                    id: 'GameProject/src/scenes/Button.ts',
                    name: 'Button.ts',
                    path: 'GameProject/src/scenes/Button.ts',
                    kind: 'script',
                    depth: 3,
                }, {
                    id: 'GameProject/src/scenes/Child.scene',
                    name: 'Child.scene',
                    path: 'GameProject/src/scenes/Child.scene',
                    kind: 'scene',
                    depth: 3,
                }, {
                    id: 'GameProject/src/scenes/Child.ts',
                    name: 'Child.ts',
                    path: 'GameProject/src/scenes/Child.ts',
                    kind: 'script',
                    depth: 3,
                }],
            }],
        }],
    };
}

function currentScene() {
    return [
        '<Scene name="Button">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n');
}

function scriptSource() {
    return [
        'import { Container } from "pixi.js";',
        'import { scene } from "pixifact/compiler";',
        '@scene()',
        'export class Button extends Container {}',
    ].join('\n');
}

function childScene() {
    return [
        '<Scene name="Child" />',
        '',
    ].join('\n');
}

function childScriptSource() {
    return [
        'import { Container } from "pixi.js";',
        'import { prop, scene } from "pixifact/compiler";',
        '@scene()',
        'export class Child extends Container {',
        '  @prop({ type: "string", default: "Child" })',
        '  accessor label = "Child";',
        '}',
    ].join('\n');
}

function resetHostFiles(files: [string, string][] = []) {
    host.files = new Map([
        ['GameProject/src/scenes/Button.scene', currentScene()],
        ['GameProject/src/scenes/Child.scene', childScene()],
        ['GameProject/src/scenes/Button.ts', scriptSource()],
        ['GameProject/src/scenes/Child.ts', childScriptSource()],
        ...files,
    ]);
    host.writes = [];
}

function proposalText(content: string, baseRevision = createSceneRevision(currentScene())) {
    return JSON.stringify({
        kind: 'pixifact.sceneProposal.v1',
        scene: 'src/scenes/Button.scene',
        baseRevision,
        content,
    });
}

describe('Agent proposal review service', () => {
    it('checks a pasted proposal against the opened compiler scene without writing files', async () => {
        resetHostFiles();

        const result = await checkCurrentSceneProposal({
            projectTree: projectTree(),
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            proposalText: proposalText('<Scene name="Button"><Text id="label" text="Play" /></Scene>'),
        });

        expect(result.ok).toBe(true);
        expect(result.scenePath).toBe('src/scenes/Button.scene');
        expect(result.diffs).toEqual([{
            kind: 'nodePropChanged',
            path: '0:label',
            node: 'Text#label',
            prop: 'text',
            before: 'Start',
            after: 'Play',
        }]);
        expect(host.writes).toEqual([]);
    });

    it('applies the checked proposal by writing canonical scene source', async () => {
        resetHostFiles();

        const result = await applyCurrentSceneProposal({
            projectTree: projectTree(),
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            proposalText: proposalText('<Scene name="Button"><Text id="label" text="Play" /></Scene>'),
        });

        expect(result.ok).toBe(true);
        expect(result.scenePath).toBe('src/scenes/Button.scene');
        expect(host.writes).toEqual([{
            projectRootPath: '/repo/GameProject',
            filePath: 'GameProject/src/scenes/Button.scene',
            content: [
                '<Scene name="Button">',
                '  <Text id="label" text="Play" />',
                '</Scene>',
                '',
            ].join('\n'),
        }]);
    });

    it('returns proposal validation errors instead of writing stale proposals', async () => {
        resetHostFiles();

        const result = await applyCurrentSceneProposal({
            projectTree: projectTree(),
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            proposalText: proposalText('<Scene name="Button"><Text id="label" text="Play" /></Scene>', 'scene:stale'),
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('Scene proposal baseRevision does not match current scene revision.');
        expect(host.writes).toEqual([]);
    });

    it('checks stale revisions before parsing proposed scene content', async () => {
        resetHostFiles();

        const result = await checkCurrentSceneProposal({
            projectTree: projectTree(),
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            proposalText: proposalText('<Scene name="Button"', 'scene:stale'),
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('Scene proposal baseRevision does not match current scene revision.');
    });

    it('rejects proposals targeting a different scene without writing files', async () => {
        resetHostFiles();
        const proposal = JSON.parse(proposalText('<Scene name="Button"><Text id="label" text="Play" /></Scene>'));
        proposal.scene = 'src/scenes/Other.scene';

        const result = await applyCurrentSceneProposal({
            projectTree: projectTree(),
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            proposalText: JSON.stringify(proposal),
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('Scene proposal target does not match the opened Scene.');
        expect(host.writes).toEqual([]);
    });

    it('uses project assets when validating pasted proposals', async () => {
        resetHostFiles();

        const result = await checkCurrentSceneProposal({
            projectTree: projectTree(),
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            proposalText: proposalText('<Scene name="Button"><Sprite id="icon" texture="assets/missing.png" /></Scene>'),
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('Scene proposal validation failed.');
        expect(result.diagnostics).toEqual([{
            path: '0:icon',
            prop: 'texture',
            expected: 'existing project asset',
            actual: 'assets/missing.png',
            hint: 'Use an asset path that exists in the project before applying the proposal.',
        }]);
    });

    it('uses bound scene interfaces when validating newly inserted Scene instances', async () => {
        resetHostFiles();

        const result = await checkCurrentSceneProposal({
            projectTree: projectTree(),
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            proposalText: proposalText([
                '<Scene name="Button">',
                '  <Child id="child" scene="./Child.scene" secret="x" />',
                '</Scene>',
            ].join('\n')),
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('Scene proposal validation failed.');
        expect(result.diagnostics).toEqual([{
            path: '0:child',
            prop: 'secret',
            expected: 'public prop declared by src/scenes/Child.scene',
            actual: 'unknown prop',
            hint: 'Expose the property with @prop on the child Scene script before setting it from a parent Scene.',
        }]);
    });

    it('formats proposal diffs for panel review', () => {
        expect(describeSceneProposalDiff({
            kind: 'nodePropChanged',
            path: '0:label',
            node: 'Text#label',
            prop: 'text',
            before: 'Start',
            after: 'Play',
        })).toBe('Text#label.text: Start -> Play');
    });
});
