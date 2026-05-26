import { describe, expect, it } from 'vitest';
import {
    ButtonComponent,
    SceneDocument,
    ProgressBar,
    ScrollRect,
    compileLogicGraphToTypescript,
    createComponentSpecFromSchema,
    createLogicGraph,
    createRuntimeActions,
    createUseInventoryItemFlow,
    image,
    input,
    component,
    container,
    createInventoryPanelCommands,
    instantiate,
    listPaletteComponents,
    scene,
    shape,
    text,
    validateLogicGraph,
    validateCommand,
} from 'pixifact';
import type { SceneSpec } from 'pixifact';
import { createNodeTemplateNode, pixiNodeTemplateLibrary, pixiNodeTypeFromTemplateKind } from '../apps/editor/src/services/nodeTemplateLibrary';

function createButtonScene(): SceneSpec {
    return scene('PrimaryButton',
        container('Button', {
            id: 'root',
            key: 'submitButton',
            width: 140,
            height: 44,
            components: [
                component('ui.Button', { targetGraphic: 'submitButtonBg', onClick: 'submitLogin' }, 'button'),
            ],
            children: [
                shape('背景', {
                    id: 'submitButtonBg',
                    key: 'submitButtonBg',
                    width: 140,
                    height: 44,
                    type: 'roundedRect',
                    color: 0x2563eb,
                    radius: 8,
                }),
                text('Label', {
                    id: 'label-node',
                    key: 'submitButtonLabel',
                    width: 140,
                    height: 44,
                    value: 'Submit',
                    color: 0xffffff,
                    fontSize: 14,
                    center: true,
                }),
            ],
        }),
    );
}

describe('SceneDocument', () => {
    it('loads and serializes scene specs without using runtime objects as source of truth', () => {
        const doc = new SceneDocument(createButtonScene());
        const json = doc.serialize();
        const next = new SceneDocument(createButtonScene());

        next.load(json);

        expect(next.scene.name).toBe('PrimaryButton');
        expect(next.scene.root.key).toBe('submitButton');
        expect(next.dirty).toBe(false);
    });

    it('applies setNodeData commands and supports undo/redo', () => {
        const doc = new SceneDocument(createButtonScene());

        const result = doc.apply({
            op: 'setNodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        });

        expect(result.ok).toBe(true);
        expect(doc.dirty).toBe(true);
        expect(doc.canUndo).toBe(true);
        expect(doc.scene.root.children?.[1].text?.value).toBe('Continue');
        expect(doc.overrides[0]).toMatchObject({
            source: 'manual',
            target: 'submitButtonLabel.text.value',
            before: 'Submit',
            after: 'Continue',
        });

        doc.undo();
        expect(doc.scene.root.children?.[1].text?.value).toBe('Submit');
        expect(doc.canRedo).toBe(true);

        doc.redo();
        expect(doc.scene.root.children?.[1].text?.value).toBe('Continue');
    });

    it('applies setTransform commands and can instantiate the edited scene', () => {
        const doc = new SceneDocument(createButtonScene());

        doc.apply({
            op: 'setTransform',
            node: 'submitButton',
            values: {
                width: 180,
                height: 52,
            },
        });

        expect(doc.scene.root.transform?.width).toBe(180);
        expect(doc.scene.root.transform?.height).toBe(52);

        const runtime = instantiate(doc.scene);
        expect(runtime.root.width).toBe(180);
        expect(runtime.root.height).toBe(52);
    });

    it('rebuilds runtime preview and builds inspector models from schema', () => {
        const doc = new SceneDocument(createButtonScene());
        doc.setSelection({ type: 'node', node: 'submitButtonLabel' });

        const preview = doc.rebuildPreview();
        const inspector = doc.getInspectorModel();

        expect(preview.nodes.get('submitButton')).toBeDefined();
        expect(inspector?.display[0].displayName).toBe('Text');
        expect(inspector?.display[0].fields.some((field) => field.key === 'value')).toBe(true);

        doc.apply({
            op: 'setNodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'value',
            value: 'Preview',
        });

        expect(doc.preview?.nodes.get('submitButtonLabel')).toBeDefined();
        doc.destroy();
    });

    it('builds node-specific inspector display fields', () => {
        const doc = new SceneDocument(scene('InspectorFields',
            container('Root', {
                key: 'root',
                children: [
                    text('Title', {
                        key: 'title',
                        value: 'Hello',
                        color: 0x111827,
                        fontSize: 18,
                    }),
                    image('Hero', {
                        key: 'hero',
                        mode: 'sprite',
                        src: 'assets/hero.png',
                        tint: 0xffffff,
                    }),
                    shape('Panel', {
                        key: 'panel',
                        type: 'roundedRect',
                        color: 0xffffff,
                        radius: 8,
                    }),
                    input('Name', {
                        key: 'nameInput',
                        value: 'Player',
                        backgroundColor: 0xffffff,
                        borderColor: 0x94a3b8,
                    }),
                ],
            }),
        ));

        doc.setSelection({ type: 'node', node: 'title' });
        expect(doc.getInspectorModel()?.display[0].fields.map((field) => field.key)).toEqual([
            'value',
            'color',
            'fontSize',
            'fontFamily',
            'fontWeight',
            'center',
        ]);
        expect(doc.getInspectorModel()?.display[0].fields.some((field) => field.key === 'src' || field.key === 'radius')).toBe(false);

        doc.setSelection({ type: 'node', node: 'hero' });
        expect(doc.getInspectorModel()?.display[0].fields.map((field) => field.key)).toEqual([
            'mode',
            'src',
            'tint',
            'leftWidth',
            'rightWidth',
            'topHeight',
            'bottomHeight',
        ]);
        expect(doc.getInspectorModel()?.display[0].fields.some((field) => field.key === 'value' || field.key === 'radius')).toBe(false);

        doc.setSelection({ type: 'node', node: 'panel' });
        expect(doc.getInspectorModel()?.display[0].fields.map((field) => field.key)).toEqual([
            'type',
            'color',
            'fillAlpha',
            'radius',
            'strokeColor',
            'strokeWidth',
            'strokeAlpha',
        ]);
        expect(doc.getInspectorModel()?.display[0].fields.some((field) => field.key === 'src')).toBe(false);

        doc.setSelection({ type: 'node', node: 'nameInput' });
        expect(doc.getInspectorModel()?.display[0].fields.map((field) => field.key)).toEqual([
            'value',
            'backgroundColor',
            'borderColor',
            'borderSize',
            'textColor',
            'fontSize',
            'fontFamily',
            'paddingLeft',
            'paddingRight',
            'paddingTop',
            'paddingBottom',
        ]);
        expect(doc.getInspectorModel()?.display[0].fields.some((field) => field.key === 'src' || field.key === 'radius')).toBe(false);

        doc.setSelection({ type: 'node', node: 'root' });
        expect(doc.getInspectorModel()?.display).toEqual([]);
    });

    it('adds and removes components through commands', () => {
        const doc = new SceneDocument(createButtonScene());

        const add = doc.apply({
            op: 'addComponent',
            node: 'submitButtonLabel',
            component: component('ui.Button', { onClick: 'submitLogin' }, 'label-button'),
            index: 0,
        });

        expect(add.ok).toBe(true);
        expect(doc.scene.root.children?.[1].components?.[0].id).toBe('label-button');

        const remove = doc.apply({
            op: 'removeComponent',
            node: 'submitButtonLabel',
            component: 'label-button',
        });

        expect(remove.ok).toBe(true);
        expect(doc.scene.root.children?.[1].components?.some((component) => component.id === 'label-button')).toBe(false);

        doc.undo();
        expect(doc.scene.root.children?.[1].components?.some((component) => component.id === 'label-button')).toBe(true);
    });

    it('builds component palette items from schema and creates default component specs', () => {
        const doc = new SceneDocument(createButtonScene());
        const items = listPaletteComponents({
            scene: doc.scene,
            node: 'submitButton',
        });
        const buttonItem = items.find((item) => item.type === 'ui.Button');

        expect(buttonItem?.disabledReason).toContain('already exists');

        const spec = createComponentSpecFromSchema('ui.ProgressBar', 'progress');
        expect(spec).toMatchObject({
            id: 'progress',
            type: 'ui.ProgressBar',
        });
        expect(spec.props).toMatchObject({
            value: 0,
            min: 0,
            max: 1,
        });

        const result = doc.apply({
            op: 'addComponent',
            node: 'submitButton',
            component: spec,
        });

        expect(result.ok).toBe(true);
        expect(doc.scene.root.components?.some((component) => component.id === 'progress')).toBe(true);
    });

    it('updates node props and supports tree commands with undo', () => {
        const doc = new SceneDocument(createButtonScene());
        const createPanel = doc.apply({
            op: 'createNode',
            node: container('Panel', {
                id: 'panel',
                key: 'panel',
                width: 120,
                height: 80,
            }),
        });

        expect(createPanel.ok).toBe(true);
        expect(doc.scene.root.children?.some((node) => node.key === 'panel')).toBe(true);

        doc.apply({
            op: 'setNodeProp',
            node: 'panel',
            prop: 'role',
            value: 'dialog-panel',
        });
        expect(doc.scene.root.children?.find((node) => node.key === 'panel')?.role).toBe('dialog-panel');

        doc.apply({
            op: 'reorderNode',
            node: 'panel',
            index: 0,
        });
        expect(doc.scene.root.children?.[0].key).toBe('panel');

        doc.apply({
            op: 'reparentNode',
            node: 'submitButtonBg',
            parent: 'panel',
        });
        expect(doc.scene.root.children?.[0].children?.[0].key).toBe('submitButtonBg');

        doc.undo();
        expect(doc.scene.root.children?.some((node) => node.key === 'submitButtonBg')).toBe(true);
    });

    it('rejects adding children to non-container nodes', () => {
        const doc = new SceneDocument(createButtonScene());
        const createUnderButton = doc.apply({
            op: 'createNode',
            parent: 'submitButtonLabel',
            node: container('Panel', {
                id: 'panel',
                key: 'panel',
            }),
        });

        expect(createUnderButton.ok).toBe(false);
        expect(createUnderButton.error).toContain('Only container nodes');

        const createPanel = doc.apply({
            op: 'createNode',
            node: container('Panel', {
                id: 'floatingPanel',
                key: 'floatingPanel',
            }),
        });
        expect(createPanel.ok).toBe(true);

        const reparentUnderButton = doc.apply({
            op: 'reparentNode',
            node: 'floatingPanel',
            parent: 'submitButtonLabel',
        });

        expect(reparentUnderButton.ok).toBe(false);
        expect(reparentUnderButton.error).toContain('Only container nodes');
    });

    it('applies inventory template commands and instantiates the generated native component tree', () => {
        const doc = new SceneDocument(createButtonScene());
        const result = doc.apply({
            op: 'batch',
            commands: createInventoryPanelCommands({ columns: 4, rows: 3 }),
        });

        expect(result.ok).toBe(true);
        const panel = doc.scene.root.children?.find((node) => node.key === 'inventoryPanel');
        expect(panel?.children?.filter((node) => node.role === 'inventory-slot')).toHaveLength(12);

        const runtime = instantiate(doc.scene, undefined, {
            actions: {
                useInventoryItem() {},
            },
        });
        expect(runtime.nodes.get('inventoryPanel')).toBeDefined();
        expect(runtime.components.get('inventorySlot1UseButtonButton')).toBeDefined();

        const templateResult = new SceneDocument(createButtonScene()).apply({
            op: 'batch',
            commands: createInventoryPanelCommands(),
        });
        expect(templateResult.ok).toBe(true);
    });

    it('rejects invalid component props with schema errors', () => {
        const sceneSpec = createButtonScene();
        const result = validateCommand(sceneSpec, {
            op: 'setComponentProp',
            node: 'submitButton',
            component: 'button',
            prop: 'missing',
            value: 'bad',
        });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('does not exist');
    });

    it('stores locks on editor documents and records agent overrides', () => {
        const doc = new SceneDocument(createButtonScene());
        doc.addLock({
            target: 'nodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'fontSize',
        });

        expect(doc.locks).toHaveLength(1);

        doc.removeLock({
            target: 'nodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'fontSize',
        });

        expect(doc.locks).toHaveLength(0);

        const result = doc.apply({
            op: 'setNodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'value',
            value: 'Agent Start',
        }, 'agent');

        expect(result.ok).toBe(true);
        expect(doc.overrides.at(-1)).toMatchObject({
            source: 'agent',
            target: 'submitButtonLabel.text.value',
            after: 'Agent Start',
        });
    });

    it('turns manual overrides into accepted memory', () => {
        const doc = new SceneDocument(createButtonScene());
        doc.apply({
            op: 'setNodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'fontSize',
            value: 18,
        });

        const suggestions = doc.getMemorySuggestions();
        expect(suggestions[0].memory.pattern).toContain('fontSize=18');

        doc.acceptMemorySuggestion(suggestions[0]);
        expect(doc.memory).toHaveLength(1);

        doc.setMemoryEnabled(doc.memory[0].id, false);
        expect(doc.memory[0].enabled).toBe(false);

        doc.setMemoryEnabled(doc.memory[0].id, true);
        doc.removeMemory(doc.memory[0].id);
        expect(doc.memory).toHaveLength(0);

        doc.importMemory([{
            id: 'imported-memory',
            context: 'dialog.primaryAction',
            pattern: 'Primary dialog actions are right-aligned.',
            after: 'right',
            confidence: 0.8,
        }]);
        expect(doc.memory[0]).toMatchObject({
            id: 'imported-memory',
            source: 'imported',
        });
    });

    it('serializes and loads editor project state', () => {
        const doc = new SceneDocument(createButtonScene());
        doc.designTokens = {
            colors: { primary: 0x2563eb },
            spacing: { x8: 8 },
        };
        doc.addAction({
            key: 'submitLogin',
            label: 'Submit Login',
        });
        doc.addAction({
            key: 'useInventoryItem',
            label: 'Use Inventory Item',
        });
        doc.addLogicFlow(createUseInventoryItemFlow());
        doc.setSelection({ type: 'node', node: 'submitButtonLabel' });
        doc.addLock({
            target: 'nodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'fontSize',
        });
        doc.apply({
            op: 'setNodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'fontSize',
            value: 18,
        });
        doc.acceptMemorySuggestion(doc.getMemorySuggestions()[0]);

        const next = new SceneDocument(createButtonScene());
        next.load(doc.serializeState());

        expect(next.scene.root.children?.[1].text?.fontSize).toBe(18);
        expect(next.selection).toEqual({ type: 'node', node: 'submitButtonLabel' });
        expect(next.designTokens?.colors?.primary).toBe(0x2563eb);
        expect(next.actions.map((action) => action.key)).toEqual(['submitLogin', 'useInventoryItem']);
        expect(next.logicGraph.flows[0].action).toBe('useInventoryItem');
        expect(next.locks).toHaveLength(1);
        expect(next.overrides).toHaveLength(1);
        expect(next.memory).toHaveLength(1);
        expect(next.dirty).toBe(false);
    });

    it('validates event props against the project action registry when provided', () => {
        const doc = new SceneDocument(createButtonScene());
        doc.addAction({ key: 'submitLogin' });

        const ok = doc.apply({
            op: 'setComponentProp',
            node: 'submitButton',
            component: 'button',
            prop: 'onClick',
            value: 'submitLogin',
        });
        expect(ok.ok).toBe(true);

        const failed = doc.apply({
            op: 'setComponentProp',
            node: 'submitButton',
            component: 'button',
            prop: 'onClick',
            value: 'missingAction',
        });
        expect(failed.ok).toBe(false);
        expect(failed.error).toContain('not declared');

        const validation = validateCommand(createButtonScene(), {
            op: 'setComponentProp',
            node: 'submitButton',
            component: 'button',
            prop: 'onClick',
            value: 'missingAction',
        }, {
            actions: doc.actions,
        });
        expect(validation.ok).toBe(false);
        expect(validation.error).toContain('not declared');
    });

    it('does not validate plain string props against the action registry', () => {
        const doc = new SceneDocument(createButtonScene());
        doc.addAction({ key: 'submitLogin' });

        const result = doc.apply({
            op: 'setNodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        });

        expect(result.ok).toBe(true);
    });

    it('creates runtime action handlers from action registry specs', () => {
        const called: string[] = [];
        const actions = createRuntimeActions([{ key: 'submitLogin' }], (action) => {
            called.push(action.key);
        });

        actions.submitLogin();
        expect(called).toEqual(['submitLogin']);
    });

    it('validates, stores and compiles logic graph flows', () => {
        const doc = new SceneDocument(createButtonScene());
        doc.addAction({ key: 'useInventoryItem' });

        const flow = createUseInventoryItemFlow();
        const result = doc.addLogicFlow(flow);
        expect(result.ok).toBe(true);
        expect(doc.logicGraph.flows[0].action).toBe('useInventoryItem');

        const validation = validateLogicGraph(doc.logicGraph, {
            actions: doc.actions,
            scene: doc.scene,
        });
        expect(validation.ok).toBe(true);

        const code = compileLogicGraphToTypescript(doc.logicGraph);
        expect(code).toContain('"useInventoryItem"');
        expect(code).toContain('selectedItem');

        const failed = doc.addLogicFlow({
            id: 'flow-missing-action',
            action: 'missingAction',
            steps: [],
        });
        expect(failed.ok).toBe(false);
        expect(failed.errors[0]).toContain('undeclared action');
    });

    it('registers additional UI components for editor palettes', () => {
        const spec = scene('FormControls',
            container('Root', {
                id: 'root',
                width: 200,
                height: 80,
                components: [
                    component('ui.ProgressBar', { fillNode: 'root', value: 0.5 }, 'progress'),
                    component('ui.ScrollRect', { contentHeight: 200 }, 'scroll'),
                    component('ui.InputField', { placeholder: 'Name' }, 'input'),
                    component('ui.Button', {}, 'button'),
                ],
            }),
        );

        const runtime = instantiate(spec);

        expect(runtime.components.get('progress')).toBeInstanceOf(ProgressBar);
        expect(runtime.components.get('scroll')).toBeInstanceOf(ScrollRect);
        expect(runtime.components.get('input')).toBeDefined();
        expect(runtime.components.get('button')).toBeInstanceOf(ButtonComponent);
    });
});

describe('editor scene templates', () => {
    it('adds only base nodes through the editor template library', () => {
        const doc = new SceneDocument(createButtonScene());
        const group = createNodeTemplateNode(doc, 'container');
        const label = createNodeTemplateNode(doc, 'text');
        const sprite = createNodeTemplateNode(doc, 'image');
        const field = createNodeTemplateNode(doc, 'input');
        const box = createNodeTemplateNode(doc, 'shape');

        expect(group.kind).toBe('container');
        expect(label.kind).toBe('text');
        expect(sprite.kind).toBe('image');
        expect(field.kind).toBe('input');
        expect(box.kind).toBe('shape');
    });

    it('builds compiler Pixi node templates from schema types', () => {
        expect(pixiNodeTemplateLibrary.map((item) => [item.kind, item.name])).toEqual([
            ['pixi-container', 'Container'],
            ['pixi-sprite', 'Sprite'],
            ['pixi-nine-slice-sprite', 'NineSliceSprite'],
            ['pixi-tiling-sprite', 'TilingSprite'],
            ['pixi-text', 'Text'],
            ['pixi-bitmap-text', 'BitmapText'],
            ['pixi-html-text', 'HTMLText'],
            ['pixi-graphics', 'Graphics'],
        ]);
        expect(pixiNodeTypeFromTemplateKind('pixi-nine-slice-sprite')).toBe('NineSliceSprite');
        expect(pixiNodeTypeFromTemplateKind('pixi-html-text')).toBe('HTMLText');
    });
});
