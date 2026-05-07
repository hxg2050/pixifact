import { describe, expect, it } from 'vitest';
import {
    EditorDocument,
    MockAiProposalProvider,
    ImageGraphic,
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
    button,
    createInventoryPanelCommands,
    createAiProposal,
    dryRunProposal,
    dryRunCommands,
    getAiComponentSchemas,
    group,
    imageGraphic,
    instantiate,
    inputField,
    listPaletteComponents,
    prefab,
    progressBar,
    ref,
    roundedRect,
    scrollRect,
    summarizePrefabForAi,
    textGraphic,
    validateLogicGraph,
    validateCommand,
} from '../src';
import type { PrefabSpec } from '../src';

function createButtonPrefab(): PrefabSpec {
    return prefab('PrimaryButton',
        group('Button', {
            id: 'root',
            key: 'submitButton',
            width: 140,
            height: 44,
            components: [
                roundedRect({ color: 0x2563eb, radius: 8 }, 'bg'),
                button({ targetGraphic: ref('bg'), onClick: 'submitLogin' }, 'button'),
            ],
            children: [
                group('Label', {
                    id: 'label-node',
                    key: 'submitButtonLabel',
                    width: 140,
                    height: 44,
                    components: [
                        textGraphic({
                            text: 'Submit',
                            color: 0xffffff,
                            fontSize: 14,
                            center: true,
                        }, 'text'),
                    ],
                }),
            ],
        }),
    );
}

describe('EditorDocument', () => {
    it('loads and serializes prefab specs without using runtime objects as source of truth', () => {
        const doc = new EditorDocument(createButtonPrefab());
        const json = doc.serialize();
        const next = new EditorDocument(createButtonPrefab());

        next.load(json);

        expect(next.prefab.name).toBe('PrimaryButton');
        expect(next.prefab.root.key).toBe('submitButton');
        expect(next.dirty).toBe(false);
    });

    it('applies setComponentProp commands and supports undo/redo', () => {
        const doc = new EditorDocument(createButtonPrefab());

        const result = doc.apply({
            op: 'setComponentProp',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'text',
            value: 'Continue',
        });

        expect(result.ok).toBe(true);
        expect(doc.dirty).toBe(true);
        expect(doc.canUndo).toBe(true);
        expect(doc.prefab.root.children?.[0].components?.[0].props?.text).toBe('Continue');
        expect(doc.overrides[0]).toMatchObject({
            source: 'manual',
            target: 'submitButtonLabel.text.text',
            before: 'Submit',
            after: 'Continue',
        });

        doc.undo();
        expect(doc.prefab.root.children?.[0].components?.[0].props?.text).toBe('Submit');
        expect(doc.canRedo).toBe(true);

        doc.redo();
        expect(doc.prefab.root.children?.[0].components?.[0].props?.text).toBe('Continue');
    });

    it('applies setTransform commands and can instantiate the edited prefab', () => {
        const doc = new EditorDocument(createButtonPrefab());

        doc.apply({
            op: 'setTransform',
            node: 'submitButton',
            values: {
                width: 180,
                height: 52,
            },
        });

        expect(doc.prefab.root.transform?.width).toBe(180);
        expect(doc.prefab.root.transform?.height).toBe(52);

        const runtime = instantiate(doc.prefab);
        expect(runtime.root.width).toBe(180);
        expect(runtime.root.height).toBe(52);
    });

    it('rebuilds runtime preview and builds inspector models from schema', () => {
        const doc = new EditorDocument(createButtonPrefab());
        doc.setSelection({ type: 'node', node: 'submitButtonLabel' });

        const preview = doc.rebuildPreview();
        const inspector = doc.getInspectorModel();

        expect(preview.nodes.get('submitButton')).toBeDefined();
        expect(inspector?.components[0].displayName).toBe('Text');
        expect(inspector?.components[0].fields.some((field) => field.key === 'text')).toBe(true);

        doc.apply({
            op: 'setComponentProp',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'text',
            value: 'Preview',
        });

        expect(doc.preview?.components.get('text')).toBeDefined();
        doc.destroy();
    });

    it('adds and removes components through commands', () => {
        const doc = new EditorDocument(createButtonPrefab());

        const add = doc.apply({
            op: 'addComponent',
            node: 'submitButtonLabel',
            component: roundedRect({ color: 0xff0000 }, 'label-bg'),
            index: 0,
        });

        expect(add.ok).toBe(true);
        expect(doc.prefab.root.children?.[0].components?.[0].id).toBe('label-bg');

        const remove = doc.apply({
            op: 'removeComponent',
            node: 'submitButtonLabel',
            component: 'label-bg',
        });

        expect(remove.ok).toBe(true);
        expect(doc.prefab.root.children?.[0].components?.some((component) => component.id === 'label-bg')).toBe(false);

        doc.undo();
        expect(doc.prefab.root.children?.[0].components?.some((component) => component.id === 'label-bg')).toBe(true);
    });

    it('builds component palette items from schema and creates default component specs', () => {
        const doc = new EditorDocument(createButtonPrefab());
        const items = listPaletteComponents({
            prefab: doc.prefab,
            node: 'submitButton',
        });
        const rounded = items.find((item) => item.type === 'ui.RoundedRectGraphic');
        const buttonItem = items.find((item) => item.type === 'ui.Button');

        expect(rounded?.category).toBe('UI/Graphic');
        expect(buttonItem?.disabledReason).toContain('already exists');

        const spec = createComponentSpecFromSchema('ui.TextGraphic', 'titleText');
        expect(spec).toMatchObject({
            id: 'titleText',
            type: 'ui.TextGraphic',
        });
        expect(spec.props).toMatchObject({
            text: '',
            color: 0x000000,
            fontSize: 14,
            center: false,
        });

        const result = doc.apply({
            op: 'addComponent',
            node: 'submitButton',
            component: spec,
        });

        expect(result.ok).toBe(true);
        expect(doc.prefab.root.components?.some((component) => component.id === 'titleText')).toBe(true);
    });

    it('updates node props and supports tree commands with undo', () => {
        const doc = new EditorDocument(createButtonPrefab());
        const createPanel = doc.apply({
            op: 'createNode',
            parent: 'submitButton',
            node: group('Panel', {
                id: 'panel',
                key: 'panel',
                width: 120,
                height: 80,
            }),
        });

        expect(createPanel.ok).toBe(true);
        expect(doc.prefab.root.children?.some((node) => node.key === 'panel')).toBe(true);

        doc.apply({
            op: 'setNodeProp',
            node: 'panel',
            prop: 'role',
            value: 'dialog-panel',
        });
        expect(doc.prefab.root.children?.find((node) => node.key === 'panel')?.role).toBe('dialog-panel');

        doc.apply({
            op: 'reorderNode',
            node: 'panel',
            index: 0,
        });
        expect(doc.prefab.root.children?.[0].key).toBe('panel');

        doc.apply({
            op: 'reparentNode',
            node: 'submitButtonLabel',
            parent: 'panel',
        });
        expect(doc.prefab.root.children?.[0].children?.[0].key).toBe('submitButtonLabel');

        doc.undo();
        expect(doc.prefab.root.children?.some((node) => node.key === 'submitButtonLabel')).toBe(true);
    });

    it('applies inventory template commands and instantiates the generated native component tree', () => {
        const doc = new EditorDocument(createButtonPrefab());
        const result = doc.apply({
            op: 'batch',
            commands: createInventoryPanelCommands({ parent: 'submitButton', columns: 4, rows: 3 }),
        });

        expect(result.ok).toBe(true);
        const panel = doc.prefab.root.children?.find((node) => node.key === 'inventoryPanel');
        expect(panel?.children?.filter((node) => node.role === 'inventory-slot')).toHaveLength(12);

        const runtime = instantiate(doc.prefab, undefined, {
            actions: {
                useInventoryItem() {},
            },
        });
        expect(runtime.nodes.get('inventoryPanel')).toBeDefined();
        expect(runtime.components.get('inventorySlot1UseButton:button')).toBeDefined();

        const dryRun = dryRunProposal(createButtonPrefab(), createAiProposal({
            commands: [{
                op: 'batch',
                commands: createInventoryPanelCommands({ parent: 'submitButton' }),
            }],
        }));
        expect(dryRun.ok).toBe(true);
        expect(dryRun.diffs[0].target).toContain('inventoryPanel');
    });

    it('rejects invalid component props with schema errors', () => {
        const prefabSpec = createButtonPrefab();
        const result = validateCommand(prefabSpec, {
            op: 'setComponentProp',
            node: 'submitButton',
            component: 'button',
            prop: 'missing',
            value: 'bad',
        });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('does not exist');
    });

    it('summarizes prefabs and schemas for AI and dry-runs command lists', () => {
        const source = createButtonPrefab();
        const summary = summarizePrefabForAi(source);
        const schemas = getAiComponentSchemas();

        expect(summary.root.key).toBe('submitButton');
        expect(schemas.some((schema) => schema.type === 'ui.Button')).toBe(true);

        const result = dryRunCommands(source, [{
            op: 'setComponentProp',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'text',
            value: 'Continue',
        }]);

        expect(result.ok).toBe(true);
        expect(result.prefab?.root.children?.[0].components?.[0].props?.text).toBe('Continue');
        expect(source.root.children?.[0].components?.[0].props?.text).toBe('Submit');
    });

    it('dry-runs AI proposals with diffs and keeps the source prefab unchanged', () => {
        const source = createButtonPrefab();
        const proposal = createAiProposal({
            prompt: 'Start game button',
            explanation: 'Rename the button label.',
            commands: [{
                op: 'setComponentProp',
                node: 'submitButtonLabel',
                component: 'text',
                prop: 'text',
                value: 'Start Game',
            }],
        });

        const result = dryRunProposal(source, proposal);

        expect(result.ok).toBe(true);
        expect(result.diffs[0].target).toBe('submitButtonLabel.text.text');
        expect(result.diffs[0].before).toBe('Submit');
        expect(result.diffs[0].after).toBe('Start Game');
        expect(result.prefab?.root.children?.[0].components?.[0].props?.text).toBe('Start Game');
        expect(source.root.children?.[0].components?.[0].props?.text).toBe('Submit');
    });

    it('rejects AI proposals that touch locked props', () => {
        const proposal = createAiProposal({
            commands: [{
                op: 'setComponentProp',
                node: 'submitButtonLabel',
                component: 'text',
                prop: 'fontSize',
                value: 18,
            }],
        });

        const result = dryRunProposal(createButtonPrefab(), proposal, {
            locks: [{
                target: 'component',
                node: 'submitButtonLabel',
                component: 'text',
                prop: 'fontSize',
                reason: 'Designer override',
            }],
        });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('locked');
    });

    it('stores locks on editor documents and records AI overrides', () => {
        const doc = new EditorDocument(createButtonPrefab());
        doc.addLock({
            target: 'component',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'fontSize',
        });

        expect(doc.locks).toHaveLength(1);

        doc.removeLock({
            target: 'component',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'fontSize',
        });

        expect(doc.locks).toHaveLength(0);

        const result = doc.apply({
            op: 'setComponentProp',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'text',
            value: 'AI Start',
        }, 'ai');

        expect(result.ok).toBe(true);
        expect(doc.overrides.at(-1)).toMatchObject({
            source: 'ai',
            target: 'submitButtonLabel.text.text',
            after: 'AI Start',
        });
    });

    it('turns manual overrides into accepted memory for future AI context', async () => {
        const doc = new EditorDocument(createButtonPrefab());
        doc.apply({
            op: 'setComponentProp',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'fontSize',
            value: 18,
        });

        const suggestions = doc.getMemorySuggestions();
        expect(suggestions[0].memory.pattern).toContain('fontSize=18');

        doc.acceptMemorySuggestion(suggestions[0]);
        expect(doc.memory).toHaveLength(1);

        const provider = new MockAiProposalProvider();
        const proposal = await provider.generate('把按钮改成 Start Game', {
            prefab: doc.prefab,
            selection: 'submitButton',
            memory: doc.memory,
        });

        expect(proposal.explanation).toContain('Memory:');
        expect(proposal.explanation).toContain('fontSize=18');

        doc.setMemoryEnabled(doc.memory[0].id, false);
        const disabledProposal = await provider.generate('把按钮改成 Start Game', {
            prefab: doc.prefab,
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
        const doc = new EditorDocument(createButtonPrefab());
        const proposal = createAiProposal({
            id: 'proposal-test',
            prompt: 'make label larger',
            commands: [{
                op: 'setComponentProp',
                node: 'submitButtonLabel',
                component: 'text',
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
            target: 'component',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'fontSize',
        });
        doc.apply({
            op: 'setComponentProp',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'fontSize',
            value: 18,
        });
        doc.acceptMemorySuggestion(doc.getMemorySuggestions()[0]);
        doc.recordProposalRun(dryRunProposal(doc.prefab, proposal));
        doc.markProposalApplied(proposal);

        const next = new EditorDocument(createButtonPrefab());
        next.load(doc.serializeState());

        expect(next.prefab.root.children?.[0].components?.[0].props?.fontSize).toBe(18);
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
        const doc = new EditorDocument(createButtonPrefab());
        const proposal = createAiProposal({
            id: 'proposal-history',
            commands: [{
                op: 'setComponentProp',
                node: 'submitButtonLabel',
                component: 'text',
                prop: 'text',
                value: 'Start',
            }],
        });

        doc.recordProposal(proposal);
        expect(doc.proposalHistory[0].status).toBe('generated');

        const run = dryRunProposal(doc.prefab, proposal);
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
        const doc = new EditorDocument(createButtonPrefab());
        const prompts: string[] = [];
        const provider = {
            async generate(prompt: string) {
                prompts.push(prompt);
                return createAiProposal({
                    id: `repair-${prompts.length}`,
                    prompt,
                    commands: prompts.length === 1
                        ? [{
                            op: 'setComponentProp',
                            node: 'missingNode',
                            component: 'text',
                            prop: 'text',
                            value: 'Broken',
                        }]
                        : [{
                            op: 'setComponentProp',
                            node: 'submitButtonLabel',
                            component: 'text',
                            prop: 'text',
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
        expect(doc.prefab.root.children?.[0].components?.[0].props?.text).toBe('Fixed');
        expect(doc.overrides.at(-1)).toMatchObject({
            source: 'ai',
            target: 'submitButtonLabel.text.text',
            after: 'Fixed',
        });
        expect(doc.proposalHistory.map((entry) => entry.status)).toEqual(['dryRunFailed', 'applied']);
    });

    it('returns a failed AI execution result when repair attempts are exhausted', async () => {
        const doc = new EditorDocument(createButtonPrefab());
        const provider = {
            async generate(prompt: string) {
                return createAiProposal({
                    id: `failed-${prompt.length}`,
                    prompt,
                    commands: [{
                        op: 'setComponentProp',
                        node: 'submitButtonLabel',
                        component: 'text',
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
        expect(doc.prefab.root.children?.[0].components?.[0].props?.text).toBe('Submit');
        expect(doc.proposalHistory.at(-1)?.status).toBe('rejected');
    });

    it('builds AI authoring context with schemas, locks, design tokens and memory', () => {
        const prefabSpec = createButtonPrefab();
        const context = buildAiAuthoringContext({
            prefab: prefabSpec,
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
                target: 'component',
                node: 'submitButtonLabel',
                component: 'text',
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

        expect(context.prefabSummary.root.key).toBe('submitButton');
        expect(context.componentSchemas.some((schema) => schema.type === 'ui.TextGraphic')).toBe(true);
        expect(context.commandSchemas.some((schema) => schema.op === 'createNode')).toBe(true);
        expect(context.commandSummary).toContain('EditorCommand');
        expect(context.commandSummary).toContain('useInventoryItem');
        expect(context.selection).toEqual({ type: 'node', node: 'submitButtonLabel' });
        expect(context.lockedTargets).toEqual(['submitButtonLabel.text.fontSize']);
        expect(context.designTokens?.colors?.primary).toBe(0x2563eb);
        expect(context.actionSummary).toContain('submitLogin');
        expect(context.logicSummary).toContain('useInventoryItem');
        expect(context.memorySummary).toContain('fontSize=18');
        expect(context.memory).toHaveLength(1);

        prefabSpec.root.key = 'mutated-after-context-build';
        expect(context.prefab.root.key).toBe('submitButton');
    });

    it('excludes disabled memory from AI authoring context', () => {
        const context = buildAiAuthoringContext({
            prefab: createButtonPrefab(),
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
        const doc = new EditorDocument(createButtonPrefab());
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
        const dryRun = dryRunProposal(createButtonPrefab(), proposal, {
            actions: doc.actions,
        });
        expect(dryRun.ok).toBe(false);
        expect(dryRun.error).toContain('not declared');
    });

    it('does not validate plain string props against the action registry', () => {
        const doc = new EditorDocument(createButtonPrefab());
        doc.addAction({ key: 'submitLogin' });

        const result = doc.apply({
            op: 'setComponentProp',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'text',
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
        const doc = new EditorDocument(createButtonPrefab());
        doc.addAction({ key: 'useInventoryItem' });

        const flow = createUseInventoryItemFlow();
        const result = doc.addLogicFlow(flow);
        expect(result.ok).toBe(true);
        expect(doc.logicGraph.flows[0].action).toBe('useInventoryItem');

        const validation = validateLogicGraph(doc.logicGraph, {
            actions: doc.actions,
            prefab: doc.prefab,
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
                        op: 'setComponentProp',
                        node: 'submitButtonLabel',
                        component: 'text',
                        prop: 'text',
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
        const source = createButtonPrefab();
        const proposal = await provider.generate('make it remote', {
            prefab: source,
            selection: 'submitButtonLabel',
        });

        expect(proposal.commands[0]).toMatchObject({
            op: 'setComponentProp',
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
        expect(body.context.prefabSummary.root.key).toBe('submitButton');
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
            prefab: createButtonPrefab(),
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
            prefab: createButtonPrefab(),
        })).rejects.toThrow('timed out after 1ms');
    });

    it('reports design token warnings without blocking valid proposals', () => {
        const proposal = createAiProposal({
            commands: [{
                op: 'setComponentProp',
                node: 'submitButton',
                component: 'bg',
                prop: 'color',
                value: 0xff00ff,
            }],
        });

        const result = dryRunProposal(createButtonPrefab(), proposal, {
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
        const source = createButtonPrefab();
        const proposal = await provider.generate('把按钮改成 Start Game，并移动到中心', {
            prefab: source,
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
        expect(result.prefab?.root.transform?.x).toBe(320);
        expect(result.prefab?.root.children?.[0].components?.[0].props?.text).toBe('Start Game');
    });

    it('generates editable inventory panels from natural language prompts', async () => {
        const provider = new MockAiProposalProvider();
        const source = createButtonPrefab();
        const proposal = await provider.generate('创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮', {
            prefab: source,
            selection: 'submitButton',
        });

        expect(proposal.commands[0]).toMatchObject({ op: 'createNode' });

        const result = dryRunProposal(source, proposal);
        expect(result.ok).toBe(true);
        const panel = result.prefab?.root.children?.find((node) => node.key === 'inventoryPanel');
        expect(panel?.role).toBe('inventory-panel');
        expect(panel?.children?.filter((node) => node.role === 'inventory-slot')).toHaveLength(12);
    });

    it('registers additional UI components for editor palettes', () => {
        const spec = prefab('FormControls',
            group('Root', {
                id: 'root',
                width: 200,
                height: 80,
                components: [
                    progressBar({ fillNode: 'root', value: 0.5 }, 'progress'),
                    scrollRect({ contentHeight: 200 }, 'scroll'),
                    inputField({ placeholder: 'Name' }, 'input'),
                    imageGraphic({}, 'image'),
                ],
            }),
        );

        const runtime = instantiate(spec);

        expect(runtime.components.get('progress')).toBeInstanceOf(ProgressBar);
        expect(runtime.components.get('scroll')).toBeInstanceOf(ScrollRect);
        expect(runtime.components.get('input')).toBeDefined();
        expect(runtime.components.get('image')).toBeInstanceOf(ImageGraphic);
    });
});
