import { describe, expect, it } from 'vitest';
import {
    ButtonComponent,
    SceneDocument,
    MockAiProposalProvider,
    ProgressBar,
    RemoteAiProposalProvider,
    ScrollRect,
    buildAiAuthoringContext,
    compileLogicGraphToTypescript,
    createAiProposalRequest,
    createComponentSpecFromSchema,
    executeAiPrompt,
    createLogicGraph,
    createRuntimeActions,
    createUseInventoryItemFlow,
    image,
    input,
    progressBarScene,
    scrollViewScene,
    component,
    container,
    createInventoryPanelCommands,
    createAiProposal,
    dryRunProposal,
    dryRunCommands,
    getAiComponentSchemas,
    instantiate,
    listPaletteComponents,
    scene,
    shape,
    summarizeSceneForAi,
    text,
    validateLogicGraph,
    validateCommand,
} from 'pixifact';
import type { SceneSpec } from 'pixifact';
import { createNodeTemplateNode } from '../apps/editor/src/services/nodeTemplateLibrary';

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

        const dryRun = dryRunProposal(createButtonScene(), createAiProposal({
            commands: [{
                op: 'batch',
                commands: createInventoryPanelCommands(),
            }],
        }));
        expect(dryRun.ok).toBe(true);
        expect(dryRun.diffs[0].target).toContain('inventoryPanel');
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

    it('summarizes scenes and schemas for AI and dry-runs command lists', () => {
        const source = createButtonScene();
        const summary = summarizeSceneForAi(source);
        const schemas = getAiComponentSchemas();

        expect(summary.root.key).toBe('submitButton');
        expect(schemas.some((schema) => schema.type === 'ui.Button')).toBe(true);

        const result = dryRunCommands(source, [{
            op: 'setNodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        }]);

        expect(result.ok).toBe(true);
        expect(result.scene?.root.children?.[1].text?.value).toBe('Continue');
        expect(source.root.children?.[1].text?.value).toBe('Submit');
    });

    it('dry-runs AI proposals with diffs and keeps the source scene unchanged', () => {
        const source = createButtonScene();
        const proposal = createAiProposal({
            prompt: 'Start game button',
            explanation: 'Rename the button label.',
            commands: [{
                op: 'setNodeData',
                node: 'submitButtonLabel',
                field: 'text',
                prop: 'value',
                value: 'Start Game',
            }],
        });

        const result = dryRunProposal(source, proposal);

        expect(result.ok).toBe(true);
        expect(result.diffs[0].target).toBe('submitButtonLabel.text.value');
        expect(result.diffs[0].before).toBe('Submit');
        expect(result.diffs[0].after).toBe('Start Game');
        expect(result.scene?.root.children?.[1].text?.value).toBe('Start Game');
        expect(source.root.children?.[1].text?.value).toBe('Submit');
    });

    it('rejects AI proposals that touch locked props', () => {
        const proposal = createAiProposal({
            commands: [{
                op: 'setNodeData',
                node: 'submitButtonLabel',
                field: 'text',
                prop: 'fontSize',
                value: 18,
            }],
        });

        const result = dryRunProposal(createButtonScene(), proposal, {
            locks: [{
                target: 'nodeData',
                node: 'submitButtonLabel',
                field: 'text',
                prop: 'fontSize',
                reason: 'Designer override',
            }],
        });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('locked');
    });

    it('stores locks on editor documents and records AI overrides', () => {
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
            value: 'AI Start',
        }, 'ai');

        expect(result.ok).toBe(true);
        expect(doc.overrides.at(-1)).toMatchObject({
            source: 'ai',
            target: 'submitButtonLabel.text.value',
            after: 'AI Start',
        });
    });

    it('turns manual overrides into accepted memory for future AI context', async () => {
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

        const provider = new MockAiProposalProvider();
        const proposal = await provider.generate('把按钮改成 Start Game', {
            scene: doc.scene,
            selection: 'submitButton',
            memory: doc.memory,
        });

        expect(proposal.explanation).toContain('Memory:');
        expect(proposal.explanation).toContain('fontSize=18');

        doc.setMemoryEnabled(doc.memory[0].id, false);
        const disabledProposal = await provider.generate('把按钮改成 Start Game', {
            scene: doc.scene,
            selection: 'submitButton',
            memory: doc.memory,
        });
        expect(disabledProposal.explanation).not.toContain('Memory:');

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

    it('serializes and loads full AI-first editor project state', () => {
        const doc = new SceneDocument(createButtonScene());
        const proposal = createAiProposal({
            id: 'proposal-test',
            prompt: 'make label larger',
            commands: [{
                op: 'setNodeData',
                node: 'submitButtonLabel',
                field: 'text',
                prop: 'fontSize',
                value: 18,
            }],
        });
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
        doc.recordProposalRun(dryRunProposal(doc.scene, proposal));
        doc.markProposalApplied(proposal);

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
        expect(next.proposalHistory[0]).toMatchObject({
            id: 'proposal-test',
            status: 'applied',
        });
        expect(next.dirty).toBe(false);
    });

    it('records proposal history across generate, dry-run, reject and apply states', () => {
        const doc = new SceneDocument(createButtonScene());
        const proposal = createAiProposal({
            id: 'proposal-history',
            commands: [{
                op: 'setNodeData',
                node: 'submitButtonLabel',
                field: 'text',
                prop: 'value',
                value: 'Start',
            }],
        });

        doc.recordProposal(proposal);
        expect(doc.proposalHistory[0].status).toBe('generated');

        const run = dryRunProposal(doc.scene, proposal);
        doc.recordProposalRun(run);
        expect(doc.proposalHistory).toHaveLength(1);
        expect(doc.proposalHistory[0].status).toBe('dryRunPassed');
        expect(doc.proposalHistory[0].diffs?.[0].after).toBe('Start');

        doc.markProposalRejected(proposal);
        expect(doc.proposalHistory[0].status).toBe('rejected');

        doc.markProposalApplied(proposal);
        expect(doc.proposalHistory[0].status).toBe('applied');
    });

    it('repairs invalid AI commands before applying the proposal', async () => {
        const doc = new SceneDocument(createButtonScene());
        const prompts: string[] = [];
        const provider = {
            async generate(prompt: string) {
                prompts.push(prompt);
                return createAiProposal({
                    id: `repair-${prompts.length}`,
                    prompt,
                    commands: prompts.length === 1
                        ? [{
                            op: 'setNodeData',
                            node: 'missingNode',
                            field: 'text',
                            prop: 'value',
                            value: 'Broken',
                        }]
                        : [{
                            op: 'setNodeData',
                            node: 'submitButtonLabel',
                            field: 'text',
                            prop: 'value',
                            value: 'Fixed',
                        }],
                });
            },
        };

        const result = await executeAiPrompt(doc, provider, 'rename label', {
            maxAttempts: 2,
        });

        expect(result.ok).toBe(true);
        expect(result.attempts).toHaveLength(2);
        expect(prompts[1]).toContain('未通过 Pixifact 校验');
        expect(prompts[1]).toContain('Node "missingNode" was not found.');
        expect(doc.scene.root.children?.[1].text?.value).toBe('Fixed');
        expect(doc.overrides.at(-1)).toMatchObject({
            source: 'ai',
            target: 'submitButtonLabel.text.value',
            after: 'Fixed',
        });
        expect(doc.proposalHistory.map((entry) => entry.status)).toEqual(['dryRunFailed', 'applied']);
    });

    it('returns a failed AI execution result when repair attempts are exhausted', async () => {
        const doc = new SceneDocument(createButtonScene());
        const provider = {
            async generate(prompt: string) {
                return createAiProposal({
                    id: `failed-${prompt.length}`,
                    prompt,
                    commands: [{
                        op: 'setNodeData',
                        node: 'submitButtonLabel',
                        field: 'text',
                        prop: 'missing',
                        value: 'Broken',
                    }],
                });
            },
        };

        const result = await executeAiPrompt(doc, provider, 'bad edit', {
            maxAttempts: 2,
        });

        expect(result.ok).toBe(false);
        expect(result.applied).toBe(false);
        expect(result.attempts).toHaveLength(2);
        expect(result.error).toContain('does not exist');
        expect(doc.scene.root.children?.[1].text?.value).toBe('Submit');
        expect(doc.proposalHistory.at(-1)?.status).toBe('rejected');
    });

    it('builds AI authoring context with schemas, locks, design tokens and memory', () => {
        const sceneSpec = createButtonScene();
        const context = buildAiAuthoringContext({
            scene: sceneSpec,
            selection: 'submitButtonLabel',
            designTokens: {
                colors: { primary: 0x2563eb },
            },
            actions: [{
                key: 'submitLogin',
                label: 'Submit Login',
                description: 'Submits the login form.',
            }, {
                key: 'useInventoryItem',
            }],
            logicGraph: createLogicGraph([createUseInventoryItemFlow()]),
            locks: [{
                target: 'nodeData',
                node: 'submitButtonLabel',
                field: 'text',
                prop: 'fontSize',
            }],
            memory: [{
                id: 'memory-1',
                context: 'submitButtonLabel.text.fontSize',
                pattern: 'When editing submit labels, prefer fontSize=18.',
                after: 18,
                confidence: 0.7,
            }],
        });

        expect(context.sceneSummary.root.key).toBe('submitButton');
        expect(context.componentSchemas.some((schema) => schema.type === 'ui.TextGraphic')).toBe(false);
        expect(context.commandSchemas.some((schema) => schema.op === 'createNode')).toBe(true);
        expect(context.commandSummary).toContain('SceneCommand');
        expect(context.commandSummary).toContain('useInventoryItem');
        expect(context.selection).toEqual({ type: 'node', node: 'submitButtonLabel' });
        expect(context.lockedTargets).toEqual(['submitButtonLabel.text.fontSize']);
        expect(context.designTokens?.colors?.primary).toBe(0x2563eb);
        expect(context.actionSummary).toContain('submitLogin');
        expect(context.logicSummary).toContain('useInventoryItem');
        expect(context.memorySummary).toContain('fontSize=18');
        expect(context.memory).toHaveLength(1);

        sceneSpec.root.key = 'mutated-after-context-build';
        expect(context.scene.root.key).toBe('submitButton');
    });

    it('excludes disabled memory from AI authoring context', () => {
        const context = buildAiAuthoringContext({
            scene: createButtonScene(),
            memory: [{
                id: 'enabled',
                context: 'button.text',
                pattern: 'Use concise labels.',
                after: 'Start',
                confidence: 0.8,
                enabled: true,
            }, {
                id: 'disabled',
                context: 'button.color',
                pattern: 'Use magenta buttons.',
                after: 0xff00ff,
                confidence: 0.8,
                enabled: false,
            }],
        });

        expect(context.memorySummary).toContain('concise labels');
        expect(context.memorySummary).not.toContain('magenta');
        expect(context.memory).toHaveLength(1);
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

        const proposal = createAiProposal({
            commands: [{
                op: 'setComponentProp',
                node: 'submitButton',
                component: 'button',
                prop: 'onClick',
                value: 'missingAction',
            }],
        });
        const dryRun = dryRunProposal(createButtonScene(), proposal, {
            actions: doc.actions,
        });
        expect(dryRun.ok).toBe(false);
        expect(dryRun.error).toContain('not declared');
    });

    it('does not validate plain string props against the action registry', () => {
        const doc = new SceneDocument(createButtonScene());
        doc.addAction({ key: 'submitLogin' });

        const result = doc.apply({
            op: 'setNodeData',
            node: 'submitButtonLabel',
            field: 'text',
            prop: 'value',
            value: 'Remote Start',
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

    it('creates remote AI proposal requests and normalizes remote proposals', async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const fetchMock: typeof fetch = async (url, init) => {
            calls.push({ url: String(url), init });
            return new Response(JSON.stringify({
                proposal: {
                    prompt: 'remote prompt',
                    explanation: 'Remote edit.',
                    commands: [{
                        op: 'setNodeData',
                        node: 'submitButtonLabel',
                        field: 'text',
                        prop: 'value',
                        value: 'Remote Start',
                    }],
                },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        };

        const provider = new RemoteAiProposalProvider({
            endpoint: 'https://ai.example.test/proposal',
            headers: { authorization: 'Bearer test' },
            timeoutMs: 3000,
            model: {
                endpoint: 'https://model.example.test/v1/chat/completions',
                token: 'upstream-secret',
                model: 'model-x',
                timeoutMs: 30000,
                authHeader: 'authorization',
                authPrefix: 'Bearer',
                temperature: 0.2,
            },
            fetch: fetchMock,
        });
        const source = createButtonScene();
        const proposal = await provider.generate('make it remote', {
            scene: source,
            selection: 'submitButtonLabel',
        });

        expect(proposal.commands[0]).toMatchObject({
            op: 'setNodeData',
            value: 'Remote Start',
        });
        expect(calls[0].url).toBe('https://ai.example.test/proposal');
        expect(calls[0].init?.method).toBe('POST');

        const body = JSON.parse(String(calls[0].init?.body)) as ReturnType<typeof createAiProposalRequest>;
        expect(body.protocol).toBe('pixifact.aiProposal.v1');
        expect(body.prompt).toBe('make it remote');
        expect(body.model).toMatchObject({
            endpoint: 'https://model.example.test/v1/chat/completions',
            token: 'upstream-secret',
            model: 'model-x',
            timeoutMs: 30000,
        });
        expect(body.context.sceneSummary.root.key).toBe('submitButton');
        expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer test');
        expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
    });

    it('reports invalid remote AI proposal responses', async () => {
        const provider = new RemoteAiProposalProvider({
            endpoint: 'https://ai.example.test/proposal',
            fetch: async () => new Response(JSON.stringify({
                proposal: {
                    explanation: 'Missing commands.',
                },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
        });

        await expect(provider.generate('bad response', {
            scene: createButtonScene(),
        })).rejects.toThrow('commands array');
    });

    it('times out remote AI proposal requests', async () => {
        const provider = new RemoteAiProposalProvider({
            endpoint: 'https://ai.example.test/proposal',
            timeoutMs: 1,
            fetch: (_url, init) => new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                });
            }),
        });

        await expect(provider.generate('slow response', {
            scene: createButtonScene(),
        })).rejects.toThrow('timed out after 1ms');
    });

    it('reports design token warnings without blocking valid proposals', () => {
        const proposal = createAiProposal({
            commands: [{
                op: 'setNodeData',
                node: 'submitButtonBg',
                field: 'shape',
                prop: 'color',
                value: 0xff00ff,
            }],
        });

        const result = dryRunProposal(createButtonScene(), proposal, {
            designTokens: {
                colors: {
                    primary: 0x2563eb,
                },
            },
        });

        expect(result.ok).toBe(true);
        expect(result.warnings[0].message).toContain('outside design tokens');
    });

    it('generates mock AI proposals from prompts and dry-runs them', async () => {
        const provider = new MockAiProposalProvider();
        const source = createButtonScene();
        const proposal = await provider.generate('把按钮改成 Start Game，并移动到中心', {
            scene: source,
            selection: 'submitButton',
            designTokens: {
                colors: {
                    primary: 0x2563eb,
                },
            },
        });

        expect(proposal.commands.length).toBeGreaterThan(0);
        expect(proposal.explanation).toContain('MockAiProposalProvider');

        const result = dryRunProposal(source, proposal);
        expect(result.ok).toBe(true);
        expect(result.scene?.root.transform?.x).toBe(320);
        expect(result.scene?.root.children?.[1].text?.value).toBe('Start Game');
    });

    it('generates editable inventory panels from natural language prompts', async () => {
        const provider = new MockAiProposalProvider();
        const source = createButtonScene();
        const proposal = await provider.generate('创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮', {
            scene: source,
            selection: 'submitButton',
        });

        expect(proposal.commands[0]).toMatchObject({ op: 'createNode' });

        const result = dryRunProposal(source, proposal);
        expect(result.ok).toBe(true);
        const panel = result.scene?.root.children?.find((node) => node.key === 'inventoryPanel');
        expect(panel?.role).toBe('inventory-panel');
        expect(panel?.children?.filter((node) => node.role === 'inventory-slot')).toHaveLength(12);
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
    it('creates Button as a container template instead of a base display node', () => {
        const doc = new SceneDocument(createButtonScene());
        const node = createNodeTemplateNode(doc, 'button');

        expect(node.kind).toBe('container');
        if (node.kind !== 'container') {
            throw new Error('Button template must create a container node.');
        }
        expect(node.components?.[0]?.type).toBe('ui.Button');
        expect(node.components?.[0]?.props?.targetGraphic).toBe(`${node.key}Bg`);
        expect(node.children?.map((child) => child.kind)).toEqual(['shape', 'text']);
    });

    it('creates ProgressBar and ScrollView as container templates', () => {
        const progressBar = progressBarScene('Progress', { key: 'loading', value: 0.25 });
        const scrollView = scrollViewScene('List', { key: 'list', contentHeight: 320 });

        expect(progressBar.kind).toBe('container');
        expect(progressBar.components?.[0]).toMatchObject({
            id: 'loadingProgress',
            type: 'ui.ProgressBar',
            props: {
                value: 0.25,
                fillNode: 'loadingFill',
            },
        });
        expect(progressBar.children?.map((child) => child.kind)).toEqual(['shape', 'shape']);

        expect(scrollView.kind).toBe('container');
        expect(scrollView.components?.[0]).toMatchObject({
            id: 'listScroll',
            type: 'ui.ScrollRect',
            props: {
                viewport: 'listViewport',
                content: 'listContent',
                contentHeight: 320,
            },
        });
        expect(scrollView.children?.map((child) => child.kind)).toEqual(['shape', 'container']);
    });

    it('adds ProgressBar and ScrollView through the editor template library', () => {
        const doc = new SceneDocument(createButtonScene());
        const progressBar = createNodeTemplateNode(doc, 'progressBar');
        const scrollView = createNodeTemplateNode(doc, 'scrollView');

        expect(progressBar.kind).toBe('container');
        expect(progressBar.components?.[0]?.type).toBe('ui.ProgressBar');
        expect(scrollView.kind).toBe('container');
        expect(scrollView.components?.[0]?.type).toBe('ui.ScrollRect');
    });
});
