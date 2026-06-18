import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { Application as PixiApplication, Container } from 'pixi.js';
import { defaultPixifactProjectResolution } from 'pixifact';
import { normalizeSceneAssetId } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import {
    getCompilerSceneNode,
    selectCompilerSceneNode,
    selectCompilerSceneRoot,
    updateCompilerSceneNodePropsInPlace,
} from '../document/compilerSceneDocumentController';
import type { CompilerSceneDocument } from '../document/compilerSceneDocumentController';
import {
    beginSceneViewProfile,
    countSceneViewProfile,
    endSceneViewProfile,
    measureSceneViewProfile,
} from '../services/sceneViewProfiler';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { createCompilerSceneRuntimePreview, destroyCompilerSceneRuntimePreview } from './compilerSceneRuntimePreview';

interface CompilerSceneViewportProps {
    document: CompilerSceneDocument;
    projectResolution?: ViewportSize;
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

export interface CompilerSceneRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

type SelectionRect = CompilerSceneRect;
export interface CompilerSceneHitTarget {
    bounds?: CompilerSceneRect;
    locator?: string;
}

export interface CompilerSceneMoveProps {
    x?: unknown;
    y?: unknown;
}

interface ViewportModel {
    gridVisible: boolean;
    mode: 'fit' | 'manual';
    projectResolution: ViewportSize;
    scene: ViewportSize;
    transform: ViewportTransform;
}

interface MoveSession {
    locator: string;
    mergeKey: string;
    pointerId: number;
    profileId?: number;
    started: boolean;
    startPoint: ViewportPoint;
    startProps: CompilerSceneMoveProps;
}

const previewWidth = 960;
const previewHeight = 540;
const gridSize = 24;
const gridPlaneOffset = 12000;
const minViewportScale = 0.1;
const maxViewportScale = 8;
const dragThreshold = 4;

export const compilerScenePreviewEventFeatures = {
    click: false,
    globalMove: false,
    move: false,
    wheel: false,
};

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
    const scenePoint = viewportPointToScenePoint(current, viewportPoint);
    return {
        scale,
        offset: {
            x: viewportPoint.x - scenePoint.x * scale,
            y: viewportPoint.y - scenePoint.y * scale,
        },
    };
}

export function viewportPointToScenePoint(transform: ViewportTransform, point: ViewportPoint): ViewportPoint {
    return {
        x: (point.x - transform.offset.x) / transform.scale,
        y: (point.y - transform.offset.y) / transform.scale,
    };
}

export function viewportDeltaToSceneDelta(transform: Pick<ViewportTransform, 'scale'>, delta: ViewportPoint): ViewportPoint {
    return {
        x: delta.x / transform.scale,
        y: delta.y / transform.scale,
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

export function viewportTransformStyle(transform: ViewportTransform): React.CSSProperties {
    return {
        transform: `translate(${transform.offset.x}px, ${transform.offset.y}px) scale(${transform.scale})`,
    };
}

export function gridTransformStyle(transform: ViewportTransform): React.CSSProperties {
    return {
        transform: `translate(${transform.offset.x - gridPlaneOffset * transform.scale}px, ${transform.offset.y - gridPlaneOffset * transform.scale}px) scale(${transform.scale})`,
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

function compilerSceneRectIsVisible(rect: CompilerSceneRect) {
    return Number.isFinite(rect.x)
        && Number.isFinite(rect.y)
        && Number.isFinite(rect.width)
        && Number.isFinite(rect.height)
        && rect.width > 0
        && rect.height > 0;
}

export function compilerScenePointInRect(point: ViewportPoint, rect: CompilerSceneRect) {
    return point.x >= rect.x
        && point.x <= rect.x + rect.width
        && point.y >= rect.y
        && point.y <= rect.y + rect.height;
}

export function isEditableCompilerSceneHitTarget(target: CompilerSceneHitTarget) {
    const finalSegment = target.locator?.split('/').at(-1);
    return Boolean(
        target.locator
        && target.locator !== '__scene__'
        && !finalSegment?.startsWith('slot:')
        && target.bounds
        && compilerSceneRectIsVisible(target.bounds),
    );
}

export function pickTopCompilerSceneHit(targets: readonly CompilerSceneHitTarget[], point: ViewportPoint) {
    for (let index = targets.length - 1; index >= 0; index -= 1) {
        const target = targets[index];
        if (!isEditableCompilerSceneHitTarget(target) || !target.bounds) {
            continue;
        }
        if (compilerScenePointInRect(point, target.bounds)) {
            return target.locator;
        }
    }
    return undefined;
}

export function selectCompilerSceneViewportHit(targets: readonly CompilerSceneHitTarget[], point: ViewportPoint) {
    const locator = pickTopCompilerSceneHit(targets, point);
    if (locator) {
        selectCompilerSceneNode(locator);
        return { type: 'node' as const, node: locator };
    }
    selectCompilerSceneRoot();
    return { type: 'scene' as const };
}

export function moveCompilerSceneNodeProps(startProps: CompilerSceneMoveProps, deltaScene: ViewportPoint) {
    const startX = typeof startProps.x === 'number' ? startProps.x : 0;
    const startY = typeof startProps.y === 'number' ? startProps.y : 0;
    return {
        x: startX + deltaScene.x,
        y: startY + deltaScene.y,
    };
}

export function canBeginCompilerSceneMove(selectedLocator: string | undefined, hitLocator: string | undefined) {
    return Boolean(selectedLocator && hitLocator && selectedLocator === hitLocator);
}

function selectedCompilerNode(document: CompilerSceneDocument) {
    return document.selection.type === 'node' && document.selection.node !== '__scene__'
        ? document.selection.node
        : undefined;
}

function defaultViewportModel(projectResolution: ViewportSize = defaultPixifactProjectResolution): ViewportModel {
    const scene = { width: previewWidth, height: previewHeight };
    return {
        gridVisible: true,
        mode: 'fit',
        projectResolution,
        scene,
        transform: fitViewportTransform(scene, scene),
    };
}

export function compilerSceneSelectionRect(target: Pick<Container, 'getBounds'> | undefined): SelectionRect | undefined {
    if (!target) {
        return undefined;
    }

    const bounds = measureSceneViewProfile('viewport.getBounds', () => target.getBounds());
    if (!compilerSceneRectIsVisible(bounds)) {
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

function applyCompilerSceneNodePosition(target: Container, props: CompilerSceneMoveProps) {
    const x = typeof props.x === 'number' ? props.x : 0;
    const y = typeof props.y === 'number' ? props.y : 0;
    target.position.set(x, y);
}

function gridStyle(model: ViewportModel): React.CSSProperties {
    return {
        ...gridTransformStyle(model.transform),
        backgroundSize: `${gridSize}px ${gridSize}px`,
    };
}

function compilerSceneHitTargets(nodes: Map<string, Pick<Container, 'getBounds'>>): CompilerSceneHitTarget[] {
    return [...nodes.entries()].map(([locator, target]) => ({
        locator,
        bounds: compilerSceneSelectionRect(target),
    }));
}

export const CompilerSceneViewport = forwardRef<CompilerSceneViewportHandle, CompilerSceneViewportProps>(
    function CompilerSceneViewport({
        document,
        projectResolution = defaultPixifactProjectResolution,
        projectTree,
        onStateChange,
    }, ref) {
        const hostRef = useRef<HTMLDivElement | null>(null);
        const nodesRef = useRef<Map<string, Container>>(new Map());
        const previewRef = useRef<Awaited<ReturnType<typeof createCompilerSceneRuntimePreview>> | undefined>(undefined);
        const viewportRef = useRef<ViewportSize>({ width: previewWidth, height: previewHeight });
        const transformRef = useRef<ViewportTransform>(defaultViewportModel(projectResolution).transform);
        const selectedNodeRef = useRef<string | undefined>(undefined);
        const spacePressedRef = useRef(false);
        const panRef = useRef<{ pointerId: number; last: ViewportPoint } | undefined>(undefined);
        const clickRef = useRef<{ pointerId: number; start: ViewportPoint } | undefined>(undefined);
        const moveRef = useRef<MoveSession | undefined>(undefined);
        const moveSessionRef = useRef(0);
        const [viewport, setViewport] = useState<ViewportSize>({ width: previewWidth, height: previewHeight });
        const [model, setModel] = useState<ViewportModel>(() => defaultViewportModel(projectResolution));
        const [outline, setOutline] = useState<SelectionRect | undefined>(undefined);
        const [status, setStatus] = useState('正在初始化编译器预览');

        selectedNodeRef.current = selectedCompilerNode(document);

        const updateModel = useCallback((updater: (current: ViewportModel) => ViewportModel) => {
            setModel((current) => {
                const next = updater(current);
                applyTransform(previewRef.current?.root, next.transform);
                transformRef.current = next.transform;
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
            updateModel((current) => ({
                ...current,
                projectResolution,
            }));
        }, [projectResolution, updateModel]);

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
            transformRef.current = initialTransform;
            setViewport(initialViewport);
            setModel({
                gridVisible: true,
                mode: 'fit',
                projectResolution,
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
                    transformRef.current = transform;
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
                        backgroundAlpha: 0,
                        antialias: true,
                        autoDensity: true,
                        eventFeatures: compilerScenePreviewEventFeatures,
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
                    transformRef.current = transform;
                    app.stage.addChild(preview.root);
                    nodesRef.current = preview.nodes;
                    setModel((current) => ({
                        ...current,
                        mode: 'fit',
                        scene,
                        transform,
                    }));
                    setOutline(compilerSceneSelectionRect(nodesRef.current.get(selectedNodeRef.current ?? '')));
                    app.canvas.className = 'pixifactCanvas compilerSceneCanvas';
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
                clickRef.current = undefined;
                moveRef.current = undefined;
                spacePressedRef.current = false;
                destroyPreview();
                destroyApp();
            };
        }, [document.scenePath, document.template, projectTree]);

        useEffect(() => {
            setOutline(compilerSceneSelectionRect(nodesRef.current.get(selectedCompilerNode(document) ?? '')));
        }, [document.selection, model.transform]);

        useEffect(() => {
            const move = moveRef.current;
            if (!move) {
                const selected = selectedCompilerNode(document);
                const node = selected ? getCompilerSceneNode(selected) : undefined;
                const target = selected ? nodesRef.current.get(selected) : undefined;
                if (node && node.kind !== 'slotOutlet' && target) {
                    applyCompilerSceneNodePosition(target, node.props);
                    setOutline(compilerSceneSelectionRect(target));
                }
            }
        }, [document]);

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
                if (event.button === 0) {
                    hostRef.current?.focus();
                    const start = clientPoint(event);
                    const hitLocator = pickTopCompilerSceneHit(compilerSceneHitTargets(nodesRef.current), start);
                    const selectedLocator = selectedNodeRef.current;
                    if (canBeginCompilerSceneMove(selectedLocator, hitLocator)) {
                        const node = getCompilerSceneNode(selectedLocator!);
                        if (node && node.kind !== 'slotOutlet') {
                            event.preventDefault();
                            moveSessionRef.current += 1;
                            hostRef.current?.setPointerCapture(event.pointerId);
                            moveRef.current = {
                                locator: selectedLocator!,
                                mergeKey: `scene-view:move:${selectedLocator}:${moveSessionRef.current}`,
                                pointerId: event.pointerId,
                                profileId: beginSceneViewProfile('move', { locator: selectedLocator }),
                                started: false,
                                startPoint: start,
                                startProps: {
                                    x: node.props.x,
                                    y: node.props.y,
                                },
                            };
                            return;
                        }
                    }
                    clickRef.current = {
                        pointerId: event.pointerId,
                        start,
                    };
                }
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
            const move = moveRef.current;
            if (move?.pointerId === event.pointerId) {
                countSceneViewProfile('viewport.pointermove');
                event.preventDefault();
                const nextPoint = clientPoint(event);
                const deltaViewport = {
                    x: nextPoint.x - move.startPoint.x,
                    y: nextPoint.y - move.startPoint.y,
                };
                const passedThreshold = move.started || Math.hypot(deltaViewport.x, deltaViewport.y) > dragThreshold;
                if (!passedThreshold) {
                    return;
                }
                move.started = true;
                countSceneViewProfile('viewport.moveUpdate');
                const deltaScene = viewportDeltaToSceneDelta(transformRef.current, deltaViewport);
                const nextProps = moveCompilerSceneNodeProps(move.startProps, deltaScene);
                const target = nodesRef.current.get(move.locator);
                const node = getCompilerSceneNode(move.locator);
                if (!target || !node || node.kind === 'slotOutlet') {
                    moveRef.current = undefined;
                    hostRef.current?.releasePointerCapture(event.pointerId);
                    return;
                }
                updateCompilerSceneNodePropsInPlace(move.locator, nextProps, { mergeKey: move.mergeKey });
                applyCompilerSceneNodePosition(target, nextProps);
                setOutline(compilerSceneSelectionRect(target));
                return;
            }

            const pan = panRef.current;
            if (!pan || pan.pointerId !== event.pointerId) {
                const click = clickRef.current;
                if (click?.pointerId === event.pointerId) {
                    const nextPoint = clientPoint(event);
                    if (Math.hypot(nextPoint.x - click.start.x, nextPoint.y - click.start.y) > dragThreshold) {
                        clickRef.current = undefined;
                    }
                }
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
            if (moveRef.current?.pointerId === event.pointerId) {
                endSceneViewProfile(moveRef.current.profileId, { committed: moveRef.current.started });
                moveRef.current = undefined;
                hostRef.current?.releasePointerCapture(event.pointerId);
                return;
            }
            if (panRef.current?.pointerId === event.pointerId) {
                panRef.current = undefined;
                hostRef.current?.releasePointerCapture(event.pointerId);
                return;
            }
            if (clickRef.current?.pointerId === event.pointerId) {
                clickRef.current = undefined;
                selectCompilerSceneViewportHit(compilerSceneHitTargets(nodesRef.current), clientPoint(event));
            }
        };

        const cancelPointer = (event: React.PointerEvent<HTMLDivElement>) => {
            if (moveRef.current?.pointerId === event.pointerId) {
                endSceneViewProfile(moveRef.current.profileId, { cancelled: true });
                moveRef.current = undefined;
                hostRef.current?.releasePointerCapture(event.pointerId);
            }
            if (panRef.current?.pointerId === event.pointerId) {
                panRef.current = undefined;
                hostRef.current?.releasePointerCapture(event.pointerId);
            }
            if (clickRef.current?.pointerId === event.pointerId) {
                clickRef.current = undefined;
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
                onPointerCancel={cancelPointer}
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
                        className="compilerSceneResolutionBounds"
                        fill="none"
                        height={model.projectResolution.height * model.transform.scale}
                        vectorEffect="non-scaling-stroke"
                        width={model.projectResolution.width * model.transform.scale}
                        x={model.transform.offset.x}
                        y={model.transform.offset.y}
                    />
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
