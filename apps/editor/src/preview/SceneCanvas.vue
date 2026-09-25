<script setup lang="ts">
import {
    AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
    AlignHorizontalDistributeCenter, AlignHorizontalDistributeEnd, AlignHorizontalDistributeStart,
    AlignHorizontalSpaceBetween, AlignStartHorizontal, AlignStartVertical,
    AlignVerticalDistributeCenter, AlignVerticalDistributeEnd, AlignVerticalDistributeStart,
    AlignVerticalSpaceBetween, ChevronDown, Hand, LayoutGrid, Move, Scaling, Scan,
} from 'lucide-vue-next';
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
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
import { onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import type { SceneDocument, SceneDocumentEvent } from '../document/SceneDocument';
import {
    createSceneAssetNode,
    findSceneNodeByLocator,
    selectedSceneTreeRoots,
    type EditorSceneAsset,
} from '../document/sceneTree';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import {
    createCompilerSceneRuntimePreview,
    destroyCompilerSceneRuntimePreview,
    type CompilerSceneRuntimePreview,
} from './compilerSceneRuntimePreview';
import { captureCompilerScenePreview } from './captureCompilerScenePreview';
import {
    fitSceneCanvasView,
    moveSceneCanvasGeometry,
    panSceneCanvasView,
    resizeLayoutManagedSceneCanvasGeometry,
    resizeSceneCanvasView,
    resizeSceneCanvasGeometry,
    setSceneCanvasGeometry,
    cycleSceneCanvasSelection,
    sceneCanvasHitTestOrder,
    sceneCanvasEventTargetIsWithinNode,
    sceneCanvasNodePositionIsLayoutManaged,
    sceneCanvasNodeCanStartDrag,
    zoomSceneCanvasView,
    type SceneCanvasGeometry,
    type SceneCanvasMoveAxis,
    type SceneCanvasPropChange,
    type SceneCanvasResizeHandle,
    type SceneCanvasSelectionCycle,
    type SceneCanvasSize,
    type SceneCanvasView,
} from './sceneCanvasGeometry';
import { graphicsDrawingProps, redrawSceneCanvasGraphics } from './sceneCanvasGraphics';
import { sceneCanvasLayoutDeltas, type SceneCanvasLayoutAction } from './sceneCanvasLayout';
import { incrementalScenePreviewCommands } from './scenePreviewCommands';

const props = defineProps<{
    document?: SceneDocument;
    draggedAsset?: EditorSceneAsset;
    projectTree?: ProjectFileTreeNode;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    selected?: string;
    selections: string[];
    revision: number;
}>();
const emit = defineEmits<{
    assetDrop: [];
    openScene: [reference: string];
    previewState: [state: 'loading' | 'ready' | 'error'];
    select: [selection: { locators: string[]; primary?: string }];
}>();
const host = ref<HTMLElement>();
const canvasHovered = ref(false);
const isPanning = ref(false);
const spacePressed = ref(false);
const activeTool = ref<'pan' | 'move' | 'resize'>('resize');
const status = ref('正在初始化画布');
const zoomPercent = ref(100);
const designSize = ref('');
const layoutMenuOpen = ref(false);
type LayoutMenuAction = SceneCanvasLayoutAction & { label: string; icon: Component };
const layoutGroups: { label: string; actions: LayoutMenuAction[] }[] = [
    { label: '对齐', actions: [
        { kind: 'align', axis: 'y', anchor: 'start', label: '顶部对齐', icon: AlignStartHorizontal },
        { kind: 'align', axis: 'y', anchor: 'center', label: '垂直居中对齐', icon: AlignCenterHorizontal },
        { kind: 'align', axis: 'y', anchor: 'end', label: '底部对齐', icon: AlignEndHorizontal },
        { kind: 'align', axis: 'x', anchor: 'start', label: '左侧对齐', icon: AlignStartVertical },
        { kind: 'align', axis: 'x', anchor: 'center', label: '水平居中对齐', icon: AlignCenterVertical },
        { kind: 'align', axis: 'x', anchor: 'end', label: '右侧对齐', icon: AlignEndVertical },
    ] },
    { label: '按线分布', actions: [
        { kind: 'distribute', axis: 'y', anchor: 'start', label: '按顶部边缘均匀分布', icon: AlignVerticalDistributeStart },
        { kind: 'distribute', axis: 'y', anchor: 'center', label: '按垂直中心线均匀分布', icon: AlignVerticalDistributeCenter },
        { kind: 'distribute', axis: 'y', anchor: 'end', label: '按底部边缘均匀分布', icon: AlignVerticalDistributeEnd },
        { kind: 'distribute', axis: 'x', anchor: 'start', label: '按左侧边缘均匀分布', icon: AlignHorizontalDistributeStart },
        { kind: 'distribute', axis: 'x', anchor: 'center', label: '按水平中心线均匀分布', icon: AlignHorizontalDistributeCenter },
        { kind: 'distribute', axis: 'x', anchor: 'end', label: '按右侧边缘均匀分布', icon: AlignHorizontalDistributeEnd },
    ] },
    { label: '等空白间距', actions: [
        { kind: 'space', axis: 'y', label: '垂直空白等间距', icon: AlignVerticalSpaceBetween },
        { kind: 'space', axis: 'x', label: '水平空白等间距', icon: AlignHorizontalSpaceBetween },
    ] },
];
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
let selectionMembers: Graphics | undefined;
let interaction: CanvasInteraction | undefined;
let groupInteraction: CanvasGroupInteraction | undefined;
let suppressCanvasClick = false;
let selectionCycle: SceneCanvasSelectionCycle | undefined;
const selectionHandles = new Map<SceneCanvasResizeHandle, Graphics>();
const moveHandles = new Map<SceneCanvasMoveAxis, Graphics>();
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

interface CanvasInteractionBase {
    changes: SceneCanvasPropChange[];
    document: SceneDocument;
    geometry: SceneCanvasGeometry;
    locator: string;
    parent: Container;
    pointerId: number;
    positionManaged: boolean;
    previewed: Set<string>;
    props: Record<string, SceneTemplateValue>;
    start: { x: number; y: number };
}
type CanvasInteractionAction =
    | { mode: 'move'; axis: SceneCanvasMoveAxis }
    | { mode: 'resize'; handle: SceneCanvasResizeHandle };
type CanvasInteraction = CanvasInteractionBase & CanvasInteractionAction;

interface CanvasGroupTarget {
    locator: string;
    target: Container;
    geometry: SceneCanvasGeometry;
    props: Record<string, SceneTemplateValue>;
    origin: { x: number; y: number };
    previewed: Set<string>;
    changes: SceneCanvasPropChange[];
}

interface CanvasGroupInteraction {
    document: SceneDocument;
    mode: 'move' | 'resize';
    axis?: SceneCanvasMoveAxis;
    handle?: SceneCanvasResizeHandle;
    pointerId: number;
    start: { x: number; y: number };
    bounds: { x: number; y: number; width: number; height: number };
    targets: CanvasGroupTarget[];
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
    zoomPercent.value = Math.round(view.scale * 100);
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
    return {
        path: capturedDocument.path,
        revision: capturedDocument.version,
        width: capturedPreview.width,
        height: capturedPreview.height,
        dataUrl: await captureCompilerScenePreview(app, capturedPreview),
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
        designSize.value = '';
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
        designSize.value = `${next.width} × ${next.height}`;
        previewDocument = document;
        selectionCycle = undefined;
        for (const [locator, target] of preview.nodes) {
            target.eventMode = 'static';
            target.cursor = nodeCanMove(locator, target, 'xy') ? 'move' : 'default';
            target.on('pointerdown', (event) => beginMove(locator, target, event));
            target.on('click', (event) => handleNodeClick(locator, event, document));
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

function handleNodeClick(
    locator: string,
    event: FederatedPointerEvent,
    document: SceneDocument,
) {
    if (activeTool.value === 'pan') return;
    if (suppressCanvasClick) {
        event.stopPropagation();
        return;
    }
    event.stopPropagation();
    const point = { x: event.global.x, y: event.global.y };
    const candidates = preview
        ? sceneCanvasHitTestOrder(preview.root, preview.nodes, point)
        : [];
    const choice = cycleSceneCanvasSelection(
        candidates.length > 0 ? candidates : [locator],
        point,
        selectionCycle,
        props.selected,
    );
    if (!choice) return;
    selectionCycle = choice.cycle;
    if (event.metaKey || event.ctrlKey) {
        const locators = props.selections.includes(choice.locator)
            ? props.selections.filter((value) => value !== choice.locator)
            : [...props.selections, choice.locator];
        emit('select', { locators, primary: locators.includes(choice.locator) ? choice.locator : locators.at(-1) });
    } else {
        emit('select', { locators: [choice.locator], primary: choice.locator });
    }
    const node = findSceneNodeByLocator(document.template.children, choice.locator);
    if (event.detail === 2 && choice.locator === props.selected && node?.kind === 'sceneInstance') {
        emit('openScene', node.scene);
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

function nodeCanMove(locator: string, target: Container, axis: SceneCanvasMoveAxis) {
    const node = selectedNode(locator);
    if (!props.document || !node || node.kind === 'slotOutlet') return false;
    if (sceneCanvasNodePositionIsLayoutManaged(props.document.template, locator)) return false;
    return moveSceneCanvasGeometry(node.props, targetGeometry(target), { x: 1, y: 1 }, axis) !== undefined;
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

function groupTargets() {
    if (!props.document || !preview) return [];
    const roots = selectedSceneTreeRoots(props.document.template.children, props.selections);
    return roots.flatMap((entry) => {
        const target = preview!.nodes.get(entry.locator);
        return target ? [{ locator: entry.locator, target }] : [];
    });
}

function groupBounds(targets: readonly { target: Container }[]) {
    const bounds = targets.map(({ target }) => target.getBounds());
    if (bounds.length === 0) return;
    const x = Math.min(...bounds.map((value) => value.minX));
    const y = Math.min(...bounds.map((value) => value.minY));
    const maxX = Math.max(...bounds.map((value) => value.maxX));
    const maxY = Math.max(...bounds.map((value) => value.maxY));
    if (![x, y, maxX, maxY].every(Number.isFinite)) return;
    return { x, y, width: maxX - x, height: maxY - y };
}

function layoutPlan(action: SceneCanvasLayoutAction): { commands: CompilerSceneCommand[]; reason?: string } {
    const document = props.document;
    if (!document || !preview || previewDocument !== document || status.value) {
        return { commands: [], reason: '画布预览尚未就绪' };
    }
    const roots = selectedSceneTreeRoots(document.template.children, props.selections);
    const minimum = action.kind === 'align' ? 2 : 3;
    if (roots.length < minimum) {
        return { commands: [], reason: `需要至少选择 ${minimum} 个可独立移动的节点` };
    }
    const targets = roots.map(({ locator, node }) => ({ locator, node, target: preview!.nodes.get(locator) }));
    if (targets.some(({ locator, node, target }) => !target || !target.parent || node.kind === 'slotOutlet'
        || sceneCanvasNodePositionIsLayoutManaged(document.template, locator))) {
        return { commands: [], reason: '选区包含无法独立移动的节点' };
    }
    const bounds = targets.map(({ target }) => target!.getBounds());
    if (bounds.some(({ minX, minY, maxX, maxY }) => ![minX, minY, maxX, maxY].every(Number.isFinite))) {
        return { commands: [], reason: '无法获取选中节点的画布边界' };
    }
    const deltas = sceneCanvasLayoutDeltas(bounds.map(({ minX, minY, maxX, maxY }) => ({
        x: minX, y: minY, width: maxX - minX, height: maxY - minY,
    })), action);
    const commands: CompilerSceneCommand[] = [];
    for (const [index, { locator, node, target }] of targets.entries()) {
        if (!target || !target.parent || node.kind === 'slotOutlet') {
            return { commands: [], reason: '选区包含无法独立移动的节点' };
        }
        const delta = deltas[index];
        if (delta.x === 0 && delta.y === 0) continue;
        const current = target.parent.toGlobal(target.position);
        const next = target.parent.toLocal({ x: current.x + delta.x, y: current.y + delta.y });
        const localDelta = { x: next.x - target.x, y: next.y - target.y };
        if (![localDelta.x, localDelta.y].every(Number.isFinite)) {
            return { commands: [], reason: '无法换算节点的位置' };
        }
        const changes = moveSceneCanvasGeometry(node.props, targetGeometry(target), localDelta, 'xy');
        if (!changes) return { commands: [], reason: '选区包含无法修改位置属性的节点' };
        commands.push(...changes.map(({ prop, value }) => ({ op: 'setNodeProp', node: locator, prop, value } as const)));
    }
    return commands.length ? { commands } : { commands, reason: '节点已在目标位置' };
}

async function applyLayout(action: SceneCanvasLayoutAction) {
    const plan = layoutPlan(action);
    if (plan.reason || !props.document) return;
    layoutMenuOpen.value = false;
    try {
        await props.document.commitCommand({ op: 'batch', commands: plan.commands });
    } catch (error) {
        status.value = error instanceof Error ? error.message : String(error);
    }
}

function groupCanMove() {
    const targets = groupTargets();
    return targets.length > 0
        && targets.length === selectedSceneTreeRoots(props.document!.template.children, props.selections).length
        && targets.every(({ locator, target }) => nodeCanMove(locator, target, 'xy'));
}

function groupCanResize(handle: SceneCanvasResizeHandle) {
    const targets = groupTargets();
    const bounds = groupBounds(targets);
    return targets.length > 0
        && targets.length === selectedSceneTreeRoots(props.document!.template.children, props.selections).length
        && !!bounds && bounds.width > 0 && bounds.height > 0
        && targets.every(({ locator, target }) => {
            const parent = target.parent;
            const node = selectedNode(locator);
            return !!parent
                && !!node && node.kind !== 'slotOutlet'
                && Math.abs(parent.worldTransform.b) < 0.000001
                && Math.abs(parent.worldTransform.c) < 0.000001
                && !sceneCanvasNodePositionIsLayoutManaged(props.document!.template, locator)
                && nodeCanResize(locator, target, handle)
                && setSceneCanvasGeometry(
                    node.props,
                    targetGeometry(target),
                    {
                        x: target.x + (handle.includes('w') || handle.includes('e') ? 1 : 0),
                        y: target.y + (handle.includes('n') || handle.includes('s') ? 1 : 0),
                        width: target.width + (handle.includes('w') || handle.includes('e') ? 1 : 0),
                        height: target.height + (handle.includes('n') || handle.includes('s') ? 1 : 0),
                    },
                ) !== undefined;
        });
}

function beginGroupInteraction(
    event: FederatedPointerEvent,
    action: { mode: 'move'; axis: SceneCanvasMoveAxis } | { mode: 'resize'; handle: SceneCanvasResizeHandle },
) {
    const document = props.document;
    if (!document || !app || (action.mode === 'move' ? !groupCanMove() : !groupCanResize(action.handle))) return;
    const selected = groupTargets();
    const bounds = groupBounds(selected);
    if (!bounds) return;
    cancelInteraction();
    groupInteraction = {
        document,
        mode: action.mode,
        axis: action.mode === 'move' ? action.axis : undefined,
        handle: action.mode === 'resize' ? action.handle : undefined,
        pointerId: event.pointerId,
        start: { x: event.global.x, y: event.global.y },
        bounds,
        targets: selected.map(({ locator, target }) => ({
            locator,
            target,
            geometry: targetGeometry(target),
            props: { ...(selectedNode(locator) as { props: Record<string, SceneTemplateValue> }).props },
            origin: target.parent!.toGlobal(target.position),
            previewed: new Set<string>(),
            changes: [],
        })),
    };
    app.canvas.style.cursor = action.mode === 'resize'
        ? resizeCursors[action.handle]
        : action.axis === 'x' ? 'ew-resize' : action.axis === 'y' ? 'ns-resize' : 'move';
}

function moveGroupInteraction(event: FederatedPointerEvent) {
    const current = groupInteraction;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.global.x - current.start.x;
    const dy = event.global.y - current.start.y;
    if (dx !== 0 || dy !== 0) suppressCanvasClick = true;
    const bounds = current.bounds;
    let left = bounds.x;
    let top = bounds.y;
    let right = bounds.x + bounds.width;
    let bottom = bounds.y + bounds.height;
    if (current.mode === 'resize') {
        if (current.handle!.includes('w')) left = Math.min(right - 1, left + dx);
        if (current.handle!.includes('e')) right = Math.max(left + 1, right + dx);
        if (current.handle!.includes('n')) top = Math.min(bottom - 1, top + dy);
        if (current.handle!.includes('s')) bottom = Math.max(top + 1, bottom + dy);
    }
    const scaleX = (right - left) / bounds.width;
    const scaleY = (bottom - top) / bounds.height;
    for (const target of current.targets) {
        const parent = target.target.parent!;
        let changes: SceneCanvasPropChange[] | undefined;
        if (current.mode === 'move') {
            const x = current.axis === 'y' ? 0 : dx;
            const y = current.axis === 'x' ? 0 : dy;
            const start = parent.toLocal(current.start);
            const end = parent.toLocal({ x: current.start.x + x, y: current.start.y + y });
            changes = moveSceneCanvasGeometry(target.props, target.geometry,
                { x: end.x - start.x, y: end.y - start.y }, 'xy');
        } else {
            const nextOrigin = parent.toLocal({
                x: left + (target.origin.x - bounds.x) * scaleX,
                y: top + (target.origin.y - bounds.y) * scaleY,
            });
            changes = setSceneCanvasGeometry(target.props, target.geometry, {
                x: nextOrigin.x,
                y: nextOrigin.y,
                width: target.geometry.width * scaleX,
                height: target.geometry.height * scaleY,
            });
        }
        if (!changes) return;
        const nextProps = new Set(changes.map((change) => change.prop));
        for (const prop of target.previewed) {
            if (!nextProps.has(prop)) current.document.previewNodeProp(target.locator, prop, originalGroupPreviewValue(target, prop));
        }
        for (const change of changes) current.document.previewNodeProp(target.locator, change.prop, change.value);
        target.previewed = nextProps;
        target.changes = changes;
    }
    updateSelectionOverlay();
}

function originalGroupPreviewValue(target: CanvasGroupTarget, prop: string) {
    const source = target.props[prop];
    if (source !== undefined) return source;
    return prop === 'x' ? target.geometry.x
        : prop === 'y' ? target.geometry.y
            : prop === 'width' ? target.geometry.width
                : prop === 'height' ? target.geometry.height : undefined;
}

async function finishGroupInteraction() {
    const current = groupInteraction;
    if (!current) return;
    groupInteraction = undefined;
    resetCanvasCursor();
    window.setTimeout(() => { suppressCanvasClick = false; }, 0);
    const commands = current.targets.flatMap((target) => target.changes.map((change) => ({
        op: 'setNodeProp' as const, node: target.locator, prop: change.prop, value: change.value,
    })));
    if (commands.length === 0) return;
    try {
        await current.document.commitCommand({ op: 'batch', commands });
    } catch (error) {
        status.value = error instanceof Error ? error.message : String(error);
    }
}

function cancelGroupInteraction() {
    const current = groupInteraction;
    if (!current) return;
    groupInteraction = undefined;
    window.setTimeout(() => { suppressCanvasClick = false; }, 0);
    for (const target of current.targets) {
        for (const prop of target.previewed) {
            current.document.previewNodeProp(target.locator, prop, originalGroupPreviewValue(target, prop));
        }
    }
    resetCanvasCursor();
    updateSelectionOverlay();
}

function beginMove(locator: string, hitTarget: Container, event: FederatedPointerEvent) {
    if (activeTool.value === 'pan' || spacePressed.value || isPanning.value) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (!sceneCanvasEventTargetIsWithinNode(hitTarget, event.target)) return;
    const point = { x: event.global.x, y: event.global.y };
    const candidates = preview
        ? sceneCanvasHitTestOrder(preview.root, preview.nodes, point)
        : [];
    if (props.selections.length > 1 && props.selections.includes(locator)) {
        event.stopPropagation();
        beginGroupInteraction(event, { mode: 'move', axis: 'xy' });
        return;
    }
    if (!sceneCanvasNodeCanStartDrag(props.selected, locator, candidates)) return;
    event.stopPropagation();
    const dragLocator = props.selected;
    if (!dragLocator) return;
    const target = selectedTarget(dragLocator);
    if (!target || !nodeCanMove(dragLocator, target, 'xy')) {
        updateSelectionOverlay(dragLocator);
        return;
    }
    beginInteraction(dragLocator, target, event, { mode: 'move', axis: 'xy' });
}

function beginMoveHandle(axis: SceneCanvasMoveAxis, event: FederatedPointerEvent) {
    if (activeTool.value !== 'move' || spacePressed.value || isPanning.value) return;
    event.stopPropagation();
    if (event.button !== 0 || !props.selected) return;
    if (props.selections.length > 1) {
        beginGroupInteraction(event, { mode: 'move', axis });
        return;
    }
    const target = selectedTarget();
    if (!target || !nodeCanMove(props.selected, target, axis)) return;
    beginInteraction(props.selected, target, event, { mode: 'move', axis });
}

function beginResize(handle: SceneCanvasResizeHandle, event: FederatedPointerEvent) {
    if (activeTool.value !== 'resize' || spacePressed.value || isPanning.value) return;
    event.stopPropagation();
    if (event.button !== 0 || !props.selected) return;
    if (props.selections.length > 1) {
        beginGroupInteraction(event, { mode: 'resize', handle });
        return;
    }
    const target = selectedTarget();
    if (!target || !nodeCanResize(props.selected, target, handle)) return;
    beginInteraction(props.selected, target, event, { mode: 'resize', handle });
}

function beginInteraction(
    locator: string,
    target: Container,
    event: FederatedPointerEvent,
    action: CanvasInteractionAction,
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
        ...action,
        locator,
        parent: target.parent,
        pointerId: event.pointerId,
        positionManaged: sceneCanvasNodePositionIsLayoutManaged(document.template, locator),
        previewed: new Set(),
        props: { ...node.props },
        start: { x: start.x, y: start.y },
    };
    app.canvas.style.cursor = action.mode === 'move'
        ? action.axis === 'x' ? 'ew-resize' : action.axis === 'y' ? 'ns-resize' : 'move'
        : resizeCursors[action.handle];
}

function moveInteraction(event: FederatedPointerEvent) {
    if (groupInteraction) {
        moveGroupInteraction(event);
        return;
    }
    const current = interaction;
    if (!current || event.pointerId !== current.pointerId) return;
    const point = current.parent.toLocal(event.global);
    const delta = {
        x: point.x - current.start.x,
        y: point.y - current.start.y,
    };
    const changes = current.mode === 'move'
        ? moveSceneCanvasGeometry(current.props, current.geometry, delta, current.axis)
        : current.positionManaged
            ? resizeLayoutManagedSceneCanvasGeometry(current.props, current.geometry, current.handle, delta)
            : resizeSceneCanvasGeometry(current.props, current.geometry, current.handle, delta);
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
    cancelGroupInteraction();
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
    const active = !!interaction || !!groupInteraction || !!canvasPan || spacePressed.value;
    cancelInteraction();
    finishCanvasPan();
    spacePressed.value = false;
    return active;
}

function resetCanvasCursor() {
    if (app) app.canvas.style.cursor = '';
}

function selectTool(tool: 'pan' | 'move' | 'resize') {
    if (activeTool.value === tool) return;
    cancelInteraction();
    finishCanvasPan();
    activeTool.value = tool;
    updateSelectionOverlay();
}

function handleCanvasPointerDown(event: PointerEvent) {
    const target = event.target;
    if (target instanceof Element && target.closest('.canvas-tools')) return;
    const shouldPan = event.button === 1 || event.button === 2
        || (event.button === 0 && (spacePressed.value || activeTool.value === 'pan'));
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

function handleCanvasContextMenu(event: MouseEvent) {
    const target = event.target;
    if (target instanceof Element && target.closest('.canvas-tools')) return;
    event.preventDefault();
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
    } else if (event.pointerId === groupInteraction?.pointerId) {
        void finishGroupInteraction();
    } else if (event.pointerId === interaction?.pointerId) {
        void finishInteraction();
    }
}

function handleWindowPointerCancel(event: PointerEvent) {
    if (event.pointerId === canvasPan?.pointerId) {
        finishCanvasPan();
    } else if (event.pointerId === groupInteraction?.pointerId) {
        cancelInteraction();
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
    selectionMembers = new Graphics();
    selectionMembers.eventMode = 'none';
    selectionLayer.addChild(selectionMembers);
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
    const horizontal = new Graphics()
        .moveTo(10, 0).lineTo(54, 0)
        .stroke({ color: 0xef6964, width: 3, cap: 'round' })
        .poly([54, -7, 68, 0, 54, 7], true)
        .fill(0xef6964);
    horizontal.hitArea = new Rectangle(8, -11, 62, 22);
    const vertical = new Graphics()
        .moveTo(0, -10).lineTo(0, -54)
        .stroke({ color: 0x61ca80, width: 3, cap: 'round' })
        .poly([-7, -54, 0, -68, 7, -54], true)
        .fill(0x61ca80);
    vertical.hitArea = new Rectangle(-11, -70, 22, 62);
    const center = new Graphics()
        .rect(-8, -8, 16, 16)
        .fill(0xf4f7fc)
        .stroke({ color: 0x26313e, width: 2 });
    for (const [axis, graphic] of [
        ['x', horizontal],
        ['y', vertical],
        ['xy', center],
    ] as const) {
        graphic.eventMode = 'static';
        graphic.cursor = axis === 'x' ? 'ew-resize' : axis === 'y' ? 'ns-resize' : 'move';
        graphic.visible = false;
        graphic.on('pointerdown', (event) => beginMoveHandle(axis, event));
        moveHandles.set(axis, graphic);
        selectionLayer.addChild(graphic);
    }
    app!.stage.addChild(selectionLayer);
}

function updateSelectionOverlay(locator = props.selected) {
    if (!selectionOutline) return;
    selectionMembers?.clear();
    if (props.selections.length > 1) {
        const targets = groupTargets();
        const bounds = groupBounds(targets);
        if (!bounds) {
            selectionOutline.visible = false;
            for (const handle of selectionHandles.values()) handle.visible = false;
            for (const handle of moveHandles.values()) handle.visible = false;
            return;
        }
        for (const selected of props.selections) {
            const target = selectedTarget(selected);
            if (!target) continue;
            const member = target.getBounds();
            selectionMembers?.rect(member.minX, member.minY, member.maxX - member.minX, member.maxY - member.minY)
                .stroke({ color: 0x4c8dff, width: 1, alpha: 0.6 });
        }
        const { x, y, width, height } = bounds;
        selectionOutline.clear().rect(x, y, width, height).stroke({ color: 0x4c8dff, width: 1 });
        selectionOutline.visible = true;
        const positions: Record<SceneCanvasResizeHandle, { x: number; y: number }> = {
            nw: { x, y }, n: { x: x + width / 2, y }, ne: { x: x + width, y },
            e: { x: x + width, y: y + height / 2 }, se: { x: x + width, y: y + height },
            s: { x: x + width / 2, y: y + height }, sw: { x, y: y + height },
            w: { x, y: y + height / 2 },
        };
        for (const [handle, graphic] of selectionHandles) {
            graphic.position.copyFrom(positions[handle]);
            graphic.visible = activeTool.value === 'resize' && groupCanResize(handle);
        }
        for (const graphic of moveHandles.values()) {
            graphic.position.set(x + width / 2, y + height / 2);
            graphic.visible = activeTool.value === 'move' && groupCanMove();
        }
        return;
    }
    const target = selectedTarget(locator);
    if (!target || !locator || target.destroyed) {
        selectionOutline.visible = false;
        for (const handle of selectionHandles.values()) handle.visible = false;
        for (const handle of moveHandles.values()) handle.visible = false;
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
        graphic.visible = activeTool.value === 'resize' && nodeCanResize(locator, target, handle);
    }
    const origin = target.parent?.toGlobal(target.position);
    for (const [axis, graphic] of moveHandles) {
        if (origin) graphic.position.copyFrom(origin);
        graphic.visible = activeTool.value === 'move'
            && !!origin
            && nodeCanMove(locator, target, axis);
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
watch([() => props.selected, () => props.selections], () => updateSelectionOverlay());

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
    groupInteraction = undefined;
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
      'is-pan-ready': spacePressed || activeTool === 'pan',
      'is-panning': isPanning,
    }"
    @pointerdown.capture="handleCanvasPointerDown"
    @pointerenter="canvasHovered = true"
    @pointerleave="canvasHovered = false"
    @pointerup="dropAssetOnCanvas"
    @contextmenu="handleCanvasContextMenu"
    @wheel.prevent="handleCanvasWheel"
  >
    <div class="canvas-grid" />
    <div v-if="status" class="canvas-status">{{ status }}</div>
    <div class="canvas-tools canvas-mode-tools" role="group" aria-label="画布工具">
      <button
        type="button"
        title="拖动画布"
        aria-label="拖动画布"
        :aria-pressed="activeTool === 'pan'"
        @click="selectTool('pan')"
      >
        <Hand :size="15" />
      </button>
      <button
        type="button"
        title="移动节点"
        aria-label="移动节点"
        :aria-pressed="activeTool === 'move'"
        @click="selectTool('move')"
      >
        <Move :size="15" />
      </button>
      <button
        type="button"
        title="调整大小（可拖动节点）"
        aria-label="调整大小"
        :aria-pressed="activeTool === 'resize'"
        @click="selectTool('resize')"
      >
        <Scaling :size="15" />
      </button>
      <PopoverRoot v-model:open="layoutMenuOpen">
        <PopoverTrigger
          class="canvas-layout-trigger"
          type="button"
          title="快捷布局"
          aria-label="快捷布局"
        >
          <LayoutGrid :size="15" />
          <ChevronDown :size="10" />
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent class="canvas-layout-popover" side="bottom" align="start" :side-offset="8">
            <div v-for="group in layoutGroups" :key="group.label" class="canvas-layout-group">
              <div class="canvas-layout-heading">{{ group.label }}</div>
              <div class="canvas-layout-actions" role="group" :aria-label="group.label">
                <span
                  v-for="action in group.actions"
                  :key="action.label"
                  :title="layoutPlan(action).reason ?? action.label"
                >
                  <button
                    type="button"
                    :aria-label="action.label"
                    :disabled="!!layoutPlan(action).reason"
                    @click="applyLayout(action)"
                  >
                    <component :is="action.icon" :size="17" />
                  </button>
                </span>
              </div>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
    <div class="canvas-tools canvas-view-tools">
      <span v-if="document && designSize" class="canvas-view-size" title="Scene 设计尺寸">{{ designSize }}</span>
      <span v-if="document && designSize" class="canvas-view-zoom" title="画布缩放比例">{{ zoomPercent }}%</span>
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
