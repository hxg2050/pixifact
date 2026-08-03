<script setup lang="ts">
import { Application, Container, Graphics, type FederatedPointerEvent } from 'pixi.js';
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
    moveSceneCanvasGeometry,
    resizeLayoutManagedSceneCanvasGeometry,
    resizeSceneCanvasGeometry,
    sceneCanvasNodePositionIsLayoutManaged,
    zoomSceneCanvasView,
    type SceneCanvasGeometry,
    type SceneCanvasPropChange,
    type SceneCanvasResizeHandle,
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
    select: [locator: string];
}>();
const host = ref<HTMLElement>();
const status = ref('正在初始化画布');
let app: Application | undefined;
let preview: CompilerSceneRuntimePreview | undefined;
let resizeObserver: ResizeObserver | undefined;
let unsubscribeDocument: (() => void) | undefined;
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

function hostSize() {
    const bounds = host.value!.getBoundingClientRect();
    return {
        width: Math.max(1, Math.floor(bounds.width || 960)),
        height: Math.max(1, Math.floor(bounds.height || 540)),
    };
}

function fitPreview() {
    if (!preview || !host.value) return;
    const viewport = hostSize();
    const scale = Math.min(viewport.width / preview.width, viewport.height / preview.height, 1);
    preview.root.scale.set(scale);
    preview.root.position.set(
        (viewport.width - preview.width * scale) / 2,
        (viewport.height - preview.height * scale) / 2,
    );
    updateSelectionOverlay();
}

function handleCanvasWheel(event: WheelEvent) {
    if (!app || !preview || !host.value) return;
    const bounds = host.value.getBoundingClientRect();
    const pointer = {
        x: (event.clientX - bounds.left) * app.screen.width / bounds.width,
        y: (event.clientY - bounds.top) * app.screen.height / bounds.height,
    };
    const wheelDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * bounds.height
            : event.deltaY;
    const next = zoomSceneCanvasView({
        scale: preview.root.scale.x,
        x: preview.root.position.x,
        y: preview.root.position.y,
    }, pointer, wheelDelta);
    preview.root.scale.set(next.scale);
    preview.root.position.set(next.x, next.y);
    updateSelectionOverlay();
}

async function rebuildPreview() {
    const revision = ++buildRevision;
    const document = props.document;
    const projectTree = props.projectTree;
    if (!app || !document || !projectTree) return;
    status.value = '正在构建 Scene';
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
        for (const [locator, target] of preview.nodes) {
            target.eventMode = 'static';
            target.cursor = nodeCanMove(locator, target) ? 'move' : 'default';
            target.on('pointerdown', (event) => beginMove(locator, event));
        }
        app.stage.addChild(preview.root);
        if (selectionLayer) app.stage.addChild(selectionLayer);
        fitPreview();
        updateSelectionOverlay();
        status.value = '';
    } catch (error) {
        status.value = error instanceof Error ? error.message : String(error);
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

function beginMove(locator: string, event: FederatedPointerEvent) {
    event.stopPropagation();
    if (event.button !== 0) return;
    emit('select', locator);
    const target = selectedTarget(locator);
    if (!target || !nodeCanMove(locator, target)) {
        updateSelectionOverlay(locator);
        return;
    }
    beginInteraction(locator, target, event, 'move');
}

function beginResize(handle: SceneCanvasResizeHandle, event: FederatedPointerEvent) {
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

function resetCanvasCursor() {
    if (app) app.canvas.style.cursor = '';
}

function canvasScenePoint(event: PointerEvent) {
    if (!app || !host.value || !preview) return;
    const bounds = host.value.getBoundingClientRect();
    const point = preview.root.toLocal({
        x: (event.clientX - bounds.left) * app.screen.width / bounds.width,
        y: (event.clientY - bounds.top) * app.screen.height / bounds.height,
    });
    if (point.x < 0 || point.y < 0 || point.x > preview.width || point.y > preview.height) return;
    return {
        x: Math.round(point.x * 100) / 100,
        y: Math.round(point.y * 100) / 100,
    };
}

async function dropAssetOnCanvas(event: PointerEvent) {
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
    if (event.pointerId === interaction?.pointerId) void finishInteraction();
}

function handleWindowPointerCancel(event: PointerEvent) {
    if (event.pointerId === interaction?.pointerId) cancelInteraction();
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
    unsubscribeDocument?.();
    unsubscribeDocument = document?.subscribe(handleDocumentEvent);
    void rebuildPreview();
}, { immediate: true });

watch(() => props.projectTree, () => void rebuildPreview());
watch(() => props.sceneInterfaces, () => void rebuildPreview());
watch(() => props.selected, () => updateSelectionOverlay());

onMounted(async () => {
    app = new Application();
    const size = hostSize();
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
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);
    resizeObserver = new ResizeObserver(() => {
        if (!app) return;
        const next = hostSize();
        app.renderer.resize(next.width, next.height);
        app.stage.hitArea = app.screen;
        fitPreview();
    });
    resizeObserver.observe(host.value!);
    await rebuildPreview();
});

onBeforeUnmount(() => {
    buildRevision += 1;
    interaction = undefined;
    window.removeEventListener('pointerup', handleWindowPointerUp);
    window.removeEventListener('pointercancel', handleWindowPointerCancel);
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
    :class="{ 'is-asset-drop-target': !!draggedAsset }"
    @pointerup="dropAssetOnCanvas"
    @wheel.prevent="handleCanvasWheel"
  >
    <div class="canvas-grid" />
    <div v-if="status" class="canvas-status">{{ status }}</div>
  </div>
</template>
