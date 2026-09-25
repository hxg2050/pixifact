import {
    CompilerSceneCommandStack,
    parseSceneTemplate,
    serializeSceneTemplate,
    type CompilerSceneCommand,
    type CompilerSceneCommandContext,
    type CompilerSceneSelection,
    type SceneTemplate,
    type SceneTemplateValue,
    isSceneTemplateBindingValue,
} from 'pixifact/compiler';
import { findSceneNodeByLocator } from './sceneTree';

export type SceneDocumentSyncState = 'synced' | 'unsaved' | 'saving' | 'conflict' | 'error';

export interface SceneFileApi {
    readScene(path: string): Promise<{ path: string; source: string; version: string }>;
    writeScene(path: string, source: string, expectedVersion: string): Promise<{ path: string; version: string }>;
}

export type SceneDocumentEvent =
    | { type: 'nodePropPreview'; locator: string; prop: string; value?: SceneTemplateValue }
    | {
        type: 'commandApplied';
        command: CompilerSceneCommand;
        inverse: CompilerSceneCommand;
        selection?: CompilerSceneSelection;
    }
    | { type: 'syncStateChanged'; state: SceneDocumentSyncState };

type SceneDocumentListener = (event: SceneDocumentEvent) => void;

export class SceneDocument {
    readonly path: string;
    readonly template: SceneTemplate;
    #api: SceneFileApi;
    #commandStack = new CompilerSceneCommandStack();
    #listeners = new Set<SceneDocumentListener>();
    #saveQueue: Promise<void> = Promise.resolve();
    #syncState: SceneDocumentSyncState = 'synced';
    #savedSource: string;
    #autoSave: boolean;
    #pendingWrites = 0;
    #version: string;

    private constructor(path: string, source: string, version: string, api: SceneFileApi, autoSave: boolean) {
        this.path = path;
        this.template = parseSceneTemplate(source);
        this.#savedSource = this.source;
        this.#autoSave = autoSave;
        this.#version = version;
        this.#api = api;
    }

    static async open(path: string, api: SceneFileApi, options: { autoSave?: boolean } = {}) {
        const scene = await api.readScene(path);
        return new SceneDocument(scene.path, scene.source, scene.version, api, options.autoSave ?? false);
    }

    get source() {
        return serializeSceneTemplate(this.template);
    }

    get syncState() {
        return this.#syncState;
    }

    get dirty() {
        return this.source !== this.#savedSource;
    }

    get version() {
        return this.#version;
    }

    get canUndo() {
        return this.#commandStack.canUndo;
    }

    get canRedo() {
        return this.#commandStack.canRedo;
    }

    subscribe(listener: SceneDocumentListener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    previewNodeProp(locator: string, prop: string, value?: SceneTemplateValue) {
        this.#emit({ type: 'nodePropPreview', locator, prop, value });
    }

    async commitNodeProp(locator: string, prop: string, value?: SceneTemplateValue) {
        const node = findSceneNodeByLocator(this.template.children, locator);
        if (!node || node.kind === 'slotOutlet') {
            throw new Error(`Scene node "${locator}" was not found.`);
        }
        if (scenePropValue(node.props, prop) === value) {
            return;
        }
        const command = { op: 'setNodeProp', node: locator, prop, value } satisfies CompilerSceneCommand;
        await this.commitCommand(command);
    }

    async commitNodeId(locator: string, id: string) {
        const node = findSceneNodeByLocator(this.template.children, locator);
        if (!node || node.kind === 'slotOutlet') {
            throw new Error(`Scene node "${locator}" was not found.`);
        }
        const value = id.trim();
        if (!value) {
            throw new Error('Node id cannot be empty.');
        }
        if (node.id === value) {
            return undefined;
        }
        const command = { op: 'setNodeId', node: locator, value } satisfies CompilerSceneCommand;
        return this.commitCommand(command);
    }

    async commitCommand(command: CompilerSceneCommand, context: CompilerSceneCommandContext = {}) {
        if (command.op === 'setSceneProp' || command.op === 'setSceneDefaultProp') {
            const values = command.op === 'setSceneProp' ? this.template.props : this.template.propDefaults;
            if (scenePropValue(values ?? {}, command.prop) === command.value) return;
        }
        const result = this.#commandStack.execute(this.template, command, {}, context);
        if (!result.ok) {
            throw new Error(result.error);
        }
        this.#emit({
            type: 'commandApplied',
            command: result.command,
            inverse: result.inverse,
            selection: result.selection,
        });
        await this.#afterCommand();
        return result.selection;
    }

    async undo() {
        const result = this.#commandStack.undo(this.template);
        if (!result?.ok) {
            return;
        }
        this.#emit({
            type: 'commandApplied',
            command: result.command,
            inverse: result.inverse,
            selection: result.selection,
        });
        await this.#afterCommand();
    }

    async redo() {
        const result = this.#commandStack.redo(this.template);
        if (!result?.ok) {
            return;
        }
        this.#emit({
            type: 'commandApplied',
            command: result.command,
            inverse: result.inverse,
            selection: result.selection,
        });
        await this.#afterCommand();
    }

    async setAutoSave(autoSave: boolean) {
        this.#autoSave = autoSave;
        if (autoSave && this.#syncState !== 'conflict' && (this.dirty || this.#pendingWrites > 0)) await this.save();
    }

    async save() {
        if (!this.dirty && this.#pendingWrites === 0) return;
        await this.#queueSave();
    }

    async saveOverVersion(version: string) {
        if (this.#syncState !== 'conflict') throw new Error('Scene is not in conflict.');
        await this.#queueSave(version);
    }

    async reloadIfChanged() {
        while (true) {
            const saveQueue = this.#saveQueue;
            await saveQueue;
            if (saveQueue !== this.#saveQueue) {
                continue;
            }
            if (this.#syncState !== 'synced') {
                return undefined;
            }

            const scene = await this.#api.readScene(this.path);
            if (saveQueue !== this.#saveQueue) {
                continue;
            }
            if (this.#syncState !== 'synced' || scene.version === this.#version) {
                return undefined;
            }
            return new SceneDocument(scene.path, scene.source, scene.version, this.#api, this.#autoSave);
        }
    }

    async #afterCommand() {
        if (this.#pendingWrites === 0 && (!this.dirty || (this.#syncState !== 'conflict' && this.#syncState !== 'error'))) {
            this.#setSyncState(this.dirty ? 'unsaved' : 'synced');
        }
        if (this.#autoSave && this.#syncState !== 'conflict' && (this.dirty || this.#pendingWrites > 0)) await this.save();
    }

    #queueSave(expectedVersion?: string) {
        const source = this.source;
        this.#pendingWrites += 1;
        this.#setSyncState('saving');
        const operation = this.#saveQueue.then(async () => {
            try {
                await this.#write(source, expectedVersion);
            } finally {
                this.#pendingWrites -= 1;
            }
        });
        this.#saveQueue = operation.catch(() => {});
        return operation;
    }

    async #write(source: string, expectedVersion?: string) {
        try {
            const saved = await this.#api.writeScene(this.path, source, expectedVersion ?? this.#version);
            this.#version = saved.version;
            this.#savedSource = source;
            if (!this.dirty) this.#commandStack.markSaved();
            this.#setSyncState(this.#pendingWrites > 1 ? 'saving' : this.dirty ? 'unsaved' : 'synced');
        } catch (error) {
            const status = typeof error === 'object' && error !== null && 'status' in error
                ? (error as { status?: unknown }).status
                : undefined;
            this.#setSyncState(status === 409 ? 'conflict' : 'error');
            throw error;
        }
    }

    #setSyncState(state: SceneDocumentSyncState) {
        this.#syncState = state;
        this.#emit({ type: 'syncStateChanged', state });
    }

    #emit(event: SceneDocumentEvent) {
        for (const listener of this.#listeners) {
            listener(event);
        }
    }
}

function scenePropValue(props: Record<string, SceneTemplateValue>, prop: string) {
    const [root, field, ...rest] = prop.split('.');
    if (!field || rest.length > 0) {
        return props[prop];
    }
    const value = props[root];
    return value && typeof value === 'object' && !isSceneTemplateBindingValue(value) ? value[field] : undefined;
}
