import { useSyncExternalStore } from 'react';
import type { SceneDocument, NodeSpec } from 'pixifact';
import {
    getSceneDocumentRevision,
    subscribeSceneDocument,
} from '../document/sceneDocumentController';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n';

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

export interface HierarchyItem {
    node: NodeSpec;
    locator: string;
    depth: number;
}

export function getNodeLocator(node: NodeSpec) {
    return node.key ?? node.id ?? node.name ?? 'root';
}

export function collectHierarchy(node: NodeSpec, depth = 0, items: HierarchyItem[] = []) {
    items.push({
        node,
        locator: getNodeLocator(node),
        depth,
    });

    if (node.kind === 'container') {
        for (const child of node.children ?? []) {
            collectHierarchy(child, depth + 1, items);
        }
    }

    return items;
}

export function selectedNodeId(document: SceneDocument) {
    return document.selection.type === 'node' || document.selection.type === 'component'
        ? document.selection.node
        : undefined;
}

export function useDocumentRevision() {
    return useSyncExternalStore(
        subscribeSceneDocument,
        getSceneDocumentRevision,
        getSceneDocumentRevision,
    );
}

export function formatValue(value: unknown, t?: Translate) {
    if (value === undefined) {
        return t ? t('unset') : '未设置';
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    if (typeof value === 'boolean') {
        if (!t) {
            return value ? '是' : '否';
        }
        return value ? t('yes') : t('no');
    }
    if (typeof value === 'string') {
        return value;
    }
    return JSON.stringify(value);
}

export function parseTextValue(value: string) {
    return value.trim() === '' ? undefined : value;
}

export function FieldRow({ label, value }: { label: string; value: unknown }) {
    const t = useI18n();
    return (
        <div className="fieldRow">
            <span>{label}</span>
            <strong>{formatValue(value, t)}</strong>
        </div>
    );
}
