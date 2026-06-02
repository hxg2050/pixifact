import { useEffect, useRef, useState } from 'react';
import { Application as PixiApplication, Container } from 'pixi.js';
import { normalizeSceneAssetId } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import type { CompilerSceneDocument } from '../document/compilerSceneDocumentController';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { createCompilerSceneRuntimePreview, destroyCompilerSceneRuntimePreview } from './compilerSceneRuntimePreview';

interface CompilerSceneViewportProps {
    document: CompilerSceneDocument;
    projectTree: ProjectFileTreeNode;
}

const previewWidth = 960;
const previewHeight = 540;

interface ViewportSize {
    width: number;
    height: number;
}

interface SelectionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function fitScene(root: Container, width: number, height: number, viewport: ViewportSize) {
    const scaleLimit = width < 480 || height < 240 ? 4 : 1;
    const scale = Math.min(viewport.width / width, viewport.height / height, scaleLimit);
    root.scale.set(scale);
    root.position.set(
        (viewport.width - width * scale) / 2,
        (viewport.height - height * scale) / 2,
    );
}

function selectedCompilerNode(document: CompilerSceneDocument) {
    return document.selection.type === 'node' && document.selection.node !== '__scene__'
        ? document.selection.node
        : undefined;
}

function selectionRect(target: Container | undefined): SelectionRect | undefined {
    if (!target) {
        return undefined;
    }

    const bounds = target.getBounds();
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || bounds.width <= 0 || bounds.height <= 0) {
        return undefined;
    }

    return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
    };
}

function hostSize(host: HTMLElement): ViewportSize {
    const bounds = host.getBoundingClientRect();
    return {
        width: Math.max(1, Math.floor(bounds.width || previewWidth)),
        height: Math.max(1, Math.floor(bounds.height || previewHeight)),
    };
}

export function CompilerSceneViewport({ document, projectTree }: CompilerSceneViewportProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const nodesRef = useRef<Map<string, Container>>(new Map());
    const previewRef = useRef<Awaited<ReturnType<typeof createCompilerSceneRuntimePreview>> | undefined>(undefined);
    const viewportRef = useRef<ViewportSize>({ width: previewWidth, height: previewHeight });
    const selectedNodeRef = useRef<string | undefined>(undefined);
    const [viewport, setViewport] = useState<ViewportSize>({ width: previewWidth, height: previewHeight });
    const [outline, setOutline] = useState<SelectionRect | undefined>(undefined);
    const [status, setStatus] = useState('正在初始化编译器预览');

    selectedNodeRef.current = selectedCompilerNode(document);

    useEffect(() => {
        const hostElement = hostRef.current;
        if (!hostElement) {
            return;
        }
        const host = hostElement;
        setOutline(undefined);
        setStatus('正在初始化编译器预览');

        let cancelled = false;
        let initialized = false;
        let destroyed = false;
        const app = new PixiApplication();
        let destroyPreview = () => {};
        let resizeObserver: ResizeObserver | undefined;

        const updateSelectionOutline = () => {
            setOutline(selectionRect(nodesRef.current.get(selectedNodeRef.current ?? '')));
        };

        const resizeViewport = (next: ViewportSize) => {
            viewportRef.current = next;
            setViewport(next);
            if (initialized) {
                app.renderer.resize(next.width, next.height);
            }
            const preview = previewRef.current;
            if (preview) {
                fitScene(preview.root, preview.width, preview.height, next);
                updateSelectionOutline();
            }
        };

        const destroyApp = () => {
            if (!initialized || destroyed) {
                return;
            }
            destroyed = true;
            app.destroy({ removeView: true }, { children: true });
        };

        async function boot() {
            try {
                const initialViewport = hostSize(host);
                viewportRef.current = initialViewport;
                setViewport(initialViewport);
                await app.init({
                    width: initialViewport.width,
                    height: initialViewport.height,
                    background: 0x020617,
                    backgroundAlpha: 1,
                    antialias: true,
                    autoDensity: true,
                    resolution: Math.min(window.devicePixelRatio || 1, 2),
                });
                initialized = true;

                if (cancelled) {
                    destroyApp();
                    return;
                }

                resizeObserver = new ResizeObserver(() => resizeViewport(hostSize(host)));
                resizeObserver.observe(host);

                const scenePath = normalizeSceneAssetId(document.scenePath.slice(projectTree.path.length + 1));
                const preview = await createCompilerSceneRuntimePreview({
                    document,
                    projectTree,
                    scenePath,
                });
                previewRef.current = preview;
                destroyPreview = () => destroyCompilerSceneRuntimePreview(preview);

                if (cancelled) {
                    destroyPreview();
                    destroyApp();
                    return;
                }

                fitScene(preview.root, preview.width, preview.height, viewportRef.current);
                app.stage.addChild(preview.root);
                nodesRef.current = preview.nodes;
                updateSelectionOutline();
                app.canvas.className = 'pixifactCanvas';
                host.appendChild(app.canvas);
                setStatus('');
            } catch (error) {
                setStatus(error instanceof Error ? error.message : '编译器预览初始化失败');
                destroyPreview();
                destroyApp();
            }
        }

        void boot();

        return () => {
            cancelled = true;
            resizeObserver?.disconnect();
            previewRef.current = undefined;
            nodesRef.current = new Map();
            destroyPreview();
            destroyApp();
        };
    }, [document.scenePath, document.template, projectTree]);

    useEffect(() => {
        setOutline(selectionRect(nodesRef.current.get(selectedCompilerNode(document) ?? '')));
    }, [document.selection]);

    return (
        <div className="pixifactViewportHost" ref={hostRef}>
            <svg
                aria-hidden="true"
                className="compilerSceneOverlay"
                viewBox={`0 0 ${viewport.width} ${viewport.height}`}
            >
                {outline ? (
                    <rect
                        fill="none"
                        height={outline.height}
                        stroke="#16a34a"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                        width={outline.width}
                        x={outline.x}
                        y={outline.y}
                    />
                ) : null}
            </svg>
            {status ? <div className="runtimeStatus">{status}</div> : null}
        </div>
    );
}
