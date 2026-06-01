import { pixiSceneAddableNodeTypes } from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
import type { PixiSceneNodeType } from '../../../../packages/pixifact/src/compiler/pixiNodeSchema';
import type { I18nKey } from '../i18n';

export type PixiNodeTemplateKind = `pixi-${string}`;

export interface NodeTemplateItem {
    kind: PixiNodeTemplateKind;
    name: string;
    nameKey: I18nKey;
}

export const pixiNodeTemplateLibrary: NodeTemplateItem[] = pixiSceneAddableNodeTypes.map((type) => ({
    kind: pixiNodeTemplateKind(type),
    name: type,
    nameKey: pixiNodeTemplateNameKey(type),
}));

const pixiNodeTypesByTemplateKind = new Map<PixiNodeTemplateKind, PixiSceneNodeType>(
    pixiSceneAddableNodeTypes.map((type) => [pixiNodeTemplateKind(type), type]),
);

export function pixiNodeTemplateKind(type: PixiSceneNodeType): PixiNodeTemplateKind {
    return `pixi-${type
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()}`;
}

export function pixiNodeTypeFromTemplateKind(kind: string) {
    return pixiNodeTypesByTemplateKind.get(kind as PixiNodeTemplateKind);
}

function pixiNodeTemplateI18nName(type: PixiSceneNodeType) {
    return type.replace(/^HTML/, 'Html');
}

function pixiNodeTemplateNameKey(type: PixiSceneNodeType): I18nKey {
    return `pixi${pixiNodeTemplateI18nName(type)}Name` as I18nKey;
}
