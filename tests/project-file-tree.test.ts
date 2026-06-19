import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Pixi from 'pixi.js';
import {
    builtinSceneAssetId,
    parseSceneTemplate,
    pixiSceneFieldSchema,
    pixiSceneNodeDefaults,
    pixiSceneNodePropGroups,
    pixiSceneNodePropKeys,
} from 'pixifact/compiler';
import {
    addCompilerSceneNode,
    canUndoCompilerSceneCommand,
    createCompilerPixiTemplateNode,
    createCompilerSlotOutletTemplateNode,
    deleteCompilerSceneNode,
    getCompilerSceneDocument,
    moveCompilerSceneNode,
    resetCompilerSceneDocument,
    undoCompilerSceneCommand,
    updateCompilerSceneTemplate,
    updateCompilerSceneNode,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import type { CompilerSceneDocument } from '../apps/editor/src/document/compilerSceneDocumentController';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { buildCompilerHierarchyTreeItems } from '../apps/editor/src/panels/HierarchyPanel';
import { compilerSceneInstanceSlotRows } from '../apps/editor/src/panels/InspectorPanel';
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
    openCompilerSceneScriptFile,
    openProjectCodeFile,
    openProjectDefaultFile,
    ProjectFileOperationError,
    projectFileKind,
    projectFileRelativePath,
    renameProjectEntry,
    refreshProjectFileTree,
    saveCompilerSceneFile,
    refreshCompilerSceneBindingSnapshot,
    assetDragPayload,
    resolveProjectAssetReference,
} from '../apps/editor/src/services/projectFileTree';
import {
    readCompilerSceneBindingIndex,
    sceneInterfacesForCompilerTemplate,
} from '../apps/editor/src/services/sceneBindingIndex';
import { isCompilerBindingSourceChange } from '../apps/editor/src/services/compilerSceneBindingSync';
import { syncOpenedCompilerSceneFromHostChange } from '../apps/editor/src/services/compilerSceneExternalSync';
import { addDroppedCompilerSceneInstance } from '../apps/editor/src/services/compilerSceneDrop';
import { createCompilerSceneRuntimePreview } from '../apps/editor/src/preview/compilerSceneRuntimePreview';
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
    watchHostProjectFiles: vi.fn(),
    writeHostProjectFileText: host.writeProjectFileText,
}));

async function readHostTree() {
    return refreshProjectFileTree({
        id: 'GameProject',
        name: 'GameProject',
        path: 'GameProject',
        kind: 'folder',
        depth: 0,
        systemPath: '/tmp/GameProject',
        projectRootPath: '/tmp/GameProject',
        children: [],
    });
}

function sceneScriptSource(className: string, members = '') {
    return `
        import { Text } from 'pixi.js';
import { Group } from 'pixifact/runtime';
        import { createEvent, event, part, prop, scene, slot } from 'pixifact/compiler';

        @scene()
        export class ${className} extends Group {
            ${members}
        }
    `;
}

function sceneScript(className: string, members = '') {
    return host.file(sceneScriptSource(className, members));
}

function emptySceneScript(className: string) {
    return sceneScript(className);
}

function buttonSceneScript(options: { disabled?: boolean } = {}) {
    return sceneScript('Button', `
        @part()
        protected declare labelText: Text;

        @prop({ type: String, default: 'Button' })
        accessor label = 'Button';

        ${options.disabled ? `
        @prop({ type: Boolean, default: false })
        accessor disabled = false;
        ` : ''}

        @event()
        readonly click = createEvent();

        @slot()
        icon!: Container;
    `);
}

function panelSceneScript(className = 'Panel') {
    return sceneScript(className, `
        @slot()
        footer!: Container;
    `);
}

describe('project file tree service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
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
            '.pixifact': host.directory({
                generated: host.directory({
                    'Button.scene.generated.ts': host.file(),
                    'scenes.generated.ts': host.file(),
                }),
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
        expect(findFileByPath(tree, 'GameProject/.pixifact')).toBeUndefined();
        expect(projectFileKind('Button.scene', 'GameProject/scenes/Button.scene')).toBe('scene');
        expect(projectFileKind('logic.ts', 'GameProject/scripts/logic.ts')).toBe('script');
        expect(projectFileKind('atlas.png', 'GameProject/atlas.png')).toBe('asset');
        expect(componentTypeFromPath('GameProject/scripts/components/ButtonBinding.ts')).toBe('ui.Button');
    });

    it('creates a blank scene file in the selected directory', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory(),
            }),
        });
        const tree = await readHostTree();
        const scenes = findFileByPath(tree, 'GameProject/src/scenes');

        const created = await createSceneFile(tree, scenes!, 'menu panel');
        const refreshed = await readHostTree();
        const script = await host.readProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/MenuPanel.ts');

        expect(created.path).toBe('GameProject/src/scenes/MenuPanel.scene');
        expect(created.scriptPath).toBe('GameProject/src/scenes/MenuPanel.ts');
        expect(parseSceneTemplate(created.content)).toMatchObject({
            version: 2,
            name: 'MenuPanel',
            props: {
                width: 960,
                height: 540,
            },
            interface: {
                props: {},
                events: {},
                slots: {},
            },
            children: [],
        });
        expect(created.content).toBe('<Scene name="MenuPanel" width="960" height="540">\n</Scene>\n');
        expect(script).toBe([
            "import { Group } from 'pixifact/runtime';",
            "import { scene } from 'pixifact/compiler';",
            '',
            '@scene()',
            'export class MenuPanel extends Group {',
            '    onMounted() {}',
            '}',
            '',
        ].join('\n'));
        expect(findFileByPath(refreshed, 'GameProject/src/scenes/MenuPanel.scene')).toBeDefined();
        expect(findFileByPath(refreshed, 'GameProject/src/scenes/MenuPanel.ts')).toBeDefined();
    });

    it('rejects compiler Scene creation outside the source root', async () => {
        host.reset({
            scenes: host.directory(),
        });
        const tree = await readHostTree();
        const scenes = findFileByPath(tree, 'GameProject/scenes');

        await expect(createSceneFile(tree, scenes!, 'menu panel')).rejects.toThrow(ProjectFileOperationError);
        await expect(createSceneFile(tree, scenes!, 'menu panel')).rejects.toThrow('Compiler Scene 必须创建在 src 目录下。');
    });

    it('rejects duplicate scene file names', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MenuPanel.scene': host.file('{}'),
                }),
            }),
        });
        const tree = await readHostTree();
        const scenes = findFileByPath(tree, 'GameProject/src/scenes');

        await expect(createSceneFile(tree, scenes!, 'menu panel')).rejects.toThrow('已存在 MenuPanel.scene');
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



    it('opens compiler Scene templates as editable editor documents', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button" width="120" height="40">
                          <Graphics id="background" shape="roundRect" width="120" height="40" radius="8" fill="#2f6fed" />
                          <Text id="labelText" text="Button" />
                        </Scene>
                    `),

                    'Button.ts': buttonSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        const opened = await openCompilerSceneFile(tree, sceneFile!);
        const compilerDocument = getCompilerSceneDocument();

        expect(opened.openedScenePath).toBe('GameProject/src/scenes/Button.scene');
        expect(opened.template.name).toBe('Button');
        expect(opened.descriptor?.className).toBe('Button');
        expect(compilerDocument?.scenePath).toBe('GameProject/src/scenes/Button.scene');
        expect(compilerDocument?.template.children.map((node) => node.kind === 'slotOutlet' ? node.name : node.id)).toEqual(['background', 'labelText']);
        expect(compilerDocument?.descriptor?.interface.props.label.default).toBe('Button');
        expect(compilerDocument?.selection).toEqual({ type: 'scene' });
        expect(compilerDocument?.sceneInterfaces[builtinSceneAssetId('Control')]).toMatchObject({
            props: {
                minWidth: { type: 'number', default: 0 },
            },
            slots: {
                default: {},
            },
        });
    });

    it('opens compiler Scene files without a root script attribute', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file('<Scene name="Button" />'),
                    'Button.ts': emptySceneScript('Button'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        const opened = await openCompilerSceneFile(tree, sceneFile!);

        expect(opened.descriptor.className).toBe('Button');
    });

    it('rejects compiler Scene files when the colocated script is missing', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file('<Scene name="Button" />'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        await expect(openCompilerSceneFile(tree, sceneFile!)).rejects.toThrow('找不到 Scene 脚本 src/scenes/Button.ts');
    });

    it('rejects compiler Scene files whose name does not match the @scene class', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file('<Scene name="Button" />'),

                    'Button.ts': emptySceneScript('PrimaryButton'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        await expect(openCompilerSceneFile(tree, sceneFile!)).rejects.toThrow('Scene Button.scene 的 name "Button" 必须等于脚本 @scene 类名 "PrimaryButton"');
    });

    it('rejects compiler Scene files whose script has no @scene class', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file('<Scene name="Button" />'),

                    'Button.ts': host.file('export class Button {}'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        await expect(openCompilerSceneFile(tree, sceneFile!)).rejects.toThrow('No @scene decorator found');
    });

    it('indexes compiler Scene script bindings as derived contracts', async () => {
        host.reset({
            scenes: host.directory({
                'Legacy.scene': host.file('<Scene name="Legacy" />'),
            }),
            src: host.directory({
                build: host.directory({
                    'BuildOnly.scene': host.file('<Scene name="BuildOnly" />'),
                }),
                generated: host.directory({
                    'GeneratedOnly.scene': host.file('<Scene name="GeneratedOnly" />'),
                }),
                scenes: host.directory({
                    'Button.scene': host.file('<Scene name="Button" />'),
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Button id="startButton" scene="./Button.scene" label="Start" @click="startGame" />
                        </Scene>
                    `),

                    'Button.ts': buttonSceneScript({ disabled: true }),
                    'MainMenu.ts': emptySceneScript('MainMenu'),
                }),
            }),
        });
        const tree = await readHostTree();

        const index = await readCompilerSceneBindingIndex(tree);
        const button = index['src/scenes/Button.scene'];
        const mainMenu = index['src/scenes/MainMenu.scene'];
        const sceneInterfaces = sceneInterfacesForCompilerTemplate(index, mainMenu.template.children, mainMenu.scenePath);

        expect(Object.keys(index).sort()).toEqual(['src/scenes/Button.scene', 'src/scenes/MainMenu.scene']);
        expect(button.className).toBe('Button');
        expect(button.template.interface).toBe(button.interface);
        expect(button.interface.props.disabled.default).toBe(false);
        expect(button.interface.events.click).toEqual({ type: 'action' });
        expect(button.interface.slots.icon).toEqual({});
        expect(sceneInterfaces['src/scenes/Button.scene']).toBe(button.interface);
    });

    it('loads compiler preview project textures through an explicit Pixi texture parser', async () => {
        host.reset({
            assets: host.directory({
                'play.png': host.file('fake-png'),
            }),
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button">
                          <Sprite id="icon" texture="assets/play.png" />
                        </Scene>
                    `),

                    'Button.ts': emptySceneScript('Button'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');
        await openCompilerSceneFile(tree, sceneFile!);
        const document = getCompilerSceneDocument();
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pixifact-preview-texture');
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const loadAsset = vi.spyOn(Pixi.Assets, 'load').mockResolvedValue(Pixi.Texture.EMPTY);

        try {
            const preview = await createCompilerSceneRuntimePreview({
                document: document!,
                projectTree: tree,
                scenePath: 'src/scenes/Button.scene',
            });

            expect(loadAsset).toHaveBeenCalledWith({
                src: 'blob:pixifact-preview-texture',
                parser: 'texture',
            });
            preview.dispose();
            expect(revokeObjectUrl).toHaveBeenCalledWith('blob:pixifact-preview-texture');
        } finally {
            loadAsset.mockRestore();
            createObjectUrl.mockRestore();
            revokeObjectUrl.mockRestore();
        }
    });

    it('detects compiler binding source file changes', () => {
        expect(isCompilerBindingSourceChange({ path: 'src/scenes/Button.scene', kind: 'scene' })).toBe(true);
        expect(isCompilerBindingSourceChange({ path: 'src/scenes/Button.ts', kind: 'script' })).toBe(true);
        expect(isCompilerBindingSourceChange({ path: 'GameProject/src/scenes/Button.ts', kind: 'script' })).toBe(true);
        expect(isCompilerBindingSourceChange({ path: 'src/logic/actions.ts', kind: 'script' })).toBe(true);
        expect(isCompilerBindingSourceChange({ path: 'assets/button.png', kind: 'asset' })).toBe(false);
    });

    it('reloads the opened compiler Scene when the host reports an external .scene edit', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button">
                          <Text id="labelText" text="Start" />
                        </Scene>
                    `),

                    'Button.ts': emptySceneScript('Button'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');
        await openCompilerSceneFile(tree, sceneFile!);

        await host.writeProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/Button.scene', `
            <Scene name="Button">
              <Text id="labelText" text="Continue" />
            </Scene>
        `);
        const result = await syncOpenedCompilerSceneFromHostChange({
            projectTree: tree,
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            event: {
                projectRootPath: '/tmp/GameProject',
                path: 'GameProject/src/scenes/Button.scene',
                kind: 'scene',
            },
        });

        expect(result.status).toBe('sceneReloaded');
        expect(getCompilerSceneDocument()?.template.children[0]).toMatchObject({
            kind: 'pixi',
            type: 'Text',
            id: 'labelText',
            props: {
                text: 'Continue',
            },
        });
        expect(getCompilerSceneDocument()?.dirty).toBe(false);
    });

    it('reports validation feedback when an externally changed compiler Scene reloads', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button">
                          <Text id="labelText" text="Start" />
                        </Scene>
                    `),

                    'Button.ts': emptySceneScript('Button'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');
        await openCompilerSceneFile(tree, sceneFile!);

        await host.writeProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/Button.scene', `
            <Scene name="Button">
              <Text id="labelText" text="Continue" />
            </Scene>
        `);
        const result = await syncOpenedCompilerSceneFromHostChange({
            projectTree: tree,
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            event: {
                projectRootPath: '/tmp/GameProject',
                path: 'GameProject/src/scenes/Button.scene',
                kind: 'scene',
            },
        });

        expect(result).toMatchObject({
            status: 'sceneReloaded',
            message: '外部 Scene 修改已刷新，校验通过。',
            validation: {
                ok: true,
                scene: 'src/scenes/Button.scene',
                summary: {
                    name: 'Button',
                    nodeCount: 1,
                },
            },
        });
    });

    it('returns validation diagnostics without replacing preview when an external compiler Scene edit is invalid', async () => {
        host.reset({
            assets: host.directory({}),
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button">
                          <Text id="labelText" text="Start" />
                        </Scene>
                    `),

                    'Button.ts': emptySceneScript('Button'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');
        await openCompilerSceneFile(tree, sceneFile!);

        await host.writeProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/Button.scene', `
            <Scene name="Button">
              <Sprite id="missingTexture" texture="assets/missing.png" />
            </Scene>
        `);
        const result = await syncOpenedCompilerSceneFromHostChange({
            projectTree: tree,
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            event: {
                projectRootPath: '/tmp/GameProject',
                path: 'GameProject/src/scenes/Button.scene',
                kind: 'scene',
            },
        });

        expect(result).toMatchObject({
            status: 'validationFailed',
            message: '外部 Scene 修改未刷新：校验失败。',
            validation: {
                ok: false,
                scene: 'src/scenes/Button.scene',
                diagnostics: [{
                    path: '0:missingTexture',
                    prop: 'texture',
                    expected: 'existing project asset',
                    actual: 'assets/missing.png',
                }],
            },
        });
        expect(getCompilerSceneDocument()?.template.children[0]).toMatchObject({
            id: 'labelText',
            props: {
                text: 'Start',
            },
        });
    });

    it('does not reload an externally changed compiler Scene over dirty editor changes', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button">
                          <Text id="labelText" text="Start" />
                        </Scene>
                    `),

                    'Button.ts': emptySceneScript('Button'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');
        await openCompilerSceneFile(tree, sceneFile!);
        updateCompilerSceneNode('0:labelText', { props: { text: 'Unsaved' } });

        await host.writeProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/Button.scene', `
            <Scene name="Button">
              <Text id="labelText" text="External" />
            </Scene>
        `);
        const result = await syncOpenedCompilerSceneFromHostChange({
            projectTree: tree,
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            event: {
                projectRootPath: '/tmp/GameProject',
                path: 'GameProject/src/scenes/Button.scene',
                kind: 'scene',
            },
        });

        expect(result).toEqual({
            status: 'dirtySkipped',
            message: '当前打开的 Scene 有未保存修改，已跳过外部文件刷新。',
        });
        expect(getCompilerSceneDocument()?.template.children[0]).toMatchObject({
            props: {
                text: 'Unsaved',
            },
        });
        expect(getCompilerSceneDocument()?.dirty).toBe(true);
    });

    it('opens and refreshes the bound compiler Scene script contract', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button" width="120" height="40">
                          <Text id="labelText" text="Button" />
                        </Scene>
                    `),

                    'Button.ts': buttonSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        const opened = await openCompilerSceneFile(tree, sceneFile!);
        await openCompilerSceneScriptFile(tree, opened.template, sceneFile);
        await host.writeProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/Button.ts', sceneScriptSource('Button', `
            @prop({ type: Boolean, default: false })
            accessor disabled = false;
        `));
        const { descriptor } = await refreshCompilerSceneBindingSnapshot(tree, sceneFile!, opened.template);
        const compilerDocument = getCompilerSceneDocument();

        expect(host.openHostCodeFile).toHaveBeenCalledWith('/tmp/GameProject', 'src/scenes/Button.ts');
        expect(descriptor.scene).toBe('src/scenes/Button.scene');
        expect(compilerDocument?.descriptor?.interface.props.disabled.default).toBe(false);
        expect(compilerDocument?.template.interface.props.disabled.default).toBe(false);
        expect(opened.template.interface.props.disabled).toBeUndefined();
        expect(compilerDocument?.dirty).toBe(false);
    });

    it('loads public interfaces for compiler Scene instances', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file('<Scene name="Button" />'),
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Button id="startButton" scene="./Button.scene" label="Start" @click="startGame" />
                        </Scene>
                    `),

                    'Button.ts': buttonSceneScript({ disabled: true }),
                    'MainMenu.ts': emptySceneScript('MainMenu'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

        const opened = await openCompilerSceneFile(tree, sceneFile!);
        const compilerDocument = getCompilerSceneDocument();

        expect(opened.sceneInterfaces['src/scenes/Button.scene'].props.disabled.default).toBe(false);
        expect(compilerDocument?.sceneInterfaces['src/scenes/Button.scene'].events.click).toEqual({ type: 'action' });
        expect(compilerDocument?.sceneInterfaces['src/scenes/Button.scene'].slots.icon).toEqual({});
    });

    it('builds placement-only hierarchy nodes for public compiler Scene slots', () => {
        const compilerDocument: CompilerSceneDocument = {
            scenePath: 'GameProject/src/scenes/MainMenu.scene',
            template: {
                version: 2,
                name: 'MainMenu',
                props: {},
                interface: {
                    props: {},
                    events: {},
                    slots: {},
                },
                children: [{
                    kind: 'sceneInstance',
                    type: 'Panel',
                    id: 'settingsPanel',
                    scene: 'src/scenes/Panel.scene',
                    props: {},
                    events: {},
                    slots: {
                        footer: [{
                            kind: 'pixi',
                            type: 'Text',
                            id: 'footerText',
                            props: {
                                text: 'OK',
                            },
                            children: [],
                        }],
                    },
                }],
            },
            sceneInterfaces: {
                'src/scenes/Panel.scene': {
                    props: {},
                    events: {},
                    slots: {
                        default: {},
                        footer: {},
                    },
                },
            },
            selection: { type: 'scene' },
            dirty: false,
        };
        compilerDocument.template.children[0].scene = './Panel.scene';

        const [sceneItem] = buildCompilerHierarchyTreeItems(compilerDocument);
        const [panelItem] = sceneItem.children ?? [];
        const slots = panelItem.children ?? [];

        expect(slots.map((slot) => slot.textValue)).toEqual(['slot: default', 'slot: footer']);
        expect(slots[0].item.node).toEqual({
            kind: 'slot',
            owner: '0:settingsPanel',
            name: 'default',
            childCount: 0,
        });
        expect(slots[1].item.node).toEqual({
            kind: 'slot',
            owner: '0:settingsPanel',
            name: 'footer',
            childCount: 1,
        });
        expect(slots[1].children?.[0].item.node).toMatchObject({
            kind: 'pixi',
            id: 'footerText',
        });
    });

    it('builds read-only inspector rows for compiler Scene instance slots', () => {
        const rows = compilerSceneInstanceSlotRows({
            kind: 'sceneInstance',
            type: 'Panel',
            id: 'settingsPanel',
            scene: 'src/scenes/Panel.scene',
            props: {},
            events: {},
            slots: {
                footer: [{
                    kind: 'pixi',
                    type: 'Text',
                    id: 'footerText',
                    props: {
                        text: 'OK',
                    },
                    children: [],
                }],
                custom: [],
            },
        }, {
            props: {},
            events: {},
            slots: {
                default: {},
                footer: {},
            },
        });

        expect(rows).toEqual([
            { name: 'default', childCount: 0 },
            { name: 'footer', childCount: 1 },
            { name: 'custom', childCount: 0 },
        ]);
    });

    it('updates compiler Scene template nodes in memory', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button" width="120" height="40">
                          <Graphics id="background" shape="roundRect" width="120" height="40" radius="8" fill="#4169e1" />
                          <Text id="labelText" text="Button" x="32" y="10" fontSize="16" fill="#ffffff" />
                        </Scene>
                    `),

                    'Button.ts': buttonSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        updateCompilerSceneNode('1:labelText', {
            id: 'titleText',
            props: {
                text: 'Start',
                x: 40,
                pivotX: 8,
                pivotY: 4,
                skewX: 0.1,
                skewY: 0.2,
                alpha: 0.9,
                eventMode: 'static',
                cursor: 'pointer',
                label: 'title',
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
                pivotX: 8,
                pivotY: 4,
                skewX: 0.1,
                skewY: 0.2,
                alpha: 0.9,
                eventMode: 'static',
                cursor: 'pointer',
                label: 'title',
            },
        });
        expect(compilerDocument?.selection).toEqual({ type: 'node', node: '1:titleText' });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('resolves dropped image assets as project-relative compiler texture references', async () => {
        host.reset({
            assets: host.directory({
                'hero.png': host.file('png bytes'),
            }),
            scripts: host.directory({
                'logic.ts': host.file(),
            }),
        });
        const tree = await readHostTree();
        const hero = findFileByPath(tree, 'GameProject/assets/hero.png');
        const script = findFileByPath(tree, 'GameProject/scripts/logic.ts');

        expect(assetDragPayload(hero!)).toEqual({
            data: 'GameProject/assets/hero.png',
            label: 'hero.png',
            type: 'application/x-pixifact-asset',
        });
        expect(assetDragPayload(script!)).toBeUndefined();
        expect(resolveProjectAssetReference(tree, hero!.path)).toEqual({
            ok: true,
            value: 'assets/hero.png',
        });
        expect(resolveProjectAssetReference(tree, script!.path)).toEqual({
            ok: false,
            error: '拖入的文件不是图片资源。',
        });
    });

    it('updates compiler Scene root metadata in memory', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file('<Scene name="Button" width="120" height="40" />'),

                    'Button.ts': buttonSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        updateCompilerSceneTemplate({
            name: 'PrimaryButton',
            props: {
                width: 180,
                height: 52,
            },
        });

        const compilerDocument = getCompilerSceneDocument();

        expect(compilerDocument?.template).toMatchObject({
            name: 'PrimaryButton',
            props: {
                width: 180,
                height: 52,
            },
        });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('adds compiler Pixi nodes to root, Container children, and Scene slots', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Container id="content" />
                          <Panel id="settingsPanel" scene="./Panel.scene" />
                        </Scene>
                    `),
                    'Panel.scene': host.file('<Scene name="Panel" />'),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                    'Panel.ts': panelSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        let compilerDocument = getCompilerSceneDocument();
        expect(compilerDocument).toBeDefined();

        const rootResult = addCompilerSceneNode('__scene__', createCompilerPixiTemplateNode(compilerDocument!.template, 'Text'));
        compilerDocument = getCompilerSceneDocument();
        const containerResult = addCompilerSceneNode('0:content', createCompilerPixiTemplateNode(compilerDocument!.template, 'Graphics'));
        compilerDocument = getCompilerSceneDocument();
        const slotResult = addCompilerSceneNode('1:settingsPanel/slot:footer', createCompilerPixiTemplateNode(compilerDocument!.template, 'Container'));

        compilerDocument = getCompilerSceneDocument();
        expect(rootResult).toEqual({ ok: true, locator: '2:text1' });
        expect(containerResult).toEqual({ ok: true, locator: '0:content/0:graphics1' });
        expect(slotResult).toEqual({ ok: true, locator: '1:settingsPanel/slot:footer/0:container1' });
        expect(compilerDocument?.template.children[2]).toMatchObject({
            kind: 'pixi',
            type: 'Text',
            id: 'text1',
        });
        expect(compilerDocument?.template.children[0]).toMatchObject({
            kind: 'pixi',
            children: [{
                kind: 'pixi',
                type: 'Graphics',
                id: 'graphics1',
            }],
        });
        expect(compilerDocument?.template.children[1]).toMatchObject({
            kind: 'sceneInstance',
            slots: {
                footer: [{
                    kind: 'pixi',
                    type: 'Container',
                    id: 'container1',
                }],
            },
        });
        expect(compilerDocument?.selection).toEqual({ type: 'node', node: '1:settingsPanel/slot:footer/0:container1' });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('creates compiler Pixi basic nodes with type defaults', () => {
        const template = parseSceneTemplate('<Scene name="Library" />');

        expect(createCompilerPixiTemplateNode(template, 'NineSliceSprite')).toMatchObject({
            kind: 'pixi',
            type: 'NineSliceSprite',
            props: {
                width: 160,
                height: 80,
                leftWidth: 10,
                rightWidth: 10,
                topHeight: 10,
                bottomHeight: 10,
            },
        });
        expect(createCompilerPixiTemplateNode(template, 'TilingSprite')).toMatchObject({
            kind: 'pixi',
            type: 'TilingSprite',
            props: {
                width: 160,
                height: 96,
                tileScaleX: 1,
                tileScaleY: 1,
            },
        });
        expect(createCompilerPixiTemplateNode(template, 'BitmapText')).toMatchObject({
            kind: 'pixi',
            type: 'BitmapText',
            props: {
                text: 'Text',
                fontSize: 16,
            },
        });
    });

    it('describes compiler Pixi basic node fields through schema', () => {
        expect(pixiSceneNodeDefaults('Graphics')).toEqual({
            shape: 'roundRect',
            width: 100,
            height: 60,
            radius: 8,
            fill: 0xe5e7eb,
        });
        expect(pixiSceneNodePropKeys('TilingSprite')).toEqual([
            'texture',
            'anchorX',
            'anchorY',
            'tint',
            'tilePositionX',
            'tilePositionY',
            'tileScaleX',
            'tileScaleY',
            'tileRotation',
        ]);
        expect(pixiSceneFieldSchema('eventMode')).toMatchObject({
            type: 'enum',
            options: ['none', 'passive', 'auto', 'static', 'dynamic'],
        });
        expect(pixiSceneFieldSchema('fill')).toMatchObject({
            type: 'color',
        });
    });

    it('groups compiler Pixi basic node props by node capability', () => {
        expect(pixiSceneNodePropGroups('NineSliceSprite')).toEqual([
            {
                group: 'sprite',
                fields: ['texture', 'anchorX', 'anchorY', 'tint'],
            },
            {
                group: 'nineSlice',
                fields: ['leftWidth', 'rightWidth', 'topHeight', 'bottomHeight'],
            },
        ]);
        expect(pixiSceneNodePropGroups('TilingSprite').map((group) => group.group)).toEqual(['sprite', 'tiling']);
        expect(pixiSceneNodePropGroups('Text')).toEqual([
            {
                group: 'text',
                fields: ['text', 'fontSize', 'fontFamily', 'fontWeight', 'fill'],
            },
        ]);
    });

    it('adds and renames compiler slot outlets only under Containers', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Container id="content" />
                          <Panel id="settingsPanel" scene="./Panel.scene" />
                        </Scene>
                    `),
                    'Panel.scene': host.file('<Scene name="Panel" />'),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                    'Panel.ts': panelSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        let compilerDocument = getCompilerSceneDocument();
        expect(compilerDocument).toBeDefined();

        const rootResult = addCompilerSceneNode('__scene__', createCompilerSlotOutletTemplateNode(compilerDocument!.template));
        compilerDocument = getCompilerSceneDocument();
        const containerResult = addCompilerSceneNode('0:content', createCompilerSlotOutletTemplateNode(compilerDocument!.template));
        compilerDocument = getCompilerSceneDocument();
        const sceneSlotResult = addCompilerSceneNode('1:settingsPanel/slot:footer', createCompilerSlotOutletTemplateNode(compilerDocument!.template));

        expect(rootResult.ok).toBe(false);
        expect(containerResult).toEqual({ ok: true, locator: '0:content/0:slot:slot1' });
        expect(sceneSlotResult.ok).toBe(false);

        updateCompilerSceneNode('0:content/0:slot:slot1', {
            slotName: 'content',
        });

        compilerDocument = getCompilerSceneDocument();
        expect(compilerDocument?.template.children[0]).toMatchObject({
            kind: 'pixi',
            id: 'content',
            children: [{
                kind: 'slotOutlet',
                name: 'content',
            }],
        });
        expect(compilerDocument?.selection).toEqual({ type: 'node', node: '0:content/0:slot:content' });
        expect(compilerDocument?.dirty).toBe(true);
        expect(await saveCompilerSceneFile(tree, 'GameProject/src/scenes/MainMenu.scene', compilerDocument!)).toBe(true);
        await expect(host.readProjectFileText('', 'GameProject/src/scenes/MainMenu.scene')).resolves.toContain('<slot name="content" />');
    });

    it('adds dropped compiler Scene files to root, Container children, and Scene slots', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Container id="content" />
                          <Panel id="settingsPanel" scene="./Panel.scene" />
                        </Scene>
                    `),
                    'Button.scene': host.file(`
                        <Scene name="Button" width="120" height="40">
                          <Container id="iconHost">
                            <slot name="icon" />
                          </Container>
                        </Scene>
                    `),
                    'Panel.scene': host.file('<Scene name="Panel" />'),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                    'Button.ts': buttonSceneScript(),
                    'Panel.ts': panelSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const mainMenuFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');
        const buttonFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        await openCompilerSceneFile(tree, mainMenuFile!);
        const rootResult = await addDroppedCompilerSceneInstance({
            openedScenePath: mainMenuFile?.path,
            projectTree: tree,
            scenePath: buttonFile!.path,
            parentLocator: '__scene__',
        });
        const containerResult = await addDroppedCompilerSceneInstance({
            openedScenePath: mainMenuFile?.path,
            projectTree: tree,
            scenePath: buttonFile!.path,
            parentLocator: '0:content',
        });
        const slotResult = await addDroppedCompilerSceneInstance({
            openedScenePath: mainMenuFile?.path,
            projectTree: tree,
            scenePath: buttonFile!.path,
            parentLocator: '1:settingsPanel/slot:footer',
        });
        const selfResult = await addDroppedCompilerSceneInstance({
            openedScenePath: mainMenuFile?.path,
            projectTree: tree,
            scenePath: mainMenuFile!.path,
            parentLocator: '__scene__',
        });
        const invalidResult = await addDroppedCompilerSceneInstance({
            openedScenePath: mainMenuFile?.path,
            projectTree: tree,
            scenePath: 'GameProject/src/scenes/Button.ts',
            parentLocator: '__scene__',
        });

        const compilerDocument = getCompilerSceneDocument();
        expect(rootResult).toEqual({ ok: true, locator: '2:button1' });
        expect(containerResult).toEqual({ ok: true, locator: '0:content/0:button2' });
        expect(slotResult).toEqual({ ok: true, locator: '1:settingsPanel/slot:footer/0:button3' });
        expect(selfResult).toEqual({ ok: false, errorKey: 'sceneCannotDropSelf' });
        expect(invalidResult).toEqual({ ok: false, errorKey: 'droppedFileNotScene' });
        expect(compilerDocument?.template.children[2]).toMatchObject({
            kind: 'sceneInstance',
            type: 'Button',
            id: 'button1',
            scene: 'src/scenes/Button.scene',
            props: {},
            events: {},
            slots: {
                icon: [],
            },
        });
        expect(compilerDocument?.template.children[0]).toMatchObject({
            kind: 'pixi',
            id: 'content',
            children: [{
                kind: 'sceneInstance',
                id: 'button2',
            }],
        });
        expect(compilerDocument?.template.children[1]).toMatchObject({
            kind: 'sceneInstance',
            id: 'settingsPanel',
            slots: {
                footer: [{
                    kind: 'sceneInstance',
                    id: 'button3',
                }],
            },
        });
        expect(compilerDocument?.sceneInterfaces['src/scenes/Button.scene']).toEqual({
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
        });
        expect(compilerDocument?.selection).toEqual({ type: 'node', node: '1:settingsPanel/slot:footer/0:button3' });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('does not add compiler nodes inside non-container Pixi nodes', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Text id="titleText" text="Title" />
                        </Scene>
                    `),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        const compilerDocument = getCompilerSceneDocument();
        const result = addCompilerSceneNode('0:titleText', createCompilerPixiTemplateNode(compilerDocument!.template, 'Text'));

        expect(result.ok).toBe(false);
        expect(getCompilerSceneDocument()?.template.children).toHaveLength(1);
        expect(getCompilerSceneDocument()?.dirty).toBe(false);
    });

    it('deletes compiler nodes from root, Container children, and Scene slots', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Text id="titleText" text="Title" />
                          <Container id="content">
                            <Graphics id="background" />
                          </Container>
                          <Panel id="settingsPanel" scene="./Panel.scene">
                            <Text slot="footer" id="footerText" text="Footer" />
                          </Panel>
                        </Scene>
                    `),
                    'Panel.scene': host.file('<Scene name="Panel" />'),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                    'Panel.ts': panelSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        const rootResult = deleteCompilerSceneNode('0:titleText');
        const childResult = deleteCompilerSceneNode('0:content/0:background');
        const slotChildResult = deleteCompilerSceneNode('1:settingsPanel/slot:footer/0:footerText');

        const compilerDocument = getCompilerSceneDocument();
        expect(rootResult).toEqual({ ok: true, selection: { type: 'scene' } });
        expect(childResult).toEqual({ ok: true, selection: { type: 'node', node: '0:content' } });
        expect(slotChildResult).toEqual({ ok: true, selection: { type: 'node', node: '1:settingsPanel/slot:footer' } });
        expect(compilerDocument?.template.children).toHaveLength(2);
        expect(compilerDocument?.template.children[0]).toMatchObject({
            kind: 'pixi',
            id: 'content',
            children: [],
        });
        expect(compilerDocument?.template.children[1]).toMatchObject({
            kind: 'sceneInstance',
            slots: {
                footer: [],
            },
        });
        expect(compilerDocument?.selection).toEqual({ type: 'node', node: '1:settingsPanel/slot:footer' });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('deletes compiler slot outlets but not placement slots', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Panel.scene': host.file(`
                        <Scene name="Panel">
                          <Container id="footerHost">
                            <slot name="footer" />
                          </Container>
                        </Scene>
                    `),

                    'Panel.ts': panelSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Panel.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        const slotResult = deleteCompilerSceneNode('0:footerHost/slot:footer');
        const slotOutletResult = deleteCompilerSceneNode('0:footerHost/0:slot:footer');

        expect(slotResult.ok).toBe(false);
        expect(slotOutletResult).toEqual({ ok: true, selection: { type: 'node', node: '0:footerHost' } });
        expect(getCompilerSceneDocument()?.template.children[0]).toMatchObject({
            kind: 'pixi',
            id: 'footerHost',
            children: [],
        });
        expect(getCompilerSceneDocument()?.dirty).toBe(true);
    });

    it('moves compiler nodes before, after, inside containers, into slots, and back to root', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Text id="titleText" text="Title" />
                          <Container id="content">
                            <Graphics id="background" />
                          </Container>
                          <Panel id="settingsPanel" scene="./Panel.scene" />
                        </Scene>
                    `),
                    'Panel.scene': host.file('<Scene name="Panel" />'),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                    'Panel.ts': panelSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        const intoContainer = moveCompilerSceneNode('0:titleText', '1:content', 'inside');
        const afterContent = moveCompilerSceneNode('0:content/1:titleText', '0:content/0:background', 'before');
        const intoSlot = moveCompilerSceneNode('0:content/0:titleText', '1:settingsPanel/slot:footer', 'inside');
        const backToRoot = moveCompilerSceneNode('1:settingsPanel/slot:footer/0:titleText', '__scene__', 'inside');

        const compilerDocument = getCompilerSceneDocument();
        expect(intoContainer).toEqual({ ok: true, locator: '0:content/1:titleText' });
        expect(afterContent).toEqual({ ok: true, locator: '0:content/0:titleText' });
        expect(intoSlot).toEqual({ ok: true, locator: '1:settingsPanel/slot:footer/0:titleText' });
        expect(backToRoot).toEqual({ ok: true, locator: '2:titleText' });
        expect(compilerDocument?.template.children.map((node) => node.kind === 'slotOutlet' ? node.name : node.id)).toEqual([
            'content',
            'settingsPanel',
            'titleText',
        ]);
        expect(compilerDocument?.template.children[0]).toMatchObject({
            kind: 'pixi',
            id: 'content',
            children: [{
                kind: 'pixi',
                id: 'background',
            }],
        });
        expect(compilerDocument?.template.children[1]).toMatchObject({
            kind: 'sceneInstance',
            id: 'settingsPanel',
            slots: {
                footer: [],
            },
        });
        expect(compilerDocument?.selection).toEqual({ type: 'node', node: '2:titleText' });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('moves compiler slot outlets within Containers only', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Panel.scene': host.file(`
                        <Scene name="Panel">
                          <Container id="content">
                            <Text id="titleText" text="Title" />
                            <slot name="default" />
                          </Container>
                          <Container id="footerHost" />
                          <Panel id="nestedPanel" scene="./NestedPanel.scene" />
                        </Scene>
                    `),
                    'NestedPanel.scene': host.file('<Scene name="NestedPanel" />'),

                    'Panel.ts': panelSceneScript(),
                    'NestedPanel.ts': panelSceneScript('NestedPanel'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Panel.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        const beforeText = moveCompilerSceneNode('0:content/1:slot:default', '0:content/0:titleText', 'before');
        const intoFooterHost = moveCompilerSceneNode('0:content/0:slot:default', '1:footerHost', 'inside');
        const toRoot = moveCompilerSceneNode('1:footerHost/0:slot:default', '__scene__', 'inside');
        const intoSceneSlot = moveCompilerSceneNode('1:footerHost/0:slot:default', '2:nestedPanel/slot:footer', 'inside');

        const compilerDocument = getCompilerSceneDocument();
        expect(beforeText).toEqual({ ok: true, locator: '0:content/0:slot:default' });
        expect(intoFooterHost).toEqual({ ok: true, locator: '1:footerHost/0:slot:default' });
        expect(toRoot.ok).toBe(false);
        expect(intoSceneSlot.ok).toBe(false);
        expect(compilerDocument?.template.children[0]).toMatchObject({
            kind: 'pixi',
            id: 'content',
            children: [{
                kind: 'pixi',
                id: 'titleText',
            }],
        });
        expect(compilerDocument?.template.children[1]).toMatchObject({
            kind: 'pixi',
            id: 'footerHost',
            children: [{
                kind: 'slotOutlet',
                name: 'default',
            }],
        });
        expect(compilerDocument?.selection).toEqual({ type: 'node', node: '1:footerHost/0:slot:default' });
        expect(compilerDocument?.dirty).toBe(true);
    });

    it('does not move compiler placement slots or nodes into descendants', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Container id="content">
                            <Container id="inner" />
                            <slot name="footer" />
                          </Container>
                          <Panel id="settingsPanel" scene="./Panel.scene" />
                        </Scene>
                    `),
                    'Panel.scene': host.file('<Scene name="Panel" />'),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                    'Panel.ts': panelSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);

        const intoDescendant = moveCompilerSceneNode('0:content', '0:content/0:inner', 'inside');
        const slot = moveCompilerSceneNode('1:settingsPanel/slot:footer', '__scene__', 'inside');
        const intoSceneInstance = moveCompilerSceneNode('0:content/0:inner', '1:settingsPanel', 'inside');

        expect(intoDescendant.ok).toBe(false);
        expect(slot.ok).toBe(false);
        expect(intoSceneInstance.ok).toBe(false);
        expect(getCompilerSceneDocument()?.dirty).toBe(false);
    });

    it('updates compiler Scene instance public props and events in memory', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Button id="startButton" scene="./Button.scene" label="Start" @click="startGame" />
                        </Scene>
                    `),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

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
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button" width="120" height="40">
                          <Graphics id="background" shape="roundRect" width="120" height="40" radius="8" fill="#4169e1" />
                          <Text id="labelText" text="Button" x="32" y="10" fontSize="16" fill="#ffffff" />
                        </Scene>
                    `),

                    'Button.ts': buttonSceneScript(),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        await openCompilerSceneFile(tree, sceneFile!);
        updateCompilerSceneTemplate({
            name: 'PrimaryButton',
            props: {
                width: 180,
                height: 52,
            },
        });
        updateCompilerSceneNode('1:labelText', {
            id: 'titleText',
            props: {
                text: 'Start',
                x: 40,
                pivotX: 8,
                pivotY: 4,
                skewX: 0.1,
                skewY: 0.2,
                alpha: 0.9,
                eventMode: 'static',
                cursor: 'pointer',
                label: 'title',
            },
        });
        const compilerDocument = getCompilerSceneDocument();

        expect(compilerDocument?.dirty).toBe(true);
        expect(await saveCompilerSceneFile(tree, 'GameProject/src/scenes/Button.scene', compilerDocument!)).toBe(true);
        expect(getCompilerSceneDocument()?.dirty).toBe(false);

        const saved = await host.readProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/Button.scene');
        expect(saved).toContain('<Scene name="PrimaryButton" width="180" height="52">');
        expect(saved).toContain('<Text id="titleText" text="Start" x="40" y="10" fontSize="16" fill="#ffffff" pivotX="8" pivotY="4" skewX="0.1" skewY="0.2" alpha="0.9" eventMode="static" cursor="pointer" label="title" />');
    });

    it('keeps compiler undo history when the save file watcher reports the same Scene content', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'Button.scene': host.file(`
                        <Scene name="Button">
                          <Text id="labelText" text="Start" />
                        </Scene>
                    `),

                    'Button.ts': emptySceneScript('Button'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/Button.scene');

        await openCompilerSceneFile(tree, sceneFile!);
        updateCompilerSceneNode('0:labelText', {
            props: {
                text: 'Continue',
            },
        });
        const compilerDocument = getCompilerSceneDocument();

        expect(await saveCompilerSceneFile(tree, 'GameProject/src/scenes/Button.scene', compilerDocument!)).toBe(true);
        expect(getCompilerSceneDocument()?.dirty).toBe(false);
        expect(canUndoCompilerSceneCommand()).toBe(true);

        const result = await syncOpenedCompilerSceneFromHostChange({
            projectTree: tree,
            openedScenePath: 'GameProject/src/scenes/Button.scene',
            event: {
                projectRootPath: '/tmp/GameProject',
                path: 'GameProject/src/scenes/Button.scene',
                kind: 'scene',
            },
        });

        expect(result).toEqual({ status: 'ignored' });
        expect(canUndoCompilerSceneCommand()).toBe(true);
        expect(undoCompilerSceneCommand()?.ok).toBe(true);
        expect(getCompilerSceneDocument()?.template.children[0]).toMatchObject({
            props: {
                text: 'Start',
            },
        });
        expect(getCompilerSceneDocument()?.dirty).toBe(true);
    });

    it('saves compiler Scene instance public prop and event edits back to XML', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Button id="startButton" scene="./Button.scene" label="Start" @click="startGame" />
                        </Scene>
                    `),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                }),
            }),
        });
        const tree = await readHostTree();
        const sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

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

        expect(await saveCompilerSceneFile(tree, 'GameProject/src/scenes/MainMenu.scene', compilerDocument!)).toBe(true);

        const saved = await host.readProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/MainMenu.scene');
        expect(saved).toContain('<Button id="startButton" scene="./Button.scene" label="Continue" x="24" y="36" width="188" height="48" scaleX="1.2" scaleY="0.9" rotation="0.25" alpha="0.8" visible="true" zIndex="10" disabled="true" @click="resumeGame" />');
    });

    it('reopens saved compiler Scene instance slot children from XML', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory({
                    'MainMenu.scene': host.file(`
                        <Scene name="MainMenu">
                          <Panel id="settingsPanel" scene="./Panel.scene">
                            <Text slot="footer" id="footerText" text="Footer" fill="#ffffff" />
                          </Panel>
                        </Scene>
                    `),
                    'Panel.scene': host.file('<Scene name="Panel" />'),

                    'MainMenu.ts': emptySceneScript('MainMenu'),
                    'Panel.ts': panelSceneScript(),
                }),
            }),
        });
        let tree = await readHostTree();
        let sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');

        await openCompilerSceneFile(tree, sceneFile!);
        const compilerDocument = getCompilerSceneDocument();

        expect(await saveCompilerSceneFile(tree, 'GameProject/src/scenes/MainMenu.scene', compilerDocument!)).toBe(true);

        tree = await readHostTree();
        sceneFile = findFileByPath(tree, 'GameProject/src/scenes/MainMenu.scene');
        await openCompilerSceneFile(tree, sceneFile!);

        const reopenedPanel = getCompilerSceneDocument()?.template.children[0];
        expect(reopenedPanel).toMatchObject({
            kind: 'sceneInstance',
            id: 'settingsPanel',
            slots: {
                footer: [{
                    kind: 'pixi',
                    type: 'Text',
                    id: 'footerText',
                    props: {
                        text: 'Footer',
                        fill: 0xffffff,
                    },
                }],
            },
        });
    });

    it('creates and opens a compiler Scene and saves it as XML', async () => {
        host.reset({
            src: host.directory({
                scenes: host.directory(),
            }),
        });
        const tree = await readHostTree();
        const scenes = findFileByPath(tree, 'GameProject/src/scenes');

        const opened = await createAndOpenSceneFile(tree, scenes!, 'status panel');
        const compilerDocument = getCompilerSceneDocument();

        expect(opened.created.path).toBe('GameProject/src/scenes/StatusPanel.scene');
        expect(opened.created.scriptPath).toBe('GameProject/src/scenes/StatusPanel.ts');
        expect(opened.openedScenePath).toBe('GameProject/src/scenes/StatusPanel.scene');
        expect(opened.descriptor.className).toBe('StatusPanel');
        expect(opened.template).toEqual(compilerDocument?.template);
        expect(compilerDocument?.scenePath).toBe('GameProject/src/scenes/StatusPanel.scene');
        expect(compilerDocument?.template).toMatchObject({
            version: 2,
            name: 'StatusPanel',
            props: {
                width: 960,
                height: 540,
            },
            children: [],
        });
        expect(host.writeProjectFileText).not.toHaveBeenCalled();

        expect(await saveCompilerSceneFile(opened.refreshedTree, opened.openedScenePath, compilerDocument!)).toBe(true);

        const saved = await host.readProjectFileText('/tmp/GameProject', 'GameProject/src/scenes/StatusPanel.scene');
        expect(host.writeProjectFileText).toHaveBeenCalledWith(
            '/tmp/GameProject',
            'GameProject/src/scenes/StatusPanel.scene',
            '<Scene name="StatusPanel" width="960" height="540">\n</Scene>\n',
        );
        expect(parseSceneTemplate(saved).name).toBe('StatusPanel');
    });

});
