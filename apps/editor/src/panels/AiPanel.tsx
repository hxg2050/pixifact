import { useState } from 'react';
import {
    dryRunProposal,
    MockAiProposalProvider,
    RemoteAiProposalProvider,
} from '../../../../src';
import type {
    AiProposal,
    DesignTokenWarning,
    DiffEntry,
    EditorCommand,
    EditorDocument,
    ProposalHistoryEntry,
    ProposalRunResult,
} from '../../../../src';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { useEditorStore } from '../editorStore';
import { formatValue, selectedNodeId } from './common';

const proposalStatusLabels: Record<string, string> = {
    generated: '已生成',
    dryRunPassed: '校验通过',
    dryRunFailed: '校验失败',
    applied: '已应用',
    rejected: '已拒绝',
};

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

function formatDate(timestamp: number) {
    return new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(timestamp);
}

function formatDiffValue(value: unknown) {
    const maxLength = 160;
    const truncate = (text: string) => text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;

    if (value === undefined) {
        return '未设置';
    }
    if (typeof value === 'object' && value !== null) {
        return truncate(JSON.stringify(value));
    }
    return truncate(String(value));
}

function remoteHeaders(header: string, token: string) {
    const name = header.trim();
    const value = token.trim();
    return name && value ? { [name]: value } : undefined;
}

function remoteModelConfig({
    api,
    endpoint,
    token,
    model,
    timeoutMs,
    authHeader,
    authPrefix,
    temperature,
    reasoningEffort,
    serviceTier,
    store,
}: {
    api: 'chatCompletions' | 'responses';
    endpoint: string;
    token: string;
    model: string;
    timeoutMs: number;
    authHeader: string;
    authPrefix: string;
    temperature: number;
    reasoningEffort: string;
    serviceTier: string;
    store: boolean;
}) {
    if (!endpoint.trim()) {
        return undefined;
    }

    return {
        api,
        endpoint: endpoint.trim(),
        token: token.trim() || undefined,
        envKey: 'OPENAI_API_KEY',
        model: model.trim() || undefined,
        timeoutMs,
        authHeader: authHeader.trim() || undefined,
        authPrefix: authPrefix.trim(),
        temperature,
        reasoningEffort: reasoningEffort.trim() || undefined,
        serviceTier: serviceTier.trim() || undefined,
        store,
    };
}

function DiffList({ diffs }: { diffs: readonly DiffEntry[] }) {
    if (diffs.length === 0) {
        return <div className="emptyInline">暂无 diff</div>;
    }

    return (
        <div className="diffList">
            {diffs.map((diff, index) => (
                <div className="diffRow" key={`${diff.target}-${index}`}>
                    <span>{diff.command.op}</span>
                    <strong>{diff.target}</strong>
                    <small>{formatDiffValue(diff.before)} → {formatDiffValue(diff.after)}</small>
                </div>
            ))}
        </div>
    );
}

function WarningList({ warnings }: { warnings: readonly DesignTokenWarning[] }) {
    if (warnings.length === 0) {
        return null;
    }

    return (
        <div className="warningList">
            {warnings.map((warning, index) => (
                <div className="warningRow" key={`${warning.target}-${index}`}>
                    <strong>{warning.target}</strong>
                    <span>{warning.message}</span>
                </div>
            ))}
        </div>
    );
}

function ProposalHistoryList({
    entries,
    selectedId,
    onSelect,
}: {
    entries: readonly ProposalHistoryEntry[];
    selectedId?: string;
    onSelect(entry: ProposalHistoryEntry): void;
}) {
    if (entries.length === 0) {
        return <div className="emptyInline">暂无历史</div>;
    }

    return (
        <div className="historyList">
            {[...entries].reverse().map((entry) => (
                <button
                    className={entry.id === selectedId ? 'historyItem selected' : 'historyItem'}
                    key={entry.id}
                    onClick={() => onSelect(entry)}
                    type="button"
                >
                    <span>{proposalStatusLabels[entry.status] ?? entry.status}</span>
                    <strong>{entry.proposal.prompt || entry.proposal.id}</strong>
                    <small>{formatDate(entry.updatedAt)}</small>
                </button>
            ))}
        </div>
    );
}

export function AiPanel({ document }: { document: EditorDocument }) {
    const prompt = useEditorStore((state) => state.prompt);
    const providerMode = useEditorStore((state) => state.providerMode);
    const remoteEndpoint = useEditorStore((state) => state.remoteEndpoint);
    const remoteTimeoutMs = useEditorStore((state) => state.remoteTimeoutMs);
    const remoteAuthHeader = useEditorStore((state) => state.remoteAuthHeader);
    const remoteAuthToken = useEditorStore((state) => state.remoteAuthToken);
    const remoteModelApi = useEditorStore((state) => state.remoteModelApi);
    const remoteModelEndpoint = useEditorStore((state) => state.remoteModelEndpoint);
    const remoteModelName = useEditorStore((state) => state.remoteModelName);
    const remoteModelTimeoutMs = useEditorStore((state) => state.remoteModelTimeoutMs);
    const remoteModelAuthHeader = useEditorStore((state) => state.remoteModelAuthHeader);
    const remoteModelAuthPrefix = useEditorStore((state) => state.remoteModelAuthPrefix);
    const remoteModelToken = useEditorStore((state) => state.remoteModelToken);
    const remoteModelTemperature = useEditorStore((state) => state.remoteModelTemperature);
    const remoteModelReasoningEffort = useEditorStore((state) => state.remoteModelReasoningEffort);
    const remoteModelServiceTier = useEditorStore((state) => state.remoteModelServiceTier);
    const remoteModelStore = useEditorStore((state) => state.remoteModelStore);
    const setPrompt = useEditorStore((state) => state.setPrompt);
    const setProviderMode = useEditorStore((state) => state.setProviderMode);
    const setRemoteEndpoint = useEditorStore((state) => state.setRemoteEndpoint);
    const setRemoteTimeoutMs = useEditorStore((state) => state.setRemoteTimeoutMs);
    const setRemoteAuthHeader = useEditorStore((state) => state.setRemoteAuthHeader);
    const setRemoteAuthToken = useEditorStore((state) => state.setRemoteAuthToken);
    const setRemoteModelApi = useEditorStore((state) => state.setRemoteModelApi);
    const setRemoteModelEndpoint = useEditorStore((state) => state.setRemoteModelEndpoint);
    const setRemoteModelName = useEditorStore((state) => state.setRemoteModelName);
    const setRemoteModelTimeoutMs = useEditorStore((state) => state.setRemoteModelTimeoutMs);
    const setRemoteModelAuthHeader = useEditorStore((state) => state.setRemoteModelAuthHeader);
    const setRemoteModelAuthPrefix = useEditorStore((state) => state.setRemoteModelAuthPrefix);
    const setRemoteModelToken = useEditorStore((state) => state.setRemoteModelToken);
    const setRemoteModelTemperature = useEditorStore((state) => state.setRemoteModelTemperature);
    const setRemoteModelReasoningEffort = useEditorStore((state) => state.setRemoteModelReasoningEffort);
    const setRemoteModelServiceTier = useEditorStore((state) => state.setRemoteModelServiceTier);
    const setRemoteModelStore = useEditorStore((state) => state.setRemoteModelStore);
    const [proposal, setProposal] = useState<AiProposal>();
    const [run, setRun] = useState<ProposalRunResult>();
    const [error, setError] = useState<string>();
    const [loading, setLoading] = useState(false);

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
        setLoading(true);
        setError(undefined);

        try {
            const provider = providerMode === 'remote'
                ? new RemoteAiProposalProvider({
                    endpoint: remoteEndpoint,
                    headers: remoteHeaders(remoteAuthHeader, remoteAuthToken),
                    timeoutMs: remoteTimeoutMs,
                    model: remoteModelConfig({
                        api: remoteModelApi,
                        endpoint: remoteModelEndpoint,
                        token: remoteModelToken,
                        model: remoteModelName,
                        timeoutMs: remoteModelTimeoutMs,
                        authHeader: remoteModelAuthHeader,
                        authPrefix: remoteModelAuthPrefix,
                        temperature: remoteModelTemperature,
                        reasoningEffort: remoteModelReasoningEffort,
                        serviceTier: remoteModelServiceTier,
                        store: remoteModelStore,
                    }),
                })
                : new MockAiProposalProvider();
            const nextProposal = await provider.generate(prompt, context());
            const result = dryRunProposal(document.prefab, nextProposal, {
                locks: document.locks,
                designTokens: document.designTokens,
                actions: document.actions,
            });

            document.recordProposal(nextProposal);
            document.recordProposalRun(result);
            setProposal(nextProposal);
            setRun(result);

            if (!result.ok) {
                setError(result.error ?? '命令校验失败，后续会接入 AI 自动修正循环。');
                refreshEditorDocument();
                return;
            }

            for (const command of nextProposal.commands) {
                const applyResult = document.apply(command, 'ai');
                if (!applyResult.ok) {
                    setError(applyResult.error);
                    refreshEditorDocument();
                    return;
                }
            }

            document.markProposalApplied(nextProposal);
            refreshEditorDocument();
        } catch (err) {
            setError(err instanceof Error ? err.message : '发送失败');
        } finally {
            setLoading(false);
        }
    };

    const selectHistory = (entry: ProposalHistoryEntry) => {
        setProposal(entry.proposal);
        setRun(entry.diffs ? {
            ok: entry.status === 'dryRunPassed' || entry.status === 'applied',
            proposal: entry.proposal,
            results: [],
            diffs: entry.diffs,
            warnings: entry.warnings ?? [],
            error: entry.error,
        } : undefined);
        setError(entry.error);
    };

    return (
        <div className="panelBody">
            <section className="inspectorSection">
                <div className="segmented">
                    <button
                        className={providerMode === 'mock' ? 'active' : ''}
                        onClick={() => setProviderMode('mock')}
                        type="button"
                    >
                        Mock
                    </button>
                    <button
                        className={providerMode === 'remote' ? 'active' : ''}
                        onClick={() => setProviderMode('remote')}
                        type="button"
                    >
                        Remote
                    </button>
                </div>
                <label className="srOnly" htmlFor="ai-prompt-input">Prompt</label>
                <textarea
                    className="promptInput"
                    data-testid="ai-prompt"
                    id="ai-prompt-input"
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="描述你想创建或调整的游戏 UI。"
                    value={prompt}
                />
                {providerMode === 'remote' ? (
                    <div className="remoteConfig">
                        <div className="remoteConfigTitle">Gateway</div>
                        <label className="srOnly" htmlFor="ai-remote-endpoint">Remote endpoint</label>
                        <input
                            className="endpointInput"
                            data-testid="ai-remote-endpoint"
                            id="ai-remote-endpoint"
                            onChange={(event) => setRemoteEndpoint(event.target.value)}
                            placeholder="http://localhost:8788/proposal"
                            value={remoteEndpoint}
                        />
                        <div className="remoteConfigGrid">
                            <label>
                                <span>Timeout</span>
                                <input
                                    data-testid="ai-remote-timeout"
                                    min={1000}
                                    onChange={(event) => setRemoteTimeoutMs(Number(event.target.value))}
                                    step={1000}
                                    type="number"
                                    value={remoteTimeoutMs}
                                />
                            </label>
                            <label>
                                <span>Auth header</span>
                                <input
                                    autoComplete="off"
                                    data-testid="ai-remote-auth-header"
                                    onChange={(event) => setRemoteAuthHeader(event.target.value)}
                                    placeholder="Authorization"
                                    value={remoteAuthHeader}
                                />
                            </label>
                        </div>
                        <label className="remoteTokenField">
                            <span>Gateway token</span>
                            <input
                                autoComplete="off"
                                data-testid="ai-remote-auth-token"
                                onChange={(event) => setRemoteAuthToken(event.target.value)}
                                placeholder="Bearer ..."
                                type="password"
                                value={remoteAuthToken}
                            />
                        </label>
                        <div className="remoteConfigTitle">Model</div>
                        <div className="remoteConfigGrid">
                            <label>
                                <span>API</span>
                                <select
                                    data-testid="ai-remote-model-api"
                                    onChange={(event) => setRemoteModelApi(event.target.value as 'chatCompletions' | 'responses')}
                                    value={remoteModelApi}
                                >
                                    <option value="responses">Responses</option>
                                    <option value="chatCompletions">Chat Completions</option>
                                </select>
                            </label>
                            <label>
                                <span>Store</span>
                                <select
                                    data-testid="ai-remote-model-store"
                                    onChange={(event) => setRemoteModelStore(event.target.value === 'true')}
                                    value={remoteModelStore ? 'true' : 'false'}
                                >
                                    <option value="false">false</option>
                                    <option value="true">true</option>
                                </select>
                            </label>
                        </div>
                        <label>
                            <span>Model endpoint</span>
                            <input
                                autoComplete="off"
                                data-testid="ai-remote-model-endpoint"
                                onChange={(event) => setRemoteModelEndpoint(event.target.value)}
                                placeholder="https://model.example.test/v1/chat/completions"
                                value={remoteModelEndpoint}
                            />
                        </label>
                        <div className="remoteConfigGrid">
                            <label>
                                <span>Model</span>
                                <input
                                    autoComplete="off"
                                    data-testid="ai-remote-model-name"
                                    onChange={(event) => setRemoteModelName(event.target.value)}
                                    placeholder="model-name"
                                    value={remoteModelName}
                                />
                            </label>
                            <label>
                                <span>Temperature</span>
                                <input
                                    data-testid="ai-remote-model-temperature"
                                    max={2}
                                    min={0}
                                    onChange={(event) => setRemoteModelTemperature(Number(event.target.value))}
                                    step={0.1}
                                    type="number"
                                    value={remoteModelTemperature}
                                />
                            </label>
                        </div>
                        <div className="remoteConfigGrid">
                            <label>
                                <span>Reasoning</span>
                                <input
                                    autoComplete="off"
                                    data-testid="ai-remote-model-reasoning-effort"
                                    onChange={(event) => setRemoteModelReasoningEffort(event.target.value)}
                                    placeholder="medium"
                                    value={remoteModelReasoningEffort}
                                />
                            </label>
                            <label>
                                <span>Service tier</span>
                                <input
                                    autoComplete="off"
                                    data-testid="ai-remote-model-service-tier"
                                    onChange={(event) => setRemoteModelServiceTier(event.target.value)}
                                    placeholder="fast"
                                    value={remoteModelServiceTier}
                                />
                            </label>
                        </div>
                        <div className="remoteConfigGrid">
                            <label>
                                <span>Model timeout</span>
                                <input
                                    data-testid="ai-remote-model-timeout"
                                    min={1000}
                                    onChange={(event) => setRemoteModelTimeoutMs(Number(event.target.value))}
                                    step={1000}
                                    type="number"
                                    value={remoteModelTimeoutMs}
                                />
                            </label>
                            <label>
                                <span>Auth header</span>
                                <input
                                    autoComplete="off"
                                    data-testid="ai-remote-model-auth-header"
                                    onChange={(event) => setRemoteModelAuthHeader(event.target.value)}
                                    placeholder="authorization"
                                    value={remoteModelAuthHeader}
                                />
                            </label>
                        </div>
                        <div className="remoteConfigGrid">
                            <label>
                                <span>Auth prefix</span>
                                <input
                                    autoComplete="off"
                                    data-testid="ai-remote-model-auth-prefix"
                                    onChange={(event) => setRemoteModelAuthPrefix(event.target.value)}
                                    placeholder="Bearer"
                                    value={remoteModelAuthPrefix}
                                />
                            </label>
                            <label>
                                <span>Model token</span>
                                <input
                                    autoComplete="off"
                                    data-testid="ai-remote-model-token"
                                    onChange={(event) => setRemoteModelToken(event.target.value)}
                                    placeholder="sk-..."
                                    type="password"
                                    value={remoteModelToken}
                                />
                            </label>
                        </div>
                        <div className="helpText">Gateway 和 model 的 endpoint/header/model 会保存在本地浏览器；token 不保存，也不写入项目资产。</div>
                    </div>
                ) : null}
                <button className="primaryButton" data-testid="ai-generate" disabled={loading || prompt.trim() === ''} onClick={() => void sendPrompt()} type="button">
                    {loading ? '发送中...' : '发送'}
                </button>
            </section>
            {proposal ? (
                <section className="inspectorSection">
                    <h3>{run?.ok ? '执行结果' : '待修正命令'}</h3>
                    <p className="proposalText">{proposal.explanation}</p>
                    {proposal.risks?.length ? (
                        <div className="riskList">
                            {proposal.risks.map((risk, index) => (
                                <div className="riskRow" key={`${risk}-${index}`}>{risk}</div>
                            ))}
                        </div>
                    ) : null}
                    {proposal.annotations?.length ? (
                        <div className="annotationList">
                            {proposal.annotations.map((annotation, index) => (
                                <div className="annotationRow" key={`${annotation.message}-${index}`}>
                                    <strong>{[annotation.node, annotation.component, annotation.prop].filter(Boolean).join('.') || 'proposal'}</strong>
                                    <span>{annotation.message}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <div className="commandList">
                        {proposal.commands.map((command, index) => (
                            <div className="commandRow" key={`${command.op}-${index}`}>
                                <span>{index + 1}</span>
                                <strong>{formatCommand(command)}</strong>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}
            {run ? (
                <section className="inspectorSection" data-testid="ai-run-result">
                    <h3>{run.ok ? '校验通过并已应用' : '校验失败'}</h3>
                    <DiffList diffs={run.diffs} />
                    <WarningList warnings={run.warnings} />
                </section>
            ) : null}
            {error ? <div className="errorBox">{error}</div> : null}
            <section className="inspectorSection">
                <h3>历史</h3>
                <ProposalHistoryList
                    entries={document.proposalHistory}
                    onSelect={selectHistory}
                    selectedId={proposal?.id}
                />
            </section>
        </div>
    );
}
