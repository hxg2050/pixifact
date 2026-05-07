import { useState } from 'react';
import {
    executeAiPrompt,
    MockAiProposalProvider,
    RemoteAiProposalProvider,
} from '../../../../src';
import type {
    AiExecutionAttempt,
    AiExecutionResult,
    EditorCommand,
    EditorDocument,
} from '../../../../src';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { useEditorStore } from '../editorStore';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n';
import { formatValue, useDocumentRevision } from './common';

type AiMessage =
    | { role: 'assistant'; text: string }
    | { role: 'user'; text: string }
    | { role: 'result'; execution: AiExecutionResult };

type Translate = (key: I18nKey, values?: Record<string, string | number>) => string;

function formatCommand(command: EditorCommand, t: Translate): string {
    switch (command.op) {
        case 'setNodeProp':
            return `${command.node}.${command.prop} = ${formatValue(command.value, t)}`;
        case 'setTransform':
            return `${command.node}.transform ${Object.keys(command.values).join(', ')}`;
        case 'setComponentProp':
            return `${command.node}.${command.component}.${command.prop} = ${formatValue(command.value, t)}`;
        case 'addComponent':
            return t('commandAddComponent', { node: command.node, component: command.component.type });
        case 'removeComponent':
            return t('commandRemoveComponent', { node: command.node, component: command.component });
        case 'createNode':
            return t('commandCreateNode', {
                parent: command.parent ?? 'root',
                node: command.node.name ?? command.node.key ?? command.node.id ?? 'node',
            });
        case 'deleteNode':
            return t('commandDeleteNode', { node: command.node });
        case 'reparentNode':
            return t('commandReparentNode', { node: command.node, parent: command.parent ?? 'root' });
        case 'reorderNode':
            return t('commandReorderNode', { node: command.node, index: command.index });
        case 'batch':
            return t('commandBatch', { count: command.commands.length });
    }
}

function remoteHeaders(header: string, token: string) {
    const name = header.trim();
    const value = token.trim();
    return name && value ? { [name]: value } : undefined;
}

function formatJson(value: unknown) {
    return JSON.stringify(value, null, 2);
}

function AttemptDetails({ attempt }: { attempt: AiExecutionAttempt }) {
    const t = useI18n();

    return (
        <section className="attemptDetail">
            <header>
                <strong>{t('attemptTitle', { attempt: attempt.attempt })}</strong>
                <span>{attempt.run.ok ? attempt.applied ? t('attemptApplied') : t('attemptApplyFailed') : t('attemptValidationFailed')}</span>
            </header>
            {attempt.proposal.explanation ? <p>{attempt.proposal.explanation}</p> : null}
            {attempt.run.error ? (
                <div className="detailNotice">
                    <span>{t('validationError')}</span>
                    <small>{attempt.run.error}</small>
                </div>
            ) : null}
            {attempt.applyError ? (
                <div className="detailNotice">
                    <span>{t('applyError')}</span>
                    <small>{attempt.applyError}</small>
                </div>
            ) : null}
            {attempt.run.diffs.length > 0 ? (
                <div className="detailGrid">
                    <span>Diff</span>
                    <div>
                        {attempt.run.diffs.map((diff, index) => (
                            <small key={`${diff.target}-${index}`}>
                                {diff.target}: {formatValue(diff.before, t)} {'->'} {formatValue(diff.after, t)}
                            </small>
                        ))}
                    </div>
                </div>
            ) : null}
            {attempt.run.warnings.length > 0 ? (
                <div className="detailGrid">
                    <span>Warnings</span>
                    <div>
                        {attempt.run.warnings.map((warning, index) => (
                            <small key={`${warning.target}-${index}`}>{warning.message}</small>
                        ))}
                    </div>
                </div>
            ) : null}
            <details className="commandDetails">
                <summary>Commands JSON</summary>
                <pre>{formatJson(attempt.proposal.commands)}</pre>
            </details>
        </section>
    );
}

function ResultMessage({ message }: { message: Extract<AiMessage, { role: 'result' }> }) {
    const t = useI18n();
    const { execution } = message;
    const { proposal, run, attempts } = execution;
    const failed = !execution.ok;
    const lastAttempt = attempts[attempts.length - 1];

    return (
        <div className={failed ? 'resultBox failed' : 'resultBox'} data-testid="ai-run-result">
            <strong>{failed ? t('aiRunFailed') : t('aiRunValidated')}</strong>
            <p>{proposal.explanation || t('aiReturnedCommand')}</p>
            <div className="repairTrace">
                {attempts.map((attempt) => (
                    <div className={attempt.run.ok && attempt.applied ? 'traceRow accepted' : 'traceRow rejected'} key={attempt.proposal.id}>
                        <span>{t('attemptTitle', { attempt: attempt.attempt })}</span>
                        <small>
                            {attempt.run.ok
                                ? attempt.applied
                                    ? t('validCommandApplied')
                                    : attempt.applyError ?? t('attemptApplyFailed')
                                : attempt.run.error ?? t('commandValidationFailed')}
                        </small>
                    </div>
                ))}
            </div>
            <div className="resultGrid">
                {proposal.commands.slice(0, 6).map((command, index) => (
                    <FragmentRow command={command} index={index} key={`${command.op}-${index}`} />
                ))}
            </div>
            {run.warnings.length > 0 ? (
                <div className="inspectorAction">{run.warnings.map((warning) => warning.message).join('；')}</div>
            ) : null}
            <div className={execution.ok ? 'successLine' : 'fileRule'}>
                {execution.ok
                    ? t('validCommandAppliedSummary', {
                        repair: attempts.length > 1 ? t('autoRepaired', { count: attempts.length - 1 }) : '',
                    })
                    : lastAttempt.applyError ?? execution.error}
            </div>
            <details className="executionDetails">
                <summary>{t('executionDetails')}</summary>
                <div className="executionDetailStack">
                    {attempts.map((attempt) => (
                        <AttemptDetails attempt={attempt} key={attempt.proposal.id} />
                    ))}
                </div>
            </details>
        </div>
    );
}

function FragmentRow({ command, index }: { command: EditorCommand; index: number }) {
    const t = useI18n();

    return (
        <>
            <span>{index + 1}. {command.op}</span>
            <small>{formatCommand(command, t)}</small>
        </>
    );
}

export function AiPanel({ document }: { document: EditorDocument }) {
    useDocumentRevision();
    const t = useI18n();
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
            text: t('aiIntro'),
        },
    ]);

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
            const execution = await executeAiPrompt(document, provider, text, {
                maxAttempts: 3,
            });

            setMessages((previous) => [...previous, { role: 'result', execution }]);
            refreshEditorDocument();
        } catch (err) {
            const text = err instanceof Error ? err.message : t('sendFailed');
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
                            <span>{message.role === 'assistant' ? 'AI' : t('userRole')}</span>
                            <p>{message.text}</p>
                        </div>
                    );
                })}
            </div>
            <div className="composerDock">
                {configOpen ? (
                    <section className="remoteConfig">
                        <div className="segmented">
                            <button className={providerMode === 'mock' ? 'active' : ''} onClick={() => setProviderMode('mock')} type="button">{t('localMock')}</button>
                            <button className={providerMode === 'remote' ? 'active' : ''} onClick={() => setProviderMode('remote')} type="button">{t('aiService')}</button>
                        </div>
                        {providerMode === 'remote' ? (
                            <>
                                <label className="remoteSimpleField">
                                    <span>{t('serviceEndpoint')}</span>
                                    <input
                                        className="endpointInput"
                                        data-testid="ai-remote-endpoint"
                                        onChange={(event) => setRemoteEndpoint(event.target.value)}
                                        placeholder="http://localhost:8788/proposal"
                                        value={remoteEndpoint}
                                    />
                                </label>
                                <details className="advancedConfig">
                                    <summary>{t('advanced')}</summary>
                                    <label>
                                        <span>Timeout</span>
                                        <input data-testid="ai-remote-timeout" min={1000} onChange={(event) => setRemoteTimeoutMs(Number(event.target.value))} step={1000} type="number" value={remoteTimeoutMs} />
                                    </label>
                                </details>
                                <div className="helpText">{t('apiKeyLocalHint')}</div>
                            </>
                        ) : null}
                    </section>
                ) : null}
                <div className="promptBox">
                    <textarea
                        data-testid="ai-prompt"
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder={t('aiPromptPlaceholder')}
                        value={prompt}
                    />
                    <div className="composerActions">
                        <button className="configButton" data-testid="ai-config-toggle" onClick={() => setConfigOpen((open) => !open)} type="button">
                            {providerMode === 'remote' ? t('aiService') : t('localMock')}
                        </button>
                        <button data-testid="ai-generate" disabled={loading || prompt.trim() === ''} onClick={() => void sendPrompt()} type="button">
                            {loading ? t('sending') : t('send')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
