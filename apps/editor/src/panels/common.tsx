import { useSyncExternalStore } from 'react';
import {
    getCompilerSceneDocumentRevision,
    subscribeCompilerSceneDocument,
} from '../document/compilerSceneDocumentController';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n';

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

export function useCompilerSceneRevision() {
    return useSyncExternalStore(
        subscribeCompilerSceneDocument,
        getCompilerSceneDocumentRevision,
        getCompilerSceneDocumentRevision,
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
