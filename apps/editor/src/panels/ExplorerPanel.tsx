import { ComponentRegistry } from '../../../../src';
import type { ComponentSpec, EditorDocument, NodeSpec } from '../../../../src';
import { useEditorStore } from '../editorStore';
import { HierarchyTree } from './HierarchyPanel';
import { collectHierarchy, getNodeLocator } from './common';

interface ExplorerFileItem {
    id: string;
    name: string;
    detail: string;
    type: 'prefab' | 'script' | 'logic' | 'asset' | 'component';
    node?: string;
}

interface ExplorerSection {
    id: string;
    title: string;
    count: number;
    items: ExplorerFileItem[];
    emptyText?: string;
}

const fileTypeLabels: Record<ExplorerFileItem['type'], string> = {
    prefab: 'Prefab',
    script: 'TS',
    logic: 'Logic',
    asset: 'Asset',
    component: 'Component',
};

interface ImportMetaWithEnv extends ImportMeta {
    env?: Record<string, string | boolean | undefined>;
}

function editorProjectPath() {
    const env = (import.meta as ImportMetaWithEnv).env;
    const path = env?.VITE_PIXIF_PROJECT_ROOT;
    return typeof path === 'string' && path.trim() ? path.trim() : '未配置项目路径';
}

function folderName(path: string) {
    const normalized = path.replace(/[\\/]+$/, '');
    return normalized.split(/[\\/]/).pop() || path;
}

function sanitizeFileName(value: string) {
    return value
        .trim()
        .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '') || 'untitled';
}

function assetName(value: unknown) {
    if (typeof value === 'string') {
        return value;
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const candidate = record.id ?? record.key ?? record.path ?? record.url ?? record.name;
        return typeof candidate === 'string' ? candidate : JSON.stringify(value);
    }
    return undefined;
}

function collectAssetRefsFromComponent(node: NodeSpec, component: ComponentSpec, assets: Map<string, ExplorerFileItem>) {
    const schema = ComponentRegistry.get(component.type);
    if (!schema) {
        return;
    }

    const nodeLocator = getNodeLocator(node);
    for (const prop of schema.props) {
        if (prop.type !== 'assetRef') {
            continue;
        }

        const value = component.props?.[prop.key] ?? prop.default;
        const name = assetName(value);
        if (!name) {
            continue;
        }

        const key = `${prop.assetType ?? 'asset'}:${name}`;
        if (!assets.has(key)) {
            assets.set(key, {
                id: key,
                name,
                detail: `${prop.assetType ?? 'assetRef'} - ${nodeLocator}.${component.id ?? component.type}.${prop.key}`,
                type: 'asset',
                node: nodeLocator,
            });
        }
    }
}

function createComponentItems(document: EditorDocument): ExplorerFileItem[] {
    const components = new Map<string, { type: string; count: number; nodes: Set<string> }>();

    for (const item of collectHierarchy(document.prefab.root)) {
        for (const component of item.node.components ?? []) {
            const record = components.get(component.type) ?? {
                type: component.type,
                count: 0,
                nodes: new Set<string>(),
            };
            record.count += 1;
            record.nodes.add(item.locator);
            components.set(component.type, record);
        }
    }

    return Array.from(components.values())
        .sort((a, b) => a.type.localeCompare(b.type))
        .map((item) => ({
            id: `component:${item.type}`,
            name: item.type,
            detail: `${item.count} 个实例 - ${Array.from(item.nodes).slice(0, 3).join(', ')}`,
            type: 'component' as const,
        }));
}

function createExplorerSections(document: EditorDocument): ExplorerSection[] {
    const hierarchy = collectHierarchy(document.prefab.root);
    const assets = new Map<string, ExplorerFileItem>();
    const componentItems = createComponentItems(document);

    for (const item of hierarchy) {
        for (const component of item.node.components ?? []) {
            collectAssetRefsFromComponent(item.node, component, assets);
        }
    }

    const projectItems: ExplorerFileItem[] = [{
        id: 'prefab:current',
        name: `${sanitizeFileName(document.prefab.name)}.ai-editor.json`,
        detail: `${hierarchy.length} 个节点`,
        type: 'prefab',
        node: getNodeLocator(document.prefab.root),
    }];

    const scriptItems: ExplorerFileItem[] = [
        {
            id: 'script:logic-handlers',
            name: 'logic-handlers.ts',
            detail: document.logicGraph.flows.length > 0
                ? `${document.logicGraph.flows.length} 个逻辑流`
                : '逻辑导出入口',
            type: 'script',
        },
        ...document.actions
            .slice()
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((action) => ({
                id: `script:action:${action.key}`,
                name: `${sanitizeFileName(action.key)}.ts`,
                detail: action.label ?? action.description ?? 'Action handler',
                type: 'script' as const,
            })),
    ];

    const logicItems = document.logicGraph.flows
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((flow) => ({
            id: `logic:${flow.id}`,
            name: `${sanitizeFileName(flow.id)}.logic.json`,
            detail: `${flow.action} - ${flow.steps.length} 个步骤`,
            type: 'logic' as const,
        }));

    return [
        {
            id: 'project',
            title: '项目',
            count: projectItems.length,
            items: projectItems,
        },
        {
            id: 'scripts',
            title: '脚本',
            count: scriptItems.length,
            items: scriptItems,
        },
        {
            id: 'logic',
            title: '逻辑',
            count: logicItems.length,
            items: logicItems,
            emptyText: '暂无逻辑流',
        },
        {
            id: 'assets',
            title: '资源',
            count: assets.size,
            items: Array.from(assets.values()).sort((a, b) => a.name.localeCompare(b.name)),
            emptyText: '暂无资源引用',
        },
        {
            id: 'components',
            title: '组件',
            count: componentItems.length,
            items: componentItems,
        },
    ];
}

function ExplorerIcon({ type }: { type: ExplorerFileItem['type'] }) {
    if (type === 'prefab') {
        return (
            <svg aria-hidden="true" viewBox="0 0 16 16">
                <path d="M3 2.5h7l3 3v8H3z" />
                <path d="M10 2.5v3h3" />
                <path d="M5 8h6M5 10.5h4" />
            </svg>
        );
    }
    if (type === 'script') {
        return (
            <svg aria-hidden="true" viewBox="0 0 16 16">
                <path d="M5.5 4.5 2 8l3.5 3.5" />
                <path d="M10.5 4.5 14 8l-3.5 3.5" />
                <path d="m9 3-2 10" />
            </svg>
        );
    }
    if (type === 'logic') {
        return (
            <svg aria-hidden="true" viewBox="0 0 16 16">
                <path d="M3 4h3v3H3zM10 9h3v3h-3z" />
                <path d="M6 5.5h2c1.3 0 2 .7 2 2V9" />
            </svg>
        );
    }
    if (type === 'asset') {
        return (
            <svg aria-hidden="true" viewBox="0 0 16 16">
                <path d="M2.5 3.5h11v9h-11z" />
                <path d="m3 11 3.2-3 2.2 2 1.5-1.5L13 11.5" />
                <path d="M10.5 5.5h.01" />
            </svg>
        );
    }
    return (
        <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M6.5 2.5h3l.5 1.7 1.7.8 1.5-.8 1.5 2.6-1.4 1 .1 1.9 1.3 1-1.5 2.6-1.5-.8-1.7.8-.5 1.7h-3L6 13.3l-1.7-.8-1.5.8-1.5-2.6 1.3-1 .1-1.9-1.4-1 1.5-2.6 1.5.8 1.7-.8z" />
            <path d="M8 6.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z" />
        </svg>
    );
}

export function ResourceExplorer({ document }: { document: EditorDocument }) {
    const sections = createExplorerSections(document);
    const projectPath = editorProjectPath();

    const selectItem = (item: ExplorerFileItem) => {
        if (item.node) {
            document.setSelection({ type: 'node', node: item.node });
        }
    };

    return (
        <div className="resourceExplorer" data-testid="resource-explorer">
            <div className="projectPathBox" data-testid="project-path" title={projectPath}>
                <span>项目路径</span>
                <strong>{folderName(projectPath)}</strong>
                <small>{projectPath}</small>
            </div>
            {sections.map((section) => (
                <section className="resourceSection" key={section.id}>
                    <header className="resourceSectionHeader">
                        <span>{section.title}</span>
                        <small>{section.count}</small>
                    </header>
                    {section.items.length > 0 ? (
                        <div className="resourceTree" role="tree">
                            {section.items.map((item) => (
                                <button
                                    aria-disabled={!item.node}
                                    className={item.node ? 'resourceItem clickable' : 'resourceItem'}
                                    key={item.id}
                                    onClick={() => selectItem(item)}
                                    title={item.detail}
                                    type="button"
                                >
                                    <span className={`fileIcon ${item.type}`}>
                                        <ExplorerIcon type={item.type} />
                                    </span>
                                    <span className="fileMain">
                                        <strong>{item.name}</strong>
                                        <small>{item.detail}</small>
                                    </span>
                                    <span className="fileBadge">{fileTypeLabels[item.type]}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="emptyInline compact">{section.emptyText ?? '暂无条目'}</div>
                    )}
                </section>
            ))}
        </div>
    );
}

export function ExplorerPanel({ document }: { document: EditorDocument }) {
    const leftPanel = useEditorStore((state) => state.leftPanel);
    const setLeftPanel = useEditorStore((state) => state.setLeftPanel);

    return (
        <aside className="panel leftPanel explorerPanel" aria-label="资源管理器">
            <header className="panelHeader explorerHeader">
                <h2>资源管理器</h2>
                <div className="explorerTabs" aria-label="左侧面板">
                    <button
                        className={leftPanel === 'hierarchy' ? 'active' : ''}
                        data-testid="tab-left-hierarchy"
                        onClick={() => setLeftPanel('hierarchy')}
                        type="button"
                    >
                        层级
                    </button>
                    <button
                        className={leftPanel === 'assets' ? 'active' : ''}
                        data-testid="tab-left-assets"
                        onClick={() => setLeftPanel('assets')}
                        type="button"
                    >
                        资源
                    </button>
                </div>
            </header>
            {leftPanel === 'hierarchy' ? <HierarchyTree document={document} /> : <ResourceExplorer document={document} />}
        </aside>
    );
}
