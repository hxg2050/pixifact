import { afterEach, describe, expect, it } from 'vitest';
import type { SceneTemplate, SceneTemplateNode } from '../packages/pixifact/src/compiler/spec';
import {
    addCompilerSceneNode,
    canRedoCompilerSceneCommand,
    canUndoCompilerSceneCommand,
    createCompilerPixiTemplateNode,
    deleteCompilerSceneNode,
    getCompilerSceneDocument,
    loadCompilerSceneDocument,
    markCompilerSceneSaved,
    moveCompilerSceneNode,
    redoCompilerSceneCommand,
    resetCompilerSceneDocument,
    undoCompilerSceneCommand,
    updateCompilerSceneNode,
    updateCompilerSceneTemplate,
} from '../apps/editor/src/document/compilerSceneDocumentController';

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

function template(): SceneTemplate {
    return {
        version: 2,
        name: 'Menu',
        props: {
            width: 960,
        },
        interface: emptyInterface(),
        children: [
            pixiNode('Container', 'content', [
                pixiNode('Text', 'title'),
            ]),
            pixiNode('Text', 'footer'),
        ],
    };
}

function loadTemplate(nextTemplate = template()) {
    loadCompilerSceneDocument({
        scenePath: 'src/scenes/Menu.scene',
        template: nextTemplate,
        sceneInterfaces: {},
    });
}

function contentChildren() {
    return (getCompilerSceneDocument()?.template.children[0] as Extract<SceneTemplateNode, { kind: 'pixi' }>).children;
}

afterEach(() => {
    resetCompilerSceneDocument();
});

describe('compiler scene document controller undo redo', () => {
    it('tracks template edits through undo, redo, and saved revisions', () => {
        loadTemplate();
        expect(canUndoCompilerSceneCommand()).toBe(false);
        expect(canRedoCompilerSceneCommand()).toBe(false);

        updateCompilerSceneTemplate({
            props: {
                width: 1280,
            },
        });
        expect(getCompilerSceneDocument()?.template.props.width).toBe(1280);
        expect(getCompilerSceneDocument()?.dirty).toBe(true);
        expect(canUndoCompilerSceneCommand()).toBe(true);
        expect(canRedoCompilerSceneCommand()).toBe(false);

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(getCompilerSceneDocument()?.template.props.width).toBe(960);
        expect(getCompilerSceneDocument()?.dirty).toBe(false);
        expect(canRedoCompilerSceneCommand()).toBe(true);

        expect(redoCompilerSceneCommand()?.ok).toBe(true);
        expect(getCompilerSceneDocument()?.template.props.width).toBe(1280);
        expect(getCompilerSceneDocument()?.dirty).toBe(true);

        markCompilerSceneSaved();
        expect(getCompilerSceneDocument()?.dirty).toBe(false);

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(getCompilerSceneDocument()?.template.props.width).toBe(960);
        expect(getCompilerSceneDocument()?.dirty).toBe(true);

        expect(redoCompilerSceneCommand()?.ok).toBe(true);
        expect(getCompilerSceneDocument()?.template.props.width).toBe(1280);
        expect(getCompilerSceneDocument()?.dirty).toBe(false);
    });

    it('retargets selection and inverse commands after node id changes', () => {
        loadTemplate();

        updateCompilerSceneNode('0:content/0:title', {
            props: {
                text: 'Play',
            },
            id: 'headline',
        });

        expect(contentChildren()[0]).toMatchObject({
            id: 'headline',
            props: {
                text: 'Play',
            },
        });
        expect(getCompilerSceneDocument()?.selection).toEqual({
            type: 'node',
            node: '0:content/0:headline',
        });

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(contentChildren()[0]).toMatchObject({
            id: 'title',
            props: {},
        });
        expect(getCompilerSceneDocument()?.selection).toEqual({
            type: 'node',
            node: '0:content/0:title',
        });

        expect(redoCompilerSceneCommand()?.ok).toBe(true);
        expect(contentChildren()[0]).toMatchObject({
            id: 'headline',
            props: {
                text: 'Play',
            },
        });
        expect(getCompilerSceneDocument()?.selection).toEqual({
            type: 'node',
            node: '0:content/0:headline',
        });
    });

    it('records insert, delete, and move operations without snapshot history', () => {
        loadTemplate();
        const document = getCompilerSceneDocument();
        expect(document).toBeTruthy();

        const addResult = addCompilerSceneNode('0:content', createCompilerPixiTemplateNode(document!.template, 'Text'));
        expect(addResult).toEqual({
            ok: true,
            locator: '0:content/1:text1',
        });
        expect(contentChildren().map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['title', 'text1']);

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(contentChildren().map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['title']);

        expect(redoCompilerSceneCommand()?.ok).toBe(true);
        expect(contentChildren().map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['title', 'text1']);

        const deleteResult = deleteCompilerSceneNode('0:content/1:text1');
        expect(deleteResult.ok).toBe(true);
        expect(contentChildren().map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['title']);

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(contentChildren().map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['title', 'text1']);

        const moveResult = moveCompilerSceneNode('1:footer', '0:content', 'inside');
        expect(moveResult).toEqual({
            ok: true,
            locator: '0:content/2:footer',
        });
        expect(getCompilerSceneDocument()?.template.children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['content']);
        expect(contentChildren().map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['title', 'text1', 'footer']);

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(getCompilerSceneDocument()?.template.children.map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['content', 'footer']);
    });

    it('clears command history when a compiler scene is loaded or closed', () => {
        loadTemplate();
        updateCompilerSceneTemplate({ name: 'MainMenu' });
        expect(canUndoCompilerSceneCommand()).toBe(true);

        loadTemplate({
            ...template(),
            name: 'Hud',
        });
        expect(getCompilerSceneDocument()?.template.name).toBe('Hud');
        expect(canUndoCompilerSceneCommand()).toBe(false);
        expect(undoCompilerSceneCommand()).toBeUndefined();
        expect(getCompilerSceneDocument()?.template.name).toBe('Hud');

        resetCompilerSceneDocument();
        expect(canUndoCompilerSceneCommand()).toBe(false);
        expect(canRedoCompilerSceneCommand()).toBe(false);
    });
});
