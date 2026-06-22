import { afterEach, describe, expect, it } from 'vitest';
import type { SceneTemplate, SceneTemplateNode } from '../packages/pixifact/src/compiler/spec';
import {
    addCompilerSceneNode,
    addCompilerSceneNodeAtTarget,
    canRedoCompilerSceneCommand,
    canUndoCompilerSceneCommand,
    createCompilerPixiTemplateNode,
    deleteCompilerSceneNode,
    getCompilerSceneDocument,
    getCompilerSceneNode,
    loadCompilerSceneDocument,
    markCompilerSceneSaved,
    moveCompilerSceneNode,
    redoCompilerSceneCommand,
    resetCompilerSceneDocument,
    undoCompilerSceneCommand,
    updateCompilerSceneNode,
    updateCompilerSceneNodePropsInPlace,
    updateCompilerSceneTemplate,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import type { SceneTemplateInterface } from 'pixifact/compiler';
import {
    nodeTemplateLibraryGroups,
    pixiNodeTemplateLibrary,
} from '../apps/editor/src/services/nodeTemplateLibrary';

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

function loadTemplate(nextTemplate = template(), sceneInterfaces: Record<string, SceneTemplateInterface> = {}) {
    loadCompilerSceneDocument({
        scenePath: 'src/scenes/Menu.scene',
        template: nextTemplate,
        sceneInterfaces,
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

    it('merges repeated scene view move updates into one undo step', () => {
        loadTemplate();

        expect(getCompilerSceneNode('0:content/0:title')?.kind).toBe('pixi');

        updateCompilerSceneNode('0:content/0:title', {
            props: {
                x: 10,
                y: 20,
            },
        }, { mergeKey: 'scene-view:move:0:content/0:title:1' });
        updateCompilerSceneNode('0:content/0:title', {
            props: {
                x: 30,
                y: 35,
            },
        }, { mergeKey: 'scene-view:move:0:content/0:title:1' });

        expect(contentChildren()[0].props).toMatchObject({
            x: 30,
            y: 35,
        });

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(contentChildren()[0].props.x).toBeUndefined();
        expect(contentChildren()[0].props.y).toBeUndefined();
        expect(canUndoCompilerSceneCommand()).toBe(false);
    });

    it('merges repeated scene view resize updates into one undo step', () => {
        loadTemplate();

        updateCompilerSceneNodePropsInPlace('0:content/0:title', {
            width: 120,
            height: 40,
        }, { mergeKey: 'scene-view:resize:0:content/0:title:south-east:1' });
        updateCompilerSceneNodePropsInPlace('0:content/0:title', {
            width: 150,
            height: 64,
        }, { mergeKey: 'scene-view:resize:0:content/0:title:south-east:1' });

        expect(contentChildren()[0].props).toMatchObject({
            width: 150,
            height: 64,
        });

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(contentChildren()[0].props.width).toBeUndefined();
        expect(contentChildren()[0].props.height).toBeUndefined();
        expect(canUndoCompilerSceneCommand()).toBe(false);
    });

    it('can update scene view movement without replacing the template reference', () => {
        loadTemplate();

        const initialTemplate = getCompilerSceneDocument()?.template;
        updateCompilerSceneNodePropsInPlace('0:content/0:title', {
            x: 18,
            y: 24,
        }, { mergeKey: 'scene-view:move:0:content/0:title:1' });

        expect(getCompilerSceneDocument()?.template).toBe(initialTemplate);
        expect(getCompilerSceneNode('0:content/0:title')).toMatchObject({
            id: 'title',
            props: {
                x: 18,
                y: 24,
            },
        });

        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(contentChildren()[0].props.x).toBeUndefined();
        expect(contentChildren()[0].props.y).toBeUndefined();
    });

    it('adds compiler nodes using the hierarchy context target rules', () => {
        loadTemplate();
        const document = getCompilerSceneDocument();
        expect(document).toBeTruthy();

        const containerResult = addCompilerSceneNodeAtTarget(
            '0:content',
            createCompilerPixiTemplateNode(document!.template, 'Graphics'),
        );
        expect(containerResult).toEqual({
            ok: true,
            locator: '0:content/1:graphics1',
        });
        expect(contentChildren().map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['title', 'graphics1']);

        const leafResult = addCompilerSceneNodeAtTarget(
            '0:content/0:title',
            createCompilerPixiTemplateNode(getCompilerSceneDocument()!.template, 'Sprite'),
        );
        expect(leafResult).toEqual({
            ok: true,
            locator: '0:content/1:sprite1',
        });
        expect(contentChildren().map((node) => node.kind !== 'slotOutlet' ? node.id : node.name)).toEqual(['title', 'sprite1', 'graphics1']);
        expect(getCompilerSceneDocument()?.selection).toEqual({ type: 'node', node: '0:content/1:sprite1' });
    });

    it('adds runtime layout container nodes using the hierarchy context target rules', () => {
        loadTemplate();

        const templateItem = pixiNodeTemplateLibrary.find((item) => item.name === 'VBoxContainer');
        const gridTemplateItem = pixiNodeTemplateLibrary.find((item) => item.name === 'GridContainer');
        const scrollTemplateItem = pixiNodeTemplateLibrary.find((item) => item.name === 'ScrollContainer');
        expect(templateItem).toBeDefined();
        expect(gridTemplateItem).toBeDefined();
        expect(scrollTemplateItem).toBeDefined();
        expect(nodeTemplateLibraryGroups.map((group) => group.titleKey)).toEqual([
            'addPixiNodeGroup',
        ]);
        expect(nodeTemplateLibraryGroups[0].items).toContain(templateItem);
        expect(nodeTemplateLibraryGroups[0].items).toContain(gridTemplateItem);
        expect(nodeTemplateLibraryGroups[0].items).toContain(scrollTemplateItem);

        const result = addCompilerSceneNodeAtTarget(
            '0:content/0:title',
            createCompilerPixiTemplateNode(getCompilerSceneDocument()!.template, 'VBoxContainer'),
        );

        expect(result).toEqual({
            ok: true,
            locator: '0:content/1:vBoxContainer1',
        });
        expect(contentChildren()[1]).toMatchObject({
            kind: 'pixi',
            type: 'VBoxContainer',
            id: 'vBoxContainer1',
            props: {
                width: 160,
                height: 240,
                gap: 8,
            },
            children: [],
        });

        const scrollResult = addCompilerSceneNodeAtTarget(
            '0:content/1:vBoxContainer1',
            createCompilerPixiTemplateNode(getCompilerSceneDocument()!.template, 'ScrollContainer'),
        );

        expect(scrollResult).toEqual({
            ok: true,
            locator: '0:content/1:vBoxContainer1/0:scrollContainer1',
        });
        const stackNode = contentChildren()[1];
        expect(stackNode.kind).toBe('pixi');
        expect(stackNode.kind === 'pixi' ? stackNode.children[0] : undefined).toMatchObject({
            kind: 'pixi',
            type: 'ScrollContainer',
            id: 'scrollContainer1',
            props: {
                width: 240,
                height: 160,
                direction: 'vertical',
                scrollX: 0,
                scrollY: 0,
            },
            children: [],
        });

        const gridResult = addCompilerSceneNodeAtTarget(
            '0:content/1:vBoxContainer1',
            createCompilerPixiTemplateNode(getCompilerSceneDocument()!.template, 'GridContainer'),
        );

        expect(gridResult).toEqual({
            ok: true,
            locator: '0:content/1:vBoxContainer1/1:gridContainer1',
        });
        const stackNodeAfterGrid = contentChildren()[1];
        expect(stackNodeAfterGrid.kind === 'pixi' ? stackNodeAfterGrid.children[1] : undefined).toMatchObject({
            kind: 'pixi',
            type: 'GridContainer',
            id: 'gridContainer1',
            props: {
                width: 240,
                height: 160,
                columns: 2,
                gapX: 8,
                gapY: 8,
            },
            children: [],
        });
    });

    it('adds Rect as a Pixifact drawing leaf from the node template library', () => {
        loadTemplate();

        const templateItem = pixiNodeTemplateLibrary.find((item) => item.name === 'Rect');
        expect(templateItem).toBeDefined();
        expect(nodeTemplateLibraryGroups.map((group) => group.titleKey)).toEqual([
            'addPixiNodeGroup',
        ]);
        expect(nodeTemplateLibraryGroups[0].items).toContain(templateItem);

        const result = addCompilerSceneNodeAtTarget(
            '0:content/0:title',
            createCompilerPixiTemplateNode(getCompilerSceneDocument()!.template, 'Rect'),
        );

        expect(result).toEqual({
            ok: true,
            locator: '0:content/1:rect1',
        });
        expect(contentChildren()[1]).toMatchObject({
            kind: 'pixi',
            type: 'Rect',
            id: 'rect1',
            props: {
                width: 100,
                height: 60,
                fillColor: 0xffffff,
                fillAlpha: 1,
                strokeColor: 0x000000,
                strokeAlpha: 1,
                strokeWidth: 0,
                radius: 0,
            },
            children: [],
        });
    });

    it('adds Pixifact image leaves from the node template library', () => {
        loadTemplate();

        for (const type of ['Image', 'NineImage', 'TileImage'] as const) {
            const templateItem = pixiNodeTemplateLibrary.find((item) => item.name === type);
            expect(templateItem).toBeDefined();
            expect(nodeTemplateLibraryGroups[0].items).toContain(templateItem);
        }

        const imageResult = addCompilerSceneNodeAtTarget(
            '0:content/0:title',
            createCompilerPixiTemplateNode(getCompilerSceneDocument()!.template, 'Image'),
        );
        expect(imageResult).toEqual({
            ok: true,
            locator: '0:content/1:image1',
        });
        expect(contentChildren()[1]).toMatchObject({
            kind: 'pixi',
            type: 'Image',
            id: 'image1',
            props: {
                width: 96,
                height: 96,
                fit: 'stretch',
            },
            children: [],
        });

        const nineImageResult = addCompilerSceneNodeAtTarget(
            '0:content/1:image1',
            createCompilerPixiTemplateNode(getCompilerSceneDocument()!.template, 'NineImage'),
        );
        expect(nineImageResult).toEqual({
            ok: true,
            locator: '0:content/2:nineImage1',
        });
        expect(contentChildren()[2]).toMatchObject({
            kind: 'pixi',
            type: 'NineImage',
            id: 'nineImage1',
            props: {
                width: 160,
                height: 80,
                leftWidth: 10,
                rightWidth: 10,
                topHeight: 10,
                bottomHeight: 10,
            },
            children: [],
        });

        const tileImageResult = addCompilerSceneNodeAtTarget(
            '0:content/2:nineImage1',
            createCompilerPixiTemplateNode(getCompilerSceneDocument()!.template, 'TileImage'),
        );
        expect(tileImageResult).toEqual({
            ok: true,
            locator: '0:content/3:tileImage1',
        });
        expect(contentChildren()[3]).toMatchObject({
            kind: 'pixi',
            type: 'TileImage',
            id: 'tileImage1',
            props: {
                width: 160,
                height: 96,
                tileScaleX: 1,
                tileScaleY: 1,
            },
            children: [],
        });
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
