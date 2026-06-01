import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, DragSource, SystemIcon, TextField, TreeView } from '../components/system';
import type { SystemIconName, TreeViewItem } from '../components/system';
import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import {
    sceneDragPayload,
} from '../services/dragPayload';
import { hostErrorMessage } from '../services/hostBridge';
import {
    assetDragPayload,
    containingDirectory,
    createFolder,
    createSceneFile,
    findFileByPath,
    openCompilerSceneFile,
    openProjectCodeFile,
    openProjectDefaultFile,
    refreshProjectFileTree,
} from '../services/projectFileTree';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { useCompilerSceneRevision } from './common';

function projectTreeItem(file: ProjectFileTreeNode, query = ''): TreeViewItem<ProjectFileTreeNode> | undefined {
    const childItems = file.children
        ?.map((child) => projectTreeItem(child, query))
        .filter((child): child is TreeViewItem<ProjectFileTreeNode> => Boolean(child));
    const matches = !query || file.name.toLowerCase().includes(query);
    if (!matches && (!childItems || childItems.length === 0)) {
        return undefined;
    }

    return {
        children: childItems,
        className: file.kind,
        id: file.path,
        item: file,
        textValue: file.name,
    };
}

function collectVisibleFolderPaths(node: TreeViewItem<ProjectFileTreeNode>): string[] {
    return [
        node.item.kind === 'folder' ? node.item.path : undefined,
        ...(node.children?.flatMap(collectVisibleFolderPaths) ?? []),
    ].filter((path): path is string => Boolean(path));
}

function fileDragPayload(file: ProjectFileTreeNode) {
    if (file.kind === 'scene') {
        return sceneDragPayload(file.path, file.name);
    }
    if (file.kind === 'asset') {
        return assetDragPayload(file);
    }
    return undefined;
}

function projectFileIcon(file: ProjectFileTreeNode): SystemIconName {
    if (file.kind === 'folder') {
        return 'folder-open';
    }
    if (file.kind === 'scene') {
        return 'file-box';
    }
    if (file.name.endsWith('.ts') || file.name.endsWith('.tsx')) {
        return 'file-code';
    }
    return 'file';
}

function parentPath(path: string) {
    return path.split('/').slice(0, -1).join('/');
}

function currentFolder(projectTree: ProjectFileTreeNode, selectedPath?: string) {
    const selected = selectedPath ? findFileByPath(projectTree, selectedPath) : undefined;
    if (selected?.kind === 'folder') {
        return selected;
    }
    return selected ? findFileByPath(projectTree, parentPath(selected.path)) ?? projectTree : projectTree;
}

async function loadSceneFile(projectTree: ProjectFileTreeNode, file: ProjectFileTreeNode, t: ReturnType<typeof useI18n>) {
    const currentPath = useEditorStore.getState().openedScenePath;
    const compilerDocument = getCompilerSceneDocument();
    const dirty = compilerDocument && compilerDocument.scenePath === currentPath ? compilerDocument.dirty : false;
    if (dirty && currentPath !== file.path && !window.confirm(t('discardDirtySceneConfirm'))) {
        return false;
    }
    const opened = await openCompilerSceneFile(projectTree, file);
    useEditorStore.getState().setOpenedScene(opened.openedScenePath);
    return true;
}

export function ProjectShelf() {
    useCompilerSceneRevision();
    const t = useI18n();
    const projectTree = useEditorStore((state) => state.projectTree);
    const selectedPath = useEditorStore((state) => state.selectedProjectFilePath);
    const expandedProjectFolders = useEditorStore((state) => state.expandedProjectFolders);
    const setSelectedProjectFile = useEditorStore((state) => state.setSelectedProjectFile);
    const setExpandedProjectFolders = useEditorStore((state) => state.setExpandedProjectFolders);
    const [search, setSearch] = useState('');
    const [actionText, setActionText] = useState('');
    const [createSceneOpen, setCreateSceneOpen] = useState(false);
    const [createSceneDirectoryPath, setCreateSceneDirectoryPath] = useState('');
    const [createSceneError, setCreateSceneError] = useState('');
    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [createFolderDirectoryPath, setCreateFolderDirectoryPath] = useState('');
    const [createFolderError, setCreateFolderError] = useState('');
    const [newSceneName, setNewSceneName] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const refreshProject = useEditorStore((state) => state.refreshProject);

    const query = search.trim().toLowerCase();
    const treeItems = useMemo(() => {
        const root = projectTree ? projectTreeItem(projectTree, query) : undefined;
        return root ? [root] : [];
    }, [projectTree, query]);
    const expandedFolders = useMemo(() => {
        if (query && treeItems[0]) {
            return new Set([
                ...expandedProjectFolders,
                ...collectVisibleFolderPaths(treeItems[0]),
            ]);
        }
        return new Set(expandedProjectFolders);
    }, [expandedProjectFolders, query, treeItems]);
    const selectedFile = projectTree && selectedPath ? findFileByPath(projectTree, selectedPath) : projectTree;
    const folder = projectTree ? currentFolder(projectTree, selectedPath) : undefined;

    if (!projectTree) {
        return null;
    }

    const createSceneDirectory = createSceneDirectoryPath
        ? findFileByPath(projectTree, createSceneDirectoryPath)
        : undefined;
    const createSceneLocation = createSceneDirectory?.kind === 'folder'
        ? createSceneDirectory
        : folder;
    const createFolderDirectory = createFolderDirectoryPath
        ? findFileByPath(projectTree, createFolderDirectoryPath)
        : undefined;
    const createFolderLocation = createFolderDirectory?.kind === 'folder'
        ? createFolderDirectory
        : folder;

    const closeCreateSceneDialog = () => {
        setCreateSceneOpen(false);
        setCreateSceneDirectoryPath('');
        setCreateSceneError('');
        setNewSceneName('');
    };

    const closeCreateFolderDialog = () => {
        setCreateFolderOpen(false);
        setCreateFolderDirectoryPath('');
        setCreateFolderError('');
        setNewFolderName('');
    };

    const openCreateSceneDialog = () => {
        const directory = containingDirectory(projectTree, selectedFile);
        if (!directory) {
            setActionText(t('cannotResolveNewSceneLocation'));
            return;
        }
        setCreateSceneDirectoryPath(directory.path);
        setCreateSceneError('');
        setCreateSceneOpen(true);
    };

    const openCreateFolderDialog = () => {
        const directory = containingDirectory(projectTree, selectedFile);
        if (!directory) {
            setActionText(t('cannotResolveNewFolderLocation'));
            return;
        }
        setCreateFolderDirectoryPath(directory.path);
        setCreateFolderError('');
        setCreateFolderOpen(true);
    };

    const openFile = async (file: ProjectFileTreeNode) => {
        setSelectedProjectFile(file.path);
        try {
            if (file.kind === 'folder') {
                const next = new Set(expandedFolders);
                if (next.has(file.path)) {
                    next.delete(file.path);
                } else {
                    next.add(file.path);
                }
                setExpandedProjectFolders([...next]);
                setActionText(t('folderSelected'));
                return;
            }
            if (file.kind === 'scene') {
                const opened = await loadSceneFile(projectTree, file, t);
                if (opened) {
                    setActionText(t('sceneOpened', { name: file.name }));
                }
                return;
            }
            if (file.kind === 'script' || file.kind === 'component') {
                await openProjectCodeFile(projectTree, file);
                setActionText(t('openedVsCode', { name: file.name }));
                return;
            }
            if (file.kind === 'asset' || file.kind === 'doc' || file.kind === 'unknown') {
                await openProjectDefaultFile(projectTree, file);
                setActionText(t('openedDefaultApp', { name: file.name }));
            }
        } catch (error) {
            setActionText(hostErrorMessage(error));
        }
    };

    const createScene = async () => {
        const name = newSceneName.trim();
        if (!name || !projectTree) {
            return;
        }
        const directory = createSceneDirectoryPath
            ? findFileByPath(projectTree, createSceneDirectoryPath)
            : containingDirectory(projectTree, selectedFile);
        if (directory?.kind !== 'folder') {
            setCreateSceneError(t('cannotResolveNewSceneLocation'));
            return;
        }

        try {
            const created = await createSceneFile(projectTree, directory, name);
            const refreshedTree = await refreshProjectFileTree(projectTree);
            refreshProject(refreshedTree, {
                selectPath: created.path,
                expandPaths: [directory.path],
            });
            setNewSceneName('');
            setCreateSceneOpen(false);
            setCreateSceneDirectoryPath('');
            setCreateSceneError('');
            setActionText(t('sceneCreated', { file: created.fileName }));
        } catch (error) {
            setCreateSceneError(hostErrorMessage(error));
        }
    };

    const createFolderInSelected = async () => {
        const name = newFolderName.trim();
        if (!name || !projectTree) {
            return;
        }
        const directory = createFolderDirectoryPath
            ? findFileByPath(projectTree, createFolderDirectoryPath)
            : containingDirectory(projectTree, selectedFile);
        if (directory?.kind !== 'folder') {
            setCreateFolderError(t('cannotResolveNewFolderLocation'));
            return;
        }

        try {
            const created = await createFolder(directory, name);
            const refreshedTree = await refreshProjectFileTree(projectTree);
            refreshProject(refreshedTree, {
                selectPath: created.path,
                expandPaths: [directory.path, created.path],
            });
            setNewFolderName('');
            setCreateFolderOpen(false);
            setCreateFolderDirectoryPath('');
            setCreateFolderError('');
            setActionText(t('folderCreated', { name: created.name }));
        } catch (error) {
            setCreateFolderError(hostErrorMessage(error));
        }
    };

    return (
        <section className="projectShelf" data-testid="project-shelf" aria-label={t('projectShelf')}>
            <header className="projectShelfHeader">
                <div className="projectShelfTitle">
                    <strong>{t('project')}</strong>
                </div>
                <div className="projectShelfActions" aria-label={t('fileOperationsLabel')}>
                    <Button
                        aria-label={t('createScene')}
                        data-testid="create-scene"
                        icon="plus"
                        onPress={openCreateSceneDialog}
                        title={t('createScene')}
                    />
                    <Button
                        aria-label={t('createFolder')}
                        data-testid="create-folder"
                        icon="folder-plus"
                        onPress={openCreateFolderDialog}
                        title={t('createFolder')}
                    />
                </div>
                <div className="projectShelfPath" title={folder?.path ?? projectTree.path}>{folder?.name ?? projectTree.name}</div>
                <TextField
                    className="projectShelfSearch"
                    inputProps={{ 'aria-label': t('searchProject'), placeholder: t('search') }}
                    onChange={setSearch}
                    value={search}
                />
            </header>
            {createSceneOpen ? (
                <div className="projectShelfDialogBackdrop" role="presentation">
                    <form
                        aria-label={t('createScene')}
                        className="projectShelfDialog"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void createScene();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                closeCreateSceneDialog();
                            }
                        }}
                        role="dialog"
                    >
                        <header>
                            <strong>{t('createScene')}</strong>
                            <small>{t('createSceneLocation', { path: createSceneLocation?.path ?? projectTree.path })}</small>
                        </header>
                        <TextField
                            data-testid="create-scene-name"
                            inputProps={{ 'aria-label': t('sceneName'), autoFocus: true, placeholder: t('sceneName') }}
                            onChange={(value) => {
                                setNewSceneName(value);
                                setCreateSceneError('');
                            }}
                            value={newSceneName}
                        />
                        {createSceneError ? (
                            <p className="projectShelfDialogError" data-testid="create-scene-error" role="alert">
                                {createSceneError}
                            </p>
                        ) : null}
                        <footer>
                            <Button
                                type="button"
                                variant="subtle"
                                onPress={closeCreateSceneDialog}
                            >
                                {t('cancel')}
                            </Button>
                            <Button
                                data-testid="confirm-create-scene"
                                disabled={newSceneName.trim() === ''}
                                type="submit"
                                variant="primary"
                            >
                                {t('create')}
                            </Button>
                        </footer>
                    </form>
                </div>
            ) : null}
            {createFolderOpen ? (
                <div className="projectShelfDialogBackdrop" role="presentation">
                    <form
                        aria-label={t('createFolder')}
                        className="projectShelfDialog"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void createFolderInSelected();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                event.preventDefault();
                                closeCreateFolderDialog();
                            }
                        }}
                        role="dialog"
                    >
                        <header>
                            <strong>{t('createFolder')}</strong>
                            <small>{t('createSceneLocation', { path: createFolderLocation?.path ?? projectTree.path })}</small>
                        </header>
                        <TextField
                            data-testid="create-folder-name"
                            inputProps={{ 'aria-label': t('folderName'), autoFocus: true, placeholder: t('folderName') }}
                            onChange={(value) => {
                                setNewFolderName(value);
                                setCreateFolderError('');
                            }}
                            value={newFolderName}
                        />
                        {createFolderError ? (
                            <p className="projectShelfDialogError" data-testid="create-folder-error" role="alert">
                                {createFolderError}
                            </p>
                        ) : null}
                        <footer>
                            <Button
                                type="button"
                                variant="subtle"
                                onPress={closeCreateFolderDialog}
                            >
                                {t('cancel')}
                            </Button>
                            <Button
                                data-testid="confirm-create-folder"
                                disabled={newFolderName.trim() === ''}
                                type="submit"
                                variant="primary"
                            >
                                {t('create')}
                            </Button>
                        </footer>
                    </form>
                </div>
            ) : null}
            <div className="projectShelfBody">
                <div className="projectShelfTree" data-testid="project-shelf-tree">
                    <TreeView
                        ariaLabel={t('projectFileTreeLabel')}
                        expandedKeys={expandedFolders}
                        items={treeItems}
                        onExpandedChange={(keys) => setExpandedProjectFolders([...keys].map(String))}
                        onItemAction={(file) => setSelectedProjectFile(file.path)}
                        onSelectedKeyChange={(_, file) => setSelectedProjectFile(file.path)}
                        selectedKeys={selectedFile ? [selectedFile.path] : []}
                        renderItem={({ item: file, level }) => {
                            const iconName = projectFileIcon(file);
                            return (
                                <DragSource
                                    as="button"
                                    className={[
                                        'projectFolderRow',
                                        file.kind,
                                        selectedPath === file.path ? 'selected' : '',
                                    ].filter(Boolean).join(' ')}
                                    onDoubleClick={() => void openFile(file)}
                                    payload={fileDragPayload(file)}
                                    style={{ '--tree-indent': `${Math.max(0, level - 1) * 14}px` } as CSSProperties}
                                    title={file.path}
                                    type="button"
                                >
                                    <SystemIcon className={`projectFileIcon projectFileIcon--${iconName}`} name={iconName} />
                                    <span className="projectFileName">{file.name}</span>
                                </DragSource>
                            );
                        }}
                    />
                </div>
            </div>
            <p className="projectShelfAction" aria-live="polite">{actionText}</p>
        </section>
    );
}

export function ProjectPreviewPanel() {
    const t = useI18n();
    const projectTree = useEditorStore((state) => state.projectTree);
    const selectedPath = useEditorStore((state) => state.selectedProjectFilePath);
    const selectedFile = projectTree && selectedPath ? findFileByPath(projectTree, selectedPath) : projectTree;
    const selectedFolderCount = selectedFile?.kind === 'folder'
        ? selectedFile.children?.filter((child) => child.kind === 'folder').length ?? 0
        : 0;

    if (!projectTree) {
        return null;
    }

    return (
        <aside className="projectPreviewPanel" data-testid="project-preview-panel" aria-label={t('selectedItem')}>
            <strong>{selectedFile?.name ?? projectTree.name}</strong>
            <span>{selectedFile?.kind ?? projectTree.kind}</span>
            <small>{selectedFile?.path ?? projectTree.path}</small>
            {selectedFile?.kind === 'scene' ? <p>{t('scenePreviewRule')}</p> : null}
            {selectedFile?.kind === 'asset' ? <p>{t('assetPreviewRule')}</p> : null}
            {selectedFile?.kind === 'script' ? <p>{t('scriptPreviewRule')}</p> : null}
            {selectedFile?.kind === 'component' ? <p>{t('componentPreviewRule')}</p> : null}
            {selectedFile?.kind === 'doc' ? <p>{t('docPreviewRule')}</p> : null}
            {selectedFile?.kind === 'folder' ? <p>{t('folderPreviewRule', { count: selectedFolderCount })}</p> : null}
        </aside>
    );
}
