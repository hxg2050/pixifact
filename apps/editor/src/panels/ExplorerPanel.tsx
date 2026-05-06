import { useEffect, useMemo, useState } from 'react';
import type { EditorDocument, PrefabSpec } from '../../../../src';
import {
    Button,
    DragSource,
    Menu,
    MenuItem,
    MenuTrigger,
    Popover,
    TextField,
    TreeView,
} from '../components/system';
import type { TreeViewItem } from '../components/system';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { useEditorStore } from '../editorStore';
import { basicComponentLibrary } from '../services/basicComponentLibrary';
import {
    basicComponentDragPayload,
    componentDragPayload,
    prefabDragPayload,
} from '../services/dragPayload';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import {
    collectFolderPaths,
    componentTypeFromPath,
    countProjectFileTree,
    createFolder,
    createPrefabFile,
    deleteProjectEntry,
    containingDirectory,
    readProjectFileTree,
    renameProjectEntry,
} from '../services/projectFileTree';
import { getNodeLocator, useDocumentRevision } from './common';

interface ImportMetaWithEnv extends ImportMeta {
    env?: Record<string, string | boolean | undefined>;
}

function editorProjectPath() {
    const env = (import.meta as ImportMetaWithEnv).env;
    const path = env?.VITE_PIXIF_PROJECT_ROOT;
    return typeof path === 'string' && path.trim() ? path.trim() : '未打开项目文件夹';
}

function folderName(path: string) {
    const normalized = path.replace(/[\\/]+$/, '');
    return normalized.split(/[\\/]/).pop() || path;
}

function fileAction(file: ProjectFileTreeNode, mode: 'select' | 'open') {
    if (file.kind === 'asset') {
        return mode === 'open'
            ? `已选择图片资源 ${file.path}。`
            : '图片资源按需预览；当前阶段不调用系统图片查看器。';
    }
    if (file.kind === 'component') {
        return `${file.name} 是可挂载 Component；拖到 Inspector 空白区域即可添加。`;
    }
    if (file.kind === 'script') {
        return '代码文件只读；当前阶段不在编辑器内打开源码。';
    }
    if (file.kind === 'prefab') {
        return mode === 'open'
            ? `已打开 ${file.name} 进行预制体编辑。`
            : '预制体已选中；双击会进入预制体编辑。';
    }
    if (file.kind === 'folder') {
        return '目录只用于浏览项目结构。';
    }
    return '当前文件只读浏览。';
}

function fileTreeItem(file: ProjectFileTreeNode): TreeViewItem<ProjectFileTreeNode> {
    return {
        children: file.kind === 'folder' ? file.children?.map(fileTreeItem) : undefined,
        className: file.kind,
        id: file.path,
        item: file,
        textValue: file.name,
    };
}

function findFileInTree(node: ProjectFileTreeNode, path: string): ProjectFileTreeNode | undefined {
    if (node.path === path) {
        return node;
    }
    for (const child of node.children ?? []) {
        const match = findFileInTree(child, path);
        if (match) {
            return match;
        }
    }
    return undefined;
}

function fileDragPayload(file: ProjectFileTreeNode) {
    if (file.kind === 'prefab') {
        return prefabDragPayload(file.path, file.name);
    }
    if (file.kind === 'component') {
        const componentType = componentTypeFromPath(file.path);
        return componentType ? componentDragPayload(componentType, file.name) : undefined;
    }
    return undefined;
}

function canRenameFile(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode, openedPrefabPath?: string, dirty?: boolean) {
    return file.path !== projectTree.path && !(file.path === openedPrefabPath && dirty);
}

function canDeleteFile(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode, openedPrefabPath?: string, dirty?: boolean) {
    return file.path !== projectTree.path && !(file.path === openedPrefabPath && dirty);
}

function rootLocator(prefab: PrefabSpec) {
    return getNodeLocator(prefab.root);
}

async function loadPrefabFile(document: EditorDocument, file: ProjectFileTreeNode) {
    const handle = file.handle as FileSystemFileHandle;
    const content = await (await handle.getFile()).text();
    document.load(content);
    document.setSelection({ type: 'node', node: rootLocator(document.prefab) });
    refreshEditorDocument();
}

function EmptyProjectState() {
    return (
        <section className="filePreview">
            <span>项目</span>
            <strong>未打开文件夹</strong>
            <small>点击顶部“打开文件夹”读取完整项目文件树。</small>
            <div className="fileRule">浏览器需要支持 File System Access API，建议使用 Chrome 或 Edge。</div>
        </section>
    );
}

type ExplorerAccordionSection = 'project' | 'library' | 'preview';

export function ResourceExplorer({ document }: { document: EditorDocument; revision?: number }) {
    useDocumentRevision();
    const projectTree = useEditorStore((state) => state.projectTree);
    const selectedPath = useEditorStore((state) => state.selectedProjectFilePath);
    const expandedProjectFolders = useEditorStore((state) => state.expandedProjectFolders);
    const setSelectedProjectFile = useEditorStore((state) => state.setSelectedProjectFile);
    const setOpenedPrefab = useEditorStore((state) => state.setOpenedPrefab);
    const setExpandedProjectFolders = useEditorStore((state) => state.setExpandedProjectFolders);
    const refreshProject = useEditorStore((state) => state.refreshProject);
    const openedPrefabPath = useEditorStore((state) => state.openedPrefabPath);
    const [newPrefabName, setNewPrefabName] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [renameName, setRenameName] = useState('');
    const [renameTargetPath, setRenameTargetPath] = useState<string>();
    const [inlineRenameDraft, setInlineRenameDraft] = useState('');
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string>();
    const [actionText, setActionText] = useState('点击“打开文件夹”读取项目文件树。');
    const [openSection, setOpenSection] = useState<ExplorerAccordionSection>('project');
    const expandedFolders = useMemo(() => new Set(expandedProjectFolders), [expandedProjectFolders]);

    const fileTreeItems = useMemo(() => {
        if (!projectTree) {
            return [];
        }
        return [fileTreeItem(projectTree)];
    }, [projectTree]);
    const selectedFile = projectTree && selectedPath ? findFileInTree(projectTree, selectedPath) ?? projectTree : projectTree;
    const projectPath = projectTree?.path ?? editorProjectPath();
    const selectedBasicComponent = selectedPath?.startsWith('library/basic/')
        ? basicComponentLibrary.find((item) => selectedPath === `library/basic/${item.kind}`)
        : undefined;

    useEffect(() => {
        if (selectedFile?.kind !== 'asset') {
            setImagePreviewUrl(undefined);
            return undefined;
        }

        let revoked = false;
        let objectUrl: string | undefined;
        const handle = selectedFile.handle as FileSystemFileHandle;
        void handle.getFile()
            .then((file) => {
                if (!file.type.startsWith('image/')) {
                    return;
                }
                objectUrl = URL.createObjectURL(file);
                if (revoked) {
                    URL.revokeObjectURL(objectUrl);
                    return;
                }
                setImagePreviewUrl(objectUrl);
            })
            .catch(() => {
                if (!revoked) {
                    setImagePreviewUrl(undefined);
                }
            });

        return () => {
            revoked = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [selectedFile]);

    const toggleFolder = (file: ProjectFileTreeNode) => {
        const next = new Set(expandedFolders);
        if (next.has(file.path)) {
            next.delete(file.path);
        } else {
            next.add(file.path);
        }
        setExpandedProjectFolders([...next]);
    };

    const setTreeExpandedKeys = (keys: Set<string | number>) => {
        setExpandedProjectFolders([...keys].map(String));
    };

    const selectFile = (file: ProjectFileTreeNode) => {
        setSelectedProjectFile(file.path);
        setRenameName(file.name);
        setActionText(fileAction(file, 'select'));
    };

    const selectBasicComponent = (kind: string) => {
        const item = basicComponentLibrary.find((candidate) => candidate.kind === kind);
        if (!item) {
            return;
        }
        setSelectedProjectFile(`library/basic/${item.kind}`);
        setRenameName('');
        setActionText(`${item.name} 是基础组件；拖到预制体节点树即可添加。`);
    };

    const openFile = async (file: ProjectFileTreeNode) => {
        setSelectedProjectFile(file.path);
        if (file.kind === 'folder') {
            toggleFolder(file);
            setActionText(fileAction(file, 'open'));
            return;
        }
        if (file.kind === 'prefab') {
            await loadPrefabFile(document, file);
            setOpenedPrefab(file.path);
        }
        setActionText(fileAction(file, 'open'));
    };

    const refreshFileTree = async (selectPath?: string, expandPaths: string[] = []) => {
        if (!projectTree) {
            return;
        }
        const refreshedTree = await readProjectFileTree(projectTree.handle as FileSystemDirectoryHandle);
        refreshProject(refreshedTree, { selectPath, expandPaths });
        setActionText('项目文件树已刷新。');
    };

    const createFolderInSelectedDirectory = async () => {
        const name = newFolderName.trim();
        if (!name || !projectTree) {
            return;
        }
        const directory = containingDirectory(projectTree, selectedFile);
        if (!directory) {
            setActionText('无法确定新建文件夹位置。');
            return;
        }

        try {
            const created = await createFolder(directory, name);
            setNewFolderName('');
            await refreshFileTree(created.path, [directory.path, created.path]);
            setActionText(`已创建文件夹 ${created.name}。`);
        } catch (error) {
            setActionText(error instanceof Error ? error.message : '新建文件夹失败。');
        }
    };

    const createPrefab = async () => {
        const name = newPrefabName.trim();
        if (!name || !projectTree) {
            return;
        }
        const directory = containingDirectory(projectTree, selectedFile);
        if (!directory) {
            return;
        }

        const created = await createPrefabFile(directory, name);
        const refreshedTree = await readProjectFileTree(projectTree.handle as FileSystemDirectoryHandle);
        refreshProject(refreshedTree, { selectPath: created.path, expandPaths: [directory.path] });
        document.load(created.content);
        document.setSelection({ type: 'node', node: rootLocator(document.prefab) });
        setOpenedPrefab(created.path);
        setNewPrefabName('');
        setActionText(`已创建并打开 ${created.fileName}。`);
        refreshEditorDocument();
    };

    const beginRename = (file: ProjectFileTreeNode) => {
        if (!projectTree || selectedBasicComponent) {
            return;
        }
        if (!canRenameFile(projectTree, file, openedPrefabPath, document.dirty)) {
            setActionText(file.path === projectTree.path
                ? '不能重命名项目根目录。'
                : '当前打开的 Prefab 有未保存修改，不能重命名。');
            return;
        }
        setSelectedProjectFile(file.path);
        setRenameName(file.name);
        setInlineRenameDraft(file.name);
        setRenameTargetPath(file.path);
    };

    const commitRename = async (file: ProjectFileTreeNode, name: string) => {
        const nextName = name.trim();
        if (!nextName || !projectTree || selectedBasicComponent) {
            setRenameTargetPath(undefined);
            return;
        }
        if (file.path === projectTree.path) {
            setActionText('不能重命名项目根目录。');
            return;
        }
        if (file.path === openedPrefabPath && document.dirty) {
            setActionText('当前打开的 Prefab 有未保存修改，不能重命名。');
            return;
        }

        try {
            const renamed = await renameProjectEntry(projectTree, file, nextName);
            const expandPath = file.path.split('/').slice(0, -1).join('/');
            await refreshFileTree(renamed.path, [expandPath]);
            setRenameName(renamed.name);
            setRenameTargetPath(undefined);
            setActionText(`已重命名为 ${renamed.name}。`);
        } catch (error) {
            setActionText(error instanceof Error ? error.message : '重命名失败。');
        }
    };

    const renameSelectedEntry = async () => {
        if (!selectedFile) {
            return;
        }
        await commitRename(selectedFile, renameName);
    };

    const deleteEntry = async (file: ProjectFileTreeNode) => {
        if (!projectTree || selectedBasicComponent) {
            return;
        }
        if (file.path === projectTree.path) {
            setActionText('不能删除项目根目录。');
            return;
        }
        if (file.path === openedPrefabPath && document.dirty) {
            setActionText('当前打开的 Prefab 有未保存修改，不能删除。');
            return;
        }
        const confirmed = window.confirm(`删除 ${file.name}？`);
        if (!confirmed) {
            return;
        }

        try {
            await deleteProjectEntry(projectTree, file);
            await refreshFileTree(file.path);
            setRenameTargetPath(undefined);
            setActionText(`已删除 ${file.name}。`);
        } catch (error) {
            setActionText(error instanceof Error ? error.message : '删除失败。');
        }
    };

    const deleteSelectedEntry = async () => {
        if (!selectedFile) {
            return;
        }
        await deleteEntry(selectedFile);
    };

    const handleFileKeyDown = (event: React.KeyboardEvent, file: ProjectFileTreeNode) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void openFile(file);
            return;
        }
        if (event.key === 'F2') {
            event.preventDefault();
            beginRename(file);
            return;
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            void deleteEntry(file);
        }
    };

    const createFolderInDirectory = async (directory: ProjectFileTreeNode) => {
        setSelectedProjectFile(directory.path);
        setNewFolderName('');
        setActionText(`在 ${directory.name} 下输入文件夹名称。`);
    };

    const createPrefabInDirectory = async (directory: ProjectFileTreeNode) => {
        setSelectedProjectFile(directory.path);
        setNewPrefabName('');
        setActionText(`在 ${directory.name} 下输入 Prefab 名称。`);
    };

    if (!projectTree) {
        return (
            <div className="panelSurface" data-testid="resource-explorer">
                <div className="searchBox" data-testid="project-path" title={projectPath}>{folderName(projectPath)}</div>
                <EmptyProjectState />
            </div>
        );
    }

    return (
        <div className="panelSurface" data-testid="resource-explorer">
            <div className="explorerTitle">资源管理器</div>
            <div className="searchBox" data-testid="project-path" title={projectPath}>{folderName(projectPath)}</div>
            <section className="panelSection">
                <section className="accordionSection" data-testid="project-file-section">
                    <button
                        aria-expanded={openSection === 'project'}
                        className="accordionHeader"
                        onClick={() => setOpenSection('project')}
                        type="button"
                    >
                        项目文件 · {countProjectFileTree(projectTree)} 项
                    </button>
                    <div
                        aria-hidden={openSection !== 'project'}
                        className={openSection === 'project' ? 'accordionPanel open' : 'accordionPanel'}
                    >
                        <div className="accordionContent">
                            <div className="fileOperationBar" aria-label="文件操作">
                                <Button icon="refresh" onPress={() => void refreshFileTree()}>刷新</Button>
                                <Button disabled={selectedBasicComponent !== undefined || !selectedFile || !canRenameFile(projectTree, selectedFile, openedPrefabPath, document.dirty)} icon="edit" onPress={() => selectedFile ? beginRename(selectedFile) : undefined}>
                                    重命名
                                </Button>
                                <Button disabled={selectedBasicComponent !== undefined || !selectedFile || !canDeleteFile(projectTree, selectedFile, openedPrefabPath, document.dirty)} icon="trash" onPress={() => void deleteSelectedEntry()} variant="danger">
                                    删除
                                </Button>
                            </div>
                            <div className="createPrefabRow">
                                <TextField
                                    data-testid="rename-entry-name"
                                    disabled={selectedBasicComponent !== undefined || selectedFile?.path === projectTree.path}
                                    inputProps={{ 'aria-label': '重命名当前条目', placeholder: '重命名当前条目' }}
                                    onChange={setRenameName}
                                    value={renameName}
                                />
                                <Button
                                    data-testid="rename-entry"
                                    disabled={selectedBasicComponent !== undefined || selectedFile?.path === projectTree.path || renameName.trim() === ''}
                                    onPress={() => void renameSelectedEntry()}
                                >
                                    应用
                                </Button>
                            </div>
                            <div className="createPrefabRow">
                                <TextField
                                    data-testid="new-folder-name"
                                    inputProps={{ 'aria-label': '文件夹名称', placeholder: '文件夹名称' }}
                                    onChange={setNewFolderName}
                                    value={newFolderName}
                                />
                                <Button data-testid="create-folder" disabled={newFolderName.trim() === ''} icon="folder-plus" onPress={() => void createFolderInSelectedDirectory()}>
                                    新建文件夹
                                </Button>
                            </div>
                            <div className="createPrefabRow">
                                <TextField
                                    data-testid="new-prefab-name"
                                    inputProps={{ 'aria-label': 'Prefab 名称', placeholder: 'Prefab 名称' }}
                                    onChange={setNewPrefabName}
                                    value={newPrefabName}
                                />
                                <Button data-testid="create-prefab" disabled={newPrefabName.trim() === ''} icon="plus" onPress={() => void createPrefab()}>
                                    新建预制体
                                </Button>
                            </div>
                            <TreeView
                                ariaLabel="项目文件树"
                                expandedKeys={expandedFolders}
                                items={fileTreeItems}
                                onExpandedChange={setTreeExpandedKeys}
                                onItemAction={(file) => selectFile(file)}
                                onItemKeyDown={(event, file) => handleFileKeyDown(event, file)}
                                onSelectedKeyChange={(_, file) => selectFile(file)}
                                selectedKeys={selectedPath ? [selectedPath] : []}
                                renderItem={({ item: file, level }) => (
                                    <DragSource
                                        as="div"
                                        className={[
                                            'fileRow',
                                            file.kind,
                                            selectedPath === file.path ? 'selected' : '',
                                        ].filter(Boolean).join(' ')}
                                        data-file-id={file.path}
                                        onContextMenu={(event) => {
                                            event.preventDefault();
                                            selectFile(file);
                                        }}
                                        onDoubleClick={() => void openFile(file)}
                                        onKeyDown={(event) => handleFileKeyDown(event, file)}
                                        payload={fileDragPayload(file)}
                                        style={{ '--tree-indent': `${Math.max(0, level - 1) * 14}px` } as React.CSSProperties}
                                        title={file.detail ?? file.path}
                                    >
                                        {renameTargetPath === file.path ? (
                                            <input
                                                aria-label="重命名当前条目"
                                                autoFocus
                                                className="inlineRenameInput"
                                                data-testid="inline-rename-entry"
                                                onBlur={() => void commitRename(file, inlineRenameDraft)}
                                                onChange={(event) => setInlineRenameDraft(event.target.value)}
                                                onClick={(event) => event.stopPropagation()}
                                                onKeyDown={(event) => {
                                                    event.stopPropagation();
                                                    if (event.key === 'Enter') {
                                                        event.currentTarget.blur();
                                                    }
                                                    if (event.key === 'Escape') {
                                                        setRenameTargetPath(undefined);
                                                    }
                                                }}
                                                value={inlineRenameDraft}
                                            />
                                        ) : (
                                            <strong>{file.name}</strong>
                                        )}
                                        <MenuTrigger>
                                            <Button
                                                aria-label={`${file.name} 更多操作`}
                                                className="fileMoreButton"
                                                icon="more"
                                                onPress={() => selectFile(file)}
                                                title="更多操作"
                                                variant="subtle"
                                            />
                                            <Popover className="fileMenuPopover">
                                                <Menu className="fileMenu" aria-label={`${file.name} 操作`}>
                                                    <MenuItem onAction={() => void openFile(file)}>
                                                        {file.kind === 'folder' ? '展开/收起' : file.kind === 'prefab' ? '打开' : '选择'}
                                                    </MenuItem>
                                                    {file.kind === 'folder' ? (
                                                        <>
                                                            <MenuItem onAction={() => void createFolderInDirectory(file)}>
                                                                新建文件夹
                                                            </MenuItem>
                                                            <MenuItem onAction={() => void createPrefabInDirectory(file)}>
                                                                新建 Prefab
                                                            </MenuItem>
                                                        </>
                                                    ) : null}
                                                    <MenuItem
                                                        isDisabled={!canRenameFile(projectTree, file, openedPrefabPath, document.dirty)}
                                                        onAction={() => beginRename(file)}
                                                    >
                                                        重命名
                                                    </MenuItem>
                                                    <MenuItem
                                                        isDisabled={!canDeleteFile(projectTree, file, openedPrefabPath, document.dirty)}
                                                        onAction={() => void deleteEntry(file)}
                                                    >
                                                        删除
                                                    </MenuItem>
                                                </Menu>
                                            </Popover>
                                        </MenuTrigger>
                                    </DragSource>
                                )}
                            />
                        </div>
                    </div>
                </section>
                <section className="accordionSection" data-testid="basic-component-library">
                    <button
                        aria-expanded={openSection === 'library'}
                        className="accordionHeader"
                        onClick={() => setOpenSection('library')}
                        type="button"
                    >
                        基础组件库
                    </button>
                    <div
                        aria-hidden={openSection !== 'library'}
                        className={openSection === 'library' ? 'accordionPanel open' : 'accordionPanel'}
                    >
                        <div className="accordionContent">
                            <div className="fileTree basicLibraryTree">
                                {basicComponentLibrary.map((item) => (
                                    <DragSource
                                        as="button"
                                        className={[
                                            'fileRow',
                                            'basicComponent',
                                            selectedPath === `library/basic/${item.kind}` ? 'selected' : '',
                                        ].filter(Boolean).join(' ')}
                                        data-basic-component={item.kind}
                                        key={item.kind}
                                        onClick={() => selectBasicComponent(item.kind)}
                                        payload={basicComponentDragPayload(item.kind, item.name)}
                                        title={item.detail}
                                    >
                                        <strong>{item.name}</strong>
                                    </DragSource>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
                <section className="accordionSection filePreview" data-testid="file-preview">
                    <button
                        aria-expanded={openSection === 'preview'}
                        className="accordionHeader"
                        onClick={() => setOpenSection('preview')}
                        type="button"
                    >
                        文件说明
                    </button>
                    <div
                        aria-hidden={openSection !== 'preview'}
                        className={openSection === 'preview' ? 'accordionPanel open' : 'accordionPanel'}
                    >
                        <div className="accordionContent filePreviewContent">
                            <span>文件</span>
                            <strong>{selectedBasicComponent?.name ?? selectedFile?.name ?? projectTree.name}</strong>
                            <small>{selectedBasicComponent ? '基础组件库' : selectedFile?.path ?? projectTree.path}</small>
                            {selectedBasicComponent ? (
                                <div className="fileRule">{selectedBasicComponent.detail}。拖到预制体节点树可作为子节点添加。</div>
                            ) : selectedFile?.kind === 'asset' ? (
                                <div className="imagePreview">
                                    {imagePreviewUrl ? (
                                        <img alt={selectedFile.name} src={imagePreviewUrl} />
                                    ) : (
                                        <div className="atlasPreview">
                                            <i />
                                            <i />
                                            <i />
                                            <i />
                                            <i />
                                            <i />
                                        </div>
                                    )}
                                    <p>资源文件已纳入完整文件树；内容按需读取。</p>
                                </div>
                            ) : selectedFile?.kind === 'component' ? (
                                <div className="fileRule">Component 文件。拖到 Inspector 空白区域，或从 Inspector 的添加列表挂到当前节点。</div>
                            ) : selectedFile?.kind === 'script' ? (
                                <div className="fileRule">只读代码文件。当前阶段不在编辑器内修改源码。</div>
                            ) : selectedFile?.kind === 'prefab' ? (
                                <div className="fileRule">双击进入预制体编辑；拖到预制体节点树可作为子节点添加。</div>
                            ) : selectedFile?.kind === 'folder' ? (
                                <div className="fileRule">目录包含 {collectFolderPaths(selectedFile).length - 1} 个子目录。</div>
                            ) : (
                                <div className="fileRule">当前条目仅用于项目浏览。</div>
                            )}
                            <div className="fileAction">{actionText}</div>
                        </div>
                    </div>
                </section>
            </section>
        </div>
    );
}
