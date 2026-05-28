# Editor Fixed Scene Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dockview-first Pixifact editor shell with a fixed Scene workbench containing Hierarchy, Preview, Inspector, Project Shelf, and Status Bar.

**Architecture:** Keep the existing compiler Scene document/controller, hierarchy, preview, inspector, host bridge, and project file services. Extract a focused Project Shelf from `ExplorerPanel.tsx`, then compose the fixed workbench in `EditorApp.tsx` without Dockview. Use CSS grid for stable areas and keep Scene/resource data in existing controllers/services, not React state copies.

**Tech Stack:** React 19, TypeScript, Zustand, Pixifact compiler Scene document APIs, existing editor system controls, Vitest, Vite.

---

## File Structure

- Modify `apps/editor/src/EditorApp.tsx`: remove Dockview shell, compose fixed workbench, keep project open/save/run/sync/live bridge logic.
- Create `apps/editor/src/panels/ProjectShelf.tsx`: plain project file browser with folder tree, current folder contents, selected item details, search, drag payloads, and double-click behavior.
- Modify `apps/editor/src/panels/ExplorerPanel.tsx`: either remove old resource explorer usage from the app or leave it as an unused legacy panel until a later cleanup task; do not route the new workbench through it.
- Modify `apps/editor/src/panels/HierarchyPanel.tsx`: add a small wrapper for compiler hierarchy in fixed workbench if needed; preserve existing `.scene` drag-to-tree behavior.
- Modify `apps/editor/src/panels/ViewportPanel.tsx`: keep existing preview behavior; allow fixed workbench styling through wrapper classes.
- Modify `apps/editor/src/panels/InspectorPanel.tsx`: keep existing compiler inspector behavior; allow fixed workbench styling through wrapper classes.
- Modify `apps/editor/src/styles.css`: add fixed workbench layout, Project Shelf layout, minimal project header, independent status bar, and remove Dockview-dependent visual assumptions from the main shell.
- Modify `apps/editor/src/i18n.ts`: add labels for Project Shelf and fixed workbench text.
- Modify `tests/agent-panel-ui.test.ts`: update EditorApp status assertions for the fixed status bar and add smoke coverage for the new workbench structure.
- Create `tests/editor-workbench-ui.test.ts`: focused UI tests for fixed workbench layout, Project Shelf selection, and absence of persistent create/more controls.
- Optionally modify `package.json` only if `dockview` becomes unused and removal is part of the task; prefer leaving dependency cleanup for a final pass after imports are gone.

## Task 1: Add Fixed Workbench Smoke Test

**Files:**
- Modify: `tests/agent-panel-ui.test.ts`
- Create: `tests/editor-workbench-ui.test.ts`

- [ ] **Step 1: Add a fixed workbench test file**

Create `tests/editor-workbench-ui.test.ts` with this initial failing test. Reuse the same host mocking pattern from `tests/agent-panel-ui.test.ts`; copy the helper data exactly so this test can run independently.

```ts
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFileTreeNode } from '../apps/editor/src/services/projectFileTree';
import { useEditorStore } from '../apps/editor/src/editorStore';
import { EditorApp } from '../apps/editor/src/EditorApp';
import {
    loadCompilerSceneDocument,
    resetCompilerSceneDocument,
} from '../apps/editor/src/document/compilerSceneDocumentController';
import { parseSceneTemplate } from '../packages/pixifact/src/compiler/templateParser';

const host = vi.hoisted(() => ({
    files: new Map<string, string>(),
    fileChangedHandler: undefined as ((event: { projectRootPath: string; path: string; kind: string }) => void) | undefined,
}));

function missingHostCall(name: string) {
    return vi.fn(async () => {
        throw new Error(`Unexpected host call ${name}.`);
    });
}

vi.mock('../apps/editor/src/services/hostBridge', () => ({
    createHostProjectDirectory: missingHostCall('createHostProjectDirectory'),
    createHostProjectFile: missingHostCall('createHostProjectFile'),
    deleteHostProjectEntry: missingHostCall('deleteHostProjectEntry'),
    openHostCodeFile: missingHostCall('openHostCodeFile'),
    openHostDefaultFile: missingHostCall('openHostDefaultFile'),
    pickHostProjectFolder: missingHostCall('pickHostProjectFolder'),
    readHostProjectFileBytes: vi.fn(async () => new Uint8Array()),
    readHostProjectFileText: vi.fn(async (_projectRootPath: string, filePath: string) => {
        const content = host.files.get(filePath);
        if (content === undefined) {
            throw new Error(`Missing test file ${filePath}.`);
        }
        return content;
    }),
    readHostProjectFileTree: vi.fn(async () => projectTree()),
    renameHostProjectEntry: missingHostCall('renameHostProjectEntry'),
    watchHostProjectFiles: vi.fn(async () => {}),
    listenHostProjectFileChanged: vi.fn(async (handler: (event: { projectRootPath: string; path: string; kind: string }) => void) => {
        host.fileChangedHandler = handler;
        return () => {
            host.fileChangedHandler = undefined;
        };
    }),
    writeHostProjectFileText: vi.fn(async () => {}),
}));

function projectTree(): ProjectFileTreeNode {
    return {
        id: 'GameProject',
        name: 'GameProject',
        path: 'GameProject',
        kind: 'folder',
        depth: 0,
        systemPath: '/repo/GameProject',
        projectRootPath: '/repo/GameProject',
        children: [{
            id: 'GameProject/scenes',
            name: 'scenes',
            path: 'GameProject/scenes',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/scenes/Button.scene',
                name: 'Button.scene',
                path: 'GameProject/scenes/Button.scene',
                kind: 'scene',
                depth: 2,
            }, {
                id: 'GameProject/scenes/Child.scene',
                name: 'Child.scene',
                path: 'GameProject/scenes/Child.scene',
                kind: 'scene',
                depth: 2,
            }],
        }, {
            id: 'GameProject/assets',
            name: 'assets',
            path: 'GameProject/assets',
            kind: 'folder',
            depth: 1,
            children: [{
                id: 'GameProject/assets/play.png',
                name: 'play.png',
                path: 'GameProject/assets/play.png',
                kind: 'asset',
                depth: 2,
            }],
        }],
    };
}

function currentScene() {
    return [
        '<Scene name="Button" script="src/scenes/Button.ts">',
        '  <Text id="label" text="Start" />',
        '</Scene>',
        '',
    ].join('\n');
}

function setEditorProject() {
    useEditorStore.setState({
        language: 'zh-CN',
        projectName: 'GameProject',
        projectTree: projectTree(),
        selectedProjectFilePath: 'GameProject/scenes/Button.scene',
        openedScenePath: 'GameProject/scenes/Button.scene',
        expandedProjectFolders: ['GameProject', 'GameProject/scenes'],
        expandedHierarchyNodesByScene: {},
    });
    loadCompilerSceneDocument({
        scenePath: 'GameProject/scenes/Button.scene',
        template: parseSceneTemplate(currentScene()),
        sceneInterfaces: {},
    });
}

async function renderEditorApp() {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(createElement(EditorApp));
        await Promise.resolve();
    });
    return {
        container,
        async cleanup() {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        },
    };
}

function textContent(container: HTMLElement) {
    return container.textContent ?? '';
}

beforeEach(() => {
    localStorage.clear();
    host.files = new Map([
        ['GameProject/scenes/Button.scene', currentScene()],
        ['GameProject/scenes/Child.scene', '<Scene name="Child" />\n'],
    ]);
    resetCompilerSceneDocument();
    setEditorProject();
});

afterEach(() => {
    resetCompilerSceneDocument();
    document.body.innerHTML = '';
});

describe('Editor fixed workbench UI', () => {
    it('renders the fixed Scene workbench instead of Dockview panels', async () => {
        const view = await renderEditorApp();
        try {
            expect(view.container.querySelector('[data-testid="editor-workbench"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-hierarchy"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-preview"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="workbench-inspector"]')).toBeTruthy();
            expect(view.container.querySelector('[data-testid="project-shelf"]')).toBeTruthy();
            expect(view.container.querySelector('.dockHost')).toBeFalsy();
            expect(view.container.querySelector('.dv-dockview')).toBeFalsy();
            expect(textContent(view.container)).toContain('Button.scene');
            expect(textContent(view.container)).toContain('Project');
        } finally {
            await view.cleanup();
        }
    });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

Expected: FAIL because `data-testid="editor-workbench"` and the fixed workbench regions do not exist yet.

- [ ] **Step 3: Add a status-bar assertion to the existing external sync test**

In `tests/agent-panel-ui.test.ts`, update the test named `shows successful external compiler Scene refresh feedback in the status bar` after the existing sync assertion:

```ts
expect(view.container.querySelector('[data-testid="workbench-status-bar"]')).toBeTruthy();
expect(textContent(view.container)).toContain('Sync: 外部 Scene 修改已刷新，校验通过。');
```

- [ ] **Step 4: Run the related existing test and verify current behavior**

Run:

```bash
bunx --no-install vitest run tests/agent-panel-ui.test.ts
```

Expected: FAIL only on the new `workbench-status-bar` assertion. Existing proposal and sync behavior should continue to pass.

- [ ] **Step 5: Commit the failing tests**

```bash
git add tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts
git commit -m "test: capture fixed editor workbench shell"
```

## Task 2: Extract Minimal Project Shelf

**Files:**
- Create: `apps/editor/src/panels/ProjectShelf.tsx`
- Modify: `apps/editor/src/i18n.ts`
- Test: `tests/editor-workbench-ui.test.ts`

- [ ] **Step 1: Add Project Shelf behavior tests**

Append this test to `tests/editor-workbench-ui.test.ts` inside `describe('Editor fixed workbench UI', ...)`:

```ts
it('shows a plain Project Shelf without persistent file management actions', async () => {
    const view = await renderEditorApp();
    try {
        const shelf = view.container.querySelector('[data-testid="project-shelf"]');
        expect(shelf).toBeTruthy();
        expect(shelf?.textContent).toContain('Project');
        expect(shelf?.textContent).toContain('GameProject/scenes');
        expect(shelf?.textContent).toContain('Button.scene');
        expect(shelf?.textContent).toContain('Child.scene');
        expect(shelf?.textContent).toContain('play.png');
        expect(shelf?.querySelector('[data-testid="create-scene"]')).toBeFalsy();
        expect(shelf?.querySelector('[data-testid="create-folder"]')).toBeFalsy();
        expect(shelf?.querySelector('[data-testid="rename-entry"]')).toBeFalsy();
        expect(shelf?.textContent).not.toContain('All');
        expect(shelf?.textContent).not.toContain('Images');
        expect(shelf?.textContent).not.toContain('Scripts');
        expect(shelf?.textContent).not.toContain('Docs');
    } finally {
        await view.cleanup();
    }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

Expected: FAIL because `ProjectShelf` does not exist in the app yet.

- [ ] **Step 3: Create `ProjectShelf.tsx` with browsing-only UI**

Create `apps/editor/src/panels/ProjectShelf.tsx`:

```tsx
import { useMemo, useState } from 'react';
import {
    DragSource,
    TextField,
    TreeView,
} from '../components/system';
import type { TreeViewItem } from '../components/system';
import { getCompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import {
    componentDragPayload,
    sceneDragPayload,
} from '../services/dragPayload';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import {
    assetDragPayload,
    componentTypeFromPath,
    findFileByPath,
    openCompilerSceneFile,
    openProjectCodeFile,
    openProjectDefaultFile,
} from '../services/projectFileTree';
import { hostErrorMessage } from '../services/hostBridge';
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

function flattenVisibleFiles(node: ProjectFileTreeNode): ProjectFileTreeNode[] {
    return [
        node,
        ...(node.children ?? []).flatMap(flattenVisibleFiles),
    ];
}

function parentPath(path: string) {
    return path.split('/').slice(0, -1).join('/');
}

function folderChildren(projectTree: ProjectFileTreeNode, selectedPath?: string) {
    const selected = selectedPath ? findFileByPath(projectTree, selectedPath) : undefined;
    const folder = selected?.kind === 'folder'
        ? selected
        : selected ? findFileByPath(projectTree, parentPath(selected.path)) : projectTree;
    return folder?.children ?? projectTree.children ?? [];
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

    const treeItems = useMemo(() => projectTree ? [fileTreeItem(projectTree)] : [], [projectTree]);
    const expandedFolders = useMemo(() => new Set(expandedProjectFolders), [expandedProjectFolders]);
    const selectedFile = projectTree && selectedPath ? findFileByPath(projectTree, selectedPath) : projectTree;
    const contentFiles = useMemo(() => {
        if (!projectTree) {
            return [];
        }
        const files = search.trim()
            ? flattenVisibleFiles(projectTree).filter((file) => file.name.toLowerCase().includes(search.trim().toLowerCase()))
            : folderChildren(projectTree, selectedPath);
        return files.filter((file) => file !== projectTree);
    }, [projectTree, search, selectedPath]);
    const currentPath = selectedFile?.kind === 'folder'
        ? selectedFile.path
        : selectedFile ? parentPath(selectedFile.path) : projectTree?.path ?? '';

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
                <div className="projectShelfPath" title={currentPath}>{currentPath}</div>
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
                            style={{ '--tree-indent': `${Math.max(0, level - 1) * 14}px` } as React.CSSProperties}
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
                            type="button"
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
```

- [ ] **Step 4: Add i18n labels**

In `apps/editor/src/i18n.ts`, add these keys to both `zh` and `en` dictionaries.

For `zh`:

```ts
projectShelf: 'Project Shelf',
collapseProjectShelf: '折叠 Project Shelf',
search: '搜索',
searchProject: '搜索项目',
selectedItem: '选中项',
dragSceneToHierarchy: '拖到 Hierarchy',
```

For `en`:

```ts
projectShelf: 'Project Shelf',
collapseProjectShelf: 'Collapse Project Shelf',
search: 'Search',
searchProject: 'Search project',
selectedItem: 'Selected item',
dragSceneToHierarchy: 'Drag to Hierarchy',
```

- [ ] **Step 5: Export nothing from old ExplorerPanel**

Do not delete `ExplorerPanel.tsx` in this task. Leave existing tests and imports untouched until `EditorApp` stops using it.

- [ ] **Step 6: Run the Project Shelf tests and verify current expected failure**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

Expected: still FAIL because `EditorApp` has not mounted `ProjectShelf` yet.

- [ ] **Step 7: Commit Project Shelf component**

```bash
git add apps/editor/src/panels/ProjectShelf.tsx apps/editor/src/i18n.ts tests/editor-workbench-ui.test.ts
git commit -m "feat: add editor project shelf"
```

## Task 3: Replace Dockview Shell with Fixed Workbench

**Files:**
- Modify: `apps/editor/src/EditorApp.tsx`
- Modify: `apps/editor/src/styles.css`
- Test: `tests/editor-workbench-ui.test.ts`
- Test: `tests/agent-panel-ui.test.ts`

- [ ] **Step 1: Remove Dockview imports and panel registration code**

In `apps/editor/src/EditorApp.tsx`, remove these imports:

```ts
import { useMemo, useRef } from 'react';
import { DockviewReact, themeLight } from 'dockview';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import { ResourceExplorer } from './panels/ExplorerPanel';
import { AgentPanel } from './panels/AgentPanel';
import 'dockview/dist/styles/dockview.css';
```

Keep `useCallback`, `useEffect`, and `useState`.

Remove these functions and types from `EditorApp.tsx`:

```ts
type EditorPanelParams = Record<string, never>;
function dockPanelTitles(...)
function setDockPanelTitles(...)
function setInitialDockLayout(...)
function createDockComponents(...)
function SceneTreePanel(...)
function addInitialPanels(...)
```

Keep `countCompilerSceneNodes` only if the new shell uses it; otherwise remove it in this task.

- [ ] **Step 2: Add fixed workbench imports**

Add:

```ts
import { ProjectShelf } from './panels/ProjectShelf';
import { CompilerSceneHierarchyTree } from './panels/HierarchyPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { ViewportPanel } from './panels/ViewportPanel';
```

Remove duplicate imports if they already exist.

- [ ] **Step 3: Remove Dockview state and effects**

In `EditorApp`, remove:

```ts
const dockApiRef = useRef<DockviewApi | undefined>(undefined);
const components = useMemo(() => createDockComponents(), []);
useEffect(() => {
    if (dockApiRef.current) {
        setDockPanelTitles(dockApiRef.current, language);
    }
}, [language]);
const handleDockReady = useCallback((event: DockviewReadyEvent) => {
    dockApiRef.current = event.api;
    addInitialPanels(event, language);
    window.requestAnimationFrame(() => setInitialDockLayout(event.api));
}, [language]);
```

- [ ] **Step 4: Add `WorkbenchMain` helper inside `EditorApp.tsx`**

Add this component above `export function EditorApp()`:

```tsx
function WorkbenchMain() {
    const t = useI18n();
    const openedScenePath = useEditorStore((state) => state.openedScenePath);
    const compilerDocument = getCompilerSceneDocument();
    const isCompilerScene = openedScenePath && compilerDocument?.scenePath === openedScenePath;

    return (
        <main className="workbenchMain" data-testid="editor-workbench">
            <section className="workbenchPane workbenchHierarchy" data-testid="workbench-hierarchy" aria-label={t('hierarchyLabel')}>
                {isCompilerScene ? (
                    <CompilerSceneHierarchyTree />
                ) : (
                    <div className="panelEmptyState">
                        <strong>{t('sceneEmptyTitle')}</strong>
                        <span>{t('sceneEmptyHint')}</span>
                    </div>
                )}
            </section>
            <section className="workbenchPreview" data-testid="workbench-preview" aria-label={t('viewportLabel')}>
                <ViewportPanel />
            </section>
            <section className="workbenchPane workbenchInspector" data-testid="workbench-inspector" aria-label="Inspector">
                <InspectorPanel />
            </section>
        </main>
    );
}
```

- [ ] **Step 5: Replace the main shell JSX**

Replace the `return` body main area in `EditorApp` so the project case no longer renders `DockviewReact`:

```tsx
<main className={hasProject ? 'workbenchHost' : 'welcomeHost'}>
    {hasProject ? (
        <>
            <WorkbenchMain />
            <ProjectShelf />
        </>
    ) : (
        <WelcomePage onOpenFolder={() => void openFolder()} />
    )}
</main>
```

Keep the existing header and footer for now. The footer gets restyled and retested in Task 4.

- [ ] **Step 6: Add fixed layout CSS**

In `apps/editor/src/styles.css`, add this after `.welcomeHost` or near existing layout styles:

```css
.workbenchHost {
    display: grid;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) 184px;
    overflow: hidden;
}

.workbenchMain {
    display: grid;
    min-height: 0;
    grid-template-columns: 300px minmax(420px, 1fr) 340px;
    overflow: hidden;
}

.workbenchPane,
.workbenchPreview {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--panel);
}

.workbenchHierarchy {
    border-right: 1px solid var(--line-strong);
}

.workbenchInspector {
    border-left: 1px solid var(--line-strong);
}

.workbenchPreview {
    background: #edf2f7;
}
```

- [ ] **Step 7: Run workbench UI tests**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts
```

Expected: `tests/editor-workbench-ui.test.ts` passes the fixed shell assertions. `tests/agent-panel-ui.test.ts` may still fail only on status bar test id if footer has not been updated.

- [ ] **Step 8: Run TypeScript check**

Run:

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit fixed shell**

```bash
git add apps/editor/src/EditorApp.tsx apps/editor/src/styles.css tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts
git commit -m "feat: replace editor dockview shell"
```

## Task 4: Make Status Bar Independent and Compact

**Files:**
- Modify: `apps/editor/src/EditorApp.tsx`
- Modify: `apps/editor/src/styles.css`
- Modify: `tests/agent-panel-ui.test.ts`
- Test: `tests/editor-workbench-ui.test.ts`

- [ ] **Step 1: Add status bar expectations**

Append this test to `tests/editor-workbench-ui.test.ts`:

```ts
it('shows Scene state in an independent status bar', async () => {
    const view = await renderEditorApp();
    try {
        const status = view.container.querySelector('[data-testid="workbench-status-bar"]');
        expect(status).toBeTruthy();
        expect(status?.textContent).toContain('已保存');
        expect(status?.textContent).toContain('运行');
        expect(status?.textContent).toContain('CLI Context');
        expect(view.container.querySelector('[data-testid="project-shelf"]')?.textContent).not.toContain('CLI Context');
    } finally {
        await view.cleanup();
    }
});
```

- [ ] **Step 2: Run status tests and verify failure**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts
```

Expected: FAIL because footer still uses `agent-status-bar`, and `CLI Context` may not be present.

- [ ] **Step 3: Replace footer JSX**

In `EditorApp.tsx`, replace the existing footer:

```tsx
<footer className="agentStatusBar" aria-label={t('agentStatusTitle')} data-testid="agent-status-bar">
    ...
</footer>
```

with:

```tsx
<footer className="workbenchStatusBar" aria-label={t('agentStatusTitle')} data-testid="workbench-status-bar">
    <strong className={currentSceneDirty ? 'statusText dirty' : 'statusText saved'}>
        {currentSceneDirty ? t('dirtyUnsaved') : t('saved')}
    </strong>
    <span data-testid="save-status">{saveStatus}</span>
    {externalSceneSyncStatusState ? (
        <span className={`statusText ${externalSceneSyncStatusState.tone}`}>Sync: {externalSceneSyncStatusState.message}</span>
    ) : null}
    <span>{t(`runState_${runStatus.state}`)}</span>
    <span>{runStatus.error ?? runStatus.stderr.at(-1) ?? runStatus.stdout.at(-1) ?? runStatus.command ?? t('runLogEmpty')}</span>
    <span className="statusBarSpacer" />
    <span>CLI Context</span>
    <code>{pixifactAgentBridgeUrl}</code>
</footer>
```

Keep `data-testid="save-status"` only here. Remove the duplicate `save-status` from the top status if needed in Task 5.

- [ ] **Step 4: Add status bar CSS**

In `apps/editor/src/styles.css`, add:

```css
.workbenchStatusBar {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
    border-top: 1px solid var(--line-strong);
    background: #f8fafc;
    padding: 0 12px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    overflow: hidden;
}

.workbenchStatusBar span,
.workbenchStatusBar strong,
.workbenchStatusBar code {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.workbenchStatusBar code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-weight: 600;
}

.statusText.saved {
    color: var(--success);
}

.statusText.dirty {
    color: var(--warning);
}

.statusBarSpacer {
    flex: 1;
}
```

- [ ] **Step 5: Run status tests**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit status bar**

```bash
git add apps/editor/src/EditorApp.tsx apps/editor/src/styles.css tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts
git commit -m "feat: add editor workbench status bar"
```

## Task 5: Simplify Top Bar for Fixed Workbench

**Files:**
- Modify: `apps/editor/src/EditorApp.tsx`
- Modify: `apps/editor/src/styles.css`
- Test: `tests/editor-workbench-ui.test.ts`

- [ ] **Step 1: Add top bar expectations**

Append this test to `tests/editor-workbench-ui.test.ts`:

```ts
it('keeps detailed Scene status out of the top bar', async () => {
    const view = await renderEditorApp();
    try {
        const topbar = view.container.querySelector('.topbar');
        expect(topbar).toBeTruthy();
        expect(topbar?.textContent).toContain('Pixifact');
        expect(topbar?.textContent).toContain('Button.scene');
        expect(topbar?.textContent).toContain('保存');
        expect(topbar?.textContent).not.toContain('Agent Bridge');
        expect(topbar?.textContent).not.toContain('Sync:');
    } finally {
        await view.cleanup();
    }
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

Expected: FAIL because top bar still includes detailed status and Agent Bridge text.

- [ ] **Step 3: Replace `topStatus` with centered scene identity**

In `EditorApp.tsx`, replace the `topStatus` variable with:

```tsx
const sceneTitle = hasProject ? (
    <>
        <strong>{compilerSceneOpened ? `${currentSceneName}.scene` : currentSceneName}</strong>
        <span title={openedScenePath ?? undefined}>{openedScenePath ?? t('unboundSceneFile')}</span>
    </>
) : (
    <>
        <strong>{t('projectNotOpened')}</strong>
        <span>{t('projectOpenHint')}</span>
    </>
);
```

Update the header center:

```tsx
<div className="sceneTitleBar">
    {sceneTitle}
</div>
```

Remove `SummaryBar` from `EditorApp.tsx` imports and top bar usage.

- [ ] **Step 4: Reduce top actions**

Keep these top actions:

- Open folder.
- Save.
- Validate/Compile represented by existing save+compile path for now.
- Run/Stop.
- Language selector.

Remove reset demo and disabled undo/redo from the fixed workbench top bar:

```tsx
{hasProject ? (
    <>
        <Button icon="save" onPress={() => void saveScene()}>{t('save')}</Button>
    </>
) : null}
```

Do not add new behavior for validate-only in this task.

- [ ] **Step 5: Add top bar CSS**

In `apps/editor/src/styles.css`, replace `.statusBar` center usage with:

```css
.sceneTitleBar {
    display: flex;
    min-width: 0;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
}

.sceneTitleBar strong,
.sceneTitleBar span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sceneTitleBar strong {
    font-size: 13px;
}

.sceneTitleBar span {
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
}
```

Keep existing `.statusBar` CSS only if other components still use it; otherwise remove it in a cleanup task.

- [ ] **Step 6: Run tests**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit top bar simplification**

```bash
git add apps/editor/src/EditorApp.tsx apps/editor/src/styles.css tests/editor-workbench-ui.test.ts
git commit -m "feat: simplify editor workbench top bar"
```

## Task 6: Style Project Shelf and Preserve Drag Targets

**Files:**
- Modify: `apps/editor/src/styles.css`
- Modify: `tests/editor-workbench-ui.test.ts`

- [ ] **Step 1: Add Project Shelf structure assertions**

Append this test to `tests/editor-workbench-ui.test.ts`:

```ts
it('keeps Project Shelf as folder tree, contents, and selected item details', async () => {
    const view = await renderEditorApp();
    try {
        const shelf = view.container.querySelector('[data-testid="project-shelf"]');
        expect(shelf?.querySelector('.projectShelfHeader')).toBeTruthy();
        expect(shelf?.querySelector('.projectShelfBody')).toBeTruthy();
        expect(shelf?.querySelector('.projectShelfContents')).toBeTruthy();
        expect(shelf?.querySelector('.projectShelfDetails')).toBeTruthy();
        expect(shelf?.querySelector('[data-testid="project-shelf-contents"]')?.textContent).toContain('Button.scene');
    } finally {
        await view.cleanup();
    }
});
```

- [ ] **Step 2: Run test**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

Expected: PASS if Task 2 structure was implemented; if it fails, fix markup before styling.

- [ ] **Step 3: Add Project Shelf CSS**

In `apps/editor/src/styles.css`, add:

```css
.projectShelf {
    display: grid;
    min-height: 0;
    grid-template-rows: 32px minmax(0, 1fr);
    border-top: 1px solid var(--line-strong);
    background: var(--panel);
    overflow: hidden;
}

.projectShelfHeader {
    display: grid;
    min-width: 0;
    grid-template-columns: 220px minmax(0, 1fr) 180px 220px;
    align-items: center;
    border-bottom: 1px solid var(--line);
    font-size: 11px;
}

.projectShelfTitle {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
}

.projectShelfTitle button {
    width: 24px;
    min-width: 24px;
    height: 24px;
    min-height: 24px;
    padding: 0;
}

.projectShelfPath {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.projectShelfSearch {
    padding: 0 8px;
}

.projectShelfDetailsTitle {
    padding: 0 10px;
    color: var(--soft);
    text-align: right;
    font-weight: 700;
}

.projectShelfBody {
    display: grid;
    min-height: 0;
    grid-template-columns: 220px minmax(0, 1fr) 220px;
    overflow: hidden;
}

.projectShelfBody > .systemTree {
    min-height: 0;
    border-right: 1px solid var(--line);
    background: var(--panel-muted);
    overflow: auto;
    padding: 6px;
}

.projectFolderRow {
    display: block;
    width: 100%;
    min-height: 24px;
    border: 0;
    background: transparent;
    padding: 3px 6px 3px calc(8px + var(--tree-indent, 0px));
    text-align: left;
    font-size: 11px;
    font-weight: 700;
}

.projectFolderRow.selected {
    background: var(--blue-soft);
    color: var(--text);
}

.projectShelfContents {
    display: grid;
    min-height: 0;
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
    align-content: start;
    gap: 8px;
    overflow: auto;
    padding: 10px;
}

.projectFileCard {
    display: grid;
    width: 100%;
    min-height: 76px;
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: start;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: #fff;
    padding: 7px;
    text-align: left;
}

.projectFileCard.selected {
    border-color: var(--blue);
    background: var(--blue-soft);
}

.projectFileCard strong {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
}

.projectFileCard span {
    color: var(--muted);
    font-size: 10px;
}

.projectShelfDetails {
    display: grid;
    align-content: start;
    gap: 6px;
    border-left: 1px solid var(--line);
    background: var(--panel-muted);
    padding: 8px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
    overflow: auto;
}

.projectShelfDetails strong {
    color: var(--text);
    font-size: 12px;
}

.projectShelfDetails small {
    overflow-wrap: anywhere;
}
```

- [ ] **Step 4: Verify hierarchy drop markup still exists**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Project Shelf styling**

```bash
git add apps/editor/src/styles.css tests/editor-workbench-ui.test.ts
git commit -m "style: polish editor project shelf"
```

## Task 7: Remove Dockview Dependency from App Code

**Files:**
- Modify: `apps/editor/src/EditorApp.tsx`
- Modify: `package.json` if no imports remain and dependency cleanup is desired
- Test: full editor checks

- [ ] **Step 1: Search for Dockview imports**

Run:

```bash
rg -n "dockview|Dockview" apps/editor/src package.json
```

Expected after Task 3: only `package.json` may still contain the dependency and old CSS selectors may still exist in `styles.css`.

- [ ] **Step 2: Remove unused Dockview CSS selectors**

If `apps/editor/src/styles.css` still contains `.dockHost` or `.dockview-theme-light` blocks and no component uses those classes, remove these blocks:

```css
.dockHost { ... }
.dockview-theme-light { ... }
.dockview-theme-light .dv-tabs-container { ... }
.dockview-theme-light .dv-default-tab { ... }
.dockview-theme-light .dv-tab,
.dockview-theme-light .dv-void-container.dv-draggable { ... }
.dockview-theme-light .dv-tab.dv-tab--dragging,
.dockview-theme-light .dv-tab.dv-tab-dragging { ... }
```

Do not remove unrelated panel styles that are still used by Hierarchy, Preview, Inspector, Project Shelf, or old tests.

- [ ] **Step 3: Decide dependency cleanup**

If `rg -n "dockview|Dockview" apps/editor/src` returns no results, remove this line from `package.json` dependencies:

```json
"dockview": "^6.0.1",
```

Do not edit lockfiles unless this repository has one tracked and `bun install` changes it as part of dependency cleanup.

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
```

Expected: PASS.

- [ ] **Step 5: Run editor UI tests**

Run:

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Dockview cleanup**

```bash
git add apps/editor/src/styles.css package.json
git commit -m "chore: remove dockview from editor shell"
```

If `package.json` was not changed, commit only `styles.css`.

## Task 8: Final Verification

**Files:**
- No planned source edits unless verification exposes failures.

- [ ] **Step 1: Run focused TypeScript check**

```bash
bunx --no-install tsc --noEmit --strict --jsx react-jsx --moduleResolution Node --module ESNext --target ESNext --lib ESNext,DOM --experimentalDecorators --allowSyntheticDefaultImports --skipLibCheck apps/editor/src/main.tsx
```

Expected: PASS.

- [ ] **Step 2: Run focused editor and project tests**

```bash
bunx --no-install vitest run tests/editor-workbench-ui.test.ts tests/agent-panel-ui.test.ts tests/project-file-tree.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run editor frontend build**

```bash
bun run editor:frontend:build
```

Expected: PASS. Do not commit generated `apps/editor/dist`.

- [ ] **Step 4: Check git status for generated artifacts**

```bash
git status --short
```

Expected: only intentional source/test/doc files are modified or added. Do not commit `.superpowers/brainstorm/`, `apps/editor/dist`, `packages/pixifact/dist`, `test-results`, or `apps/editor/src-tauri/target`.

- [ ] **Step 5: Commit final verification fixes if any**

If verification required source/test fixes:

```bash
git add <changed source and test files>
git commit -m "fix: stabilize editor workbench verification"
```

If no source/test fixes were needed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: fixed workbench, Hierarchy, Preview, Inspector, Project Shelf, Status Bar, no Dockview-first shell, no Project Shelf tabs/chips, no persistent create/more controls are covered by tasks and tests.
- No placeholders: all steps include exact files, commands, and expected outcomes.
- Type consistency: component names and test ids are consistent across tasks: `ProjectShelf`, `WorkbenchMain`, `editor-workbench`, `project-shelf`, and `workbench-status-bar`.
