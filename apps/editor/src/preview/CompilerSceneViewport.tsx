import { useEffect, useRef, useState } from 'react';
import {
    Application as PixiApplication,
    Container,
    Graphics,
    Sprite,
    Text,
} from 'pixi.js';
import { parseSceneTemplate } from '../../../../packages/pixifact/src/compiler/templateParser';
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
    width: number;
    height: number;
}

interface RenderContext {
    projectTree: ProjectFileTreeNode;
    sceneRootPath: string;
    templates: Map<string, SceneTemplate>;
}

const previewWidth = 960;
const previewHeight = 540;
const transformProps = new Set(['x', 'y', 'width', 'height']);
const pixiProps = new Set(['alpha', 'visible', 'eventMode', 'cursor', 'label']);
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
        ).fill(numericProp(props.fill, 0xffffff));
        return;
    }
    if (shape === 'rect') {
        node.rect(0, 0, numericProp(props.width, 0), numericProp(props.height, 0))
            .fill(numericProp(props.fill, 0xffffff));
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
    if (!instance && props.shape !== undefined) {
        applyGraphics(target, props);
    }

    for (const [key, value] of Object.entries(props)) {
        if (transformProps.has(key) || key === 'shape' || key === 'radius' || key === 'fill' || key === 'texture' || key === 'text' || textStyleProps.has(key)) {
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
    const size = sceneSize(template);

    applyNodeProps(root, template.props);
    await renderChildren(root, template.children, context, slots);

    return {
        root,
        slots,
        width: size.width,
        height: size.height,
    };
}

async function renderChildren(
    parent: Container,
    children: readonly SceneTemplateNode[],
    context: RenderContext,
    slots: Map<string, Container>,
) {
    for (const child of children) {
        if (child.kind === 'slotOutlet') {
            slots.set(child.name, parent);
            continue;
        }
        parent.addChild(await renderNode(child, context, slots));
    }
}

async function renderSceneInstance(node: SceneInstanceTemplateNode, context: RenderContext) {
    const template = await loadSceneTemplate(context, node.scene);
    const rendered = await renderScene(template, context);

    rendered.root.label = node.id ?? node.type;
    applyNodeProps(rendered.root, node.props, true);

    for (const [slot, children] of Object.entries(node.slots)) {
        const host = rendered.slots.get(slot);
        if (!host) {
            throw new Error(`${node.type} 缺少 slot：${slot}`);
        }
        await renderChildren(host, children, context, rendered.slots);
    }

    return rendered.root;
}

async function renderNode(node: SceneTemplateNode, context: RenderContext, slots: Map<string, Container>): Promise<Container> {
    if (node.kind === 'slotOutlet') {
        throw new Error('<slot> 只能放在容器内部。');
    }
    if (node.kind === 'sceneInstance') {
        return renderSceneInstance(node, context);
    }

    const display = createPixiNode(node);
    display.label = node.id ?? node.type;
    applyNodeProps(display, node.props);
    await renderChildren(display, node.children, context, slots);
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

export function CompilerSceneViewport({ document, projectTree }: CompilerSceneViewportProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
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
                    templates: new Map([[document.scenePath, document.template]]),
                };
                const rendered = await renderScene(document.template, context);

                if (cancelled) {
                    destroyApp();
                    return;
                }

                fitScene(rendered.root, rendered.width, rendered.height);
                app.stage.addChild(rendered.root);
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
            destroyApp();
        };
    }, [document.scenePath, document.template, projectTree]);

    return (
        <div className="pixifactViewportHost" ref={hostRef}>
            {status ? <div className="runtimeStatus">{status}</div> : null}
        </div>
    );
}
