import * as Pixi from 'pixi.js';
import { Container, Graphics, Texture } from 'pixi.js';
import {
    GridContainer,
    Group,
    HBoxContainer,
    Image,
    BitmapLabel,
    Label,
    NineImage,
    Rect,
    ScrollContainer,
    TileImage,
    VBoxContainer,
    layoutFrameChildren,
} from 'pixifact/runtime';
import {
    applySceneNodeProp,
    bindSceneNodeProp,
    initializeScenePropsFromInterface,
    readSceneBindingValue,
} from 'pixifact/scene';
import {
    compilerSceneNodeLocator,
    isSceneTemplateBindingValue,
    normalizeSceneAssetId,
    resolveSceneReference,
    type PixiTemplateNode,
    type SceneInstanceTemplateNode,
    type SceneTemplate,
    type SceneTemplateInterface,
    type SceneTemplateNode,
    type SceneTemplatePrimitiveType,
    type SceneTemplateValue,
} from 'pixifact/compiler';
import type { PixifactProjectResolution } from 'pixifact';
import {
    findFileByPath,
    type ProjectFileTreeNode,
} from '../services/projectFileTree';
import { awaitScenePreviewTask, CompilerSceneBindingCache } from '../services/sceneBindingIndex';
import { editorProjectFileUrl } from '../services/editorApi';

interface CreateCompilerSceneRuntimePreviewOptions {
    cache: CompilerScenePreviewCache;
    signal?: AbortSignal;
    document: CompilerScenePreviewDocument;
    projectResolution?: PixifactProjectResolution;
    projectTree: ProjectFileTreeNode;
    scenePath: string;
}

interface CompilerScenePreviewDocument {
    template: SceneTemplate;
    sceneInterfaces: Record<string, SceneTemplateInterface>;
}

export interface CompilerSceneRuntimePreview {
    root: Group;
    nodes: Map<string, Container>;
    width: number;
    height: number;
    dispose: () => void;
}

interface AuthoringContext {
    interfaces: Record<string, SceneTemplateInterface>;
    nodes: Map<string, Container>;
    projectResolution?: PixifactProjectResolution;
    projectTree: ProjectFileTreeNode;
    templates: Map<string, SceneTemplate>;
    textures: Map<string, Texture>;
}

interface RenderScope {
    bindingRoot: Group;
    collectNodes: boolean;
    scenePath: string;
    slots: Map<string, Container>;
}

const assetParsers: Record<string, string> = {
    '.jpg': 'texture',
    '.jpeg': 'texture',
    '.png': 'texture',
    '.svg': 'svg',
    '.webp': 'texture',
};

const graphicsProps = new Set([
    'shape',
    'radius',
    'fill',
    'fillAlpha',
    'strokeColor',
    'strokeWidth',
    'strokeAlpha',
]);

function numericProp(value: unknown, defaultValue: number) {
    return typeof value === 'number' ? value : defaultValue;
}

function sceneSize(template: SceneTemplate, defaultSize?: PixifactProjectResolution) {
    const hasExplicitSize = template.props.width !== undefined || template.props.height !== undefined;
    return {
        width: numericProp(template.props.width, hasExplicitSize ? 960 : defaultSize?.width ?? 960),
        height: numericProp(template.props.height, hasExplicitSize ? 540 : defaultSize?.height ?? 540),
    };
}

function projectAbsolutePath(projectTree: ProjectFileTreeNode, relativePath: string) {
    return `${projectTree.path}/${relativePath}`;
}

function projectExtension(projectPath: string) {
    const fileName = projectPath.split(/[?#]/)[0].split('/').at(-1) ?? '';
    const index = fileName.lastIndexOf('.');
    return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function sceneInterface(context: AuthoringContext, scenePath: string) {
    return context.interfaces[scenePath] ?? { props: {}, events: {}, slots: {} };
}

function scenePropDefaults(template: SceneTemplate, contract: SceneTemplateInterface) {
    return Object.fromEntries(Object.entries(contract.props).flatMap(([name, prop]) => {
        const explicit = template.propDefaults?.[name];
        if (prop.type === 'struct') {
            return [[name, {
                ...Object.fromEntries(Object.entries(prop.fields).map(([field, schema]) => [field, schema.default])),
                ...(explicit && typeof explicit === 'object' ? explicit : {}),
            }]];
        }
        return explicit === undefined ? [] : [[name, explicit]];
    }));
}

function applyRootProps(root: Group, template: SceneTemplate, defaultSize?: PixifactProjectResolution) {
    const size = sceneSize(template, defaultSize);
    root.setSize(size.width, size.height);
    for (const [prop, value] of Object.entries(template.props)) {
        if (prop !== 'width' && prop !== 'height' && !isSceneTemplateBindingValue(value)) {
            applySceneNodeProp(root, prop, value);
        }
    }
    if (Object.keys(template.events ?? {}).length > 0 && template.props.eventMode === undefined) root.eventMode = 'static';
}

function createPrimitive(context: AuthoringContext, node: PixiTemplateNode): Container {
    const texture = typeof node.props.texture === 'string'
        ? context.textures.get(node.props.texture) ?? Texture.EMPTY
        : Texture.EMPTY;
    const text = isSceneTemplateBindingValue(node.props.text) ? '' : String(node.props.text ?? '');
    const style = Object.fromEntries(['fontSize', 'fontFamily', 'fontWeight', 'fill']
        .flatMap((prop) => {
            const value = node.props[prop];
            return value === undefined || isSceneTemplateBindingValue(value) ? [] : [[prop, value]];
        }));

    switch (node.type) {
        case 'Group': return new Group();
        case 'GridContainer': return new GridContainer();
        case 'HBoxContainer': return new HBoxContainer();
        case 'ScrollContainer': return new ScrollContainer();
        case 'VBoxContainer': return new VBoxContainer();
        case 'Rect': return new Rect();
        case 'Image': return new Image({ texture });
        case 'NineImage': return new NineImage({ texture });
        case 'TileImage': return new TileImage({ texture });
        case 'Label': return new Label();
        case 'BitmapLabel': return new BitmapLabel();
        case 'Container': return new Pixi.Container();
        case 'Sprite': return new Pixi.Sprite({ texture });
        case 'Text': return new Pixi.Text({ text, style });
        case 'BitmapText': return new Pixi.BitmapText({ text, style });
        case 'HTMLText': return new Pixi.HTMLText({ text, style });
        case 'Graphics': return new Pixi.Graphics();
        case 'NineSliceSprite': return new Pixi.NineSliceSprite({ texture });
        case 'TilingSprite': return new Pixi.TilingSprite({ texture });
        default: return createAuthoringAdapter(node.type);
    }
}

function createAuthoringAdapter(_type: SceneTemplatePrimitiveType) {
    return new Container();
}

function applyPrimitiveProps(scope: RenderScope, node: PixiTemplateNode, target: Container) {
    if (node.id) {
        target.label = node.id;
    }
    for (const [prop, value] of Object.entries(node.props)) {
        if (isSceneTemplateBindingValue(value)) {
            bindSceneNodeProp(scope.bindingRoot, value, target, prop);
            continue;
        }
        if (prop === 'texture' || (node.type === 'Graphics' && graphicsProps.has(prop))) {
            continue;
        }
        applySceneNodeProp(target, prop, value);
    }
    if (Object.keys(node.events ?? {}).length > 0 && node.props.eventMode === undefined) target.eventMode = 'static';
    if (node.type === 'Graphics' && target instanceof Graphics) {
        drawGraphics(target, node.props);
    }
}

function drawGraphics(target: Graphics, props: Record<string, SceneTemplateValue>) {
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const radius = Number(props.radius ?? 0);
    target.clear();
    if (props.shape === 'rect') {
        target.rect(0, 0, width, height);
    } else if (props.shape === 'roundRect') {
        target.roundRect(0, 0, width, height, radius);
    } else {
        return;
    }
    target.fill({ color: Number(props.fill ?? 0xffffff), alpha: Number(props.fillAlpha ?? 1) });
    if (Number(props.strokeWidth ?? 0) > 0) {
        target.stroke({
            width: Number(props.strokeWidth),
            color: Number(props.strokeColor ?? 0),
            alpha: Number(props.strokeAlpha ?? 1),
        });
    }
}

function sceneInstanceInitialProps(
    scope: RenderScope,
    node: SceneInstanceTemplateNode,
    childInterface: SceneTemplateInterface,
) {
    return Object.fromEntries(Object.entries(node.props).flatMap(([prop, value]) => {
        if (!childInterface.props[prop]) {
            return [];
        }
        return [[
            prop,
            isSceneTemplateBindingValue(value)
                ? readSceneBindingValue(scope.bindingRoot, value)
                : value,
        ]];
    }));
}

function applySceneInstanceProps(
    scope: RenderScope,
    node: SceneInstanceTemplateNode,
    target: Group,
    childInterface: SceneTemplateInterface,
) {
    for (const [prop, value] of Object.entries(node.props)) {
        if (childInterface.props[prop]) {
            if (isSceneTemplateBindingValue(value)) {
                bindSceneNodeProp(scope.bindingRoot, value, target, prop);
            }
            continue;
        }
        if (isSceneTemplateBindingValue(value)) {
            bindSceneNodeProp(scope.bindingRoot, value, target, prop);
        } else {
            applySceneNodeProp(target, prop, value);
        }
    }
}

function renderNodes(
    context: AuthoringContext,
    scope: RenderScope,
    parent: Container,
    nodes: readonly SceneTemplateNode[],
    locatorPrefix = '',
) {
    for (const [index, node] of nodes.entries()) {
        if (node.kind === 'slotOutlet') {
            scope.slots.set(node.name, parent);
            continue;
        }
        const path = locatorPrefix ? `${locatorPrefix}/${index}` : String(index);
        const locator = compilerSceneNodeLocator(node, path);
        if (node.kind === 'pixi') {
            const target = createPrimitive(context, node);
            applyPrimitiveProps(scope, node, target);
            if (node.props.zIndex !== undefined) {
                parent.sortableChildren = true;
            }
            parent.addChild(target);
            if (scope.collectNodes) {
                context.nodes.set(locator, target);
            }
            renderNodes(context, scope, target, node.children, locator);
            continue;
        }
        renderSceneInstance(context, scope, parent, node, locator);
    }
}

function renderSceneInstance(
    context: AuthoringContext,
    scope: RenderScope,
    parent: Container,
    node: SceneInstanceTemplateNode,
    locator: string,
) {
    const referencedPath = resolveSceneReference(scope.scenePath, node.scene);
    const template = context.templates.get(referencedPath);
    if (!template) {
        throw new Error(`找不到 Scene：${referencedPath}`);
    }
    const childInterface = sceneInterface(context, referencedPath);
    const target = new Group();
    initializeScenePropsFromInterface(target, childInterface, sceneInstanceInitialProps(scope, node, childInterface), scenePropDefaults(template, childInterface));
    applyRootProps(target, template);
    const childScope: RenderScope = {
        bindingRoot: target,
        collectNodes: false,
        scenePath: referencedPath,
        slots: new Map(),
    };
    renderNodes(context, childScope, target, template.children);
    applySceneInstanceProps(scope, node, target, childInterface);
    if (node.id && !childInterface.props.label) {
        target.label = node.id;
    }
    if (node.props.zIndex !== undefined) {
        parent.sortableChildren = true;
    }
    parent.addChild(target);
    if (scope.collectNodes) {
        context.nodes.set(locator, target);
    }

    for (const [slot, children] of Object.entries(node.slots)) {
        const host = childScope.slots.get(slot);
        if (!host) {
            continue;
        }
        renderNodes(context, scope, host, children, `${locator}/slot:${slot}`);
    }
    layoutFrameChildren(target);
}

function collectTextureReferences(template: SceneTemplate, textures: Set<string>) {
    function visit(nodes: readonly SceneTemplateNode[]) {
        for (const node of nodes) {
            if (node.kind === 'slotOutlet') {
                continue;
            }
            if (typeof node.props.texture === 'string') {
                textures.add(node.props.texture);
            }
            if (node.kind === 'pixi') {
                visit(node.children);
            } else {
                for (const children of Object.values(node.slots)) {
                    visit(children);
                }
            }
        }
    }
    visit(template.children);
}

interface PreviewTextureEntry {
    source: string;
    url: string;
    promise: Promise<Texture>;
    texture?: Texture;
    references: number;
    bytes: number;
    stale: boolean;
}

let nextPreviewCacheId = 0;

export class CompilerScenePreviewCache {
    readonly bindings = new CompilerSceneBindingCache();
    #id = ++nextPreviewCacheId;
    #version = 0;
    #textures = new Map<string, PreviewTextureEntry>();
    #entries = new Set<PreviewTextureEntry>();
    #unused = new Map<PreviewTextureEntry, number>();
    #unusedBytes = 0;
    #unloads = new Set<Promise<void>>();

    constructor(private readonly unusedTextureBudget = 64 * 1024 * 1024) {}

    invalidate(paths: readonly string[]) {
        this.bindings.invalidate(paths);
        for (const [source, entry] of this.#textures) {
            if (paths.some((path) => source === path || source.startsWith(`${path}/`))) this.#invalidateTexture(entry);
        }
    }

    async clear() {
        this.bindings.clear();
        const entries = [...this.#entries];
        for (const entry of entries) this.#invalidateTexture(entry);
        await Promise.allSettled(entries.map((entry) => entry.promise));
        await Promise.all(this.#unloads);
    }

    acquire(projectTree: ProjectFileTreeNode, source: string) {
        let entry = this.#textures.get(source);
        if (!entry) {
            const file = findFileByPath(projectTree, projectAbsolutePath(projectTree, source));
            const version = `${this.#id}-${++this.#version}`;
            const url = file ? editorProjectFileUrl(source, version)
                : `${source}${source.includes('#') ? '&' : '#'}pixifact-preview=${version}`;
            entry = { source, url, promise: undefined!, references: 0, bytes: 0, stale: false };
            const current = entry;
            this.#entries.add(current);
            current.promise = Pixi.Assets.load<Texture>({ src: url, parser: assetParsers[projectExtension(source)] }).then((texture) => {
                current.texture = texture;
                current.bytes = texture.source.pixelWidth * texture.source.pixelHeight * 4;
                if (current.references === 0) this.#retainUnused(current);
                return texture;
            }, (error) => {
                if (this.#textures.get(source) === current) this.#textures.delete(source);
                this.#entries.delete(current);
                Pixi.Assets.resolver.removeAlias(current.url);
                throw error;
            });
            this.#textures.set(source, current);
        }
        this.#removeUnused(entry);
        entry.references += 1;
        let released = false;
        return {
            ready: entry.promise,
            release: () => {
                if (released) return;
                released = true;
                entry.references -= 1;
                if (entry.references === 0 && entry.texture) this.#retainUnused(entry);
            },
        };
    }

    #removeUnused(entry: PreviewTextureEntry) {
        const bytes = this.#unused.get(entry);
        if (bytes !== undefined) {
            this.#unusedBytes -= bytes;
            this.#unused.delete(entry);
        }
    }

    #retainUnused(entry: PreviewTextureEntry) {
        if (entry.stale) {
            this.#unload(entry);
            return;
        }
        this.#unused.set(entry, entry.bytes);
        this.#unusedBytes += entry.bytes;
        while (this.#unusedBytes > this.unusedTextureBudget) {
            this.#invalidateTexture(this.#unused.keys().next().value!);
        }
    }

    #invalidateTexture(entry: PreviewTextureEntry) {
        entry.stale = true;
        if (this.#textures.get(entry.source) === entry) this.#textures.delete(entry.source);
        this.#removeUnused(entry);
        if (entry.references === 0 && entry.texture) this.#unload(entry);
    }

    #unload(entry: PreviewTextureEntry) {
        entry.texture = undefined;
        const task = Pixi.Assets.unload(entry.url)
            .then(() => Pixi.Assets.resolver.removeAlias(entry.url))
            .finally(() => {
                this.#entries.delete(entry);
                this.#unloads.delete(task);
            });
        this.#unloads.add(task);
    }
}

export async function createCompilerSceneRuntimePreview(
    options: CreateCompilerSceneRuntimePreviewOptions,
): Promise<CompilerSceneRuntimePreview> {
    const { cache, signal } = options;
    signal?.throwIfAborted();
    const bindingIndex = await cache.bindings.readIndex(
        options.projectTree, options.scenePath, options.document.template, signal,
    );
    const scenePath = normalizeSceneAssetId(options.scenePath);
    const currentBinding = bindingIndex[scenePath];
    if (!currentBinding) {
        throw new Error(`找不到 Scene 绑定：${scenePath}`);
    }
    const templates = new Map(Object.values(bindingIndex).map((binding) => [binding.scenePath, binding.template]));
    templates.set(scenePath, options.document.template);
    const interfaces = {
        ...Object.fromEntries(Object.values(bindingIndex).map((binding) => [binding.scenePath, binding.interface])),
        ...options.document.sceneInterfaces,
    };
    const context: AuthoringContext = {
        interfaces,
        nodes: new Map(),
        projectResolution: options.projectResolution,
        projectTree: options.projectTree,
        templates,
        textures: new Map(),
    };
    const references = new Set<string>();
    for (const template of templates.values()) collectTextureReferences(template, references);
    const leases = [...references].map((reference) => ({ reference, ...cache.acquire(options.projectTree, reference) }));
    let root: Group | undefined;
    try {
        await awaitScenePreviewTask(Promise.all(leases.map(async (lease) => {
            context.textures.set(lease.reference, await lease.ready);
        })), signal);
        signal?.throwIfAborted();
        root = new Group();
        const rootInterface = interfaces[scenePath] ?? currentBinding.interface;
        initializeScenePropsFromInterface(root, rootInterface, {}, scenePropDefaults(options.document.template, rootInterface));
        applyRootProps(root, options.document.template, context.projectResolution);
        renderNodes(context, {
            bindingRoot: root,
            collectNodes: true,
            scenePath,
            slots: new Map(),
        }, root, options.document.template.children);
        layoutFrameChildren(root);

        const size = sceneSize(options.document.template, context.projectResolution);
        let disposed = false;
        return {
            root,
            nodes: context.nodes,
            width: size.width,
            height: size.height,
            dispose: () => {
                if (disposed) return;
                disposed = true;
                root!.destroy({ children: true });
                for (const lease of leases) lease.release();
            },
        };
    } catch (error) {
        root?.destroy({ children: true });
        for (const lease of leases) lease.release();
        throw error;
    }
}

export function destroyCompilerSceneRuntimePreview(preview?: CompilerSceneRuntimePreview) {
    preview?.dispose();
}
