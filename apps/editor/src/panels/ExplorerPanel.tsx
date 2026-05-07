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
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n';
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
    openProjectCodeFile,
    openProjectDefaultFile,
    readProjectFileBytes,
    readProjectFileText,
    refreshProjectFileTree,
    renameProjectEntry,
} from '../services/projectFileTree';
import { hostErrorMessage } from '../services/hostBridge';
import { getNodeLocator, useDocumentRevision } from './common';

interface ImportMetaWithEnv extends ImportMeta {
    env?: Record<string, string | boolean | undefined>;
}

function editorProjectPath() {
    const env = (import.meta as ImportMetaWithEnv).env;
    const path = env?.VITE_PIXIFACT_PROJECT_ROOT;
    return typeof path === 'string' && path.trim() ? path.trim() : undefined;
}

function folderName(path: string) {
    const normalized = path.replace(/[\\/]+$/, '');
    return normalized.split(/[\\/]/).pop() || path;
}

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

function fileAction(file: ProjectFileTreeNode, mode: 'select' | 'open', t: Translate) {
    if (file.kind === 'asset') {
        return mode === 'open'
            ? t('assetOpened', { name: file.name })
            : t('assetSelected');
    }
    if (file.kind === 'component') {
        return t('componentSelected', { name: file.name });
    }
    if (file.kind === 'script') {
        return t('scriptSelected');
    }
    if (file.kind === 'doc') {
        return t('docSelected');
    }
    if (file.kind === 'prefab') {
        return mode === 'open'
            ? t('prefabOpened', { name: file.name })
            : t('prefabSelected');
    }
    if (file.kind === 'folder') {
        return t('folderSelected');
    }
    return t('readonlySelected');
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

function canOpenInVsCode(file: ProjectFileTreeNode) {
    return file.kind === 'script' || file.kind === 'component';
}

function canOpenWithDefaultApp(file: ProjectFileTreeNode) {
    return file.kind === 'asset' || file.kind === 'doc' || file.kind === 'unknown';
}

function rootLocator(prefab: PrefabSpec) {
    return getNodeLocator(prefab.root);
}

async function loadPrefabFile(document: EditorDocument, file: ProjectFileTreeNode) {
    const projectTree = useEditorStore.getState().projectTree;
    if (!projectTree) {
        return;
    }
    const content = await readProjectFileText(projectTree, file);
    document.load(content);
    document.setSelection({ type: 'node', node: rootLocator(document.prefab) });
    refreshEditorDocument();
}

function EmptyProjectState() {
    const t = useI18n();

    return (
        <section className="filePreview">
            <span>{t('project')}</span>
            <strong>{t('projectNotOpened')}</strong>
            <small>{t('projectOpenHint')}</small>
            <div className="fileRule">{t('projectOpenRule')}</div>
        </section>
    );
}

type ExplorerAccordionSection = 'project' | 'library';

export function ResourceExplorer({ document }: { document: EditorDocument; revision?: number }) {
    useDocumentRevision();
    const t = useI18n();
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
    const [actionText, setActionText] = useState(() => t('openFolderActionHint'));
    const [openSection, setOpenSection] = useState<ExplorerAccordionSection>('project');
    const expandedFolders = useMemo(() => new Set(expandedProjectFolders), [expandedProjectFolders]);

    const fileTreeItems = useMemo(() => {
        if (!projectTree) {
            return [];
        }
        return [fileTreeItem(projectTree)];
    }, [projectTree]);
    const selectedFile = projectTree && selectedPath ? findFileInTree(projectTree, selectedPath) ?? projectTree : projectTree;
    const devProjectRootPath = editorProjectPath();
    const projectPath = projectTree?.systemPath ?? projectTree?.path ?? devProjectRootPath ?? t('saveStatusClosed');
    const selectedBasicComponent = selectedPath?.startsWith('library/basic/')
        ? basicComponentLibrary.find((item) => selectedPath === `library/basic/${item.kind}`)
        : undefined;

    useEffect(() => {
        if (!projectTree) {
            setImagePreviewUrl(undefined);
            return undefined;
        }
        if (selectedFile?.kind !== 'asset') {
            setImagePreviewUrl(undefined);
            return undefined;
        }

        let revoked = false;
        let objectUrl: string | undefined;
        void readProjectFileBytes(projectTree, selectedFile)
            .then((bytes) => {
                objectUrl = URL.createObjectURL(new Blob([bytes.slice().buffer]));
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
    }, [projectTree, selectedFile]);

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
        setActionText(fileAction(file, 'select', t));
    };

    const selectBasicComponent = (kind: string) => {
        const item = basicComponentLibrary.find((candidate) => candidate.kind === kind);
        if (!item) {
            return;
        }
        setSelectedProjectFile(`library/basic/${item.kind}`);
        setRenameName('');
        setActionText(t('basicComponentDragHint', { name: t(item.nameKey) }));
    };

    const openFile = async (file: ProjectFileTreeNode) => {
        setSelectedProjectFile(file.path);
        if (file.kind === 'folder') {
            toggleFolder(file);
            setActionText(fileAction(file, 'open', t));
            return;
        }
        if (file.kind === 'prefab') {
            await loadPrefabFile(document, file);
            setOpenedPrefab(file.path);
        } else if (file.kind === 'asset' || file.kind === 'unknown') {
            await openFileWithDefaultApp(file);
            return;
        } else if (file.kind === 'script' || file.kind === 'component') {
            await openCodeFile(file);
            return;
        } else if (file.kind === 'doc') {
            await openFileWithDefaultApp(file);
            return;
        }
        setActionText(fileAction(file, 'open', t));
    };

    const openCodeFile = async (file: ProjectFileTreeNode) => {
        if (!projectTree) {
            return;
        }
        try {
            await openProjectCodeFile(projectTree, file);
            setActionText(t('openedVsCode', { name: file.name }));
        } catch (error) {
            setActionText(hostErrorMessage(error));
        }
    };

    const openFileWithDefaultApp = async (file: ProjectFileTreeNode) => {
        if (!projectTree) {
            return;
        }
        try {
            await openProjectDefaultFile(projectTree, file);
            setActionText(t('openedDefaultApp', { name: file.name }));
        } catch (error) {
            setActionText(hostErrorMessage(error));
        }
    };

    const refreshFileTree = async (selectPath?: string, expandPaths: string[] = []) => {
        if (!projectTree) {
            return;
        }
        const refreshedTree = await refreshProjectFileTree(projectTree);
        refreshProject(refreshedTree, { selectPath, expandPaths });
        setActionText(t('projectFileTreeRefreshed'));
    };

    const createFolderInSelectedDirectory = async () => {
        const name = newFolderName.trim();
        if (!name || !projectTree) {
            return;
        }
        const directory = containingDirectory(projectTree, selectedFile);
        if (!directory) {
            setActionText(t('cannotResolveNewFolderLocation'));
            return;
        }

        try {
            const created = await createFolder(directory, name);
            setNewFolderName('');
            await refreshFileTree(created.path, [directory.path, created.path]);
            setActionText(t('folderCreated', { name: created.name }));
        } catch (error) {
            setActionText(error instanceof Error ? error.message : t('createFolderFailed'));
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
        const refreshedTree = await refreshProjectFileTree(projectTree);
        refreshProject(refreshedTree, { selectPath: created.path, expandPaths: [directory.path] });
        document.load(created.content);
        document.setSelection({ type: 'node', node: rootLocator(document.prefab) });
        setOpenedPrefab(created.path);
        setNewPrefabName('');
        setActionText(t('prefabCreatedAndOpened', { file: created.fileName }));
        refreshEditorDocument();
    };

    const beginRename = (file: ProjectFileTreeNode) => {
        if (!projectTree || selectedBasicComponent) {
            return;
        }
        if (!canRenameFile(projectTree, file, openedPrefabPath, document.dirty)) {
            setActionText(file.path === projectTree.path
                ? t('cannotRenameRoot')
                : t('cannotRenameDirtyPrefab'));
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
            setActionText(t('cannotRenameRoot'));
            return;
        }
        if (file.path === openedPrefabPath && document.dirty) {
            setActionText(t('cannotRenameDirtyPrefab'));
            return;
        }

        try {
            const renamed = await renameProjectEntry(projectTree, file, nextName);
            const expandPath = file.path.split('/').slice(0, -1).join('/');
            await refreshFileTree(renamed.path, [expandPath]);
            setRenameName(renamed.name);
            setRenameTargetPath(undefined);
            setActionText(t('renamedTo', { name: renamed.name }));
        } catch (error) {
            setActionText(error instanceof Error ? error.message : t('renameFailed'));
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
            setActionText(t('cannotDeleteRoot'));
            return;
        }
        if (file.path === openedPrefabPath && document.dirty) {
            setActionText(t('cannotDeleteDirtyPrefab'));
            return;
        }
        const confirmed = window.confirm(t('confirmDelete', { name: file.name }));
        if (!confirmed) {
            return;
        }

        try {
            await deleteProjectEntry(projectTree, file);
            await refreshFileTree(file.path);
            setRenameTargetPath(undefined);
            setActionText(t('deletedFile', { name: file.name }));
        } catch (error) {
            setActionText(error instanceof Error ? error.message : t('deleteFailed'));
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
        setActionText(t('inputFolderNameIn', { name: directory.name }));
    };

    const createPrefabInDirectory = async (directory: ProjectFileTreeNode) => {
        setSelectedProjectFile(directory.path);
        setNewPrefabName('');
        setActionText(t('inputPrefabNameIn', { name: directory.name }));
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
            <div className="explorerTitle">{t('explorerTitle')}</div>
            <div className="searchBox" data-testid="project-path" title={projectPath}>{folderName(projectPath)}</div>
            <section className="panelSection">
                <section className="accordionSection" data-testid="project-file-section">
                    <button
                        aria-expanded={openSection === 'project'}
                        className="accordionHeader"
                        onClick={() => setOpenSection('project')}
                        type="button"
                    >
                        {t('projectFilesWithCount', { count: countProjectFileTree(projectTree) })}
                    </button>
                    <div
                        aria-hidden={openSection !== 'project'}
                        className={openSection === 'project' ? 'accordionPanel open' : 'accordionPanel'}
                    >
                        <div className="accordionContent">
                            <div className="fileOperationBar" aria-label={t('fileOperationsLabel')}>
                                <Button icon="refresh" onPress={() => void refreshFileTree()}>{t('refresh')}</Button>
                                <Button disabled={selectedBasicComponent !== undefined || !selectedFile || !canRenameFile(projectTree, selectedFile, openedPrefabPath, document.dirty)} icon="edit" onPress={() => selectedFile ? beginRename(selectedFile) : undefined}>
                                    {t('rename')}
                                </Button>
                                <Button disabled={selectedBasicComponent !== undefined || !selectedFile || !canDeleteFile(projectTree, selectedFile, openedPrefabPath, document.dirty)} icon="trash" onPress={() => void deleteSelectedEntry()} variant="danger">
                                    {t('delete')}
                                </Button>
                            </div>
                            <div className="createPrefabRow">
                                <TextField
                                    data-testid="rename-entry-name"
                                    disabled={selectedBasicComponent !== undefined || selectedFile?.path === projectTree.path}
                                    inputProps={{ 'aria-label': t('renameEntryLabel'), placeholder: t('renameEntryLabel') }}
                                    onChange={setRenameName}
                                    value={renameName}
                                />
                                <Button
                                    data-testid="rename-entry"
                                    disabled={selectedBasicComponent !== undefined || selectedFile?.path === projectTree.path || renameName.trim() === ''}
                                    onPress={() => void renameSelectedEntry()}
                                >
                                    {t('apply')}
                                </Button>
                            </div>
                            <div className="createPrefabRow">
                                <TextField
                                    data-testid="new-folder-name"
                                    inputProps={{ 'aria-label': t('folderName'), placeholder: t('folderName') }}
                                    onChange={setNewFolderName}
                                    value={newFolderName}
                                />
                                <Button data-testid="create-folder" disabled={newFolderName.trim() === ''} icon="folder-plus" onPress={() => void createFolderInSelectedDirectory()}>
                                    {t('createFolder')}
                                </Button>
                            </div>
                            <div className="createPrefabRow">
                                <TextField
                                    data-testid="new-prefab-name"
                                    inputProps={{ 'aria-label': t('prefabName'), placeholder: t('prefabName') }}
                                    onChange={setNewPrefabName}
                                    value={newPrefabName}
                                />
                                <Button data-testid="create-prefab" disabled={newPrefabName.trim() === ''} icon="plus" onPress={() => void createPrefab()}>
                                    {t('createPrefab')}
                                </Button>
                            </div>
                            <TreeView
                                ariaLabel={t('projectFileTreeLabel')}
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
                                                aria-label={t('renameEntryLabel')}
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
                                                aria-label={t('moreActions', { name: file.name })}
                                                className="fileMoreButton"
                                                icon="more"
                                                onPress={() => selectFile(file)}
                                                title={t('moreActionsTitle')}
                                                variant="subtle"
                                            />
                                            <Popover className="fileMenuPopover">
                                                <Menu className="fileMenu" aria-label={t('fileActionsLabel', { name: file.name })}>
                                                    <MenuItem onAction={() => void openFile(file)}>
                                                        {file.kind === 'folder' ? t('toggleExpand') : file.kind === 'prefab' ? t('open') : t('select')}
                                                    </MenuItem>
                                                    {file.kind === 'folder' ? (
                                                        <>
                                                            <MenuItem onAction={() => void createFolderInDirectory(file)}>
                                                                {t('createFolder')}
                                                            </MenuItem>
                                                            <MenuItem onAction={() => void createPrefabInDirectory(file)}>
                                                                {t('createPrefab')}
                                                            </MenuItem>
                                                        </>
                                                    ) : null}
                                                    {canOpenInVsCode(file) ? (
                                                        <MenuItem onAction={() => void openCodeFile(file)}>
                                                            {t('openVsCode')}
                                                        </MenuItem>
                                                    ) : null}
                                                    {canOpenWithDefaultApp(file) ? (
                                                        <MenuItem onAction={() => void openFileWithDefaultApp(file)}>
                                                            {t('openDefaultApp')}
                                                        </MenuItem>
                                                    ) : null}
                                                    <MenuItem
                                                        isDisabled={!canRenameFile(projectTree, file, openedPrefabPath, document.dirty)}
                                                        onAction={() => beginRename(file)}
                                                    >
                                                        {t('rename')}
                                                    </MenuItem>
                                                    <MenuItem
                                                        isDisabled={!canDeleteFile(projectTree, file, openedPrefabPath, document.dirty)}
                                                        onAction={() => void deleteEntry(file)}
                                                    >
                                                        {t('delete')}
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
                        {t('basicComponentLibrary')}
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
                                        payload={basicComponentDragPayload(item.kind, t(item.nameKey))}
                                        title={t(item.detailKey)}
                                    >
                                        <strong>{t(item.nameKey)}</strong>
                                    </DragSource>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
                <section className="filePreview" data-testid="file-preview">
                    <div className="filePreviewContent">
                        <span>{t('file')}</span>
                        <strong>{selectedBasicComponent ? t(selectedBasicComponent.nameKey) : selectedFile?.name ?? projectTree.name}</strong>
                        <small>{selectedBasicComponent ? t('basicComponentLibrary') : selectedFile?.path ?? projectTree.path}</small>
                        {selectedBasicComponent ? (
                            <div className="fileRule">{t('basicComponentPreviewRule', { detail: t(selectedBasicComponent.detailKey) })}</div>
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
                                <p>{t('assetPreviewRule')}</p>
                                <Button icon="external" onPress={() => void openFileWithDefaultApp(selectedFile)}>
                                    {t('openDefaultApp')}
                                </Button>
                            </div>
                        ) : selectedFile?.kind === 'component' ? (
                            <div className="fileRule">
                                {t('componentPreviewRule')}
                                <div className="filePreviewActions">
                                    <Button icon="external" onPress={() => void openCodeFile(selectedFile)}>
                                        {t('openVsCode')}
                                    </Button>
                                </div>
                            </div>
                        ) : selectedFile?.kind === 'script' ? (
                            <div className="fileRule">
                                {t('scriptPreviewRule')}
                                <div className="filePreviewActions">
                                    <Button icon="external" onPress={() => void openCodeFile(selectedFile)}>
                                        {t('openVsCode')}
                                    </Button>
                                </div>
                            </div>
                        ) : selectedFile?.kind === 'doc' ? (
                            <div className="fileRule">
                                {t('docPreviewRule')}
                                <div className="filePreviewActions">
                                    <Button icon="external" onPress={() => void openFileWithDefaultApp(selectedFile)}>
                                        {t('openDefaultApp')}
                                    </Button>
                                </div>
                            </div>
                        ) : selectedFile?.kind === 'prefab' ? (
                            <div className="fileRule">{t('prefabPreviewRule')}</div>
                        ) : selectedFile?.kind === 'folder' ? (
                            <div className="fileRule">{t('folderPreviewRule', { count: collectFolderPaths(selectedFile).length - 1 })}</div>
                        ) : (
                            <div className="fileRule">{t('unknownPreviewRule')}</div>
                        )}
                        <div className="fileAction">{actionText}</div>
                    </div>
                </section>
            </section>
        </div>
    );
}
