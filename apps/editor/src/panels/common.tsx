import { useSyncExternalStore } from 'react';
import type { EditorDocument, NodeSpec } from '../../../../src';
import {
    getEditorDocumentRevision,
    subscribeEditorDocument,
} from '../document/editorDocumentController';

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

    for (const child of node.children ?? []) {
        collectHierarchy(child, depth + 1, items);
    }

    return items;
}

export function selectedNodeId(document: EditorDocument) {
    return document.selection.type === 'node' || document.selection.type === 'component'
        ? document.selection.node
        : undefined;
}

export function useDocumentRevision() {
    return useSyncExternalStore(
        subscribeEditorDocument,
        getEditorDocumentRevision,
        getEditorDocumentRevision,
    );
}

export function formatValue(value: unknown) {
    if (value === undefined) {
        return '未设置';
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }
    if (typeof value === 'boolean') {
        return value ? '是' : '否';
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
    return (
        <div className="fieldRow">
            <span>{label}</span>
            <strong>{formatValue(value)}</strong>
        </div>
    );
}
