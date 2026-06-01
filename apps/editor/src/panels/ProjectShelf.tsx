import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, DragSource, TextField, TreeView } from '../components/system';
import type { TreeViewItem } from '../components/system';
import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import {
    componentDragPayload,
    sceneDragPayload,
} from '../services/dragPayload';
import { hostErrorMessage } from '../services/hostBridge';
import {
    assetDragPayload,
    componentTypeFromPath,
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

function folderTreeItem(folder: ProjectFileTreeNode): TreeViewItem<ProjectFileTreeNode> {
    return {
        children: folder.children
            ?.filter((file) => file.kind === 'folder')
            .map(folderTreeItem),
        className: folder.kind,
        id: folder.path,
        item: folder,
        textValue: folder.name,
    };
}

function fileDragPayload(file: ProjectFileTreeNode) {
    if (file.kind === 'scene') {
        return sceneDragPayload(file.path, file.name);
    }
    if (file.kind === 'component') {
        const componentType = componentTypeFromPath(file.path);
        return componentType ? componentDragPayload(componentType, file.name) : undefined;
    }
    if (file.kind === 'asset') {
        return assetDragPayload(file);
    }
    return undefined;
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

function currentFolderFiles(folder: ProjectFileTreeNode, search: string) {
    const query = search.trim().toLowerCase();
    const files = folder.children?.filter((file) => file.kind !== 'folder') ?? [];
    if (!query) {
        return files;
    }
    return files.filter((file) => file.name.toLowerCase().includes(query));
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
    const [newSceneName, setNewSceneName] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const refreshProject = useEditorStore((state) => state.refreshProject);

    const expandedFolders = useMemo(() => new Set(expandedProjectFolders), [expandedProjectFolders]);
    const treeItems = useMemo(() => projectTree ? [folderTreeItem(projectTree)] : [], [projectTree]);
    const selectedFile = projectTree && selectedPath ? findFileByPath(projectTree, selectedPath) : projectTree;
    const folder = projectTree ? currentFolder(projectTree, selectedPath) : undefined;
    const contentFiles = useMemo(() => {
        if (!folder) {
            return [];
        }
        return currentFolderFiles(folder, search);
    }, [folder, search]);

    if (!projectTree) {
        return null;
    }

    const createSceneDirectory = createSceneDirectoryPath
        ? findFileByPath(projectTree, createSceneDirectoryPath)
        : undefined;
    const createSceneLocation = createSceneDirectory?.kind === 'folder'
        ? createSceneDirectory
        : folder;

    const closeCreateSceneDialog = () => {
        setCreateSceneOpen(false);
        setCreateSceneDirectoryPath('');
        setCreateSceneError('');
        setNewSceneName('');
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
        const directory = containingDirectory(projectTree, selectedFile);
        if (!directory) {
            return;
        }
        const created = await createFolder(directory, name);
        setNewFolderName('');
        const refreshedTree = await refreshProjectFileTree(projectTree);
        refreshProject(refreshedTree, {
            expandPaths: [directory.path, created.path],
        });
        setActionText(t('folderCreated', { name: created.name }));
    };

    return (
        <section className="projectShelf" data-testid="project-shelf" aria-label={t('projectShelf')}>
            <header className="projectShelfHeader">
                <div className="projectShelfTitle">
                    <button type="button" aria-label={t('collapseProjectShelf')} title={t('collapseProjectShelf')}>▾</button>
                    <strong>{t('project')}</strong>
                </div>
                <div className="projectShelfPath" title={folder?.path ?? projectTree.path}>{folder?.path ?? projectTree.path}</div>
                <TextField
                    className="projectShelfSearch"
                    inputProps={{ 'aria-label': t('searchProject'), placeholder: t('search') }}
                    onChange={setSearch}
                    value={search}
                />
                <div className="projectShelfDetailsTitle">{t('selectedItem')}</div>
            </header>
            <div className="projectShelfToolbar">
                <Button data-testid="create-scene" icon="plus" onPress={openCreateSceneDialog}>
                    {t('createScene')}
                </Button>
                <div className="createSceneRow">
                    <TextField
                        inputProps={{ 'aria-label': t('folderName'), placeholder: t('folderName') }}
                        onChange={setNewFolderName}
                        value={newFolderName}
                    />
                    <Button disabled={newFolderName.trim() === ''} icon="folder-plus" onPress={() => void createFolderInSelected()}>
                        {t('createFolder')}
                    </Button>
                </div>
            </div>
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
            <div className="projectShelfBody">
                <div className="projectShelfTree" data-testid="project-shelf-tree">
                    <TreeView
                        ariaLabel={t('projectFileTreeLabel')}
                        expandedKeys={expandedFolders}
                        items={treeItems}
                        onExpandedChange={(keys) => setExpandedProjectFolders([...keys].map(String))}
                        onItemAction={(file) => setSelectedProjectFile(file.path)}
                        onSelectedKeyChange={(_, file) => setSelectedProjectFile(file.path)}
                        selectedKeys={folder ? [folder.path] : []}
                        renderItem={({ item: file, level }) => (
                            <button
                                className={[
                                    'projectFolderRow',
                                    file.kind,
                                    selectedPath === file.path ? 'selected' : '',
                                ].filter(Boolean).join(' ')}
                                onDoubleClick={() => void openFile(file)}
                                style={{ '--tree-indent': `${Math.max(0, level - 1) * 14}px` } as CSSProperties}
                                title={file.path}
                                type="button"
                            >
                                {file.name}
                            </button>
                        )}
                    />
                </div>
                <div className="projectShelfContents" data-testid="project-shelf-contents">
                    {contentFiles.map((file) => (
                        <DragSource
                            as="div"
                            className={[
                                'projectFileCard',
                                file.kind,
                                selectedPath === file.path ? 'selected' : '',
                            ].filter(Boolean).join(' ')}
                            key={file.path}
                            onClick={() => setSelectedProjectFile(file.path)}
                            onDoubleClick={() => void openFile(file)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    void openFile(file);
                                }
                            }}
                            payload={fileDragPayload(file)}
                            role="button"
                            tabIndex={0}
                            title={file.path}
                        >
                            <strong>{file.name}</strong>
                            <span>{file.kind === 'scene' ? t('dragSceneToHierarchy') : file.kind}</span>
                        </DragSource>
                    ))}
                </div>
                <aside className="projectShelfDetails">
                    <strong>{selectedFile?.name ?? projectTree.name}</strong>
                    <span>{selectedFile?.kind ?? projectTree.kind}</span>
                    <small>{selectedFile?.path ?? projectTree.path}</small>
                    {selectedFile?.kind === 'scene' ? <p>{t('scenePreviewRule')}</p> : null}
                    {selectedFile?.kind === 'asset' ? <p>{t('assetPreviewRule')}</p> : null}
                    {selectedFile?.kind === 'script' ? <p>{t('scriptPreviewRule')}</p> : null}
                    {actionText ? <p className="projectShelfAction">{actionText}</p> : null}
                </aside>
            </div>
        </section>
    );
}
