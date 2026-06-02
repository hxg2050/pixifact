import { useEffect, useRef, useState } from 'react';
import {
    Application as PixiApplication,
    Assets,
    BitmapText,
    Container,
    Graphics,
    HTMLText,
    NineSliceSprite,
    Sprite,
    Text,
    Texture,
    TilingSprite,
} from 'pixi.js';
import { parseSceneTemplate } from '../../../../packages/pixifact/src/compiler/templateParser';
import { normalizeSceneAssetId, resolveSceneReference } from '../../../../packages/pixifact/src/compiler/sceneAssetPair';
import {
    pixiSceneDisplayProps,
    pixiSceneGraphicsProps,
    pixiSceneSpriteLikeProps,
    pixiSceneTextStyleProps,
    pixiSceneTransformProps,
} from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
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
    readProjectFileBytes,
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
    currentScenePath: string;
    locatorPath: string;
    templates: Map<string, SceneTemplate>;
    objectUrls: string[];
    textures: Map<string, Texture>;
}

const previewWidth = 960;
const previewHeight = 540;
const transformProps = new Set<string>(pixiSceneTransformProps);
const pixiProps = new Set<string>(pixiSceneDisplayProps);
const spriteProps = new Set<string>(pixiSceneSpriteLikeProps);
const graphicsProps = new Set<string>(pixiSceneGraphicsProps);
const textStyleProps = new Set<string>(pixiSceneTextStyleProps);
const previewFlexItems = new WeakMap<Container, PreviewFlexItemProps>();
const previewFlexLayouts = new WeakMap<Container, Record<string, SceneTemplateValue>>();
const previewFlexLayoutBoxes = new WeakMap<Container, PreviewFlexSize>();

type PreviewFlexDirection = 'row' | 'column';
type PreviewFlexAlign = 'start' | 'center' | 'end' | 'stretch';
type PreviewFlexJustify = 'start' | 'center' | 'end' | 'space-between';
type PreviewFlexAlignSelf = 'auto' | PreviewFlexAlign;
type PreviewFlexBasis = number | 'auto';

interface PreviewFlexSize {
    width: number;
    height: number;
}

interface PreviewFlexItemProps {
    grow: number;
    shrink: number;
    basis: PreviewFlexBasis;
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
    marginLeft: number;
    marginRight: number;
    marginTop: number;
    marginBottom: number;
    alignSelf: PreviewFlexAlignSelf;
}

interface PreviewFlexLayoutItem {
    child: Container;
    props: PreviewFlexItemProps;
    baseMain: number;
    baseCross: number;
    mainSize: number;
    crossSize: number;
}

function numericProp(value: SceneTemplateValue | undefined, defaultValue: number) {
    return typeof value === 'number' ? value : defaultValue;
}

function optionalNumericProp(value: SceneTemplateValue | undefined) {
    return typeof value === 'number' ? value : undefined;
}

function stringProp(value: SceneTemplateValue | undefined, defaultValue = '') {
    return value === undefined ? defaultValue : String(value);
}

function sceneSize(template: SceneTemplate) {
    return {
        width: numericProp(template.props.width, previewWidth),
        height: numericProp(template.props.height, previewHeight),
    };
}

function projectAbsoluteScenePath(projectTree: ProjectFileTreeNode, scenePath: string) {
    return `${projectTree.path}/${scenePath}`;
}

function normalizedSceneReference(context: RenderContext, scene: string) {
    return resolveSceneReference(context.currentScenePath, scene);
}

async function loadSceneTemplate(context: RenderContext, scene: string) {
    const normalizedPath = normalizedSceneReference(context, scene);
    const cached = context.templates.get(normalizedPath);
    if (cached) {
        return {
            path: normalizedPath,
            template: cached,
        };
    }

    const file = findFileByPath(context.projectTree, projectAbsoluteScenePath(context.projectTree, normalizedPath));
    if (!file) {
        throw new Error(`找不到 Scene：${scene}`);
    }

    const template = parseSceneTemplate(await readProjectFileText(context.projectTree, file));
    context.templates.set(normalizedPath, template);
    return {
        path: normalizedPath,
        template,
    };
}

async function loadProjectTexture(context: RenderContext, texture: string) {
    const cached = context.textures.get(texture);
    if (cached) {
        return cached;
    }

    const normalized = texture.replace(/^\.\/+/, '').replace(/^\/+/, '');
    const path = normalized.startsWith(`${context.projectTree.path}/`)
        ? normalized
        : `${context.projectTree.path}/${normalized}`;
    const file = findFileByPath(context.projectTree, path);
    if (!file || file.kind !== 'asset') {
        throw new Error(`找不到贴图：${texture}`);
    }

    const bytes = await readProjectFileBytes(context.projectTree, file);
    const objectUrl = URL.createObjectURL(new Blob([bytes.slice().buffer]));
    context.objectUrls.push(objectUrl);
    const loaded = await Assets.load({ src: objectUrl, parser: 'texture' });
    context.textures.set(texture, loaded);
    return loaded;
}

function createTextNode(node: PixiTemplateNode) {
    return new Text({
        text: stringProp(node.props.text),
        style: textStyle(node),
    });
}

async function createPixiNode(node: PixiTemplateNode, context: RenderContext) {
    if (node.type === 'Text') {
        return createTextNode(node);
    }
    if (node.type === 'BitmapText') {
        return new BitmapText({
            text: stringProp(node.props.text),
            style: textStyle(node),
        });
    }
    if (node.type === 'HTMLText') {
        return new HTMLText({
            text: stringProp(node.props.text),
            style: textStyle(node),
        });
    }
    if (node.type === 'Sprite') {
        const texture = node.props.texture;
        return typeof texture === 'string'
            ? new Sprite({ texture: await loadProjectTexture(context, texture) })
            : new Sprite();
    }
    if (node.type === 'NineSliceSprite') {
        const texture = node.props.texture;
        return typeof texture === 'string'
            ? new NineSliceSprite({ texture: await loadProjectTexture(context, texture) })
            : new NineSliceSprite(Texture.EMPTY);
    }
    if (node.type === 'TilingSprite') {
        const texture = node.props.texture;
        return new TilingSprite(typeof texture === 'string'
            ? { texture: await loadProjectTexture(context, texture) }
            : {});
    }
    if (node.type === 'Graphics') {
        return new Graphics();
    }
    if (node.type === 'Container') {
        return new Container();
    }
    throw new Error(`Editor preview 暂不支持 <${node.type}>。`);
}

function textStyle(node: PixiTemplateNode) {
    const style: Record<string, string | number> = {};
    for (const key of textStyleProps) {
        const value = node.props[key];
        if (value !== undefined) {
            style[key] = key === 'fontWeight' ? String(value) : value as string | number;
        }
    }
    return style;
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
    if (target instanceof Sprite || target instanceof NineSliceSprite || target instanceof TilingSprite) {
        const anchorX = props.anchorX;
        const anchorY = props.anchorY;
        if (anchorX !== undefined || anchorY !== undefined) {
            target.anchor.set(numericProp(anchorX, 0), numericProp(anchorY, 0));
        }
        if (props.tint !== undefined) {
            target.tint = numericProp(props.tint, 0xffffff);
        }
    }
    if (target instanceof NineSliceSprite) {
        for (const key of ['leftWidth', 'rightWidth', 'topHeight', 'bottomHeight'] as const) {
            const value = props[key];
            if (value !== undefined) {
                target[key] = numericProp(value, 10);
            }
        }
    }
    if (target instanceof TilingSprite) {
        const tilePositionX = props.tilePositionX;
        const tilePositionY = props.tilePositionY;
        if (tilePositionX !== undefined || tilePositionY !== undefined) {
            target.tilePosition.set(numericProp(tilePositionX, 0), numericProp(tilePositionY, 0));
        }
        const tileScaleX = props.tileScaleX;
        const tileScaleY = props.tileScaleY;
        if (tileScaleX !== undefined || tileScaleY !== undefined) {
            target.tileScale.set(numericProp(tileScaleX, 1), numericProp(tileScaleY, 1));
        }
        if (props.tileRotation !== undefined) {
            target.tileRotation = numericProp(props.tileRotation, 0);
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

const defaultPreviewFlexItemProps: PreviewFlexItemProps = {
    grow: 0,
    shrink: 1,
    basis: 'auto',
    minWidth: 0,
    minHeight: 0,
    maxWidth: -1,
    maxHeight: -1,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
    alignSelf: 'auto',
};

function previewFlexItemProps(props: Record<string, SceneTemplateValue>): PreviewFlexItemProps {
    return {
        grow: Math.max(0, numericProp(props.grow, 0)),
        shrink: Math.max(0, numericProp(props.shrink, 1)),
        basis: previewFlexBasis(props.basis),
        minWidth: Math.max(0, numericProp(props.minWidth, 0)),
        minHeight: Math.max(0, numericProp(props.minHeight, 0)),
        maxWidth: numericProp(props.maxWidth, -1),
        maxHeight: numericProp(props.maxHeight, -1),
        marginLeft: numericProp(props.marginLeft, 0),
        marginRight: numericProp(props.marginRight, 0),
        marginTop: numericProp(props.marginTop, 0),
        marginBottom: numericProp(props.marginBottom, 0),
        alignSelf: previewFlexAlignSelf(props.alignSelf),
    };
}

function previewFlexBasis(value: SceneTemplateValue | undefined): PreviewFlexBasis {
    if (value === 'auto') {
        return 'auto';
    }
    const basis = numericProp(value, -1);
    return basis >= 0 ? basis : 'auto';
}

function previewFlexDirection(value: SceneTemplateValue | undefined): PreviewFlexDirection {
    return value === 'column' ? 'column' : 'row';
}

function previewFlexAlign(value: SceneTemplateValue | undefined): PreviewFlexAlign {
    if (value === 'center' || value === 'end' || value === 'stretch') {
        return value;
    }
    return 'start';
}

function previewFlexAlignSelf(value: SceneTemplateValue | undefined): PreviewFlexAlignSelf {
    if (value === 'start' || value === 'center' || value === 'end' || value === 'stretch') {
        return value;
    }
    return 'auto';
}

function previewFlexJustify(value: SceneTemplateValue | undefined): PreviewFlexJustify {
    if (value === 'center' || value === 'end' || value === 'space-between') {
        return value;
    }
    return 'start';
}

function measurePreviewFlexChildren(container: Container): PreviewFlexSize {
    let maxX = 0;
    let maxY = 0;
    for (const child of container.children) {
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
    }
    return { width: maxX, height: maxY };
}

function measurePreviewFlexChild(child: Container): PreviewFlexSize {
    const layoutBox = previewFlexLayoutBoxes.get(child);
    if (layoutBox) {
        return layoutBox;
    }
    if (previewFlexItems.has(child)) {
        return measurePreviewFlexChildren(child);
    }
    return {
        width: child.width,
        height: child.height,
    };
}

function previewFlexMax(value: number) {
    return value >= 0 ? value : Number.POSITIVE_INFINITY;
}

function previewFlexClamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function previewFlexMarginMain(props: PreviewFlexItemProps, horizontal: boolean) {
    return horizontal
        ? props.marginLeft + props.marginRight
        : props.marginTop + props.marginBottom;
}

function previewFlexMarginCross(props: PreviewFlexItemProps, horizontal: boolean) {
    return horizontal
        ? props.marginTop + props.marginBottom
        : props.marginLeft + props.marginRight;
}

function previewFlexClampMain(value: number, props: PreviewFlexItemProps, horizontal: boolean) {
    return horizontal
        ? previewFlexClamp(value, props.minWidth, previewFlexMax(props.maxWidth))
        : previewFlexClamp(value, props.minHeight, previewFlexMax(props.maxHeight));
}

function previewFlexClampCross(value: number, props: PreviewFlexItemProps, horizontal: boolean) {
    return horizontal
        ? previewFlexClamp(value, props.minHeight, previewFlexMax(props.maxHeight))
        : previewFlexClamp(value, props.minWidth, previewFlexMax(props.maxWidth));
}

function previewFlexJustifyOffset(justify: PreviewFlexJustify, remaining: number) {
    if (justify === 'center') {
        return remaining / 2;
    }
    if (justify === 'end') {
        return remaining;
    }
    return 0;
}

function previewFlexAlignOffset(align: PreviewFlexAlign | PreviewFlexAlignSelf, remaining: number) {
    if (align === 'center') {
        return remaining / 2;
    }
    if (align === 'end') {
        return remaining;
    }
    return 0;
}

function previewFlexContainerSize(
    root: Container,
    axis: PreviewFlexDirection,
    props: Record<string, SceneTemplateValue>,
    naturalSize: number,
) {
    const layoutBox = previewFlexLayoutBoxes.get(root);
    if (axis === 'row') {
        return layoutBox?.width ?? optionalNumericProp(props.width) ?? naturalSize;
    }
    return layoutBox?.height ?? optionalNumericProp(props.height) ?? naturalSize;
}

function createPreviewFlexLayoutItem(child: Container, mainAxis: PreviewFlexDirection, crossAxis: PreviewFlexDirection): PreviewFlexLayoutItem {
    const props = previewFlexItems.get(child) ?? defaultPreviewFlexItemProps;
    const natural = measurePreviewFlexChild(child);
    const naturalMain = mainAxis === 'row' ? natural.width : natural.height;
    const naturalCross = crossAxis === 'row' ? natural.width : natural.height;
    const minMain = mainAxis === 'row' ? props.minWidth : props.minHeight;
    const maxMain = previewFlexMax(mainAxis === 'row' ? props.maxWidth : props.maxHeight);
    const minCross = crossAxis === 'row' ? props.minWidth : props.minHeight;
    const maxCross = previewFlexMax(crossAxis === 'row' ? props.maxWidth : props.maxHeight);
    const basis = props.basis === 'auto' ? naturalMain : props.basis;
    const baseMain = previewFlexClamp(basis, minMain, maxMain);
    const baseCross = previewFlexClamp(naturalCross, minCross, maxCross);
    return {
        child,
        props,
        baseMain,
        baseCross,
        mainSize: baseMain,
        crossSize: baseCross,
    };
}

function resolvePreviewFlexMainSizes(items: PreviewFlexLayoutItem[], freeMain: number, horizontal: boolean) {
    if (freeMain > 0) {
        const totalGrow = items.reduce((sum, item) => sum + item.props.grow, 0);
        if (totalGrow > 0) {
            for (const item of items) {
                item.mainSize = previewFlexClampMain(item.baseMain + freeMain * (item.props.grow / totalGrow), item.props, horizontal);
            }
        }
        return;
    }

    if (freeMain < 0) {
        const totalShrink = items.reduce((sum, item) => sum + item.props.shrink * item.baseMain, 0);
        if (totalShrink > 0) {
            for (const item of items) {
                const weighted = item.props.shrink * item.baseMain;
                item.mainSize = previewFlexClampMain(item.baseMain + freeMain * (weighted / totalShrink), item.props, horizontal);
            }
        }
    }
}

function resolvePreviewFlexCrossSizes(
    items: PreviewFlexLayoutItem[],
    innerCross: number,
    align: PreviewFlexAlign,
    horizontal: boolean,
) {
    for (const item of items) {
        const alignSelf = item.props.alignSelf === 'auto' ? align : item.props.alignSelf;
        if (alignSelf === 'stretch') {
            item.crossSize = previewFlexClampCross(innerCross - previewFlexMarginCross(item.props, horizontal), item.props, horizontal);
        }
    }
}

function setPreviewFlexChildBox(child: Container, x: number, y: number, width: number, height: number) {
    child.position.set(x, y);
    if (previewFlexItems.has(child)) {
        previewFlexLayoutBoxes.set(child, { width, height });
        return;
    }
    const nestedFlexProps = previewFlexLayouts.get(child);
    if (nestedFlexProps) {
        previewFlexLayoutBoxes.set(child, { width, height });
        applyPreviewFlexLayout(child, nestedFlexProps);
        return;
    }
    child.width = width;
    child.height = height;
}

function applyPreviewFlexLayout(root: Container, props: Record<string, SceneTemplateValue>) {
    const children = root.children as Container[];
    if (children.length === 0) {
        return;
    }
    const direction = previewFlexDirection(props.direction);
    const align = previewFlexAlign(props.align);
    const justify = previewFlexJustify(props.justify);
    const gap = Math.max(0, numericProp(props.gap, 0));
    const paddingX = Math.max(0, numericProp(props.paddingX, 0));
    const paddingY = Math.max(0, numericProp(props.paddingY, 0));
    const paddingLeft = Math.max(0, numericProp(props.paddingLeft, paddingX));
    const paddingRight = Math.max(0, numericProp(props.paddingRight, paddingX));
    const paddingTop = Math.max(0, numericProp(props.paddingTop, paddingY));
    const paddingBottom = Math.max(0, numericProp(props.paddingBottom, paddingY));
    const horizontal = direction === 'row';
    const mainAxis: PreviewFlexDirection = horizontal ? 'row' : 'column';
    const crossAxis: PreviewFlexDirection = horizontal ? 'column' : 'row';
    const paddingMainStart = horizontal ? paddingLeft : paddingTop;
    const paddingMainEnd = horizontal ? paddingRight : paddingBottom;
    const paddingCrossStart = horizontal ? paddingTop : paddingLeft;
    const paddingCrossEnd = horizontal ? paddingBottom : paddingRight;
    const items = children.map((child) => createPreviewFlexLayoutItem(child, mainAxis, crossAxis));
    const gapTotal = gap * Math.max(0, items.length - 1);
    const naturalMain = items.reduce((sum, item) => sum + item.baseMain + previewFlexMarginMain(item.props, horizontal), 0);
    const naturalCross = items.reduce((max, item) => Math.max(max, item.baseCross + previewFlexMarginCross(item.props, horizontal)), 0);
    const containerMain = previewFlexContainerSize(root, mainAxis, props, naturalMain + gapTotal + paddingMainStart + paddingMainEnd);
    const containerCross = previewFlexContainerSize(root, crossAxis, props, naturalCross + paddingCrossStart + paddingCrossEnd);
    const innerMain = Math.max(0, containerMain - paddingMainStart - paddingMainEnd - gapTotal);
    const innerCross = Math.max(0, containerCross - paddingCrossStart - paddingCrossEnd);
    const freeMain = innerMain - naturalMain;

    resolvePreviewFlexMainSizes(items, freeMain, horizontal);
    resolvePreviewFlexCrossSizes(items, innerCross, align, horizontal);

    const usedMain = items.reduce((sum, item) => sum + item.mainSize + previewFlexMarginMain(item.props, horizontal), 0);
    const remaining = Math.max(0, containerMain - paddingMainStart - paddingMainEnd - usedMain - gapTotal);
    const actualGap = justify === 'space-between' && items.length > 1
        ? gap + remaining / (items.length - 1)
        : gap;
    let cursor = paddingMainStart + previewFlexJustifyOffset(justify, remaining);

    for (const item of items) {
        const mainStartMargin = horizontal ? item.props.marginLeft : item.props.marginTop;
        const mainEndMargin = horizontal ? item.props.marginRight : item.props.marginBottom;
        const crossStartMargin = horizontal ? item.props.marginTop : item.props.marginLeft;
        const crossEndMargin = horizontal ? item.props.marginBottom : item.props.marginRight;
        const alignSelf = item.props.alignSelf === 'auto' ? align : item.props.alignSelf;
        const crossFree = Math.max(0, innerCross - item.crossSize - crossStartMargin - crossEndMargin);
        const main = cursor + mainStartMargin;
        const cross = paddingCrossStart + crossStartMargin + previewFlexAlignOffset(alignSelf, crossFree);
        const x = horizontal ? main : cross;
        const y = horizontal ? cross : main;
        const width = horizontal ? item.mainSize : item.crossSize;
        const height = horizontal ? item.crossSize : item.mainSize;
        setPreviewFlexChildBox(item.child, x, y, width, height);
        cursor = main + item.mainSize + mainEndMargin + actualGap;
    }

    previewFlexLayoutBoxes.set(root, horizontal
        ? { width: containerMain, height: containerCross }
        : { width: containerCross, height: containerMain });
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
    const loaded = await loadSceneTemplate(context, node.scene);
    const rendered = await renderScene(loaded.template, {
        ...context,
        currentScenePath: loaded.path,
    });

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

    if (loaded.template.name === 'FlexItem') {
        previewFlexItems.set(rendered.root, previewFlexItemProps(node.props));
    }
    if (loaded.template.name === 'FlexLayout') {
        previewFlexLayouts.set(rendered.root, node.props);
        applyPreviewFlexLayout(rendered.root, node.props);
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

    const display = await createPixiNode(node, context);
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
        const objectUrls: string[] = [];
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
                    currentScenePath: normalizeSceneAssetId(document.scenePath.slice(projectTree.path.length + 1)),
                    locatorPath: '',
                    templates: new Map([[normalizeSceneAssetId(document.scenePath.slice(projectTree.path.length + 1)), document.template]]),
                    objectUrls,
                    textures: new Map(),
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
            for (const objectUrl of objectUrls) {
                URL.revokeObjectURL(objectUrl);
            }
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
