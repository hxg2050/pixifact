import { describe, expect, it, vi } from 'vitest';
import { SceneDocument } from '../apps/editor/src/document/SceneDocument';

const source = [
    '<Scene name="Menu">',
    '  <Text id="title" x="20" text="开始" />',
    '</Scene>',
    '',
].join('\n');
const changedSource = source.replace('x="20"', 'x="48"');

function createApi() {
    return {
        readScene: vi.fn(async () => ({
            path: 'src/scenes/Menu.scene',
            source,
            version: 'sha256:before',
        })),
        writeScene: vi.fn(async (_path: string, _source: string, expectedVersion: string) => ({
            path: 'src/scenes/Menu.scene',
            version: `${expectedVersion}:next`,
        })),
    };
}

describe('SceneDocument', () => {
    it('previews an input without changing source and commits one versioned command', async () => {
        const api = createApi();
        const document = await SceneDocument.open('src/scenes/Menu.scene', api);
        const events: unknown[] = [];
        document.subscribe((event) => events.push(event));

        document.previewNodeProp('0:title', 'x', 48);

        expect(document.source).toBe(source);
        expect(api.writeScene).not.toHaveBeenCalled();
        expect(events).toContainEqual({
            type: 'nodePropPreview',
            locator: '0:title',
            prop: 'x',
            value: 48,
        });

        await document.commitNodeProp('0:title', 'x', 48);

        expect(api.writeScene).toHaveBeenCalledTimes(1);
        expect(api.writeScene).toHaveBeenCalledWith(
            'src/scenes/Menu.scene',
            expect.stringContaining('x="48"'),
            'sha256:before',
        );
        expect(document.syncState).toBe('synced');
        expect(document.canUndo).toBe(true);
    });

    it('undoes the committed command and saves the restored source', async () => {
        const api = createApi();
        const document = await SceneDocument.open('src/scenes/Menu.scene', api);
        await document.commitNodeProp('0:title', 'x', 48);

        await document.undo();

        expect(api.writeScene).toHaveBeenCalledTimes(2);
        expect(api.writeScene.mock.calls[1]?.[1]).toContain('x="20"');
        expect(document.canRedo).toBe(true);
    });

    it('reports a sync conflict without hiding the failed write', async () => {
        const api = createApi();
        api.writeScene.mockRejectedValueOnce(Object.assign(new Error('Scene file version changed.'), { status: 409 }));
        const document = await SceneDocument.open('src/scenes/Menu.scene', api);

        await expect(document.commitNodeProp('0:title', 'x', 48)).rejects.toThrow('Scene file version changed.');

        expect(document.syncState).toBe('conflict');
    });

    it('waits for its pending save before classifying a file notification', async () => {
        const api = createApi();
        let finishWrite!: (value: { path: string; version: string }) => void;
        api.writeScene.mockImplementationOnce(() => new Promise((resolve) => {
            finishWrite = resolve;
        }));
        const document = await SceneDocument.open('src/scenes/Menu.scene', api);

        const commit = document.commitNodeProp('0:title', 'x', 48);
        await vi.waitFor(() => expect(api.writeScene).toHaveBeenCalledTimes(1));
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: changedSource,
            version: 'sha256:after',
        });
        const reload = document.reloadIfChanged();

        finishWrite({ path: 'src/scenes/Menu.scene', version: 'sha256:after' });
        await commit;

        expect(await reload).toBeUndefined();
        expect(document.canUndo).toBe(true);
    });

    it('opens an external file version as a new document baseline', async () => {
        const api = createApi();
        const document = await SceneDocument.open('src/scenes/Menu.scene', api);
        api.readScene.mockResolvedValueOnce({
            path: 'src/scenes/Menu.scene',
            source: changedSource,
            version: 'sha256:external',
        });

        const reloaded = await document.reloadIfChanged();

        expect(reloaded?.source).toBe(changedSource);
        expect(reloaded?.canUndo).toBe(false);
        expect(document.source).toBe(source);
    });
});
