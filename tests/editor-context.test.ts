import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSceneTemplate } from 'pixifact/compiler';
import { editorSelectionContext } from '../apps/editor/src/services/editorContext';
import { remapSceneSelection } from '../apps/editor/src/document/sceneTree';
import { connectEditorSession } from '../apps/editor/src/services/editorApi';

class FakeWebSocket {
    static readonly OPEN = 1;
    static instances: FakeWebSocket[] = [];
    readonly sent: string[] = [];
    readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
    readyState = FakeWebSocket.OPEN;

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
    }

    addEventListener(type: string, listener: (event: { data?: string }) => void) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.readyState = 3;
        this.emit('close');
    }

    emit(type: string, data?: string) {
        for (const listener of this.listeners.get(type) ?? []) {
            listener({ data });
        }
    }
}

afterEach(() => {
    FakeWebSocket.instances = [];
    vi.unstubAllGlobals();
});

describe('Editor context selection', () => {
    it('distinguishes the Scene root and selected Compiler node kinds', () => {
        const template = parseSceneTemplate(`
<Scene name="Menu">
  <Group id="panel">
    <Text id="title" text="开始" />
    <slot name="content" />
  </Group>
  <Dialog id="dialog" scene="./Dialog.scene" title="设置">
    <Text slot="content" id="message" text="确认退出？" />
  </Dialog>
</Scene>
        `);

        expect(editorSelectionContext(template)).toEqual({ kind: 'scene' });
        expect(editorSelectionContext(template, '0:panel/0:title')).toEqual({
            kind: 'node',
            locator: '0:panel/0:title',
            node: {
                kind: 'pixi',
                type: 'Text',
                id: 'title',
                props: { text: '开始' },
                childCount: 0,
            },
        });
        expect(editorSelectionContext(template, '0:panel/1:slot:content')).toEqual({
            kind: 'node',
            locator: '0:panel/1:slot:content',
            node: { kind: 'slotOutlet', name: 'content' },
        });
        expect(editorSelectionContext(template, '1:dialog')).toEqual({
            kind: 'node',
            locator: '1:dialog',
            node: {
                kind: 'sceneInstance',
                type: 'Dialog',
                id: 'dialog',
                scene: './Dialog.scene',
                props: { title: '设置' },
                events: {},
                slots: { content: 1 },
            },
        });
    });

    it('keeps selection for property edits, id renames, and moves with a unique id', () => {
        const before = parseSceneTemplate(`
<Scene name="Menu">
  <Group id="panel">
    <Text id="title" text="开始" />
    <Rect id="background" />
  </Group>
</Scene>
        `);
        const renamed = parseSceneTemplate(`
<Scene name="Menu">
  <Group id="panel">
    <Text id="headline" text="继续" />
    <Rect id="background" />
  </Group>
</Scene>
        `);
        const moved = parseSceneTemplate(`
<Scene name="Menu">
  <Group id="panel">
    <Rect id="background" />
    <Text id="title" text="开始" />
  </Group>
</Scene>
        `);

        expect(remapSceneSelection(before, renamed, '0:panel/0:title')).toBe('0:panel/0:headline');
        expect(remapSceneSelection(before, moved, '0:panel/0:title')).toBe('0:panel/1:title');
    });

    it('clears selection when a moved node also changes id', () => {
        const before = parseSceneTemplate(`
<Scene name="Menu">
  <Group id="panel">
    <Text id="title" />
    <Rect id="background" />
  </Group>
</Scene>
        `);
        const changed = parseSceneTemplate(`
<Scene name="Menu">
  <Group id="panel">
    <Rect id="background" />
    <Text id="headline" />
  </Group>
</Scene>
        `);

        expect(remapSceneSelection(before, changed, '0:panel/0:title')).toBeUndefined();
    });

    it('publishes context only after the browser session is accepted', async () => {
        vi.stubGlobal('WebSocket', FakeWebSocket);
        const changed = vi.fn();
        const disconnected = vi.fn();
        const connectionPromise = connectEditorSession(changed, disconnected);
        const socket = FakeWebSocket.instances[0];

        socket.emit('message', JSON.stringify({ type: 'editorSessionAccepted', protocolVersion: 1 }));
        const connection = await connectionPromise;
        expect(connection.status).toBe('accepted');
        if (connection.status !== 'accepted') return;

        connection.publishContext({
            scene: {
                path: 'src/scenes/Menu.scene',
                revision: 'sha256:current',
                syncState: 'synced',
            },
            selection: { kind: 'scene' },
        });
        socket.emit('message', JSON.stringify({
            type: 'projectFileChanged',
            path: 'src/scenes/Menu.scene',
        }));

        expect(JSON.parse(socket.sent[0])).toEqual({
            type: 'editorContextChanged',
            protocolVersion: 1,
            context: {
                scene: {
                    path: 'src/scenes/Menu.scene',
                    revision: 'sha256:current',
                    syncState: 'synced',
                },
                selection: { kind: 'scene' },
            },
        });
        expect(changed).toHaveBeenCalledWith('src/scenes/Menu.scene');

        socket.close();
        expect(disconnected).toHaveBeenCalledOnce();
    });
});
