import {
    CompilerSceneCommandStack,
    parseSceneTemplate,
    serializeSceneTemplate,
    type CompilerSceneCommand,
    type SceneTemplate,
    type SceneTemplateValue,
} from 'pixifact/compiler';
import { findSceneNodeByLocator } from './sceneTree';

export type SceneDocumentSyncState = 'synced' | 'saving' | 'conflict' | 'error';

export interface SceneFileApi {
    readScene(path: string): Promise<{ path: string; source: string; version: string }>;
    writeScene(path: string, source: string, expectedVersion: string): Promise<{ path: string; version: string }>;
}

export type SceneDocumentEvent =
    | { type: 'nodePropPreview'; locator: string; prop: string; value?: SceneTemplateValue }
    | { type: 'commandApplied'; command: CompilerSceneCommand }
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
    #version: string;

    private constructor(path: string, source: string, version: string, api: SceneFileApi) {
        this.path = path;
        this.template = parseSceneTemplate(source);
        this.#version = version;
        this.#api = api;
    }

    static async open(path: string, api: SceneFileApi) {
        const scene = await api.readScene(path);
        return new SceneDocument(scene.path, scene.source, scene.version, api);
    }

    get source() {
        return serializeSceneTemplate(this.template);
    }

    get syncState() {
        return this.#syncState;
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
        const result = this.#commandStack.execute(this.template, command);
        if (!result.ok) {
            throw new Error(result.error);
        }
        this.#emit({ type: 'commandApplied', command });
        await this.#queueSave();
    }

    async undo() {
        const result = this.#commandStack.undo(this.template);
        if (!result?.ok) {
            return;
        }
        this.#emit({ type: 'commandApplied', command: result.command });
        await this.#queueSave();
    }

    async redo() {
        const result = this.#commandStack.redo(this.template);
        if (!result?.ok) {
            return;
        }
        this.#emit({ type: 'commandApplied', command: result.command });
        await this.#queueSave();
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
            return new SceneDocument(scene.path, scene.source, scene.version, this.#api);
        }
    }

    #queueSave() {
        const source = this.source;
        const operation = this.#saveQueue.then(() => this.#write(source));
        this.#saveQueue = operation.catch(() => {});
        return operation;
    }

    async #write(source: string) {
        this.#setSyncState('saving');
        try {
            const saved = await this.#api.writeScene(this.path, source, this.#version);
            this.#version = saved.version;
            this.#commandStack.markSaved();
            this.#setSyncState('synced');
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
    return value && typeof value === 'object' ? value[field] : undefined;
}
