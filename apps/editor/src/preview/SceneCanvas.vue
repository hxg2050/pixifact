<script setup lang="ts">
import { Application, Container, Graphics } from 'pixi.js';
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
import { findSceneNodeByLocator } from '../document/sceneTree';
import type { ProjectFileTreeNode } from '../services/projectFileTree';
import {
    createCompilerSceneRuntimePreview,
    destroyCompilerSceneRuntimePreview,
    type CompilerSceneRuntimePreview,
} from './compilerSceneRuntimePreview';

const props = defineProps<{
    document?: SceneDocument;
    projectTree?: ProjectFileTreeNode;
    sceneInterfaces?: Record<string, SceneTemplateInterface>;
    selected?: string;
}>();
const emit = defineEmits<{ select: [locator: string] }>();
const host = ref<HTMLElement>();
const status = ref('正在初始化画布');
let app: Application | undefined;
let preview: CompilerSceneRuntimePreview | undefined;
let resizeObserver: ResizeObserver | undefined;
let unsubscribeDocument: (() => void) | undefined;
let buildRevision = 0;

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
            target.on('pointertap', () => emit('select', locator));
        }
        app.stage.addChild(preview.root);
        fitPreview();
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
    if (prop === 'x' || prop === 'y') {
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
    redrawGraphics(locator, target);
}

function redrawGraphics(locator: string, target: Container) {
    if (!(target instanceof Graphics) || !props.document) return;
    const node = findSceneNodeByLocator(props.document.template.children, locator);
    if (node?.kind !== 'pixi' || node.type !== 'Graphics') return;
    const defaults = isPixiSceneNodeType(node.type) ? pixiSceneNodeDefaults(node.type) : {};
    const values = { ...defaults, ...node.props };
    const width = Number(values.width ?? 100);
    const height = Number(values.height ?? 60);
    target.clear();
    if (values.shape === 'rect') {
        target.rect(0, 0, width, height);
    } else {
        target.roundRect(0, 0, width, height, Number(values.radius ?? 0));
    }
    target.fill({ color: Number(values.fill ?? 0xe5e7eb), alpha: Number(values.fillAlpha ?? 1) });
    if (Number(values.strokeWidth ?? 0) > 0) {
        target.stroke({
            color: Number(values.strokeColor ?? 0),
            alpha: Number(values.strokeAlpha ?? 1),
            width: Number(values.strokeWidth),
        });
    }
}

function applyCommand(command: CompilerSceneCommand) {
    if (command.op === 'setNodeProp') {
        applyNodeProp(command.node, command.prop, command.value);
        return;
    }
    if (command.op === 'batch' && command.commands.every((child) => child.op === 'setNodeProp')) {
        for (const child of command.commands) applyCommand(child);
        return;
    }
    void rebuildPreview();
}

function handleDocumentEvent(event: SceneDocumentEvent) {
    if (event.type === 'nodePropPreview') {
        applyNodeProp(event.locator, event.prop, event.value);
    } else if (event.type === 'commandApplied') {
        applyCommand(event.command);
    }
}

watch(() => props.document, (document) => {
    unsubscribeDocument?.();
    unsubscribeDocument = document?.subscribe(handleDocumentEvent);
    void rebuildPreview();
}, { immediate: true });

watch(() => props.projectTree, () => void rebuildPreview());
watch(() => props.sceneInterfaces, () => void rebuildPreview());

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
    resizeObserver = new ResizeObserver(() => {
        if (!app) return;
        const next = hostSize();
        app.renderer.resize(next.width, next.height);
        fitPreview();
    });
    resizeObserver.observe(host.value!);
    await rebuildPreview();
});

onBeforeUnmount(() => {
    buildRevision += 1;
    unsubscribeDocument?.();
    resizeObserver?.disconnect();
    if (preview) destroyCompilerSceneRuntimePreview(preview);
    app?.destroy({ removeView: true }, { children: true });
});
</script>

<template>
  <div ref="host" class="scene-canvas-host">
    <div class="canvas-grid" />
    <div v-if="status" class="canvas-status">{{ status }}</div>
  </div>
</template>
