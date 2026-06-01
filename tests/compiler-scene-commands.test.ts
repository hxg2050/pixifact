import { describe, expect, it } from 'vitest';
import type { SceneTemplate, SceneTemplateNode } from '../packages/pixifact/src/compiler/spec';
import {
    CompilerSceneCommandStack,
    applyCompilerSceneCommand,
} from '../packages/pixifact/src/compiler/commands';

function emptyInterface() {
    return {
        events: {},
        props: {},
        slots: {},
    };
}

function pixiNode(type: string, id: string, children: SceneTemplateNode[] = []): SceneTemplateNode {
    return {
        kind: 'pixi',
        type: type as never,
        id,
        props: {},
        children,
    };
}

function sceneInstance(id: string, slots: Record<string, SceneTemplateNode[]> = {}): SceneTemplateNode {
    return {
        kind: 'sceneInstance',
        type: 'Button',
        id,
        scene: 'src/ui/Button.scene',
        props: {},
        events: {},
        slots,
    };
}

function slotOutlet(name: string): SceneTemplateNode {
    return {
        kind: 'slotOutlet',
        name,
    };
}

function template(): SceneTemplate {
    return {
        version: 2,
        name: 'Menu',
        props: {
            width: 960,
        },
        interface: emptyInterface(),
        children: [
            pixiNode('Container', 'panel', [
                pixiNode('Text', 'title'),
                sceneInstance('button', {
                    icon: [pixiNode('Graphics', 'iconGraphic')],
                }),
                slotOutlet('badge'),
            ]),
            pixiNode('Text', 'footer'),
        ],
    };
}

describe('compiler scene commands', () => {
    it('applies scene and node property commands with inverse commands', () => {
        const document = template();

        const sceneResult = applyCompilerSceneCommand(document, {
            op: 'setSceneProp',
            prop: 'width',
            value: 1280,
        });
        expect(sceneResult.ok).toBe(true);
        expect(document.props.width).toBe(1280);

        const sceneUndo = sceneResult.ok ? applyCompilerSceneCommand(document, sceneResult.inverse) : undefined;
        expect(sceneUndo?.ok).toBe(true);
        expect(document.props.width).toBe(960);

        const nodeResult = applyCompilerSceneCommand(document, {
            op: 'setNodeProp',
            node: '0:panel/0:title',
            prop: 'text',
            value: 'Play',
        });
        expect(nodeResult.ok).toBe(true);
        expect((document.children[0] as Extract<SceneTemplateNode, { kind: 'pixi' }>).children[0]).toMatchObject({
            props: {
                text: 'Play',
            },
        });

        const nodeUndo = nodeResult.ok ? applyCompilerSceneCommand(document, nodeResult.inverse) : undefined;
        expect(nodeUndo?.ok).toBe(true);
        expect((document.children[0] as Extract<SceneTemplateNode, { kind: 'pixi' }>).children[0]).toMatchObject({
            props: {},
        });
    });

    it('applies nested node property commands with inverse commands', () => {
        const document = template();

        const result = applyCompilerSceneCommand(document, {
            op: 'setNodeProp',
            node: '0:panel',
            prop: 'rectTransform.width',
            value: 420,
        });

        expect(result.ok).toBe(true);
        expect(document.children[0]).toMatchObject({
            props: {
                rectTransform: {
                    width: 420,
                },
            },
        });

        const undo = result.ok ? applyCompilerSceneCommand(document, result.inverse) : undefined;
        expect(undo?.ok).toBe(true);
        expect(document.children[0]).toMatchObject({
            props: {},
        });
    });

    it('retargets inverse commands when id or slot locators change', () => {
        const document = template();

        const idResult = applyCompilerSceneCommand(document, {
            op: 'setNodeId',
            node: '0:panel/0:title',
            value: 'headline',
        });
        expect(idResult).toMatchObject({
            ok: true,
            selection: { type: 'node', node: '0:panel/0:headline' },
        });

        const idUndo = idResult.ok ? applyCompilerSceneCommand(document, idResult.inverse) : undefined;
        expect(idUndo).toMatchObject({
            ok: true,
            selection: { type: 'node', node: '0:panel/0:title' },
        });

        const slotResult = applyCompilerSceneCommand(document, {
            op: 'renameSlotOutlet',
            node: '0:panel/2:slot:badge',
            name: 'accessory',
        });
        expect(slotResult).toMatchObject({
            ok: true,
            selection: { type: 'node', node: '0:panel/2:slot:accessory' },
        });

        const slotUndo = slotResult.ok ? applyCompilerSceneCommand(document, slotResult.inverse) : undefined;
        expect(slotUndo).toMatchObject({
            ok: true,
            selection: { type: 'node', node: '0:panel/2:slot:badge' },
        });
    });

    it('inserts, deletes, and moves nodes with structural inverse commands', () => {
        const document = template();
        const insertedNode = pixiNode('Text', 'subtitle');

        const insertResult = applyCompilerSceneCommand(document, {
            op: 'insertNode',
            parent: '0:panel',
            index: 1,
            node: insertedNode,
        });
        expect(insertResult).toMatchObject({
            ok: true,
            selection: { type: 'node', node: '0:panel/1:subtitle' },
        });
        expect((document.children[0] as Extract<SceneTemplateNode, { kind: 'pixi' }>).children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual([
            'title',
            'subtitle',
            'button',
            'badge',
        ]);

        const insertUndo = insertResult.ok ? applyCompilerSceneCommand(document, insertResult.inverse) : undefined;
        expect(insertUndo?.ok).toBe(true);
        expect((document.children[0] as Extract<SceneTemplateNode, { kind: 'pixi' }>).children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual([
            'title',
            'button',
            'badge',
        ]);

        const deleteResult = applyCompilerSceneCommand(document, {
            op: 'deleteNode',
            node: '0:panel/1:button',
        });
        expect(deleteResult).toMatchObject({
            ok: true,
            selection: { type: 'node', node: '0:panel' },
        });
        expect((document.children[0] as Extract<SceneTemplateNode, { kind: 'pixi' }>).children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual([
            'title',
            'badge',
        ]);

        const deleteUndo = deleteResult.ok ? applyCompilerSceneCommand(document, deleteResult.inverse) : undefined;
        expect(deleteUndo?.ok).toBe(true);
        expect((document.children[0] as Extract<SceneTemplateNode, { kind: 'pixi' }>).children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual([
            'title',
            'button',
            'badge',
        ]);

        const moveResult = applyCompilerSceneCommand(document, {
            op: 'moveNode',
            node: '1:footer',
            parent: '0:panel',
            index: 1,
        });
        expect(moveResult).toMatchObject({
            ok: true,
            selection: { type: 'node', node: '0:panel/1:footer' },
        });
        expect(document.children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['panel']);
        expect((document.children[0] as Extract<SceneTemplateNode, { kind: 'pixi' }>).children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual([
            'title',
            'footer',
            'button',
            'badge',
        ]);

        const moveUndo = moveResult.ok ? applyCompilerSceneCommand(document, moveResult.inverse) : undefined;
        expect(moveUndo?.ok).toBe(true);
        expect(document.children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['panel', 'footer']);
    });

    it('rolls back applied child commands when a batch command fails', () => {
        const document = template();

        const result = applyCompilerSceneCommand(document, {
            op: 'batch',
            commands: [{
                op: 'setSceneName',
                value: 'MainMenu',
            }, {
                op: 'deleteNode',
                node: 'missing',
            }],
        });

        expect(result).toMatchObject({
            ok: false,
        });
        expect(document.name).toBe('Menu');
    });

    it('tracks undo, redo, saved revisions, and merge keys in the command stack', () => {
        const document = template();
        const stack = new CompilerSceneCommandStack();

        const first = stack.execute(document, {
            op: 'setSceneName',
            value: 'MainMenu',
        });
        expect(first.ok).toBe(true);
        expect(stack.canUndo).toBe(true);
        expect(stack.canRedo).toBe(false);
        expect(stack.dirty).toBe(true);

        stack.markSaved();
        expect(stack.dirty).toBe(false);

        const second = stack.execute(document, {
            op: 'setSceneProp',
            prop: 'width',
            value: 1000,
        }, { mergeKey: 'scene.props.width' });
        const third = stack.execute(document, {
            op: 'setSceneProp',
            prop: 'width',
            value: 1200,
        }, { mergeKey: 'scene.props.width' });
        expect(second.ok).toBe(true);
        expect(third.ok).toBe(true);
        expect(document.props.width).toBe(1200);
        expect(stack.dirty).toBe(true);

        const undoWidth = stack.undo(document);
        expect(undoWidth?.ok).toBe(true);
        expect(document.props.width).toBe(960);
        expect(stack.dirty).toBe(false);
        expect(stack.canRedo).toBe(true);

        const redoWidth = stack.redo(document);
        expect(redoWidth?.ok).toBe(true);
        expect(document.props.width).toBe(1200);
        expect(stack.dirty).toBe(true);

        const undoWidthAgain = stack.undo(document);
        expect(undoWidthAgain?.ok).toBe(true);
        expect(document.props.width).toBe(960);
        expect(stack.dirty).toBe(false);
        expect(stack.canRedo).toBe(true);

        const branch = stack.execute(document, {
            op: 'setSceneProp',
            prop: 'height',
            value: 720,
        });
        expect(branch.ok).toBe(true);
        expect(stack.canRedo).toBe(false);
    });
});
