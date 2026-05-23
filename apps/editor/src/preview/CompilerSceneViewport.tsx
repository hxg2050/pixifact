import { useEffect, useRef, useState } from 'react';
import {
    Application as PixiApplication,
    Container,
    Graphics,
    Sprite,
    Text,
} from 'pixi.js';
import { parseSceneTemplate } from '../../../../packages/pixifact/src/compiler/templateParser';
import { compilerSceneNodeLocator } from '../document/compilerSceneDocumentController';
import type {
    PixiTemplateNode,
    SceneInstanceTemplateNode,
    SceneTemplate,
    SceneTemplateNode,
    SceneTemplateValue,
} from '../../../../packages/pixifact/src/compiler/spec';
import type { CompilerSceneDocument } from '../document/compilerSceneDocumentController';
import {
    findFileByPath,
    readProjectFileText,
} from '../services/projectFileTree';
import type { ProjectFileTreeNode } from '../services/projectFileTree';

interface CompilerSceneViewportProps {
    document: CompilerSceneDocument;
    projectTree: ProjectFileTreeNode;
}

interface RenderedCompilerScene {
    root: Container;
    slots: Map<string, Container>;
    nodes: Map<string, Container>;
    width: number;
    height: number;
}

interface RenderContext {
    projectTree: ProjectFileTreeNode;
    sceneRootPath: string;
    locatorPath: string;
    templates: Map<string, SceneTemplate>;
}

const previewWidth = 960;
const previewHeight = 540;
const transformProps = new Set(['x', 'y', 'width', 'height', 'scaleX', 'scaleY', 'rotation', 'pivotX', 'pivotY', 'skewX', 'skewY']);
const pixiProps = new Set(['alpha', 'visible', 'eventMode', 'cursor', 'label', 'zIndex']);
const spriteProps = new Set(['texture', 'anchorX', 'anchorY', 'tint']);
const graphicsProps = new Set(['shape', 'radius', 'fill', 'fillAlpha', 'strokeColor', 'strokeWidth', 'strokeAlpha']);
const textStyleProps = new Set(['fontSize', 'fontFamily', 'fontWeight', 'fill']);

function numericProp(value: SceneTemplateValue | undefined, defaultValue: number) {
    return typeof value === 'number' ? value : defaultValue;
}

function stringProp(value: SceneTemplateValue | undefined, defaultValue = '') {
    return typeof value === 'string' ? value : defaultValue;
}

function sceneSize(template: SceneTemplate) {
    return {
        width: numericProp(template.props.width, previewWidth),
        height: numericProp(template.props.height, previewHeight),
    };
}

function sceneProjectRootPath(projectTree: ProjectFileTreeNode, scenePath: string) {
    const marker = '/scenes/';
    const index = scenePath.lastIndexOf(marker);
    return index >= 0 ? scenePath.slice(0, index) : projectTree.path;
}

function normalizedSceneReference(context: RenderContext, scene: string) {
    const normalized = scene.replace(/^\.\/+/, '').replace(/^\/+/, '');
    return normalized.startsWith(`${context.projectTree.path}/`)
        ? normalized
        : `${context.sceneRootPath}/${normalized}`;
}

async function loadSceneTemplate(context: RenderContext, scene: string) {
    const path = normalizedSceneReference(context, scene);
    const cached = context.templates.get(path);
    if (cached) {
        return cached;
    }

    const file = findFileByPath(context.projectTree, path);
    if (!file) {
        throw new Error(`找不到 Scene：${scene}`);
    }

    const template = parseSceneTemplate(await readProjectFileText(context.projectTree, file));
    context.templates.set(path, template);
    return template;
}

function createTextNode(node: PixiTemplateNode) {
    const style: Record<string, string | number> = {};
    for (const key of textStyleProps) {
        const value = node.props[key];
        if (value !== undefined) {
            style[key] = key === 'fontWeight' ? String(value) : value as string | number;
        }
    }
    return new Text({
        text: stringProp(node.props.text),
        style,
    });
}

function createPixiNode(node: PixiTemplateNode) {
    if (node.type === 'Text') {
        return createTextNode(node);
    }
    if (node.type === 'Sprite') {
        const texture = node.props.texture;
        return typeof texture === 'string' ? Sprite.from(texture) : new Sprite();
    }
    if (node.type === 'Graphics') {
        return new Graphics();
    }
    if (node.type === 'Container') {
        return new Container();
    }
    throw new Error(`Editor preview 暂不支持 <${node.type}>。`);
}

function applyGraphics(node: Container, props: Record<string, SceneTemplateValue>) {
    if (!(node instanceof Graphics)) {
        return;
    }
    const shape = props.shape;
    if (shape === 'roundRect') {
        node.roundRect(
            0,
            0,
            numericProp(props.width, 0),
            numericProp(props.height, 0),
            numericProp(props.radius, 0),
        );
        applyGraphicsStyles(node, props);
        return;
    }
    if (shape === 'rect') {
        node.rect(0, 0, numericProp(props.width, 0), numericProp(props.height, 0));
        applyGraphicsStyles(node, props);
    }
}

function applyGraphicsStyles(node: Graphics, props: Record<string, SceneTemplateValue>) {
    if (props.fillAlpha === undefined) {
        node.fill(numericProp(props.fill, 0xffffff));
    } else {
        node.fill({
            color: numericProp(props.fill, 0xffffff),
            alpha: numericProp(props.fillAlpha, 1),
        });
    }
    if (props.strokeWidth !== undefined) {
        node.stroke({
            width: numericProp(props.strokeWidth, 1),
            color: numericProp(props.strokeColor, 0x000000),
            alpha: numericProp(props.strokeAlpha, 1),
        });
    }
}

function applyNodeProps(target: Container, props: Record<string, SceneTemplateValue>, instance = false) {
    const x = props.x;
    const y = props.y;
    if (x !== undefined || y !== undefined) {
        target.position.set(numericProp(x, 0), numericProp(y, 0));
    }
    if (props.width !== undefined && props.shape === undefined) {
        target.width = numericProp(props.width, 0);
    }
    if (props.height !== undefined && props.shape === undefined) {
        target.height = numericProp(props.height, 0);
    }
    const scaleX = props.scaleX;
    const scaleY = props.scaleY;
    if (scaleX !== undefined || scaleY !== undefined) {
        target.scale.set(numericProp(scaleX, 1), numericProp(scaleY, 1));
    }
    if (props.rotation !== undefined) {
        target.rotation = numericProp(props.rotation, 0);
    }
    const pivotX = props.pivotX;
    const pivotY = props.pivotY;
    if (pivotX !== undefined || pivotY !== undefined) {
        target.pivot.set(numericProp(pivotX, 0), numericProp(pivotY, 0));
    }
    const skewX = props.skewX;
    const skewY = props.skewY;
    if (skewX !== undefined || skewY !== undefined) {
        target.skew.set(numericProp(skewX, 0), numericProp(skewY, 0));
    }
    if (target instanceof Sprite) {
        const anchorX = props.anchorX;
        const anchorY = props.anchorY;
        if (anchorX !== undefined || anchorY !== undefined) {
            target.anchor.set(numericProp(anchorX, 0), numericProp(anchorY, 0));
        }
        if (props.tint !== undefined) {
            target.tint = numericProp(props.tint, 0xffffff);
        }
    }
    if (!instance && props.shape !== undefined) {
        applyGraphics(target, props);
    }

    for (const [key, value] of Object.entries(props)) {
        if (transformProps.has(key) || spriteProps.has(key) || graphicsProps.has(key) || key === 'text' || textStyleProps.has(key)) {
            continue;
        }
        if (instance || pixiProps.has(key)) {
            (target as unknown as Record<string, unknown>)[key] = value;
        }
    }
}

async function renderScene(template: SceneTemplate, context: RenderContext): Promise<RenderedCompilerScene> {
    const root = new Container({ label: template.name });
    const slots = new Map<string, Container>();
    const nodes = new Map<string, Container>();
    const size = sceneSize(template);

    applyNodeProps(root, template.props);
    await renderChildren(root, template.children, context, slots, nodes);

    return {
        root,
        slots,
        nodes,
        width: size.width,
        height: size.height,
    };
}

async function renderChildren(
    parent: Container,
    children: readonly SceneTemplateNode[],
    context: RenderContext,
    slots: Map<string, Container>,
    nodes: Map<string, Container>,
) {
    for (const [index, child] of children.entries()) {
        if (child.kind === 'slotOutlet') {
            slots.set(child.name, parent);
            continue;
        }
        const display = await renderNode(child, context, slots, nodes, context.locatorPath ? `${context.locatorPath}/${index}` : String(index));
        if (child.props.zIndex !== undefined) {
            parent.sortableChildren = true;
        }
        parent.addChild(display);
    }
}

async function renderSceneInstance(node: SceneInstanceTemplateNode, context: RenderContext, nodes: Map<string, Container>) {
    const template = await loadSceneTemplate(context, node.scene);
    const rendered = await renderScene(template, context);

    rendered.root.label = node.id ?? node.type;
    applyNodeProps(rendered.root, node.props, true);

    for (const [slot, children] of Object.entries(node.slots)) {
        const host = rendered.slots.get(slot);
        if (!host) {
            throw new Error(`${node.type} 缺少 slot：${slot}`);
        }
        await renderChildren(host, children, {
            ...context,
            locatorPath: `${context.locatorPath}/slot:${slot}`,
        }, rendered.slots, nodes);
    }

    return rendered.root;
}

async function renderNode(
    node: SceneTemplateNode,
    context: RenderContext,
    slots: Map<string, Container>,
    nodes: Map<string, Container>,
    path: string,
): Promise<Container> {
    if (node.kind === 'slotOutlet') {
        throw new Error('<slot> 只能放在容器内部。');
    }
    if (node.kind === 'sceneInstance') {
        const display = await renderSceneInstance(node, {
            ...context,
            locatorPath: compilerSceneNodeLocator(node, path),
        }, nodes);
        nodes.set(compilerSceneNodeLocator(node, path), display);
        return display;
    }

    const display = createPixiNode(node);
    display.label = node.id ?? node.type;
    applyNodeProps(display, node.props);
    const locator = compilerSceneNodeLocator(node, path);
    nodes.set(locator, display);
    await renderChildren(display, node.children, {
        ...context,
        locatorPath: locator,
    }, slots, nodes);
    return display;
}

function fitScene(root: Container, width: number, height: number) {
    const scaleLimit = width < 480 || height < 240 ? 4 : 1;
    const scale = Math.min(previewWidth / width, previewHeight / height, scaleLimit);
    root.scale.set(scale);
    root.position.set(
        (previewWidth - width * scale) / 2,
        (previewHeight - height * scale) / 2,
    );
}

function selectedCompilerNode(document: CompilerSceneDocument) {
    return document.selection.type === 'node' && document.selection.node !== '__scene__'
        ? document.selection.node
        : undefined;
}

function drawSelectionOutline(outline: Graphics, target: Container | undefined) {
    outline.clear();
    if (!target) {
        return;
    }

    const bounds = target.getBounds();
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || bounds.width <= 0 || bounds.height <= 0) {
        return;
    }

    outline
        .rect(bounds.x, bounds.y, bounds.width, bounds.height)
        .stroke({ width: 2, color: 0x16a34a, alpha: 1 });
}

export function CompilerSceneViewport({ document, projectTree }: CompilerSceneViewportProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const outlineRef = useRef<Graphics | undefined>(undefined);
    const nodesRef = useRef<Map<string, Container>>(new Map());
    const [status, setStatus] = useState('正在初始化编译器预览');

    useEffect(() => {
        const hostElement = hostRef.current;
        if (!hostElement) {
            return;
        }
        const host = hostElement;

        let cancelled = false;
        let initialized = false;
        let destroyed = false;
        const app = new PixiApplication();

        const destroyApp = () => {
            if (!initialized || destroyed) {
                return;
            }
            destroyed = true;
            app.destroy({ removeView: true }, { children: true });
        };

        async function boot() {
            try {
                await app.init({
                    width: previewWidth,
                    height: previewHeight,
                    background: 0xffffff,
                    backgroundAlpha: 0,
                    antialias: true,
                    autoDensity: true,
                    resolution: Math.min(window.devicePixelRatio || 1, 2),
                });
                initialized = true;

                if (cancelled) {
                    destroyApp();
                    return;
                }

                const context: RenderContext = {
                    projectTree,
                    sceneRootPath: sceneProjectRootPath(projectTree, document.scenePath),
                    locatorPath: '',
                    templates: new Map([[document.scenePath, document.template]]),
                };
                const rendered = await renderScene(document.template, context);

                if (cancelled) {
                    destroyApp();
                    return;
                }

                fitScene(rendered.root, rendered.width, rendered.height);
                app.stage.addChild(rendered.root);
                nodesRef.current = rendered.nodes;
                const outline = new Graphics();
                outline.eventMode = 'none';
                outlineRef.current = outline;
                app.stage.addChild(outline);
                drawSelectionOutline(outline, rendered.nodes.get(selectedCompilerNode(document) ?? ''));
                app.canvas.className = 'pixifactCanvas';
                host.appendChild(app.canvas);
                setStatus('');
            } catch (error) {
                setStatus(error instanceof Error ? error.message : '编译器预览初始化失败');
                destroyApp();
            }
        }

        void boot();

        return () => {
            cancelled = true;
            outlineRef.current = undefined;
            nodesRef.current = new Map();
            destroyApp();
        };
    }, [document.scenePath, document.template, projectTree]);

    useEffect(() => {
        const outline = outlineRef.current;
        if (!outline) {
            return;
        }
        drawSelectionOutline(outline, nodesRef.current.get(selectedCompilerNode(document) ?? ''));
    }, [document.selection]);

    return (
        <div className="pixifactViewportHost" ref={hostRef}>
            {status ? <div className="runtimeStatus">{status}</div> : null}
        </div>
    );
}
