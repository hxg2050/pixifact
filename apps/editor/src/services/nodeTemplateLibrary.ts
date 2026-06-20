import {
    builtinSceneNames,
    pixiSceneAddableNodeTypes,
    type BuiltinSceneName,
    type PixiSceneNodeType,
} from 'pixifact/compiler';
import type { I18nKey } from '../i18n';

export type PixiNodeTemplateKind = `pixi-${string}`;
export type BuiltinSceneNodeTemplateKind = `builtin-scene-${string}`;

export interface PixiNodeTemplateItem {
    kind: PixiNodeTemplateKind;
    name: string;
    nameKey: I18nKey;
}

export interface BuiltinSceneNodeTemplateItem {
    kind: BuiltinSceneNodeTemplateKind;
    name: BuiltinSceneName;
}

export type NodeTemplateItem = PixiNodeTemplateItem | BuiltinSceneNodeTemplateItem;

export interface NodeTemplateGroup {
    titleKey: I18nKey;
    items: NodeTemplateItem[];
}

export const pixiNodeTemplateLibrary: PixiNodeTemplateItem[] = pixiSceneAddableNodeTypes.map((type) => ({
    kind: pixiNodeTemplateKind(type),
    name: type,
    nameKey: pixiNodeTemplateNameKey(type),
}));

export const builtinSceneNodeTemplateLibrary: BuiltinSceneNodeTemplateItem[] = builtinSceneNames.map((name) => ({
    kind: builtinSceneNodeTemplateKind(name),
    name,
}));

export const nodeTemplateLibrary: NodeTemplateItem[] = [
    ...pixiNodeTemplateLibrary,
    ...builtinSceneNodeTemplateLibrary,
];

export const nodeTemplateLibraryGroups: NodeTemplateGroup[] = [{
    titleKey: 'addPixiNodeGroup',
    items: pixiNodeTemplateLibrary,
}, {
    titleKey: 'addBuiltinSceneGroup',
    items: builtinSceneNodeTemplateLibrary,
}];

const pixiNodeTypesByTemplateKind = new Map<PixiNodeTemplateKind, PixiSceneNodeType>(
    pixiSceneAddableNodeTypes.map((type) => [pixiNodeTemplateKind(type), type]),
);

const builtinSceneNamesByTemplateKind = new Map<BuiltinSceneNodeTemplateKind, BuiltinSceneName>(
    builtinSceneNames.map((name) => [builtinSceneNodeTemplateKind(name), name]),
);

export function pixiNodeTemplateKind(type: PixiSceneNodeType): PixiNodeTemplateKind {
    return `pixi-${nodeTemplateNameSlug(type)}`;
}

export function builtinSceneNodeTemplateKind(name: BuiltinSceneName): BuiltinSceneNodeTemplateKind {
    return `builtin-scene-${nodeTemplateNameSlug(name)}`;
}

function nodeTemplateNameSlug(name: string) {
    return name
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
}

export function pixiNodeTypeFromTemplateKind(kind: string) {
    return pixiNodeTypesByTemplateKind.get(kind as PixiNodeTemplateKind);
}

export function builtinSceneNameFromTemplateKind(kind: string) {
    return builtinSceneNamesByTemplateKind.get(kind as BuiltinSceneNodeTemplateKind);
}

function pixiNodeTemplateI18nName(type: PixiSceneNodeType) {
    return type.replace(/^HTML/, 'Html');
}

function pixiNodeTemplateNameKey(type: PixiSceneNodeType): I18nKey {
    return `pixi${pixiNodeTemplateI18nName(type)}Name` as I18nKey;
}
