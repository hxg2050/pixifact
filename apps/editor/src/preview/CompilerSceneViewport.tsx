import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import { Application as PixiApplication, Container } from 'pixi.js';
import { defaultPixifactProjectResolution, defaultPixifactProjectViewport, type PixifactProjectViewport } from 'pixifact';
import { normalizeSceneAssetId } from 'pixifact/compiler';
import { calculatePixifactViewportLayout } from 'pixifact/runtime';
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
    getSceneViewProfilerSnapshot,
    measureSceneViewProfile,
    noteSceneViewProfile,
    subscribeSceneViewProfiler,
} from '../services/sceneViewProfiler';
import type { SceneViewProfilerSnapshot } from '../services/sceneViewProfiler';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import { createCompilerSceneRuntimePreview, destroyCompilerSceneRuntimePreview } from './compilerSceneRuntimePreview';

interface CompilerSceneViewportProps {
    diagnosticsVisible?: boolean;
    document: CompilerSceneDocument;
    fillsProjectResolution?: boolean;
    projectResolution?: ViewportSize;
    projectViewport?: PixifactProjectViewport;
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
    bottom?: unknown;
    height?: unknown;
    horizontal?: unknown;
    left?: unknown;
    right?: unknown;
    top?: unknown;
    vertical?: unknown;
    width?: unknown;
    x?: unknown;
    y?: unknown;
}

export type CompilerSceneResizeHandle = 'north' | 'west' | 'north-west' | 'east' | 'south' | 'south-east';
export type CompilerSceneHorizontalLayoutMode = 'free' | 'left' | 'right' | 'center' | 'stretch';
export type CompilerSceneVerticalLayoutMode = 'free' | 'top' | 'bottom' | 'center' | 'stretch';
type CompilerSceneMovePropKey = 'bottom' | 'horizontal' | 'left' | 'right' | 'top' | 'vertical' | 'x' | 'y';
type CompilerSceneMoveUpdateProps = Partial<Record<CompilerSceneMovePropKey, number>>;

interface ViewportModel {
    gridVisible: boolean;
    mode: 'fit' | 'manual';
    projectResolution: ViewportSize;
    projectViewport: PixifactProjectViewport;
    scene: ViewportSize;
    transform: ViewportTransform;
}

interface MoveSession {
    currentProps?: CompilerSceneMoveUpdateProps;
    locator: string;
    mergeKey: string;
    pointerId: number;
    profileId?: number;
    started: boolean;
    startBounds: CompilerSceneRect;
    startPoint: ViewportPoint;
    startProps: CompilerSceneMoveProps;
}

interface ResizeSession {
    currentProps?: {
        height?: number;
        width?: number;
        x?: number;
        y?: number;
    };
    handle: CompilerSceneResizeHandle;
    locator: string;
    mergeKey: string;
    pointerId: number;
    profileId?: number;
    started: boolean;
    startBounds: CompilerSceneRect;
    startPoint: ViewportPoint;
    startProps: CompilerSceneMoveProps;
    startSize: {
        height: number;
        width: number;
        x: number;
        y: number;
    };
}

const previewWidth = 960;
const previewHeight = 540;
const gridSize = 24;
const gridPlaneOffset = 12000;
const minViewportScale = 0.1;
const maxViewportScale = 8;
const dragThreshold = 4;
const minSceneNodeSize = 1;
const resizeHandleSize = 9;

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

export function projectPreviewSceneSize(
    resolution: ViewportSize,
    viewport: PixifactProjectViewport,
    screen: ViewportSize,
): ViewportSize {
    return calculatePixifactViewportLayout({
        resolution,
        screen,
        mode: viewport.mode,
    }).scene;
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
    const horizontalMode = resolveCompilerSceneHorizontalLayoutMode(startProps);
    const verticalMode = resolveCompilerSceneVerticalLayoutMode(startProps);
    const nextProps: CompilerSceneMoveUpdateProps = {};

    if (horizontalMode === 'stretch') {
        nextProps.left = numberSceneProp(startProps.left) + deltaScene.x;
        nextProps.right = numberSceneProp(startProps.right) - deltaScene.x;
    } else if (horizontalMode === 'left') {
        nextProps.left = numberSceneProp(startProps.left) + deltaScene.x;
    } else if (horizontalMode === 'right') {
        nextProps.right = numberSceneProp(startProps.right) - deltaScene.x;
    } else if (horizontalMode === 'center') {
        nextProps.horizontal = numberSceneProp(startProps.horizontal) + deltaScene.x;
    } else {
        nextProps.x = numberSceneProp(startProps.x) + deltaScene.x;
    }

    if (verticalMode === 'stretch') {
        nextProps.top = numberSceneProp(startProps.top) + deltaScene.y;
        nextProps.bottom = numberSceneProp(startProps.bottom) - deltaScene.y;
    } else if (verticalMode === 'top') {
        nextProps.top = numberSceneProp(startProps.top) + deltaScene.y;
    } else if (verticalMode === 'bottom') {
        nextProps.bottom = numberSceneProp(startProps.bottom) - deltaScene.y;
    } else if (verticalMode === 'center') {
        nextProps.vertical = numberSceneProp(startProps.vertical) + deltaScene.y;
    } else {
        nextProps.y = numberSceneProp(startProps.y) + deltaScene.y;
    }
    return nextProps;
}

function scenePropIsNumber(value: unknown) {
    return typeof value === 'number';
}

function numberSceneProp(value: unknown) {
    return scenePropIsNumber(value) ? value : 0;
}

export function resolveCompilerSceneHorizontalLayoutMode(props: CompilerSceneMoveProps): CompilerSceneHorizontalLayoutMode {
    if (scenePropIsNumber(props.left) && scenePropIsNumber(props.right)) {
        return 'stretch';
    }
    if (scenePropIsNumber(props.left)) {
        return 'left';
    }
    if (scenePropIsNumber(props.right)) {
        return 'right';
    }
    if (scenePropIsNumber(props.horizontal)) {
        return 'center';
    }
    return 'free';
}

export function resolveCompilerSceneVerticalLayoutMode(props: CompilerSceneMoveProps): CompilerSceneVerticalLayoutMode {
    if (scenePropIsNumber(props.top) && scenePropIsNumber(props.bottom)) {
        return 'stretch';
    }
    if (scenePropIsNumber(props.top)) {
        return 'top';
    }
    if (scenePropIsNumber(props.bottom)) {
        return 'bottom';
    }
    if (scenePropIsNumber(props.vertical)) {
        return 'center';
    }
    return 'free';
}

function moveCompilerSceneNodePreviewProps(
    startProps: CompilerSceneMoveProps,
    startBounds: CompilerSceneRect,
    deltaScene: ViewportPoint,
) {
    const horizontalMode = resolveCompilerSceneHorizontalLayoutMode(startProps);
    const verticalMode = resolveCompilerSceneVerticalLayoutMode(startProps);
    return {
        x: (horizontalMode === 'free' ? numberSceneProp(startProps.x) : startBounds.x) + deltaScene.x,
        y: (verticalMode === 'free' ? numberSceneProp(startProps.y) : startBounds.y) + deltaScene.y,
    };
}

export function resizeCompilerSceneNodeProps(
    startProps: CompilerSceneMoveProps,
    startBounds: CompilerSceneRect,
    handle: CompilerSceneResizeHandle,
    deltaScene: ViewportPoint,
) {
    const startX = typeof startProps.x === 'number' ? startProps.x : startBounds.x;
    const startY = typeof startProps.y === 'number' ? startProps.y : startBounds.y;
    const startWidth = typeof startProps.width === 'number' ? startProps.width : startBounds.width;
    const startHeight = typeof startProps.height === 'number' ? startProps.height : startBounds.height;
    const westWidth = Math.max(minSceneNodeSize, startWidth - deltaScene.x);
    const northHeight = Math.max(minSceneNodeSize, startHeight - deltaScene.y);
    return {
        ...(handle === 'west' || handle === 'north-west'
            ? {
                x: startX + startWidth - westWidth,
                width: westWidth,
            }
            : {}),
        ...(handle === 'north' || handle === 'north-west'
            ? {
                y: startY + startHeight - northHeight,
                height: northHeight,
            }
            : {}),
        ...(handle === 'east' || handle === 'south-east'
            ? { width: Math.max(minSceneNodeSize, startWidth + deltaScene.x) }
            : {}),
        ...(handle === 'south' || handle === 'south-east'
            ? { height: Math.max(minSceneNodeSize, startHeight + deltaScene.y) }
            : {}),
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

function defaultViewportModel(
    projectResolution: ViewportSize = defaultPixifactProjectResolution,
    fillsProjectResolution = false,
    projectViewport: PixifactProjectViewport = defaultPixifactProjectViewport,
): ViewportModel {
    const scene = fillsProjectResolution ? projectResolution : { width: previewWidth, height: previewHeight };
    return {
        gridVisible: true,
        mode: 'fit',
        projectResolution,
        projectViewport,
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

function applyCompilerSceneNodeSize(target: Container, props: CompilerSceneMoveProps) {
    if (typeof props.width === 'number') {
        target.width = props.width;
    }
    if (typeof props.height === 'number') {
        target.height = props.height;
    }
}

function applyCompilerSceneNodePartialTransform(target: Container, props: CompilerSceneMoveProps) {
    if (typeof props.x === 'number' || typeof props.y === 'number') {
        target.position.set(
            typeof props.x === 'number' ? props.x : target.position.x,
            typeof props.y === 'number' ? props.y : target.position.y,
        );
    }
    applyCompilerSceneNodeSize(target, props);
}

export function applyCompilerSceneNodeTransform(target: Container, props: CompilerSceneMoveProps) {
    applyCompilerSceneNodePartialTransform(target, props);
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

function resizeHandleRects(outline: SelectionRect): Record<CompilerSceneResizeHandle, CompilerSceneRect> {
    const half = resizeHandleSize / 2;
    return {
        'north-west': {
            x: outline.x - half,
            y: outline.y - half,
            width: resizeHandleSize,
            height: resizeHandleSize,
        },
        west: {
            x: outline.x - half,
            y: outline.y + outline.height / 2 - half,
            width: resizeHandleSize,
            height: resizeHandleSize,
        },
        north: {
            x: outline.x + outline.width / 2 - half,
            y: outline.y - half,
            width: resizeHandleSize,
            height: resizeHandleSize,
        },
        east: {
            x: outline.x + outline.width - half,
            y: outline.y + outline.height / 2 - half,
            width: resizeHandleSize,
            height: resizeHandleSize,
        },
        south: {
            x: outline.x + outline.width / 2 - half,
            y: outline.y + outline.height - half,
            width: resizeHandleSize,
            height: resizeHandleSize,
        },
        'south-east': {
            x: outline.x + outline.width - half,
            y: outline.y + outline.height - half,
            width: resizeHandleSize,
            height: resizeHandleSize,
        },
    };
}

export function pickCompilerSceneResizeHandle(outline: SelectionRect | undefined, point: ViewportPoint) {
    if (!outline) {
        return undefined;
    }
    const handles = resizeHandleRects(outline);
    const order: CompilerSceneResizeHandle[] = ['north-west', 'south-east', 'west', 'north', 'east', 'south'];
    return order.find((handle) => compilerScenePointInRect(point, handles[handle]));
}

function formatProfileValue(value: unknown) {
    if (typeof value === 'boolean') {
        return value ? '是' : '否';
    }
    if (value === undefined) {
        return '无';
    }
    return String(value);
}

function CompilerSceneProfilerPanel({ snapshot }: { snapshot: SceneViewProfilerSnapshot }) {
    const lastPointerDown = snapshot.lastNote?.label === 'pointerdown' ? snapshot.lastNote : undefined;
    const moveSummary = snapshot.lastSummary;
    const topRows = moveSummary?.rows.slice(0, 5) ?? [];

    return (
        <aside className="compilerSceneProfilerPanel" aria-label="Scene View 诊断">
            <div className="compilerSceneProfilerHeader">
                <strong>Scene View 诊断</strong>
                <span>{snapshot.enabled ? '已开启' : '已关闭'}</span>
            </div>
            <dl className="compilerSceneProfilerFacts">
                <div>
                    <dt>hit</dt>
                    <dd>{formatProfileValue(lastPointerDown?.meta?.hitLocator)}</dd>
                </div>
                <div>
                    <dt>selected</dt>
                    <dd>{formatProfileValue(lastPointerDown?.meta?.selectedLocator)}</dd>
                </div>
                <div>
                    <dt>canMove</dt>
                    <dd>{formatProfileValue(lastPointerDown?.meta?.canMove)}</dd>
                </div>
            </dl>
            {moveSummary ? (
                <div className="compilerSceneProfilerSummary">
                    <div className="compilerSceneProfilerSummaryTitle">
                        <span>{moveSummary.name}</span>
                        <span>{moveSummary.durationMs.toFixed(2)}ms</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>指标</th>
                                <th>次数</th>
                                <th>总计</th>
                                <th>最大</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topRows.map((row) => (
                                <tr key={row.label}>
                                    <td>{row.label}</td>
                                    <td>{row.count}</td>
                                    <td>{row.totalMs.toFixed(2)}</td>
                                    <td>{row.maxMs.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p>拖动已选中节点后显示耗时。</p>
            )}
        </aside>
    );
}

export const CompilerSceneViewport = forwardRef<CompilerSceneViewportHandle, CompilerSceneViewportProps>(
    function CompilerSceneViewport({
        diagnosticsVisible = false,
        document,
        fillsProjectResolution = false,
        projectResolution = defaultPixifactProjectResolution,
        projectViewport = defaultPixifactProjectViewport,
        projectTree,
        onStateChange,
    }, ref) {
        const hostRef = useRef<HTMLDivElement | null>(null);
        const nodesRef = useRef<Map<string, Container>>(new Map());
        const previewRef = useRef<Awaited<ReturnType<typeof createCompilerSceneRuntimePreview>> | undefined>(undefined);
        const viewportRef = useRef<ViewportSize>({ width: previewWidth, height: previewHeight });
        const transformRef = useRef<ViewportTransform>(defaultViewportModel(projectResolution, fillsProjectResolution, projectViewport).transform);
        const selectedNodeRef = useRef<string | undefined>(undefined);
        const spacePressedRef = useRef(false);
        const panRef = useRef<{ pointerId: number; last: ViewportPoint } | undefined>(undefined);
        const clickRef = useRef<{ pointerId: number; start: ViewportPoint } | undefined>(undefined);
        const moveRef = useRef<MoveSession | undefined>(undefined);
        const resizeRef = useRef<ResizeSession | undefined>(undefined);
        const moveSessionRef = useRef(0);
        const resizeSessionRef = useRef(0);
        const [viewport, setViewport] = useState<ViewportSize>({ width: previewWidth, height: previewHeight });
        const [model, setModel] = useState<ViewportModel>(() => defaultViewportModel(projectResolution, fillsProjectResolution, projectViewport));
        const [outline, setOutline] = useState<SelectionRect | undefined>(undefined);
        const [status, setStatus] = useState('正在初始化编译器预览');
        const profilerSnapshot = useSyncExternalStore(
            subscribeSceneViewProfiler,
            getSceneViewProfilerSnapshot,
            getSceneViewProfilerSnapshot,
        );

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
                projectViewport,
            }));
        }, [projectResolution, projectViewport, updateModel]);

        useEffect(() => {
            const hostElement = hostRef.current;
            if (!hostElement) {
                return;
            }
            const host = hostElement;
            const initialViewport = hostSize(host);
            const initialScene = fillsProjectResolution
                ? projectPreviewSceneSize(projectResolution, projectViewport, initialViewport)
                : { width: previewWidth, height: previewHeight };
            const initialTransform = fitViewportTransform(initialScene, initialViewport);
            viewportRef.current = initialViewport;
            transformRef.current = initialTransform;
            setViewport(initialViewport);
            setModel({
                gridVisible: true,
                mode: 'fit',
                projectResolution,
                projectViewport,
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
                    const scene = fillsProjectResolution
                        ? projectPreviewSceneSize(current.projectResolution, current.projectViewport, nextViewport)
                        : current.scene;
                    if (fillsProjectResolution) {
                        previewRef.current?.root.setSize(scene.width, scene.height);
                    }
                    const transform = current.mode === 'fit'
                        ? fitViewportTransform(scene, nextViewport)
                        : resizeManualViewportTransform(current.transform, previousViewport, nextViewport);
                    const next = {
                        ...current,
                        scene,
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
                    const previewProjectResolution = fillsProjectResolution
                        ? projectPreviewSceneSize(projectResolution, projectViewport, viewportRef.current)
                        : undefined;
                    const preview = await createCompilerSceneRuntimePreview({
                        document,
                        projectResolution: previewProjectResolution,
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
                resizeRef.current = undefined;
                spacePressedRef.current = false;
                destroyPreview();
                destroyApp();
            };
        }, [document.scenePath, document.template, fillsProjectResolution, projectResolution, projectTree, projectViewport]);

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
                    applyCompilerSceneNodeTransform(target, node.props);
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
                    const resizeHandle = pickCompilerSceneResizeHandle(outline, start);
                    const selectedLocator = selectedNodeRef.current;
                    if (resizeHandle && selectedLocator) {
                        const node = getCompilerSceneNode(selectedLocator);
                        const target = nodesRef.current.get(selectedLocator);
                        const startOverlayBounds = target ? compilerSceneSelectionRect(target) : undefined;
                        if (node && node.kind !== 'slotOutlet' && target && startOverlayBounds) {
                            const startBounds = {
                                x: (startOverlayBounds.x - transformRef.current.offset.x) / transformRef.current.scale,
                                y: (startOverlayBounds.y - transformRef.current.offset.y) / transformRef.current.scale,
                                width: startOverlayBounds.width / transformRef.current.scale,
                                height: startOverlayBounds.height / transformRef.current.scale,
                            };
                            const startSize = {
                                x: typeof node.props.x === 'number' ? node.props.x : startBounds.x,
                                y: typeof node.props.y === 'number' ? node.props.y : startBounds.y,
                                width: typeof node.props.width === 'number' ? node.props.width : startBounds.width,
                                height: typeof node.props.height === 'number' ? node.props.height : startBounds.height,
                            };
                            event.preventDefault();
                            resizeSessionRef.current += 1;
                            hostRef.current?.setPointerCapture(event.pointerId);
                            resizeRef.current = {
                                handle: resizeHandle,
                                locator: selectedLocator,
                                mergeKey: `scene-view:resize:${selectedLocator}:${resizeHandle}:${resizeSessionRef.current}`,
                                pointerId: event.pointerId,
                                profileId: beginSceneViewProfile('resize', { locator: selectedLocator, handle: resizeHandle }),
                                started: false,
                                startBounds,
                                startPoint: start,
                                startProps: {
                                    height: node.props.height,
                                    width: node.props.width,
                                    x: node.props.x,
                                    y: node.props.y,
                                },
                                startSize,
                            };
                            return;
                        }
                    }
                    const hitLocator = pickTopCompilerSceneHit(compilerSceneHitTargets(nodesRef.current), start);
                    noteSceneViewProfile('pointerdown', {
                        hitLocator,
                        selectedLocator,
                        canMove: canBeginCompilerSceneMove(selectedLocator, hitLocator),
                    });
                    if (canBeginCompilerSceneMove(selectedLocator, hitLocator)) {
                        const node = getCompilerSceneNode(selectedLocator!);
                        const target = nodesRef.current.get(selectedLocator!);
                        const startOverlayBounds = target ? compilerSceneSelectionRect(target) : undefined;
                        if (node && node.kind !== 'slotOutlet' && target && startOverlayBounds) {
                            const startBounds = {
                                x: (startOverlayBounds.x - transformRef.current.offset.x) / transformRef.current.scale,
                                y: (startOverlayBounds.y - transformRef.current.offset.y) / transformRef.current.scale,
                                width: startOverlayBounds.width / transformRef.current.scale,
                                height: startOverlayBounds.height / transformRef.current.scale,
                            };
                            event.preventDefault();
                            moveSessionRef.current += 1;
                            hostRef.current?.setPointerCapture(event.pointerId);
                            moveRef.current = {
                                locator: selectedLocator!,
                                mergeKey: `scene-view:move:${selectedLocator}:${moveSessionRef.current}`,
                                pointerId: event.pointerId,
                                profileId: beginSceneViewProfile('move', { locator: selectedLocator }),
                                started: false,
                                startBounds,
                                startPoint: start,
                                startProps: {
                                    bottom: node.props.bottom,
                                    horizontal: node.props.horizontal,
                                    left: node.props.left,
                                    right: node.props.right,
                                    top: node.props.top,
                                    vertical: node.props.vertical,
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
            const resize = resizeRef.current;
            if (resize?.pointerId === event.pointerId) {
                countSceneViewProfile('viewport.pointermove');
                event.preventDefault();
                const nextPoint = clientPoint(event);
                const deltaViewport = {
                    x: nextPoint.x - resize.startPoint.x,
                    y: nextPoint.y - resize.startPoint.y,
                };
                const passedThreshold = resize.started || Math.hypot(deltaViewport.x, deltaViewport.y) > dragThreshold;
                if (!passedThreshold) {
                    return;
                }
                resize.started = true;
                countSceneViewProfile('viewport.resizeUpdate');
                const target = nodesRef.current.get(resize.locator);
                const node = getCompilerSceneNode(resize.locator);
                if (!target || !node || node.kind === 'slotOutlet') {
                    resizeRef.current = undefined;
                    hostRef.current?.releasePointerCapture(event.pointerId);
                    return;
                }
                const deltaScene = viewportDeltaToSceneDelta(transformRef.current, deltaViewport);
                const nextProps = resizeCompilerSceneNodeProps(resize.startProps, resize.startBounds, resize.handle, deltaScene);
                resize.currentProps = nextProps;
                applyCompilerSceneNodePartialTransform(target, nextProps);
                setOutline(compilerSceneSelectionRect(target));
                return;
            }

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
                const nextPreviewProps = moveCompilerSceneNodePreviewProps(move.startProps, move.startBounds, deltaScene);
                const target = nodesRef.current.get(move.locator);
                const node = getCompilerSceneNode(move.locator);
                if (!target || !node || node.kind === 'slotOutlet') {
                    if (target) {
                        applyCompilerSceneNodePosition(target, move.startBounds);
                        setOutline(compilerSceneSelectionRect(target));
                    }
                    moveRef.current = undefined;
                    hostRef.current?.releasePointerCapture(event.pointerId);
                    return;
                }
                move.currentProps = nextProps;
                applyCompilerSceneNodePosition(target, nextPreviewProps);
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
                const move = moveRef.current;
                if (move.started && move.currentProps) {
                    updateCompilerSceneNodePropsInPlace(move.locator, move.currentProps, { mergeKey: move.mergeKey });
                }
                endSceneViewProfile(move.profileId, { committed: move.started });
                moveRef.current = undefined;
                hostRef.current?.releasePointerCapture(event.pointerId);
                return;
            }
            if (resizeRef.current?.pointerId === event.pointerId) {
                const resize = resizeRef.current;
                if (resize.started && resize.currentProps) {
                    updateCompilerSceneNodePropsInPlace(resize.locator, resize.currentProps, { mergeKey: resize.mergeKey });
                }
                endSceneViewProfile(resize.profileId, { committed: resize.started });
                resizeRef.current = undefined;
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
                const move = moveRef.current;
                const target = nodesRef.current.get(move.locator);
                if (target) {
                    applyCompilerSceneNodePosition(target, move.startBounds);
                    setOutline(compilerSceneSelectionRect(target));
                }
                endSceneViewProfile(move.profileId, { cancelled: true });
                moveRef.current = undefined;
                hostRef.current?.releasePointerCapture(event.pointerId);
            }
            if (resizeRef.current?.pointerId === event.pointerId) {
                const resize = resizeRef.current;
                const target = nodesRef.current.get(resize.locator);
                if (target) {
                    applyCompilerSceneNodePartialTransform(target, resize.startSize);
                    setOutline(compilerSceneSelectionRect(target));
                }
                endSceneViewProfile(resize.profileId, { cancelled: true });
                resizeRef.current = undefined;
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
                        <>
                            <rect
                                className="compilerSceneSelection"
                                fill="none"
                                height={outline.height}
                                vectorEffect="non-scaling-stroke"
                                width={outline.width}
                                x={outline.x}
                                y={outline.y}
                            />
                            {Object.entries(resizeHandleRects(outline)).map(([handle, rect]) => (
                                <rect
                                    className={`compilerSceneResizeHandle compilerSceneResizeHandle--${handle}`}
                                    height={rect.height}
                                    key={handle}
                                    vectorEffect="non-scaling-stroke"
                                    width={rect.width}
                                    x={rect.x}
                                    y={rect.y}
                                />
                            ))}
                        </>
                    ) : null}
                </svg>
                {status ? <div className="runtimeStatus">{status}</div> : null}
                {diagnosticsVisible ? <CompilerSceneProfilerPanel snapshot={profilerSnapshot} /> : null}
            </div>
        );
    },
);
