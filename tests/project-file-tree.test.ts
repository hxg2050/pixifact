import { describe, expect, it } from 'vitest';
import {
    collectFolderPaths,
    componentTypeFromPath,
    countProjectFileTree,
    createFolder,
    createPrefabFile,
    deleteProjectEntry,
    findFileByPath,
    mergeExpandedFolderPaths,
    nearestExistingPath,
    renameProjectEntry,
    savePrefabFile,
    projectFileKind,
    readProjectFileTree,
} from '../apps/editor/src/services/projectFileTree';
import { createPrefabInstanceNode } from '../apps/editor/src/services/prefabInstance';
import { prefabAssetName, prefabFileName, prefabRootKey } from '../apps/editor/src/services/prefabNaming';
import { EditorDocument, button, group, prefab, ref, roundedRect, textGraphic } from '../src';

class MockFileHandle {
    readonly kind = 'file';
    content: string;

    constructor(readonly name: string, content = '') {
        this.content = content;
    }

    async getFile() {
        return new File([this.content], this.name);
    }

    async createWritable() {
        return {
            write: async (content: string | ArrayBuffer) => {
                this.content = typeof content === 'string'
                    ? content
                    : new TextDecoder().decode(content);
            },
            close: async () => {},
        };
    }
}

class MockDirectoryHandle {
    readonly kind = 'directory';

    constructor(
        readonly name: string,
        private readonly children: Array<MockDirectoryHandle | MockFileHandle>,
    ) {}

    async *entries(): AsyncIterableIterator<[string, MockDirectoryHandle | MockFileHandle]> {
        for (const child of this.children) {
            yield [child.name, child];
        }
    }

    async getFileHandle(name: string, options?: { create?: boolean }) {
        const existing = this.children.find((child) => child.name === name);
        if (existing instanceof MockFileHandle) {
            return existing;
        }
        const file = new MockFileHandle(name);
        if (options?.create) {
            this.children.push(file);
        }
        return file;
    }

    async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        const existing = this.children.find((child) => child.name === name);
        if (existing instanceof MockDirectoryHandle) {
            return existing;
        }
        if (existing) {
            throw new Error(`${name} is not a directory`);
        }
        const directory = new MockDirectoryHandle(name, []);
        if (options?.create) {
            this.children.push(directory);
        }
        return directory;
    }

    async removeEntry(name: string, options?: { recursive?: boolean }) {
        const index = this.children.findIndex((child) => child.name === name);
        if (index < 0) {
            throw new Error(`${name} does not exist`);
        }
        const child = this.children[index];
        if (child instanceof MockDirectoryHandle && child.children.length > 0 && !options?.recursive) {
            throw new Error(`${name} is not empty`);
        }
        this.children.splice(index, 1);
    }
}

describe('project file tree service', () => {
    it('normalizes Pixifact prefab asset names', () => {
        expect(prefabAssetName('inventory panel')).toBe('InventoryPanel');
        expect(prefabAssetName('InventoryPanel.prefab')).toBe('InventoryPanel');
        expect(prefabAssetName('test')).toBe('Test');
        expect(prefabFileName('inventory panel')).toBe('InventoryPanel.prefab');
        expect(prefabRootKey('InventoryPanel')).toBe('inventoryPanelRoot');
    });

    it('reads a complete folder tree and classifies file kinds', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('prefabs', [
                new MockFileHandle('Button.prefab', '{}'),
            ]),
            new MockDirectoryHandle('scripts', [
                new MockDirectoryHandle('components', [
                    new MockFileHandle('ButtonBinding.ts', ''),
                ]),
                new MockFileHandle('logic.ts', ''),
            ]),
            new MockFileHandle('README.md', ''),
            new MockFileHandle('atlas.png', ''),
        ]) as unknown as FileSystemDirectoryHandle);

        expect(countProjectFileTree(tree)).toBe(9);
        expect(collectFolderPaths(tree)).toEqual([
            'GameProject',
            'GameProject/prefabs',
            'GameProject/scripts',
            'GameProject/scripts/components',
        ]);
        expect(tree.children?.map((child) => child.name)).toEqual([
            'prefabs',
            'scripts',
            'atlas.png',
            'README.md',
        ]);
        expect(projectFileKind('Button.prefab', 'GameProject/prefabs/Button.prefab')).toBe('prefab');
        expect(projectFileKind('logic.ts', 'GameProject/scripts/logic.ts')).toBe('script');
        expect(projectFileKind('atlas.png', 'GameProject/atlas.png')).toBe('asset');
        expect(componentTypeFromPath('GameProject/scripts/components/ButtonBinding.ts')).toBe('ui.Button');
    });

    it('creates a blank prefab file in the selected directory', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('prefabs', []),
        ]) as unknown as FileSystemDirectoryHandle);
        const prefabs = tree.children?.[0];

        const created = await createPrefabFile(prefabs!, 'menu panel');
        const refreshed = await readProjectFileTree(tree.handle as FileSystemDirectoryHandle);

        expect(created.path).toBe('GameProject/prefabs/MenuPanel.prefab');
        expect(JSON.parse(created.content)).toMatchObject({
            version: 1,
            type: 'prefab',
            name: 'MenuPanel',
            root: {
                type: 'Group',
                name: 'MenuPanel',
                key: 'menuPanelRoot',
            },
        });
        expect(refreshed.children?.[0].children?.[0].name).toBe('MenuPanel.prefab');
    });

    it('rejects duplicate prefab file names', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('prefabs', [
                new MockFileHandle('MenuPanel.prefab', '{}'),
            ]),
        ]) as unknown as FileSystemDirectoryHandle);
        const prefabs = tree.children?.[0];

        await expect(createPrefabFile(prefabs!, 'menu panel')).rejects.toThrow('已存在 MenuPanel.prefab');
    });

    it('creates a folder in the selected directory', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('assets', []),
        ]) as unknown as FileSystemDirectoryHandle);
        const assets = tree.children?.[0];

        const created = await createFolder(assets!, 'ui sprites');
        const refreshed = await readProjectFileTree(tree.handle as FileSystemDirectoryHandle);

        expect(created).toEqual({
            name: 'ui sprites',
            path: 'GameProject/assets/ui sprites',
        });
        expect(refreshed.children?.[0].children?.[0].name).toBe('ui sprites');
    });

    it('rejects invalid folder names', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', []) as unknown as FileSystemDirectoryHandle);

        await expect(createFolder(tree, '../bad')).rejects.toThrow('名称不能包含');
        await expect(createFolder(tree, '   ')).rejects.toThrow('名称不能为空');
    });

    it('deletes files and rejects non-empty folder deletion by default', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('assets', [
                new MockFileHandle('atlas.png', ''),
            ]),
            new MockFileHandle('README.md', ''),
        ]) as unknown as FileSystemDirectoryHandle);
        const readme = findFileByPath(tree, 'GameProject/README.md');
        const assets = findFileByPath(tree, 'GameProject/assets');

        await expect(deleteProjectEntry(tree, assets!)).rejects.toThrow('目录非空');
        await deleteProjectEntry(tree, readme!);
        const refreshed = await readProjectFileTree(tree.handle as FileSystemDirectoryHandle);

        expect(findFileByPath(refreshed, 'GameProject/README.md')).toBeUndefined();
    });

    it('renames files without changing their content', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockFileHandle('README.md', 'hello'),
        ]) as unknown as FileSystemDirectoryHandle);
        const readme = findFileByPath(tree, 'GameProject/README.md');

        const renamed = await renameProjectEntry(tree, readme!, 'NOTES.md');
        const refreshed = await readProjectFileTree(tree.handle as FileSystemDirectoryHandle);
        const notes = findFileByPath(refreshed, 'GameProject/NOTES.md')?.handle as MockFileHandle | undefined;

        expect(renamed).toEqual({
            name: 'NOTES.md',
            path: 'GameProject/NOTES.md',
        });
        expect(findFileByPath(refreshed, 'GameProject/README.md')).toBeUndefined();
        expect(notes?.content).toBe('hello');
    });

    it('renames empty folders and rejects non-empty folder rename', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('empty', []),
            new MockDirectoryHandle('assets', [
                new MockFileHandle('atlas.png', ''),
            ]),
        ]) as unknown as FileSystemDirectoryHandle);
        const empty = findFileByPath(tree, 'GameProject/empty');
        const assets = findFileByPath(tree, 'GameProject/assets');

        const renamed = await renameProjectEntry(tree, empty!, 'prefabs');
        await expect(renameProjectEntry(tree, assets!, 'sprites')).rejects.toThrow('空目录');
        const refreshed = await readProjectFileTree(tree.handle as FileSystemDirectoryHandle);

        expect(renamed.path).toBe('GameProject/prefabs');
        expect(findFileByPath(refreshed, 'GameProject/prefabs')).toBeDefined();
    });

    it('rejects duplicate entry names during rename', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockFileHandle('README.md', ''),
            new MockFileHandle('NOTES.md', ''),
        ]) as unknown as FileSystemDirectoryHandle);
        const readme = findFileByPath(tree, 'GameProject/README.md');

        await expect(renameProjectEntry(tree, readme!, 'NOTES.md')).rejects.toThrow('已存在 NOTES.md');
    });

    it('resolves fallback selection and expanded folders after refresh', async () => {
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('assets', [
                new MockFileHandle('atlas.png', ''),
            ]),
        ]) as unknown as FileSystemDirectoryHandle);

        expect(nearestExistingPath(tree, 'GameProject/assets/missing.png')).toBe('GameProject/assets');
        expect(mergeExpandedFolderPaths(tree, [
            'GameProject/assets',
            'GameProject/deleted',
        ])).toEqual([
            'GameProject',
            'GameProject/assets',
        ]);
    });

    it('saves the current editor document back to an opened prefab file', async () => {
        const file = new MockFileHandle('Button.prefab', '{}');
        const tree = await readProjectFileTree(new MockDirectoryHandle('GameProject', [
            new MockDirectoryHandle('prefabs', [file]),
        ]) as unknown as FileSystemDirectoryHandle);
        const document = new EditorDocument(prefab('SavedButton', group('SavedButton', {
            key: 'savedButtonRoot',
            width: 200,
            height: 80,
        })));
        document.dirty = true;

        const saved = await savePrefabFile(tree, 'GameProject/prefabs/Button.prefab', document);

        expect(saved).toBe(true);
        expect(document.dirty).toBe(false);
        expect(JSON.parse(file.content)).toMatchObject({
            name: 'SavedButton',
            root: {
                key: 'savedButtonRoot',
            },
        });
    });

    it('creates an embedded prefab instance node with isolated locators', () => {
        const source = prefab('InventoryPanel', group('Panel', {
            id: 'root',
            key: 'panelRoot',
            width: 200,
            height: 100,
            components: [
                roundedRect({ color: 0x2563eb }, 'bg'),
                button({ targetGraphic: ref('bg') }, 'button'),
            ],
            children: [
                group('Title', {
                    key: 'title',
                    components: [
                        textGraphic({ text: 'Inventory' }, 'text'),
                    ],
                }),
            ],
        }));
        const target = prefab('MenuPanel', group('Menu', {
            key: 'menuRoot',
            children: [
                group('Existing', { key: 'inventoryPanelInstance1_panelRoot' }),
            ],
        }));

        const instance = createPrefabInstanceNode(source, target);

        expect(instance).toMatchObject({
            name: 'InventoryPanel 实例',
            role: 'prefab-instance',
            id: 'inventoryPanelInstance2_root',
            key: 'inventoryPanelInstance2_panelRoot',
        });
        expect(instance.components?.[1].props?.targetGraphic).toBe('inventoryPanelInstance2_bg');
        expect(instance.children?.[0].key).toBe('inventoryPanelInstance2_title');
        expect(instance.children?.[0].components?.[0].id).toBe('inventoryPanelInstance2_text');
    });
});
