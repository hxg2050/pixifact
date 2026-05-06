import { useState } from 'react';
import {
    dryRunProposal,
    MockAiProposalProvider,
    RemoteAiProposalProvider,
} from '../../../../src';
import type {
    AiProposal,
    EditorCommand,
    EditorDocument,
    ProposalRunResult,
} from '../../../../src';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { useEditorStore } from '../editorStore';
import { formatValue, selectedNodeId, useDocumentRevision } from './common';

type AiMessage =
    | { role: 'assistant'; text: string }
    | { role: 'user'; text: string }
    | { role: 'result'; proposal: AiProposal; run: ProposalRunResult; applied: boolean };

function formatCommand(command: EditorCommand): string {
    switch (command.op) {
        case 'setNodeProp':
            return `${command.node}.${command.prop} = ${formatValue(command.value)}`;
        case 'setTransform':
            return `${command.node}.transform ${Object.keys(command.values).join(', ')}`;
        case 'setComponentProp':
            return `${command.node}.${command.component}.${command.prop} = ${formatValue(command.value)}`;
        case 'addComponent':
            return `${command.node} 添加 ${command.component.type}`;
        case 'removeComponent':
            return `${command.node} 移除 ${command.component}`;
        case 'createNode':
            return `${command.parent ?? 'root'} 创建 ${command.node.name ?? command.node.key ?? command.node.id ?? 'node'}`;
        case 'deleteNode':
            return `删除 ${command.node}`;
        case 'reparentNode':
            return `${command.node} 移动到 ${command.parent ?? 'root'}`;
        case 'reorderNode':
            return `${command.node} 排序 ${command.index}`;
        case 'batch':
            return `批量命令 ${command.commands.length}`;
    }
}

function remoteHeaders(header: string, token: string) {
    const name = header.trim();
    const value = token.trim();
    return name && value ? { [name]: value } : undefined;
}

function ResultMessage({ message }: { message: Extract<AiMessage, { role: 'result' }> }) {
    const { proposal, run, applied } = message;
    const failed = !run.ok || !applied;

    return (
        <div className={failed ? 'resultBox failed' : 'resultBox'} data-testid="ai-run-result">
            <strong>{failed ? '自动校验失败' : '自动校验完成'}</strong>
            <p>{proposal.explanation || 'AI 已返回结构化 EditorCommand。'}</p>
            <div className="repairTrace">
                <div className={run.ok ? 'traceRow accepted' : 'traceRow rejected'}>
                    <span>校验</span>
                    <small>{run.ok ? '通过：命令合法，允许写入项目。' : run.error ?? '命令校验失败。'}</small>
                </div>
                <div className={applied ? 'traceRow accepted' : 'traceRow rejected'}>
                    <span>应用</span>
                    <small>{applied ? '通过：合法命令已应用到项目。' : '未写入：等待后续 repair loop 生成合法命令。'}</small>
                </div>
            </div>
            <div className="resultGrid">
                {proposal.commands.slice(0, 6).map((command, index) => (
                    <FragmentRow command={command} index={index} key={`${command.op}-${index}`} />
                ))}
            </div>
            {run.warnings.length > 0 ? (
                <div className="inspectorAction">{run.warnings.map((warning) => warning.message).join('；')}</div>
            ) : null}
            <div className={applied ? 'successLine' : 'fileRule'}>
                {applied ? '合法命令已应用到项目。' : '后续会接入 AI 自动修正循环。'}
            </div>
        </div>
    );
}

function FragmentRow({ command, index }: { command: EditorCommand; index: number }) {
    return (
        <>
            <span>{index + 1}. {command.op}</span>
            <small>{formatCommand(command)}</small>
        </>
    );
}

export function AiPanel({ document }: { document: EditorDocument }) {
    useDocumentRevision();
    const prompt = useEditorStore((state) => state.prompt);
    const providerMode = useEditorStore((state) => state.providerMode);
    const remoteEndpoint = useEditorStore((state) => state.remoteEndpoint);
    const remoteTimeoutMs = useEditorStore((state) => state.remoteTimeoutMs);
    const remoteAuthHeader = useEditorStore((state) => state.remoteAuthHeader);
    const remoteAuthToken = useEditorStore((state) => state.remoteAuthToken);
    const setPrompt = useEditorStore((state) => state.setPrompt);
    const setProviderMode = useEditorStore((state) => state.setProviderMode);
    const setRemoteEndpoint = useEditorStore((state) => state.setRemoteEndpoint);
    const setRemoteTimeoutMs = useEditorStore((state) => state.setRemoteTimeoutMs);
    const [loading, setLoading] = useState(false);
    const [configOpen, setConfigOpen] = useState(false);
    const [messages, setMessages] = useState<AiMessage[]>([
        {
            role: 'assistant',
            text: '输入需求后点击发送。我会生成结构化 EditorCommand，先校验，再把合法命令自动写入当前 Prefab。',
        },
    ]);

    const context = () => ({
        prefab: document.prefab,
        selection: selectedNodeId(document),
        designTokens: document.designTokens,
        actions: document.actions,
        logicGraph: document.logicGraph,
        locks: document.locks,
        memory: document.memory,
    });

    const sendPrompt = async () => {
        const text = prompt.trim();
        if (!text) {
            return;
        }

        setLoading(true);
        setMessages((previous) => [...previous, { role: 'user', text }]);

        try {
            const provider = providerMode === 'remote'
                ? new RemoteAiProposalProvider({
                    endpoint: remoteEndpoint,
                    headers: remoteHeaders(remoteAuthHeader, remoteAuthToken),
                    timeoutMs: remoteTimeoutMs,
                })
                : new MockAiProposalProvider();
            const proposal = await provider.generate(text, context());
            const run = dryRunProposal(document.prefab, proposal, {
                locks: document.locks,
                designTokens: document.designTokens,
                actions: document.actions,
            });
            let applied = false;

            document.recordProposal(proposal);
            document.recordProposalRun(run);

            if (run.ok) {
                applied = true;
                for (const command of proposal.commands) {
                    const result = document.apply(command, 'ai');
                    if (!result.ok) {
                        applied = false;
                        break;
                    }
                }
                if (applied) {
                    document.markProposalApplied(proposal);
                }
            }

            setMessages((previous) => [...previous, { role: 'result', proposal, run, applied }]);
            refreshEditorDocument();
        } catch (err) {
            const text = err instanceof Error ? err.message : '发送失败';
            setMessages((previous) => [...previous, { role: 'assistant', text }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="aiSurface">
            <div className="messages">
                {messages.map((message, index) => {
                    if (message.role === 'result') {
                        return <ResultMessage key={`result-${index}`} message={message} />;
                    }
                    return (
                        <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                            <span>{message.role === 'assistant' ? 'AI' : '你'}</span>
                            <p>{message.text}</p>
                        </div>
                    );
                })}
            </div>
            <div className="composerDock">
                {configOpen ? (
                    <section className="remoteConfig">
                        <div className="segmented">
                            <button className={providerMode === 'mock' ? 'active' : ''} onClick={() => setProviderMode('mock')} type="button">本地 Mock</button>
                            <button className={providerMode === 'remote' ? 'active' : ''} onClick={() => setProviderMode('remote')} type="button">AI 服务</button>
                        </div>
                        {providerMode === 'remote' ? (
                            <>
                                <label className="remoteSimpleField">
                                    <span>服务地址</span>
                                    <input
                                        className="endpointInput"
                                        data-testid="ai-remote-endpoint"
                                        onChange={(event) => setRemoteEndpoint(event.target.value)}
                                        placeholder="http://localhost:8788/proposal"
                                        value={remoteEndpoint}
                                    />
                                </label>
                                <details className="advancedConfig">
                                    <summary>高级</summary>
                                    <label>
                                        <span>Timeout</span>
                                        <input data-testid="ai-remote-timeout" min={1000} onChange={(event) => setRemoteTimeoutMs(Number(event.target.value))} step={1000} type="number" value={remoteTimeoutMs} />
                                    </label>
                                </details>
                                <div className="helpText">API key 放在本地 gateway 配置或环境变量里；这里不用每次填写 key。</div>
                            </>
                        ) : null}
                    </section>
                ) : null}
                <div className="promptBox">
                    <textarea
                        data-testid="ai-prompt"
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="描述你想创建或调整的游戏 UI。"
                        value={prompt}
                    />
                    <div className="composerActions">
                        <button className="configButton" data-testid="ai-config-toggle" onClick={() => setConfigOpen((open) => !open)} type="button">
                            {providerMode === 'remote' ? 'AI 服务' : '本地 Mock'}
                        </button>
                        <button data-testid="ai-generate" disabled={loading || prompt.trim() === ''} onClick={() => void sendPrompt()} type="button">
                            {loading ? '发送中...' : '发送'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
