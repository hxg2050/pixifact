import type { I18nKey } from '../i18n';
import { editorDragDataTypes } from './dragPayload';

export const sceneToolDragDataType = editorDragDataTypes.sceneTool;

export type SceneToolKind = 'slotOutlet';

export interface SceneToolItem {
    kind: SceneToolKind;
    nameKey: I18nKey;
    detailKey: I18nKey;
}

export const sceneToolLibrary: SceneToolItem[] = [
    { kind: 'slotOutlet', nameKey: 'sceneToolSlotOutletName', detailKey: 'sceneToolSlotOutletDetail' },
];

export function isSceneToolKind(value: string): value is SceneToolKind {
    return sceneToolLibrary.some((item) => item.kind === value);
}
