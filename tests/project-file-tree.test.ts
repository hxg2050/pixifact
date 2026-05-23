import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneDocument, buttonScene, container, scene, shape, text } from 'pixifact';
import type { SceneCommand } from 'pixifact';
import {
    getSceneDocument,
    resetSceneDocument,
} from '../apps/editor/src/document/sceneDocumentController';
import {
    getCompilerSceneDocument,
    resetCompilerSceneDocument,
    updateCompilerSceneNode,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { createLiveEditorActionHandlers } from '../apps/editor/src/agent/liveEditorClient';
import {
    collectFolderPaths,
    createAndOpenSceneFile,
    componentTypeFromPath,
    countProjectFileTree,
    createFolder,
    createSceneFile,
    deleteProjectEntry,
    findFileByPath,
    mergeExpandedFolderPaths,
    nearestExistingPath,
    openCompilerSceneFile,
    openSceneFile,
    openProjectCodeFile,
    openProjectDefaultFile,
    projectFileKind,
    projectFileRelativePath,
    renameProjectEntry,
    saveOpenedSceneFile,
    saveCompilerSceneFile,
    saveSceneFile,
} from '../apps/editor/src/services/projectFileTree';
import { createSceneInstanceNode } from '../apps/editor/src/services/sceneInstance';
import { sceneAssetName, sceneFileName, sceneRootKey } from '../apps/editor/src/services/sceneNaming';

type FsNode = FsDirectory | FsFile;

interface FsDirectory {
    kind: 'directory';
    children: Map<string, FsNode>;
}

interface FsFile {
    kind: 'file';
    content: string;
}

const host = vi.hoisted(() => {
    const rootName = 'GameProject';
    const rootSystemPath = '/tmp/GameProject';
    const root: FsDirectory = {
        kind: 'directory',
        children: new Map(),
    };

    function file(content = ''): FsFile {
        return { kind: 'file', content };
    }

    function directory(entries: Record<string, FsNode> = {}): FsDirectory {
        return {
            kind: 'directory',
            children: new Map(Object.entries(entries)),
        };
    }

    function reset(entries: Record<string, FsNode> = {}) {
        root.children = new Map(Object.entries(entries));
    }

    function parts(filePath: string) {
        if (filePath === rootName) {
            return [];
        }
        return filePath.startsWith(`${rootName}/`)
            ? filePath.slice(rootName.length + 1).split('/')
            : filePath.split('/');
    }

    function getNode(filePath: string) {
        let current: FsNode = root;
        for (const part of parts(filePath)) {
            if (current.kind !== 'directory') {
                throw new Error(`${filePath} is not a directory path.`);
            }
            const child = current.children.get(part);
            if (!child) {
                throw new Error(`${filePath} does not exist.`);
            }
            current = child;
        }
        return current;
    }

    function getDirectory(filePath: string) {
        const node = getNode(filePath);
        if (node.kind !== 'directory') {
            throw new Error(`${filePath} is not a directory.`);
        }
        return node;
    }

    function getParent(filePath: string) {
        const pathParts = parts(filePath);
        const name = pathParts.pop();
        if (!name) {
            throw new Error('Missing entry name.');
        }
        return {
            directory: getDirectory(pathParts.length ? `${rootName}/${pathParts.join('/')}` : rootName),
            name,
        };
    }

    function extension(name: string) {
        const index = name.lastIndexOf('.');
        return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
    }

    function kind(name: string, path: string) {
        const ext = extension(name);
        if (name.endsWith('.scene')) {
            return 'scene';
        }
        if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
            return path.includes('/components/') || name.endsWith('Binding.ts') || name.endsWith('Binding.tsx')
                ? 'component'
                : 'script';
        }
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
            return 'asset';
        }
        if (['md', 'txt'].includes(ext)) {
            return 'doc';
        }
        return 'unknown';
    }

    function componentDetail(path: string) {
        const name = path.split('/').pop() ?? path;
        const match = name.match(/^(.+)Binding\.tsx?$/);
        return match ? `ui.${match[1]}` : undefined;
    }

    function isHiddenProjectDirectory(name: string) {
        return name === 'node_modules' || name === 'dist';
    }

    function systemPath(path: string) {
        return `${rootSystemPath}${path === rootName ? '' : `/${path.slice(rootName.length + 1)}`}`;
    }

    function treeNode(name: string, path: string, node: FsNode, depth: number): unknown {
        if (node.kind === 'file') {
            const fileKind = kind(name, path);
            return {
                id: path,
                name,
                path,
                kind: fileKind,
                depth,
                systemPath: systemPath(path),
                detail: fileKind === 'component' ? componentDetail(path) : undefined,
            };
        }

        const children = [...node.children.entries()]
            .filter(([childName, child]) => child.kind !== 'directory' || !isHiddenProjectDirectory(childName))
            .sort(([leftName, left], [rightName, right]) => {
                if (left.kind !== right.kind) {
                    return left.kind === 'directory' ? -1 : 1;
                }
                return leftName.localeCompare(rightName);
            })
            .map(([childName, child]) => treeNode(childName, `${path}/${childName}`, child, depth + 1));

        return {
            id: path,
            name,
            path,
            kind: 'folder',
            depth,
            systemPath: systemPath(path),
            children,
        };
    }

    return {
        file,
        directory,
        reset,
        readProjectFileTree: vi.fn(async () => treeNode(rootName, rootName, root, 0)),
        createProjectFile: vi.fn(async (_projectRootPath: string, directoryPath: string, fileName: string, content: string) => {
            const target = getDirectory(directoryPath);
            if (target.children.has(fileName)) {
                throw new Error(`已存在 ${fileName}。`);
            }
            target.children.set(fileName, file(content));
            return `${directoryPath}/${fileName}`;
        }),
        createProjectDirectory: vi.fn(async (_projectRootPath: string, directoryPath: string, name: string) => {
            const target = getDirectory(directoryPath);
            if (target.children.has(name)) {
                throw new Error(`已存在 ${name}。`);
            }
            target.children.set(name, directory());
            return `${directoryPath}/${name}`;
        }),
        deleteProjectEntry: vi.fn(async (_projectRootPath: string, filePath: string, recursive: boolean) => {
            const { directory: parent, name } = getParent(filePath);
            const target = parent.children.get(name);
            if (!target) {
                throw new Error(`${name} does not exist.`);
            }
            if (target.kind === 'directory' && target.children.size > 0 && !recursive) {
                throw new Error('Directory not empty');
            }
            parent.children.delete(name);
        }),
        renameProjectEntry: vi.fn(async (_projectRootPath: string, filePath: string, name: string) => {
            const { directory: parent, name: currentName } = getParent(filePath);
            if (parent.children.has(name)) {
                throw new Error(`已存在 ${name}。`);
            }
            const target = parent.children.get(currentName);
            if (!target) {
                throw new Error(`${currentName} does not exist.`);
            }
            parent.children.delete(currentName);
            parent.children.set(name, target);
            const parentPath = filePath.split('/').slice(0, -1).join('/');
            return `${parentPath}/${name}`;
        }),
        readProjectFileText: vi.fn(async (_projectRootPath: string, filePath: string) => {
            const node = getNode(filePath);
            if (node.kind !== 'file') {
                throw new Error(`${filePath} is not a file.`);
            }
            return node.content;
        }),
        readProjectFileBytes: vi.fn(async (_projectRootPath: string, filePath: string) => {
            const node = getNode(filePath);
            if (node.kind !== 'file') {
                throw new Error(`${filePath} is not a file.`);
            }
            return new TextEncoder().encode(node.content);
        }),
        openHostCodeFile: vi.fn(async () => {}),
        openHostDefaultFile: vi.fn(async () => {}),
        writeProjectFileText: vi.fn(async (_projectRootPath: string, filePath: string, content: string) => {
            const node = getNode(filePath);
            if (node.kind !== 'file') {
                throw new Error(`${filePath} is not a file.`);
            }
            node.content = content;
        }),
    };
});

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    createHostProjectDirectory: host.createProjectDirectory,
    createHostProjectFile: host.createProjectFile,
    deleteHostProjectEntry: host.deleteProjectEntry,
    openHostCodeFile: host.openHostCodeFile,
    openHostDefaultFile: host.openHostDefaultFile,
    pickHostProjectFolder: vi.fn(),
    readHostProjectFileBytes: host.readProjectFileBytes,
    readHostProjectFileText: host.readProjectFileText,
    readHostProjectFileTree: host.readProjectFileTree,
    renameHostProjectEntry: host.renameProjectEntry,
    writeHostProjectFileText: host.writeProjectFileText,
}));

async function readHostTree() {
    const tree = await host.readProjectFileTree('/tmp/GameProject');
    return tree as Awaited<ReturnType<typeof import('../apps/editor/src/services/projectFileTree')['refreshProjectFileTree']>>;
}

describe('project file tree service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        resetSceneDocument();
        resetCompilerSceneDocument();
        host.reset();
        useEditorStore.setState({
            language: 'zh-CN',
            projectName: '模拟项目',
            projectTree: undefined,
            selectedProjectFilePath: undefined,
            openedScenePath: undefined,
            expandedProjectFolders: [],
            expandedHierarchyNodesByScene: {},
            prompt: '创建一个背包界面，四列三行，每个格子有图标、数量和 Use 按钮。',
        });
    });

    it('normalizes Pixifact scene asset names', () => {
        expect(sceneAssetName('inventory panel')).toBe('InventoryPanel');
        expect(sceneAssetName('InventoryPanel.scene')).toBe('InventoryPanel');
        expect(sceneAssetName('test')).toBe('Test');
        expect(sceneFileName('inventory panel')).toBe('InventoryPanel.scene');
        expect(sceneRootKey('InventoryPanel')).toBe('inventoryPanelRoot');
    });

    it('reads a complete host folder tree and classifies file kinds', async () => {
        host.reset({
            scenes: host.directory({
                'Button.scene': host.file('{}'),
            }),
            scripts: host.directory({
                components: host.directory({
                    'ButtonBinding.ts': host.file(),
                }),
                'logic.ts': host.file(),
            }),
            node_modules: host.directory({
                pixifact: host.directory({
                    'index.ts': host.file(),
                }),
            }),
            dist: host.directory({
                'bundle.js': host.file(),
            }),
            'README.md': host.file(),
            'atlas.png': host.file(),
        });

        const tree = await readHostTree();

        expect(countProjectFileTree(tree)).toBe(9);
        expect(collectFolderPaths(tree)).toEqual([
            'GameProject',
            'GameProject/scenes',
            'GameProject/scripts',
            'GameProject/scripts/components',
        ]);
        expect(tree.children?.map((child) => child.name)).toEqual([
            'scenes',
            'scripts',
            'atlas.png',
            'README.md',
        ]);
        expect(findFileByPath(tree, 'GameProject/node_modules')).toBeUndefined();
        expect(findFileByPath(tree, 'GameProject/dist')).toBeUndefined();
        expect(projectFileKind('Button.scene', 'GameProject/scenes/Button.scene')).toBe('scene');
        expect(projectFileKind('logic.ts', 'GameProject/scripts/logic.ts')).toBe('script');
        expect(projectFileKind('atlas.png', 'GameProject/atlas.png')).toBe('asset');
        expect(componentTypeFromPath('GameProject/scripts/components/ButtonBinding.ts')).toBe('ui.Button');
    });

    it('creates a blank scene file in the selected directory', async () => {
        host.reset({
            scenes: host.directory(),
        });
        const tree = await readHostTree();
        const scenes = tree.children?.[0];

        const created = await createSceneFile(scenes!, 'menu panel');
        const refreshed = await readHostTree();

        expect(created.path).toBe('GameProject/scenes/MenuPanel.scene');
        expect(JSON.parse(created.content)).toMatchObject({
            version: 1,
            type: 'scene',
            name: 'MenuPanel',
            root: {
                kind: 'container',
                name: 'MenuPanel',
                key: 'menuPanelRoot',
            },
        });
        expect(refreshed.children?.[0].children?.[0].name).toBe('MenuPanel.scene');
    });

    it('rejects duplicate scene file names', async () => {
        host.reset({
            scenes: host.directory({
                'MenuPanel.scene': host.file('{}'),
            }),
        });
        const tree = await readHostTree();
        const scenes = tree.children?.[0];

        await expect(createSceneFile(scenes!, 'menu panel')).rejects.toThrow('已存在 MenuPanel.scene');
    });

    it('creates a folder in the selected directory', async () => {
        host.reset({
            assets: host.directory(),
        });
        const tree = await readHostTree();
        const assets = tree.children?.[0];

        const created = await createFolder(assets!, 'ui sprites');
        const refreshed = await readHostTree();

        expect(created).toEqual({
            name: 'ui sprites',
            path: 'GameProject/assets/ui sprites',
        });
        expect(refreshed.children?.[0].children?.[0].name).toBe('ui sprites');
    });

    it('rejects invalid folder names', async () => {
        const tree = await readHostTree();

        await expect(createFolder(tree, '../bad')).rejects.toThrow('名称不能包含');
        await expect(createFolder(tree, '   ')).rejects.toThrow('名称不能为空');
    });

    it('deletes files and rejects non-empty folder deletion by default', async () => {
        host.reset({
            assets: host.directory({
                'atlas.png': host.file(),
            }),
            'README.md': host.file(),
        });
        const tree = await readHostTree();
        const readme = findFileByPath(tree, 'GameProject/README.md');
        const assets = findFileByPath(tree, 'GameProject/assets');

        await expect(deleteProjectEntry(tree, assets!)).rejects.toThrow('目录非空');
        await deleteProjectEntry(tree, readme!);
        const refreshed = await readHostTree();

        expect(findFileByPath(refreshed, 'GameProject/README.md')).toBeUndefined();
    });

    it('renames files without changing their content', async () => {
        host.reset({
            'README.md': host.file('hello'),
        });
        const tree = await readHostTree();
        const readme = findFileByPath(tree, 'GameProject/README.md');

        const renamed = await renameProjectEntry(tree, readme!, 'NOTES.md');
        const refreshed = await readHostTree();
        const notesContent = await host.readProjectFileText('/tmp/GameProject', 'GameProject/NOTES.md');

        expect(renamed).toEqual({
            name: 'NOTES.md',
            path: 'GameProject/NOTES.md',
        });
        expect(findFileByPath(refreshed, 'GameProject/README.md')).toBeUndefined();
        expect(notesContent).toBe('hello');
    });

    it('renames non-empty folders through the desktop host', async () => {
        host.reset({
            assets: host.directory({
                'atlas.png': host.file(),
            }),
        });
        const tree = await readHostTree();
        const assets = findFileByPath(tree, 'GameProject/assets');

        const renamed = await renameProjectEntry(tree, assets!, 'sprites');
        const refreshed = await readHostTree();

        expect(renamed.path).toBe('GameProject/sprites');
        expect(findFileByPath(refreshed, 'GameProject/sprites/atlas.png')).toBeDefined();
    });

    it('rejects duplicate entry names during rename', async () => {
        host.reset({
            'README.md': host.file(),
            'NOTES.md': host.file(),
        });
        const tree = await readHostTree();
        const readme = findFileByPath(tree, 'GameProject/README.md');

        await expect(renameProjectEntry(tree, readme!, 'NOTES.md')).rejects.toThrow('已存在 NOTES.md');
    });

    it('resolves fallback selection and expanded folders after refresh', async () => {
        host.reset({
            assets: host.directory({
                'atlas.png': host.file(),
            }),
        });
        const tree = await readHostTree();

        expect(nearestExistingPath(tree, 'GameProject/assets/missing.png')).toBe('GameProject/assets');
        expect(mergeExpandedFolderPaths(tree, [
            'GameProject/assets',
            'GameProject/deleted',
        ])).toEqual([
            'GameProject',
            'GameProject/assets',
        ]);
    });

    it('resolves project-relative file paths', async () => {
        host.reset({
            scripts: host.directory({
                'logic.ts': host.file(),
            }),
        });
        const tree = await readHostTree();
        const logic = findFileByPath(tree, 'GameProject/scripts/logic.ts');

        expect(projectFileRelativePath(tree, tree)).toBe('');
        expect(projectFileRelativePath(tree, logic!)).toBe('scripts/logic.ts');
    });

    it('opens host files by project-relative path without reading their content', async () => {
        host.reset({
            scripts: host.directory({
                'logic.ts': host.file('const secret = true;'),
            }),
            assets: host.directory({
                'atlas.png': host.file('png-bytes'),
            }),
        });
        const tree = await readHostTree();
        const logic = findFileByPath(tree, 'GameProject/scripts/logic.ts');
        const atlas = findFileByPath(tree, 'GameProject/assets/atlas.png');

        await openProjectCodeFile(tree, logic!);
        await openProjectDefaultFile(tree, atlas!);

        expect(host.openHostCodeFile).toHaveBeenCalledWith('/tmp/GameProject', 'scripts/logic.ts');
        expect(host.openHostDefaultFile).toHaveBeenCalledWith('/tmp/GameProject', 'assets/atlas.png');
        expect(host.readProjectFileText).not.toHaveBeenCalled();
        expect(host.readProjectFileBytes).not.toHaveBeenCalled();
    });

    it('saves the current editor document back to an opened scene file', async () => {
        host.reset({
            scenes: host.directory({
                'Button.scene': host.file('{}'),
            }),
        });
        const tree = await readHostTree();
        const document = new SceneDocument(scene('SavedButton', container('SavedButton', {
            key: 'savedButtonRoot',
            width: 200,
            height: 80,
        })));
        document.dirty = true;

        const saved = await saveSceneFile(tree, 'GameProject/scenes/Button.scene', document);
        const content = await host.readProjectFileText('/tmp/GameProject', 'GameProject/scenes/Button.scene');

        expect(saved).toBe(true);
        expect(document.dirty).toBe(false);
        expect(JSON.parse(content)).toMatchObject({
            name: 'SavedButton',
            root: {
                key: 'savedButtonRoot',
            },
        });
    });

    it('opens, edits, previews and saves a Scene file session', async () => {
        host.reset({
            scenes: host.directory({
                'Button.scene': host.file(JSON.stringify(scene('Button', container('Root', {
                    key: 'buttonRoot',
                    children: [
                        text('Label', {
                            key: 'buttonLabel',
                            value: 'Start',
                            color: 0xffffff,
                            fontSize: 14,
                        }),
                    ],
                })))),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/scenes/Button.scene');
        const document = new SceneDocument(scene('Empty', container('Empty', { key: 'emptyRoot' })));

        const opened = await openSceneFile(tree, sceneFile!, document);
        const result = document.apply({
            op: 'setNodeData',
            node: 'buttonLabel',
            field: 'text',
            prop: 'value',
            value: 'Continue',
        });
        const saved = await saveOpenedSceneFile(tree, opened.openedScenePath, document);
        const content = await host.readProjectFileText('/tmp/GameProject', 'GameProject/scenes/Button.scene');

        expect(opened.openedScenePath).toBe('GameProject/scenes/Button.scene');
        expect(opened.selection).toEqual({ type: 'node', node: 'buttonRoot' });
        expect(result.ok).toBe(true);
        expect(document.scene.root.children?.[0].text?.value).toBe('Continue');
        expect((document.preview?.components.get('buttonLabel') as { text?: string } | undefined)?.text).toBe('Continue');
        expect(saved).toBe(true);
        expect(document.dirty).toBe(false);
        expect(JSON.parse(content).root.children[0].text.value).toBe('Continue');
    });

    it('opens compiler Scene templates as editable editor documents', async () => {
        host.reset({
            scenes: host.directory({
                'Button.scene': host.file(`
                    <Scene name="Button" script="../src/scenes/Button.ts" class="Button" width="120" height="40">
                      <Graphics id="background" shape="roundRect" width="120" height="40" radius="8" fill="#2f6fed" />
                      <Text id="labelText" text="Button" />
                    </Scene>
                `),
            }),
            src: host.directory({
                generated: host.directory({
                    'Button.scene.interface.json': host.file(JSON.stringify({
                        scene: './scenes/Button.scene',
                        className: 'Button',
                        interface: {
                            props: {
                                label: {
                                    type: 'string',
                                    default: 'Button',
                                },
                            },
                            events: {
                                click: {
                                    type: 'action',
                                },
                            },
                            slots: {
                                icon: {},
                            },
                        },
                        parts: {
                            labelText: 'labelText',
                        },
                    })),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/scenes/Button.scene');

        const opened = await openCompilerSceneFile(tree, sceneFile!);
        const compilerDocument = getCompilerSceneDocument();

        expect(opened.openedScenePath).toBe('GameProject/scenes/Button.scene');
        expect(opened.template.name).toBe('Button');
        expect(opened.descriptor?.className).toBe('Button');
        expect(compilerDocument?.scenePath).toBe('GameProject/scenes/Button.scene');
        expect(compilerDocument?.template.children.map((node) => node.kind === 'slotOutlet' ? node.name : node.id)).toEqual(['background', 'labelText']);
        expect(compilerDocument?.descriptor?.interface.props.label.default).toBe('Button');
        expect(compilerDocument?.selection).toEqual({ type: 'scene' });
        expect(compilerDocument?.sceneInterfaces).toEqual({});
    });

    it('loads public interfaces for compiler Scene instances', async () => {
        host.reset({
            scenes: host.directory({
                'Button.scene': host.file('<Scene name="Button" />'),
                'MainMenu.scene': host.file(`
                    <Scene name="MainMenu">
                      <Button id="startButton" scene="scenes/Button.scene" label="Start" @click="startGame" />
                    </Scene>
                `),
            }),
            src: host.directory({
                generated: host.directory({
                    'Button.scene.interface.json': host.file(JSON.stringify({
                        scene: './scenes/Button.scene',
                        className: 'Button',
                        interface: {
                            props: {
                                label: {
                                    type: 'string',
                                    default: 'Button',
                                },
                                disabled: {
                                    type: 'boolean',
                                    default: false,
                                },
                            },
                            events: {
                                click: {
                                    type: 'action',
                                },
                            },
                            slots: {
                                icon: {},
                            },
                        },
                        parts: {},
                    })),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/scenes/MainMenu.scene');

        const opened = await openCompilerSceneFile(tree, sceneFile!);
        const compilerDocument = getCompilerSceneDocument();

        expect(opened.sceneInterfaces['scenes/Button.scene'].props.disabled.default).toBe(false);
        expect(compilerDocument?.sceneInterfaces['scenes/Button.scene'].events.click).toEqual({ type: 'action' });
        expect(compilerDocument?.sceneInterfaces['scenes/Button.scene'].slots.icon).toEqual({});
    });

    it('updates compiler Scene template nodes in memory', async () => {
        host.reset({
            scenes: host.directory({
                'Button.scene': host.file(`
                    <Scene name="Button" width="120" height="40">
                      <Graphics id="background" shape="roundRect" width="120" height="40" radius="8" fill="#4169e1" />
                      <Text id="labelText" text="Button" x="32" y="10" fontSize="16" fill="#ffffff" />
                    </Scene>
                `),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/scenes/Button.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        updateCompilerSceneNode('1:labelText', {
            id: 'titleText',
            props: {
                text: 'Start',
                x: 40,
            },
        });

        const compilerDocument = getCompilerSceneDocument();
        const label = compilerDocument?.template.children[1];

        expect(label).toMatchObject({
            kind: 'pixi',
            id: 'titleText',
            props: {
                text: 'Start',
                x: 40,
            },
        });
        expect(compilerDocument?.selection).toEqual({ type: 'node', node: '1:titleText' });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('updates compiler Scene instance public props and events in memory', async () => {
        host.reset({
            scenes: host.directory({
                'MainMenu.scene': host.file(`
                    <Scene name="MainMenu">
                      <Button id="startButton" scene="scenes/Button.scene" label="Start" @click="startGame" />
                    </Scene>
                `),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        updateCompilerSceneNode('0:startButton', {
            props: {
                x: 24,
                y: 36,
                width: 188,
                height: 48,
                scaleX: 1.2,
                scaleY: 0.9,
                rotation: 0.25,
                alpha: 0.8,
                visible: true,
                zIndex: 10,
                label: 'Continue',
                disabled: true,
            },
            events: {
                click: 'resumeGame',
            },
        });

        const compilerDocument = getCompilerSceneDocument();
        const button = compilerDocument?.template.children[0];

        expect(button).toMatchObject({
            kind: 'sceneInstance',
            props: {
                x: 24,
                y: 36,
                width: 188,
                height: 48,
                scaleX: 1.2,
                scaleY: 0.9,
                rotation: 0.25,
                alpha: 0.8,
                visible: true,
                zIndex: 10,
                label: 'Continue',
                disabled: true,
            },
            events: {
                click: 'resumeGame',
            },
        });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('saves compiler Scene template edits back to XML', async () => {
        host.reset({
            scenes: host.directory({
                'Button.scene': host.file(`
                    <Scene name="Button" width="120" height="40">
                      <Graphics id="background" shape="roundRect" width="120" height="40" radius="8" fill="#4169e1" />
                      <Text id="labelText" text="Button" x="32" y="10" fontSize="16" fill="#ffffff" />
                    </Scene>
                `),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/scenes/Button.scene');

        await openCompilerSceneFile(tree, sceneFile!);
        updateCompilerSceneNode('1:labelText', {
            id: 'titleText',
            props: {
                text: 'Start',
                x: 40,
            },
        });
        const compilerDocument = getCompilerSceneDocument();

        expect(compilerDocument?.dirty).toBe(true);
        expect(await saveCompilerSceneFile(tree, 'GameProject/scenes/Button.scene', compilerDocument!)).toBe(true);
        expect(getCompilerSceneDocument()?.dirty).toBe(false);

        const saved = await host.readProjectFileText('/tmp/GameProject', 'GameProject/scenes/Button.scene');
        expect(saved).toContain('<Text id="titleText" text="Start" x="40" y="10" fontSize="16" fill="#ffffff" />');
    });

    it('saves compiler Scene instance public prop and event edits back to XML', async () => {
        host.reset({
            scenes: host.directory({
                'MainMenu.scene': host.file(`
                    <Scene name="MainMenu">
                      <Button id="startButton" scene="scenes/Button.scene" label="Start" @click="startGame" />
                    </Scene>
                `),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);
        updateCompilerSceneNode('0:startButton', {
            props: {
                x: 24,
                y: 36,
                width: 188,
                height: 48,
                scaleX: 1.2,
                scaleY: 0.9,
                rotation: 0.25,
                alpha: 0.8,
                visible: true,
                zIndex: 10,
                label: 'Continue',
                disabled: true,
            },
            events: {
                click: 'resumeGame',
            },
        });
        const compilerDocument = getCompilerSceneDocument();

        expect(await saveCompilerSceneFile(tree, 'GameProject/scenes/MainMenu.scene', compilerDocument!)).toBe(true);

        const saved = await host.readProjectFileText('/tmp/GameProject', 'GameProject/scenes/MainMenu.scene');
        expect(saved).toContain('<Button id="startButton" scene="scenes/Button.scene" label="Continue" x="24" y="36" width="188" height="48" scaleX="1.2" scaleY="0.9" rotation="0.25" alpha="0.8" visible="true" zIndex="10" disabled="true" @click="resumeGame" />');
    });

    it('creates and opens a Scene, applies live CLI commands, updates preview and saves', async () => {
        host.reset({
            scenes: host.directory(),
        });
        const tree = await readHostTree();
        const scenes = findFileByPath(tree, 'GameProject/scenes');
        const document = getSceneDocument();

        const opened = await createAndOpenSceneFile(tree, scenes!, 'status panel', document);
        useEditorStore.setState({
            projectName: opened.refreshedTree.name,
            projectTree: opened.refreshedTree,
            selectedProjectFilePath: opened.openedScenePath,
            openedScenePath: opened.openedScenePath,
            expandedProjectFolders: ['GameProject', 'GameProject/scenes'],
            expandedHierarchyNodesByScene: {},
            prompt: '把当前 Scene 改成状态面板。',
            language: 'zh-CN',
        });

        const command: SceneCommand = {
            op: 'createNode',
            parent: 'statusPanelRoot',
            node: text('StatusLabel', {
                id: 'statusLabel',
                key: 'statusLabel',
                value: 'Ready',
                color: 0xffffff,
                fontSize: 18,
                x: 16,
                y: 20,
                width: 160,
                height: 28,
            }),
        };
        const handlers = createLiveEditorActionHandlers();
        const dryRun = await handlers['commands.dryRun']({
            scenePath: opened.openedScenePath,
            commands: [command],
        });

        expect(opened.created.path).toBe('GameProject/scenes/StatusPanel.scene');
        expect(opened.selection).toEqual({ type: 'node', node: 'statusPanelRoot' });
        expect(dryRun).toMatchObject({
            ok: true,
            live: true,
            diffs: [{
                target: 'statusPanelRoot.statusLabel',
                before: undefined,
            }],
        });
        expect(document.scene.root.children).toEqual([]);
        expect(host.writeProjectFileText).not.toHaveBeenCalled();

        const applied = await handlers['commands.apply']({
            scenePath: opened.openedScenePath,
            commands: [command],
        });
        const saved = await host.readProjectFileText('/tmp/GameProject', 'GameProject/scenes/StatusPanel.scene');

        expect(applied).toMatchObject({
            ok: true,
            live: true,
            saved: true,
            scenePath: 'GameProject/scenes/StatusPanel.scene',
        });
        expect(document.scene.root.children?.[0].key).toBe('statusLabel');
        expect((document.preview?.components.get('statusLabel') as { text?: string } | undefined)?.text).toBe('Ready');
        expect(document.dirty).toBe(false);
        expect(host.writeProjectFileText).toHaveBeenCalledWith(
            '/tmp/GameProject',
            'GameProject/scenes/StatusPanel.scene',
            expect.any(String),
        );
        expect(JSON.parse(saved).root.children[0].text.value).toBe('Ready');
    });

    it('creates an embedded scene instance node with isolated locators', () => {
        const source = scene('InventoryPanel', container('Panel', {
            id: 'root',
            key: 'panelRoot',
            width: 200,
            height: 100,
            children: [
                shape('背景', {
                    id: 'bg',
                    key: 'bg',
                    color: 0x2563eb,
                }),
                buttonScene('按钮', {
                    key: 'button',
                }),
                text('Title', {
                    key: 'title',
                    value: 'Inventory',
                }),
            ],
        }));
        const target = scene('MenuPanel', container('Menu', {
            key: 'menuRoot',
            children: [
                container('Existing', { key: 'inventoryPanelInstance1_panelRoot' }),
            ],
        }));

        const instance = createSceneInstanceNode(source, target);

        expect(instance).toMatchObject({
            name: 'InventoryPanel 实例',
            role: 'scene-instance',
            id: 'inventoryPanelInstance2_root',
            key: 'inventoryPanelInstance2_panelRoot',
        });
        expect(instance.children?.[1].components?.[0].props?.targetGraphic).toBe('inventoryPanelInstance2_buttonBg');
        expect(instance.children?.[2].key).toBe('inventoryPanelInstance2_title');
        expect(instance.children?.[2].kind).toBe('text');
    });
});
