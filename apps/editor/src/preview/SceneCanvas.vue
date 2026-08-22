<script setup lang="ts">
import { Scan } from 'lucide-vue-next';
import { Application, Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import {
    getFrameLayout,
    requestFrameLayout,
    setFrameLayout,
} from 'pixifact/runtime';
import {
    isPixiSceneNodeType,
    pixiSceneNodeDefaults,
    resolveSceneReference,
    type CompilerSceneCommand,
    type SceneTemplateInterface,
    type SceneTemplateValue,
} from 'pixifact/compiler';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { SceneDocument, SceneDocumentEvent } from '../document/SceneDocument';
import {
    createSceneAssetNode,
    findSceneNodeByLocator,
    type EditorSceneAsset,
} from '../document/sceneTree';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import {
    createCompilerSceneRuntimePreview,
    destroyCompilerSceneRuntimePreview,
    type CompilerSceneRuntimePreview,
} from './compilerSceneRuntimePreview';
import {
    fitSceneCanvasView,
    moveSceneCanvasGeometry,
    panSceneCanvasView,
    resizeLayoutManagedSceneCanvasGeometry,
    resizeSceneCanvasView,
    resizeSceneCanvasGeometry,
    sceneCanvasNodePositionIsLayoutManaged,
    sceneCanvasNodeCanStartDrag,
    zoomSceneCanvasView,
    type SceneCanvasGeometry,
    type SceneCanvasPropChange,
    type SceneCanvasResizeHandle,
    type SceneCanvasSize,
    type SceneCanvasView,
} from './sceneCanvasGeometry';
import { graphicsDrawingProps, redrawSceneCanvasGraphics } from './sceneCanvasGraphics';
import { incrementalScenePreviewCommands } from './scenePreviewCommands';

const props = defineProps<{
    document?: SceneDocument;
    draggedAsset?: EditorSceneAsset;
    projectTree?: ProjectFileTreeNode;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    selected?: string;
}>();
const emit = defineEmits<{
    assetDrop: [];
    openScene: [reference: string];
    previewState: [state: 'loading' | 'ready' | 'error'];
    select: [locator: string];
}>();
const host = ref<HTMLElement>();
const canvasHovered = ref(false);
const isPanning = ref(false);
const spacePressed = ref(false);
const status = ref('正在初始化画布');
let app: Application | undefined;
let canvasPan: CanvasPan | undefined;
let preview: CompilerSceneRuntimePreview | undefined;
let previewDocument: SceneDocument | undefined;
let resizeObserver: ResizeObserver | undefined;
let unsubscribeDocument: (() => void) | undefined;
let view: SceneCanvasView | undefined;
let viewScenePath: string | undefined;
let viewportSize: SceneCanvasSize | undefined;
let buildRevision = 0;
let selectionLayer: Container | undefined;
let selectionOutline: Graphics | undefined;
let interaction: CanvasInteraction | undefined;
const selectionHandles = new Map<SceneCanvasResizeHandle, Graphics>();
const resizeHandles: SceneCanvasResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const resizeCursors: Record<SceneCanvasResizeHandle, string> = {
    n: 'ns-resize',
    ne: 'nesw-resize',
    e: 'ew-resize',
    se: 'nwse-resize',
    s: 'ns-resize',
    sw: 'nesw-resize',
    w: 'ew-resize',
    nw: 'nwse-resize',
};

interface CanvasInteraction {
    changes: SceneCanvasPropChange[];
    document: SceneDocument;
    geometry: SceneCanvasGeometry;
    handle?: SceneCanvasResizeHandle;
    locator: string;
    mode: 'move' | 'resize';
    parent: Container;
    pointerId: number;
    positionManaged: boolean;
    previewed: Set<string>;
    props: Record<string, SceneTemplateValue>;
    start: { x: number; y: number };
}

interface CanvasPan {
    pointerId: number;
    start: { x: number; y: number };
    view: SceneCanvasView;
}

function hostSize() {
    const bounds = host.value!.getBoundingClientRect();
    return {
        width: Math.max(1, Math.floor(bounds.width || 960)),
        height: Math.max(1, Math.floor(bounds.height || 540)),
    };
}

function applyView() {
    if (!preview || !view) return;
    preview.root.scale.set(view.scale);
    preview.root.position.set(view.x, view.y);
    updateSelectionOverlay();
}

function captureView() {
    return view ? { ...view } : undefined;
}

function restoreView(next: SceneCanvasView) {
    view = { ...next };
    applyView();
}

async function captureScreenshot() {
    if (!app || !preview || !previewDocument) {
        throw new Error('Authoring preview is not ready.');
    }
    const capturedPreview = preview;
    const capturedDocument = previewDocument;
    const position = capturedPreview.root.position.clone();
    const scale = capturedPreview.root.scale.clone();
    let dataUrlPromise: Promise<string>;
    try {
        capturedPreview.root.position.set(0, 0);
        capturedPreview.root.scale.set(1);
        dataUrlPromise = app.renderer.extract.base64({
            target: capturedPreview.root,
            frame: new Rectangle(0, 0, capturedPreview.width, capturedPreview.height),
            resolution: 1,
            format: 'png',
            antialias: true,
        });
    } finally {
        capturedPreview.root.position.copyFrom(position);
        capturedPreview.root.scale.copyFrom(scale);
    }
    return {
        path: capturedDocument.path,
        revision: capturedDocument.version,
        width: capturedPreview.width,
        height: capturedPreview.height,
        dataUrl: await dataUrlPromise,
    };
}

defineExpose({ cancelCurrentInteraction, captureScreenshot, captureView, restoreView });

function fitPreview() {
    if (!preview || !host.value) return;
    view = fitSceneCanvasView(viewportSize ?? hostSize(), preview);
    applyView();
}

function canvasViewportPoint(clientX: number, clientY: number) {
    if (!app || !host.value) return;
    const bounds = host.value.getBoundingClientRect();
    return {
        x: (clientX - bounds.left) * app.screen.width / bounds.width,
        y: (clientY - bounds.top) * app.screen.height / bounds.height,
    };
}

function handleCanvasWheel(event: WheelEvent) {
    if (!preview || !host.value || !view) return;
    const bounds = host.value.getBoundingClientRect();
    const pointer = canvasViewportPoint(event.clientX, event.clientY)!;
    const wheelDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * bounds.height
            : event.deltaY;
    view = zoomSceneCanvasView(view, pointer, wheelDelta);
    applyView();
}

async function rebuildPreview() {
    const revision = ++buildRevision;
    const document = props.document;
    const projectTree = props.projectTree;
    if (!app || !document || !projectTree) return;
    if (viewScenePath !== document.path) {
        viewScenePath = document.path;
        view = undefined;
    }
    status.value = '正在构建 Scene';
    emit('previewState', 'loading');
    try {
        const next = await createCompilerSceneRuntimePreview({
            document: {
                template: document.template,
                sceneInterfaces: props.sceneInterfaces ?? {},
            },
            projectTree,
            scenePath: document.path,
        });
        if (revision !== buildRevision) {
            destroyCompilerSceneRuntimePreview(next);
            return;
        }
        if (preview) {
            app.stage.removeChild(preview.root);
            destroyCompilerSceneRuntimePreview(preview);
        }
        preview = next;
        previewDocument = document;
        for (const [locator, target] of preview.nodes) {
            target.eventMode = 'static';
            target.cursor = nodeCanMove(locator, target) ? 'move' : 'default';
            target.on('pointerdown', (event) => beginMove(locator, target, event));
            target.on('click', (event) => {
                event.stopPropagation();
                emit('select', locator);
                const node = findSceneNodeByLocator(document.template.children, locator);
                if (event.detail === 2 && node?.kind === 'sceneInstance') {
                    emit('openScene', node.scene);
                }
            });
        }
        app.stage.addChild(preview.root);
        if (selectionLayer) app.stage.addChild(selectionLayer);
        if (view) {
            applyView();
        } else {
            fitPreview();
        }
        status.value = '';
        emit('previewState', 'ready');
    } catch (error) {
        if (revision !== buildRevision) return;
        status.value = error instanceof Error ? error.message : String(error);
        emit('previewState', 'error');
    }
}

function effectiveValue(locator: string, prop: string, value?: SceneTemplateValue) {
    if (value !== undefined || !props.document) return value;
    const node = findSceneNodeByLocator(props.document.template.children, locator);
    if (node?.kind === 'pixi' && isPixiSceneNodeType(node.type)) {
        return pixiSceneNodeDefaults(node.type)[prop] ?? defaultRuntimeValue(prop);
    }
    if (node?.kind === 'sceneInstance') {
        const contract = props.sceneInterfaces?.[
            resolveSceneReference(props.document.path, node.scene)
        ]?.props[prop];
        if (contract) {
            return contract.type === 'struct' ? undefined : contract.default;
        }
    }
    return defaultRuntimeValue(prop);
}

function defaultRuntimeValue(prop: string) {
    if (prop === 'visible') return true;
    if (prop === 'alpha' || prop === 'scaleX' || prop === 'scaleY') return 1;
    if (prop === 'cursor') return 'default';
    if (prop === 'eventMode') return 'passive';
    return 0;
}

function applyNodeProp(locator: string, prop: string, sourceValue?: SceneTemplateValue) {
    const target = preview?.nodes.get(locator);
    if (!target) return;
    const value = effectiveValue(locator, prop, sourceValue);
    const node = props.document
        ? findSceneNodeByLocator(props.document.template.children, locator)
        : undefined;
    if (
        target instanceof Graphics
        && node?.kind === 'pixi'
        && node.type === 'Graphics'
        && graphicsDrawingProps.has(prop)
    ) {
        redrawSceneCanvasGraphics(target, node.props, { [prop]: value as SceneTemplateValue });
    } else if (prop === 'x' || prop === 'y') {
        target.position[prop] = Number(value);
    } else if (prop === 'scaleX' || prop === 'scaleY') {
        target.scale[prop === 'scaleX' ? 'x' : 'y'] = Number(value);
    } else if (prop === 'pivotX' || prop === 'pivotY') {
        target.pivot[prop === 'pivotX' ? 'x' : 'y'] = Number(value);
    } else if (prop === 'skewX' || prop === 'skewY') {
        target.skew[prop === 'skewX' ? 'x' : 'y'] = Number(value);
    } else if (['left', 'right', 'top', 'bottom', 'horizontal', 'vertical'].includes(prop)) {
        setFrameLayout(target, { ...getFrameLayout(target), [prop]: sourceValue });
    } else if (['fontSize', 'fontFamily', 'fontWeight', 'fill'].includes(prop) && 'style' in target) {
        const style = (target as unknown as { style: Record<string, unknown> }).style;
        style[prop] = value;
    } else if (prop === 'anchorX' || prop === 'anchorY') {
        const anchor = (target as unknown as { anchor?: { x: number; y: number } }).anchor;
        if (anchor) anchor[prop === 'anchorX' ? 'x' : 'y'] = Number(value);
    } else if (prop === 'tilePositionX' || prop === 'tilePositionY') {
        const point = (target as unknown as { tilePosition?: { x: number; y: number } }).tilePosition;
        if (point) point[prop === 'tilePositionX' ? 'x' : 'y'] = Number(value);
    } else if (prop === 'tileScaleX' || prop === 'tileScaleY') {
        const point = (target as unknown as { tileScale?: { x: number; y: number } }).tileScale;
        if (point) point[prop === 'tileScaleX' ? 'x' : 'y'] = Number(value);
    } else {
        (target as unknown as Record<string, unknown>)[prop] = value;
    }
    if (target.parent) requestFrameLayout(target.parent);
    updateSelectionOverlay();
}

function applyCommand(command: CompilerSceneCommand, inverse: CompilerSceneCommand) {
    const commands = incrementalScenePreviewCommands(command, inverse);
    if (!commands) {
        void rebuildPreview();
        return;
    }
    for (const child of commands) {
        applyNodeProp(child.node, child.prop, child.value);
    }
}

function handleDocumentEvent(event: SceneDocumentEvent) {
    if (event.type === 'nodePropPreview') {
        applyNodeProp(event.locator, event.prop, event.value);
    } else if (event.type === 'commandApplied') {
        applyCommand(event.command, event.inverse);
    }
}

function selectedTarget(locator = props.selected) {
    return locator ? preview?.nodes.get(locator) : undefined;
}

function selectedNode(locator = props.selected) {
    return props.document && locator
        ? findSceneNodeByLocator(props.document.template.children, locator)
        : undefined;
}

function targetGeometry(target: Container): SceneCanvasGeometry {
    return {
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
    };
}

function nodeCanMove(locator: string, target: Container) {
    const node = selectedNode(locator);
    if (!props.document || !node || node.kind === 'slotOutlet') return false;
    if (sceneCanvasNodePositionIsLayoutManaged(props.document.template, locator)) return false;
    return moveSceneCanvasGeometry(node.props, targetGeometry(target), { x: 1, y: 1 }) !== undefined;
}

function nodeCanResize(locator: string, target: Container, handle: SceneCanvasResizeHandle) {
    const node = selectedNode(locator);
    if (!props.document || !node || node.kind === 'slotOutlet') return false;
    if (target.rotation !== 0 || target.skew.x !== 0 || target.skew.y !== 0) return false;
    const delta = {
        x: handle.includes('w') || handle.includes('e') ? 1 : 0,
        y: handle.includes('n') || handle.includes('s') ? 1 : 0,
    };
    const resize = sceneCanvasNodePositionIsLayoutManaged(props.document.template, locator)
        ? resizeLayoutManagedSceneCanvasGeometry
        : resizeSceneCanvasGeometry;
    return resize(node.props, targetGeometry(target), handle, delta) !== undefined;
}

function beginMove(locator: string, hitTarget: Container, event: FederatedPointerEvent) {
    if (spacePressed.value || isPanning.value) return;
    if (event.button !== 0) return;
    if (event.target !== hitTarget) return;
    if (!sceneCanvasNodeCanStartDrag(props.selected, locator)) return;
    event.stopPropagation();
    const target = selectedTarget(locator);
    if (!target || !nodeCanMove(locator, target)) {
        updateSelectionOverlay(locator);
        return;
    }
    beginInteraction(locator, target, event, 'move');
}

function beginResize(handle: SceneCanvasResizeHandle, event: FederatedPointerEvent) {
    if (spacePressed.value || isPanning.value) return;
    event.stopPropagation();
    if (event.button !== 0 || !props.selected) return;
    const target = selectedTarget();
    if (!target || !nodeCanResize(props.selected, target, handle)) return;
    beginInteraction(props.selected, target, event, 'resize', handle);
}

function beginInteraction(
    locator: string,
    target: Container,
    event: FederatedPointerEvent,
    mode: CanvasInteraction['mode'],
    handle?: SceneCanvasResizeHandle,
) {
    const document = props.document;
    const node = selectedNode(locator);
    if (!document || !node || node.kind === 'slotOutlet' || !target.parent || !app) return;
    cancelInteraction();
    const start = target.parent.toLocal(event.global);
    interaction = {
        changes: [],
        document,
        geometry: targetGeometry(target),
        handle,
        locator,
        mode,
        parent: target.parent,
        pointerId: event.pointerId,
        positionManaged: sceneCanvasNodePositionIsLayoutManaged(document.template, locator),
        previewed: new Set(),
        props: { ...node.props },
        start: { x: start.x, y: start.y },
    };
    app.canvas.style.cursor = mode === 'move' ? 'move' : resizeCursors[handle!];
}

function moveInteraction(event: FederatedPointerEvent) {
    const current = interaction;
    if (!current || event.pointerId !== current.pointerId) return;
    const point = current.parent.toLocal(event.global);
    const delta = {
        x: point.x - current.start.x,
        y: point.y - current.start.y,
    };
    const changes = current.mode === 'move'
        ? moveSceneCanvasGeometry(current.props, current.geometry, delta)
        : current.positionManaged
            ? resizeLayoutManagedSceneCanvasGeometry(current.props, current.geometry, current.handle!, delta)
            : resizeSceneCanvasGeometry(current.props, current.geometry, current.handle!, delta);
    if (!changes) return;
    previewInteractionChanges(current, changes);
}

function previewInteractionChanges(current: CanvasInteraction, changes: SceneCanvasPropChange[]) {
    const nextProps = new Set(changes.map((change) => change.prop));
    for (const prop of current.previewed) {
        if (!nextProps.has(prop)) {
            current.document.previewNodeProp(current.locator, prop, originalPreviewValue(current, prop));
        }
    }
    for (const change of changes) {
        current.document.previewNodeProp(current.locator, change.prop, change.value);
    }
    current.previewed = nextProps;
    current.changes = changes;
    updateSelectionOverlay(current.locator);
}

function originalPreviewValue(current: CanvasInteraction, prop: string) {
    const source = current.props[prop];
    if (source !== undefined) return source;
    if (prop === 'x') return current.geometry.x;
    if (prop === 'y') return current.geometry.y;
    if (prop === 'width') return current.geometry.width;
    if (prop === 'height') return current.geometry.height;
    return undefined;
}

async function finishInteraction() {
    const current = interaction;
    if (!current) return;
    interaction = undefined;
    resetCanvasCursor();
    if (current.changes.length === 0) return;
    const commands = current.changes.map((change) => ({
        op: 'setNodeProp' as const,
        node: current.locator,
        prop: change.prop,
        value: change.value,
    }));
    const command: CompilerSceneCommand = commands.length === 1
        ? commands[0]
        : { op: 'batch', commands };
    try {
        await current.document.commitCommand(command);
    } catch (error) {
        status.value = error instanceof Error ? error.message : String(error);
    }
}

function cancelInteraction() {
    const current = interaction;
    if (!current) return;
    interaction = undefined;
    for (const prop of current.previewed) {
        current.document.previewNodeProp(current.locator, prop, originalPreviewValue(current, prop));
    }
    resetCanvasCursor();
    updateSelectionOverlay();
}

function cancelCurrentInteraction() {
    const active = !!interaction || !!canvasPan || spacePressed.value;
    cancelInteraction();
    finishCanvasPan();
    spacePressed.value = false;
    return active;
}

function resetCanvasCursor() {
    if (app) app.canvas.style.cursor = '';
}

function handleCanvasPointerDown(event: PointerEvent) {
    const target = event.target;
    if (target instanceof Element && target.closest('.canvas-tools')) return;
    const shouldPan = event.button === 1 || (event.button === 0 && spacePressed.value);
    if (!shouldPan || !view) return;
    event.preventDefault();
    event.stopPropagation();
    cancelInteraction();
    canvasPan = {
        pointerId: event.pointerId,
        start: canvasViewportPoint(event.clientX, event.clientY)!,
        view: { ...view },
    };
    isPanning.value = true;
    host.value!.setPointerCapture(event.pointerId);
}

function moveCanvasPan(event: PointerEvent) {
    const current = canvasPan;
    if (!current || event.pointerId !== current.pointerId) return;
    const point = canvasViewportPoint(event.clientX, event.clientY)!;
    view = panSceneCanvasView(current.view, {
        x: point.x - current.start.x,
        y: point.y - current.start.y,
    });
    applyView();
}

function finishCanvasPan() {
    const current = canvasPan;
    if (!current) return;
    if (host.value?.hasPointerCapture(current.pointerId)) {
        host.value.releasePointerCapture(current.pointerId);
    }
    canvasPan = undefined;
    isPanning.value = false;
}

function handleWindowKeyDown(event: KeyboardEvent) {
    if (event.code !== 'Space' || !canvasHovered.value || event.metaKey || event.ctrlKey || event.altKey) {
        return;
    }
    const target = event.target;
    if (
        target instanceof Element
        && target.closest('input, textarea, select, button, [contenteditable="true"]')
    ) {
        return;
    }
    event.preventDefault();
    spacePressed.value = true;
}

function handleWindowKeyUp(event: KeyboardEvent) {
    if (event.code !== 'Space' || !spacePressed.value) return;
    event.preventDefault();
    spacePressed.value = false;
}

function handleWindowBlur() {
    spacePressed.value = false;
    finishCanvasPan();
    cancelInteraction();
}

function canvasScenePoint(event: PointerEvent) {
    if (!preview) return;
    const point = preview.root.toLocal(canvasViewportPoint(event.clientX, event.clientY)!);
    if (point.x < 0 || point.y < 0 || point.x > preview.width || point.y > preview.height) return;
    return {
        x: Math.round(point.x * 100) / 100,
        y: Math.round(point.y * 100) / 100,
    };
}

async function dropAssetOnCanvas(event: PointerEvent) {
    const target = event.target;
    if (target instanceof Element && target.closest('.canvas-tools')) return;
    if (event.pointerId === canvasPan?.pointerId) return;
    const asset = props.draggedAsset;
    const document = props.document;
    const position = canvasScenePoint(event);
    if (!asset || !document || !position) {
        emit('assetDrop');
        return;
    }
    try {
        await document.commitCommand({
            op: 'insertNode',
            parent: '__scene__',
            node: createSceneAssetNode(document.template, asset, position),
        });
    } catch (error) {
        status.value = error instanceof Error ? error.message : String(error);
    } finally {
        emit('assetDrop');
    }
}

function handleWindowPointerUp(event: PointerEvent) {
    if (event.pointerId === canvasPan?.pointerId) {
        finishCanvasPan();
    } else if (event.pointerId === interaction?.pointerId) {
        void finishInteraction();
    }
}

function handleWindowPointerCancel(event: PointerEvent) {
    if (event.pointerId === canvasPan?.pointerId) {
        finishCanvasPan();
    } else if (event.pointerId === interaction?.pointerId) {
        cancelInteraction();
    }
}

function createSelectionOverlay() {
    selectionLayer = new Container();
    selectionLayer.eventMode = 'passive';
    selectionOutline = new Graphics();
    selectionOutline.eventMode = 'none';
    selectionLayer.addChild(selectionOutline);
    for (const handle of resizeHandles) {
        const graphic = new Graphics()
            .rect(-4, -4, 8, 8)
            .fill(0x0d0f13)
            .stroke({ color: 0x4c8dff, width: 1 });
        graphic.eventMode = 'static';
        graphic.cursor = resizeCursors[handle];
        graphic.visible = false;
        graphic.on('pointerdown', (event) => beginResize(handle, event));
        selectionHandles.set(handle, graphic);
        selectionLayer.addChild(graphic);
    }
    app!.stage.addChild(selectionLayer);
}

function updateSelectionOverlay(locator = props.selected) {
    if (!selectionOutline) return;
    const target = selectedTarget(locator);
    if (!target || !locator || target.destroyed) {
        selectionOutline.visible = false;
        for (const handle of selectionHandles.values()) handle.visible = false;
        return;
    }
    const bounds = target.getBounds();
    const x = bounds.minX;
    const y = bounds.minY;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (![x, y, width, height].every(Number.isFinite)) return;
    selectionOutline
        .clear()
        .rect(x, y, width, height)
        .stroke({ color: 0x4c8dff, width: 1 });
    selectionOutline.visible = true;
    const positions: Record<SceneCanvasResizeHandle, { x: number; y: number }> = {
        nw: { x, y },
        n: { x: x + width / 2, y },
        ne: { x: x + width, y },
        e: { x: x + width, y: y + height / 2 },
        se: { x: x + width, y: y + height },
        s: { x: x + width / 2, y: y + height },
        sw: { x, y: y + height },
        w: { x, y: y + height / 2 },
    };
    for (const [handle, graphic] of selectionHandles) {
        graphic.position.copyFrom(positions[handle]);
        graphic.visible = nodeCanResize(locator, target, handle);
    }
}

watch(() => props.document, (document) => {
    cancelInteraction();
    finishCanvasPan();
    unsubscribeDocument?.();
    unsubscribeDocument = document?.subscribe(handleDocumentEvent);
    void rebuildPreview();
}, { immediate: true });

watch([() => props.projectTree, () => props.sceneInterfaces], () => void rebuildPreview());
watch(() => props.selected, () => updateSelectionOverlay());

onMounted(async () => {
    app = new Application();
    const size = hostSize();
    viewportSize = size;
    await app.init({
        width: size.width,
        height: size.height,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    app.canvas.className = 'scene-canvas';
    host.value!.appendChild(app.canvas);
    app.renderer.events.features.globalMove = true;
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('globalpointermove', moveInteraction);
    createSelectionOverlay();
    window.addEventListener('pointermove', moveCanvasPan);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);
    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('keyup', handleWindowKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    resizeObserver = new ResizeObserver(() => {
        if (!app) return;
        const next = hostSize();
        const previous = viewportSize ?? next;
        viewportSize = next;
        app.renderer.resize(next.width, next.height);
        app.stage.hitArea = app.screen;
        if (view) view = resizeSceneCanvasView(view, previous, next);
        applyView();
    });
    resizeObserver.observe(host.value!);
    await rebuildPreview();
});

onBeforeUnmount(() => {
    buildRevision += 1;
    interaction = undefined;
    finishCanvasPan();
    window.removeEventListener('pointermove', moveCanvasPan);
    window.removeEventListener('pointerup', handleWindowPointerUp);
    window.removeEventListener('pointercancel', handleWindowPointerCancel);
    window.removeEventListener('keydown', handleWindowKeyDown);
    window.removeEventListener('keyup', handleWindowKeyUp);
    window.removeEventListener('blur', handleWindowBlur);
    unsubscribeDocument?.();
    resizeObserver?.disconnect();
    if (preview) destroyCompilerSceneRuntimePreview(preview);
    app?.destroy({ removeView: true }, { children: true });
});
</script>

<template>
  <div
    ref="host"
    class="scene-canvas-host"
    :class="{
      'is-asset-drop-target': !!draggedAsset,
      'is-pan-ready': spacePressed,
      'is-panning': isPanning,
    }"
    @pointerdown.capture="handleCanvasPointerDown"
    @pointerenter="canvasHovered = true"
    @pointerleave="canvasHovered = false"
    @pointerup="dropAssetOnCanvas"
    @wheel.prevent="handleCanvasWheel"
  >
    <div class="canvas-grid" />
    <div v-if="status" class="canvas-status">{{ status }}</div>
    <div class="canvas-tools">
      <button
        type="button"
        title="适应窗口"
        aria-label="适应窗口"
        :disabled="!document"
        @click="fitPreview"
      >
        <Scan :size="15" />
      </button>
    </div>
  </div>
</template>
