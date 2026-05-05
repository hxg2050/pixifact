import { useRef, useState } from 'react';
import type { EditorDocument, PreferenceMemory } from '../../../../src';
import { ActionButton } from '../components/ActionButton';
import { IconButton } from '../components/IconButton';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { downloadTextFile } from '../services/projectSerializer';

function memorySourceLabel(source: string | undefined) {
    switch (source) {
        case 'ai':
            return 'AI';
        case 'imported':
            return '导入';
        default:
            return '手动';
    }
}

function parseMemoryJson(text: string): PreferenceMemory[] {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
        return parsed as PreferenceMemory[];
    }
    if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { memory?: unknown }).memory)) {
        return (parsed as { memory: PreferenceMemory[] }).memory;
    }
    throw new Error('记忆文件必须是数组，或包含 memory 数组。');
}

export function MemoryPanel({ document }: { document: EditorDocument }) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const suggestions = document.getMemorySuggestions();
    const [message, setMessage] = useState<{ type: 'success' | 'error'; title: string; details?: string[] }>();

    const acceptSuggestion = (index: number) => {
        const suggestion = document.getMemorySuggestions()[index];
        if (!suggestion) {
            return;
        }
        document.acceptMemorySuggestion(suggestion);
        setMessage({ type: 'success', title: '已接受记忆建议。' });
        refreshEditorDocument();
    };

    const toggleMemory = (memory: PreferenceMemory) => {
        document.setMemoryEnabled(memory.id, memory.enabled === false);
        refreshEditorDocument();
    };

    const deleteMemory = (memory: PreferenceMemory) => {
        document.removeMemory(memory.id);
        refreshEditorDocument();
    };

    const exportMemory = () => {
        downloadTextFile('pixif-memory.json', JSON.stringify({
            type: 'pixif.preferenceMemory',
            version: 1,
            memory: document.memory,
        }, null, 2), 'application/json;charset=utf-8');
        setMessage({ type: 'success', title: '已导出 pixif-memory.json' });
    };

    const importMemory = async (file: File | undefined) => {
        if (!file) {
            return;
        }

        try {
            const memory = parseMemoryJson(await file.text());
            document.importMemory(memory);
            setMessage({
                type: 'success',
                title: `已导入 ${file.name}`,
            });
            refreshEditorDocument();
        } catch (error) {
            setMessage({
                type: 'error',
                title: `无法导入 ${file.name}`,
                details: [error instanceof Error ? error.message : String(error)],
            });
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="panelBody">
            <section className="inspectorSection">
                <h3>记忆文件</h3>
                <div className="buttonRow">
                    <ActionButton icon="download" label="导出记忆" variant="primary" onClick={exportMemory} disabled={document.memory.length === 0} />
                    <ActionButton icon="upload" label="导入记忆" onClick={() => fileInputRef.current?.click()} />
                </div>
                <input
                    accept=".json,application/json"
                    className="hiddenFileInput"
                    onChange={(event) => void importMemory(event.currentTarget.files?.[0])}
                    ref={fileInputRef}
                    type="file"
                />
                {message ? (
                    <div className={message.type === 'success' ? 'successBox' : 'errorBox'}>
                        <strong>{message.title}</strong>
                        {message.details?.length ? (
                            <ul>
                                {message.details.map((detail, index) => (
                                    <li key={`${detail}-${index}`}>{detail}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
            </section>
            <section className="inspectorSection">
                <h3>建议</h3>
                {suggestions.length > 0 ? (
                    <div className="memoryList">
                        {suggestions.map((suggestion, index) => (
                            <div className="memoryItem" key={suggestion.id}>
                                <span>建议</span>
                                <strong>{suggestion.memory.context}</strong>
                                <small>{suggestion.memory.pattern}</small>
                                <div className="actionButtons">
                                    <IconButton icon="check" label="接受建议" data-testid="memory-accept" onClick={() => acceptSuggestion(index)} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="emptyInline">暂无建议</div>
                )}
            </section>
            <section className="inspectorSection">
                <h3>已保存记忆</h3>
                {document.memory.length > 0 ? (
                    <div className="memoryList">
                        {document.memory.map((memory) => (
                            <div className={memory.enabled === false ? 'memoryItem disabled' : 'memoryItem'} key={memory.id}>
                                <span>{memory.enabled === false ? '停用' : memorySourceLabel(memory.source)}</span>
                                <strong>{memory.context}</strong>
                                <small>{memory.pattern}</small>
                                <div className="actionButtons">
                                    <ActionButton icon={memory.enabled === false ? 'check' : 'lock'} label={memory.enabled === false ? '启用' : '停用'} onClick={() => toggleMemory(memory)} />
                                    <IconButton icon="trash" label="删除记忆" onClick={() => deleteMemory(memory)} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="emptyInline">暂无记忆</div>
                )}
            </section>
        </div>
    );
}
