import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { Application as PixiApplication, Container } from 'pixi.js';
import { normalizeSceneAssetId } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import type { CompilerSceneDocument } from '../document/compilerSceneDocumentController';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { createCompilerSceneRuntimePreview, destroyCompilerSceneRuntimePreview } from './compilerSceneRuntimePreview';

interface CompilerSceneViewportProps {
    document: CompilerSceneDocument;
    projectTree: ProjectFileTreeNode;
    onStateChange?: (state: CompilerSceneViewportState) => void;
}

export interface ViewportSize {
    width: number;
    height: number;
}

export interface ViewportPoint {
    x: number;
    y: number;
}

export interface ViewportTransform {
    scale: number;
    offset: ViewportPoint;
}

export interface CompilerSceneViewportState {
    gridVisible: boolean;
    mode: 'fit' | 'manual';
    scene: ViewportSize;
    scale: number;
}

export interface CompilerSceneViewportHandle {
    fit: () => void;
    setActualSize: () => void;
    toggleGrid: () => void;
}

interface SelectionRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ViewportModel {
    gridVisible: boolean;
    mode: 'fit' | 'manual';
    scene: ViewportSize;
    transform: ViewportTransform;
}

const previewWidth = 960;
const previewHeight = 540;
const gridSize = 24;
const minViewportScale = 0.1;
const maxViewportScale = 8;

export function clampViewportScale(scale: number) {
    return Math.min(maxViewportScale, Math.max(minViewportScale, scale));
}

export function fitViewportTransform(scene: ViewportSize, viewport: ViewportSize): ViewportTransform {
    const scaleLimit = scene.width < 480 || scene.height < 240 ? 4 : 1;
    const scale = clampViewportScale(Math.min(
        viewport.width / scene.width,
        viewport.height / scene.height,
        scaleLimit,
    ));
    return centeredViewportTransform(scene, viewport, scale);
}

export function actualSizeViewportTransform(scene: ViewportSize, viewport: ViewportSize): ViewportTransform {
    return centeredViewportTransform(scene, viewport, 1);
}

export function centeredViewportTransform(scene: ViewportSize, viewport: ViewportSize, scale: number): ViewportTransform {
    const nextScale = clampViewportScale(scale);
    return {
        scale: nextScale,
        offset: {
            x: (viewport.width - scene.width * nextScale) / 2,
            y: (viewport.height - scene.height * nextScale) / 2,
        },
    };
}

export function zoomViewportTransform(
    current: ViewportTransform,
    viewportPoint: ViewportPoint,
    scaleDelta: number,
): ViewportTransform {
    const scale = clampViewportScale(current.scale * scaleDelta);
    const sceneX = (viewportPoint.x - current.offset.x) / current.scale;
    const sceneY = (viewportPoint.y - current.offset.y) / current.scale;
    return {
        scale,
        offset: {
            x: viewportPoint.x - sceneX * scale,
            y: viewportPoint.y - sceneY * scale,
        },
    };
}

export function panViewportTransform(current: ViewportTransform, delta: ViewportPoint): ViewportTransform {
    return {
        ...current,
        offset: {
            x: current.offset.x + delta.x,
            y: current.offset.y + delta.y,
        },
    };
}

export function resizeManualViewportTransform(
    current: ViewportTransform,
    previousViewport: ViewportSize,
    nextViewport: ViewportSize,
): ViewportTransform {
    return {
        ...current,
        offset: {
            x: current.offset.x + (nextViewport.width - previousViewport.width) / 2,
            y: current.offset.y + (nextViewport.height - previousViewport.height) / 2,
        },
    };
}

function selectedCompilerNode(document: CompilerSceneDocument) {
    return document.selection.type === 'node' && document.selection.node !== '__scene__'
        ? document.selection.node
        : undefined;
}

function defaultViewportModel(): ViewportModel {
    const scene = { width: previewWidth, height: previewHeight };
    return {
        gridVisible: false,
        mode: 'fit',
        scene,
        transform: fitViewportTransform(scene, scene),
    };
}

export function compilerSceneSelectionRect(target: Pick<Container, 'getBounds'> | undefined): SelectionRect | undefined {
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

function applyTransform(root: Container | undefined, transform: ViewportTransform) {
    if (!root) {
        return;
    }
    root.scale.set(transform.scale);
    root.position.set(transform.offset.x, transform.offset.y);
}

function gridStyle(model: ViewportModel): React.CSSProperties {
    const size = Math.max(1, gridSize * model.transform.scale);
    return {
        backgroundPosition: `${model.transform.offset.x}px ${model.transform.offset.y}px`,
        backgroundSize: `${size}px ${size}px`,
    };
}

export const CompilerSceneViewport = forwardRef<CompilerSceneViewportHandle, CompilerSceneViewportProps>(
    function CompilerSceneViewport({ document, projectTree, onStateChange }, ref) {
        const hostRef = useRef<HTMLDivElement | null>(null);
        const nodesRef = useRef<Map<string, Container>>(new Map());
        const previewRef = useRef<Awaited<ReturnType<typeof createCompilerSceneRuntimePreview>> | undefined>(undefined);
        const viewportRef = useRef<ViewportSize>({ width: previewWidth, height: previewHeight });
        const selectedNodeRef = useRef<string | undefined>(undefined);
        const spacePressedRef = useRef(false);
        const panRef = useRef<{ pointerId: number; last: ViewportPoint } | undefined>(undefined);
        const [viewport, setViewport] = useState<ViewportSize>({ width: previewWidth, height: previewHeight });
        const [model, setModel] = useState<ViewportModel>(() => defaultViewportModel());
        const [outline, setOutline] = useState<SelectionRect | undefined>(undefined);
        const [status, setStatus] = useState('正在初始化编译器预览');

        selectedNodeRef.current = selectedCompilerNode(document);

        const updateModel = useCallback((updater: (current: ViewportModel) => ViewportModel) => {
            setModel((current) => {
                const next = updater(current);
                applyTransform(previewRef.current?.root, next.transform);
                setOutline(compilerSceneSelectionRect(nodesRef.current.get(selectedNodeRef.current ?? '')));
                return next;
            });
        }, []);

        useImperativeHandle(ref, () => ({
            fit() {
                updateModel((current) => ({
                    ...current,
                    mode: 'fit',
                    transform: fitViewportTransform(current.scene, viewportRef.current),
                }));
            },
            setActualSize() {
                updateModel((current) => ({
                    ...current,
                    mode: 'manual',
                    transform: actualSizeViewportTransform(current.scene, viewportRef.current),
                }));
            },
            toggleGrid() {
                updateModel((current) => ({
                    ...current,
                    gridVisible: !current.gridVisible,
                }));
            },
        }), [updateModel]);

        useEffect(() => {
            onStateChange?.({
                gridVisible: model.gridVisible,
                mode: model.mode,
                scene: model.scene,
                scale: model.transform.scale,
            });
        }, [model, onStateChange]);

        useEffect(() => {
            const hostElement = hostRef.current;
            if (!hostElement) {
                return;
            }
            const host = hostElement;
            const initialScene = { width: previewWidth, height: previewHeight };
            const initialViewport = hostSize(host);
            const initialTransform = fitViewportTransform(initialScene, initialViewport);
            viewportRef.current = initialViewport;
            setViewport(initialViewport);
            setModel({
                gridVisible: false,
                mode: 'fit',
                scene: initialScene,
                transform: initialTransform,
            });
            setOutline(undefined);
            setStatus('正在初始化编译器预览');

            let cancelled = false;
            let initialized = false;
            let destroyed = false;
            const app = new PixiApplication();
            let destroyPreview = () => {};
            let resizeObserver: ResizeObserver | undefined;

            const resizeViewport = (nextViewport: ViewportSize) => {
                const previousViewport = viewportRef.current;
                viewportRef.current = nextViewport;
                setViewport(nextViewport);
                if (initialized) {
                    app.renderer.resize(nextViewport.width, nextViewport.height);
                }
                setModel((current) => {
                    const transform = current.mode === 'fit'
                        ? fitViewportTransform(current.scene, nextViewport)
                        : resizeManualViewportTransform(current.transform, previousViewport, nextViewport);
                    const next = {
                        ...current,
                        transform,
                    };
                    applyTransform(previewRef.current?.root, transform);
                    setOutline(compilerSceneSelectionRect(nodesRef.current.get(selectedNodeRef.current ?? '')));
                    return next;
                });
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

                    const scene = { width: preview.width, height: preview.height };
                    const transform = fitViewportTransform(scene, viewportRef.current);
                    applyTransform(preview.root, transform);
                    app.stage.addChild(preview.root);
                    nodesRef.current = preview.nodes;
                    setModel((current) => ({
                        ...current,
                        mode: 'fit',
                        scene,
                        transform,
                    }));
                    setOutline(compilerSceneSelectionRect(nodesRef.current.get(selectedNodeRef.current ?? '')));
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
                panRef.current = undefined;
                spacePressedRef.current = false;
                destroyPreview();
                destroyApp();
            };
        }, [document.scenePath, document.template, projectTree]);

        useEffect(() => {
            setOutline(compilerSceneSelectionRect(nodesRef.current.get(selectedCompilerNode(document) ?? '')));
        }, [document.selection, model.transform]);

        const clientPoint = (event: React.PointerEvent | React.WheelEvent): ViewportPoint => {
            const bounds = hostRef.current?.getBoundingClientRect();
            return {
                x: event.clientX - (bounds?.left ?? 0),
                y: event.clientY - (bounds?.top ?? 0),
            };
        };

        const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
            const middleButton = event.button === 1;
            const spaceLeftButton = event.button === 0 && spacePressedRef.current;
            if (!middleButton && !spaceLeftButton) {
                return;
            }

            event.preventDefault();
            hostRef.current?.focus();
            hostRef.current?.setPointerCapture(event.pointerId);
            panRef.current = {
                pointerId: event.pointerId,
                last: clientPoint(event),
            };
        };

        const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
            const pan = panRef.current;
            if (!pan || pan.pointerId !== event.pointerId) {
                return;
            }
            event.preventDefault();
            const nextPoint = clientPoint(event);
            const delta = {
                x: nextPoint.x - pan.last.x,
                y: nextPoint.y - pan.last.y,
            };
            panRef.current = {
                ...pan,
                last: nextPoint,
            };
            updateModel((current) => ({
                ...current,
                mode: 'manual',
                transform: panViewportTransform(current.transform, delta),
            }));
        };

        const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
            if (panRef.current?.pointerId === event.pointerId) {
                panRef.current = undefined;
                hostRef.current?.releasePointerCapture(event.pointerId);
            }
        };

        const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
            event.preventDefault();
            const scaleDelta = Math.exp(-event.deltaY * 0.001);
            updateModel((current) => ({
                ...current,
                mode: 'manual',
                transform: zoomViewportTransform(current.transform, clientPoint(event), scaleDelta),
            }));
        };

        const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.code === 'Space' && !event.repeat) {
                event.preventDefault();
                spacePressedRef.current = true;
            }
        };

        const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.code === 'Space') {
                event.preventDefault();
                spacePressedRef.current = false;
            }
        };

        return (
            <div
                className="pixifactViewportHost"
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onPointerCancel={endPan}
                onPointerDown={beginPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onWheel={handleWheel}
                ref={hostRef}
                tabIndex={0}
            >
                {model.gridVisible ? <div aria-hidden="true" className="compilerSceneGrid" style={gridStyle(model)} /> : null}
                <svg
                    aria-hidden="true"
                    className="compilerSceneOverlay"
                    viewBox={`0 0 ${viewport.width} ${viewport.height}`}
                >
                    <rect
                        className="compilerSceneBounds"
                        fill="none"
                        height={model.scene.height * model.transform.scale}
                        vectorEffect="non-scaling-stroke"
                        width={model.scene.width * model.transform.scale}
                        x={model.transform.offset.x}
                        y={model.transform.offset.y}
                    />
                    {outline ? (
                        <rect
                            className="compilerSceneSelection"
                            fill="none"
                            height={outline.height}
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
    },
);
