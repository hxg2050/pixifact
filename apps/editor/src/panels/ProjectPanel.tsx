import { useRef, useState } from 'react';
import type { EditorDocument } from '../../../../src';
import { ActionButton } from '../components/ActionButton';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { createProjectExport, downloadProjectFile } from '../services/projectSerializer';
import { parseProjectJson, validateProjectState } from '../services/projectValidator';
import { FieldRow } from './common';

export function ProjectPanel({ document }: { document: EditorDocument }) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; title: string; details?: string[] }>();
    const [importing, setImporting] = useState(false);
    const validation = validateProjectState(document.getState());
    const summary = validation.summary;

    const showValidationResult = () => {
        const result = validateProjectState(document.getState());
        setMessage(result.ok
            ? {
                type: 'success',
                title: result.warnings.length > 0 ? '项目校验通过，但存在提醒。' : '项目校验通过。',
                details: result.warnings,
            }
            : {
                type: 'error',
                title: '项目校验失败。',
                details: result.errors,
            });
    };

    const exportProject = () => {
        const result = createProjectExport(document);
        if (!result.ok || !result.filename || !result.json) {
            setMessage({
                type: 'error',
                title: '导出前项目校验失败。',
                details: result.validation.errors,
            });
            return;
        }

        downloadProjectFile(result.filename, result.json);
        setMessage({
            type: 'success',
            title: `已导出 ${result.filename}`,
            details: result.validation.warnings,
        });
    };

    const importProject = async (file: File | undefined) => {
        if (!file) {
            return;
        }

        setImporting(true);
        try {
            const result = parseProjectJson(await file.text());
            if (!result.ok || !result.state) {
                setMessage({
                    type: 'error',
                    title: `无法导入 ${file.name}`,
                    details: result.errors,
                });
                return;
            }

            document.loadState(result.state);
            refreshEditorDocument();
            setMessage({
                type: 'success',
                title: `已导入 ${file.name}`,
                details: result.warnings,
            });
        } catch (error) {
            setMessage({
                type: 'error',
                title: `无法导入 ${file.name}`,
                details: [error instanceof Error ? error.message : String(error)],
            });
        } finally {
            setImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="panelBody">
            <section className="inspectorSection">
                <h3>项目文件</h3>
                <div className="projectActions">
                    <ActionButton icon="download" label="导出项目" variant="primary" data-testid="project-export" onClick={exportProject} />
                    <ActionButton icon="upload" label={importing ? '导入中...' : '导入项目'} data-testid="project-import-button" onClick={() => fileInputRef.current?.click()} disabled={importing} />
                    <ActionButton icon="check" label="校验项目" onClick={showValidationResult} />
                </div>
                <input
                    accept=".ai-editor.json,application/json"
                    className="hiddenFileInput"
                    data-testid="project-import-input"
                    onChange={(event) => void importProject(event.currentTarget.files?.[0])}
                    ref={fileInputRef}
                    type="file"
                />
                {message ? (
                    <div className={message.type === 'success' ? 'successBox' : 'errorBox'}>
                        <strong>{message.title}</strong>
                        {message.details?.length ? (
                            <ul>
                                {message.details.slice(0, 6).map((detail, index) => (
                                    <li key={`${detail}-${index}`}>{detail}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
            </section>
            <section className="inspectorSection">
                <h3>项目</h3>
                <FieldRow label="名称" value={document.prefab.name} />
                <FieldRow label="节点" value={summary?.nodeCount} />
                <FieldRow label="组件" value={summary?.componentCount} />
                <FieldRow label="动作" value={summary?.actionCount} />
                <FieldRow label="逻辑流" value={summary?.logicFlowCount} />
                <FieldRow label="锁定" value={summary?.lockCount} />
                <FieldRow label="记忆" value={summary?.memoryCount} />
                <FieldRow label="历史" value={summary?.proposalHistoryCount} />
                <FieldRow label="状态" value={validation.ok ? '有效' : '需要修复'} />
            </section>
            <section className="inspectorSection">
                <h3>动作</h3>
                {document.actions.length > 0
                    ? document.actions.map((action) => (
                        <FieldRow key={action.key} label={action.key} value={action.label} />
                    ))
                    : <div className="emptyInline">暂无动作</div>}
            </section>
        </div>
    );
}
