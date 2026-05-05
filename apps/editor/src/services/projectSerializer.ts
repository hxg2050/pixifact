import type { EditorDocument, EditorProjectState } from '../../../../src';
import { validateProjectState } from './projectValidator';
import type { ProjectValidationResult } from './projectValidator';

export interface ProjectExportResult {
    ok: boolean;
    filename?: string;
    json?: string;
    validation: ProjectValidationResult;
}

function safeFilePart(value: string) {
    return value
        .trim()
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, '-')
        || 'pixif-project';
}

export function createProjectFilename(state: EditorProjectState) {
    return `${safeFilePart(state.prefab.name)}.ai-editor.json`;
}

export function createProjectExport(document: EditorDocument): ProjectExportResult {
    const state = document.getState();
    const validation = validateProjectState(state);
    if (!validation.ok) {
        return {
            ok: false,
            validation,
        };
    }

    return {
        ok: true,
        filename: createProjectFilename(state),
        json: JSON.stringify(state, null, 2),
        validation,
    };
}

export function downloadTextFile(filename: string, text: string, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export function downloadProjectFile(filename: string, json: string) {
    downloadTextFile(filename, json, 'application/json;charset=utf-8');
}
