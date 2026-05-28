import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { DragSource, TextField, TreeView } from '../components/system';
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
    findFileByPath,
    openCompilerSceneFile,
    openProjectCodeFile,
    openProjectDefaultFile,
} from '../services/projectFileTree';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { useCompilerSceneRevision } from './common';

function fileTreeItem(file: ProjectFileTreeNode): TreeViewItem<ProjectFileTreeNode> {
    return {
        children: file.kind === 'folder' ? file.children?.map(fileTreeItem) : undefined,
        className: file.kind,
        id: file.path,
        item: file,
        textValue: file.name,
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

function flattenFiles(node: ProjectFileTreeNode): ProjectFileTreeNode[] {
    return [
        node,
        ...(node.children ?? []).flatMap(flattenFiles),
    ];
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

    const expandedFolders = useMemo(() => new Set(expandedProjectFolders), [expandedProjectFolders]);
    const treeItems = useMemo(() => projectTree ? [fileTreeItem(projectTree)] : [], [projectTree]);
    const selectedFile = projectTree && selectedPath ? findFileByPath(projectTree, selectedPath) : projectTree;
    const folder = projectTree ? currentFolder(projectTree, selectedPath) : undefined;
    const contentFiles = useMemo(() => {
        if (!projectTree) {
            return [];
        }
        const query = search.trim().toLowerCase();
        if (query) {
            return flattenFiles(projectTree)
                .filter((file) => file !== projectTree && file.name.toLowerCase().includes(query));
        }
        return folder?.children ?? projectTree.children ?? [];
    }, [folder, projectTree, search]);

    if (!projectTree) {
        return null;
    }

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
            <div className="projectShelfBody">
                <TreeView
                    ariaLabel={t('projectFileTreeLabel')}
                    expandedKeys={expandedFolders}
                    items={treeItems}
                    onExpandedChange={(keys) => setExpandedProjectFolders([...keys].map(String))}
                    onItemAction={(file) => setSelectedProjectFile(file.path)}
                    onSelectedKeyChange={(_, file) => setSelectedProjectFile(file.path)}
                    selectedKeys={selectedPath ? [selectedPath] : []}
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
                <div className="projectShelfContents" data-testid="project-shelf-contents">
                    {contentFiles.map((file) => (
                        <DragSource
                            as="button"
                            className={[
                                'projectFileCard',
                                file.kind,
                                selectedPath === file.path ? 'selected' : '',
                            ].filter(Boolean).join(' ')}
                            key={file.path}
                            onClick={() => setSelectedProjectFile(file.path)}
                            onDoubleClick={() => void openFile(file)}
                            payload={fileDragPayload(file)}
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
