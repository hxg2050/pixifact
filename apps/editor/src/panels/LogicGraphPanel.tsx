import { useEffect, useState } from 'react';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import {
    compileLogicGraphToTypescript,
    createUseInventoryItemFlow,
    validateLogicGraph,
} from '../../../../src';
import type {
    EditorDocument,
    LogicFlowSpec,
    LogicStepSpec,
} from '../../../../src';
import { ActionButton } from '../components/ActionButton';
import { refreshEditorDocument } from '../document/editorDocumentController';
import { downloadTextFile } from '../services/projectSerializer';

function logicStepLabel(step: LogicStepSpec) {
    switch (step.type) {
        case 'condition':
            return `条件 ${step.condition.op}`;
        case 'setState':
            return `设置状态 ${step.path}`;
        case 'setNodeVisible':
            return `${step.visible ? '显示' : '隐藏'} ${step.node}`;
        case 'emitAction':
            return `触发动作 ${step.action}`;
        case 'comment':
            return step.text;
    }
}

function buildLogicFlowGraph(flow: LogicFlowSpec | undefined): { nodes: Node[]; edges: Edge[] } {
    if (!flow) {
        return { nodes: [], edges: [] };
    }

    const nodes: Node[] = [{
        id: `${flow.id}:action`,
        position: { x: 0, y: 120 },
        data: { label: `动作\n${flow.action}` },
        type: 'input',
    }];
    const edges: Edge[] = [];

    flow.steps.forEach((step, index) => {
        const nodeId = `${flow.id}:${step.id}`;
        nodes.push({
            id: nodeId,
            position: { x: 220 * (index + 1), y: 120 },
            data: { label: logicStepLabel(step) },
        });
        edges.push({
            id: `${flow.id}:edge:${index}`,
            source: index === 0 ? `${flow.id}:action` : `${flow.id}:${flow.steps[index - 1].id}`,
            target: nodeId,
            animated: true,
        });
    });

    return { nodes, edges };
}

export function LogicGraphPanel({ document }: { document: EditorDocument }) {
    const [selectedFlowId, setSelectedFlowId] = useState(() => document.logicGraph.flows[0]?.id);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; title: string; details?: string[] }>();
    const selectedFlow = document.logicGraph.flows.find((flow) => flow.id === selectedFlowId)
        ?? document.logicGraph.flows[0];
    const graph = buildLogicFlowGraph(selectedFlow);

    useEffect(() => {
        if (selectedFlowId && document.logicGraph.flows.some((flow) => flow.id === selectedFlowId)) {
            return;
        }
        setSelectedFlowId(document.logicGraph.flows[0]?.id);
    }, [document.logicGraph.flows, selectedFlowId]);

    const addInventoryFlow = () => {
        if (!document.actions.some((action) => action.key === 'useInventoryItem')) {
            document.addAction({
                key: 'useInventoryItem',
                label: '使用背包物品',
                description: '使用当前选中的背包物品。',
                source: 'manual',
            });
        }

        const result = document.addLogicFlow(createUseInventoryItemFlow());
        if (!result.ok) {
            setMessage({
                type: 'error',
                title: '无法添加默认逻辑流。',
                details: result.errors,
            });
            return;
        }

        setSelectedFlowId('flow-useInventoryItem');
        setMessage({
            type: 'success',
            title: '已添加默认背包逻辑流。',
        });
        refreshEditorDocument();
    };

    const validateGraph = () => {
        const result = validateLogicGraph(document.logicGraph, {
            actions: document.actions,
            prefab: document.prefab,
        });
        setMessage(result.ok
            ? { type: 'success', title: '逻辑图校验通过。' }
            : { type: 'error', title: '逻辑图校验失败。', details: result.errors });
    };

    const exportTypescript = () => {
        const result = validateLogicGraph(document.logicGraph, {
            actions: document.actions,
            prefab: document.prefab,
        });
        if (!result.ok) {
            setMessage({
                type: 'error',
                title: '导出前逻辑图校验失败。',
                details: result.errors,
            });
            return;
        }

        downloadTextFile('logic-handlers.ts', compileLogicGraphToTypescript(document.logicGraph), 'text/typescript;charset=utf-8');
        setMessage({
            type: 'success',
            title: '已导出 logic-handlers.ts',
        });
    };

    return (
        <div className="panelBody">
            <section className="inspectorSection">
                <h3>逻辑图</h3>
                <div className="buttonRow">
                    <ActionButton icon="plus" label="添加默认流程" variant="primary" data-testid="logic-add-default" onClick={addInventoryFlow} />
                    <ActionButton icon="check" label="校验" onClick={validateGraph} />
                    <ActionButton icon="download" label="导出 TS" onClick={exportTypescript} disabled={document.logicGraph.flows.length === 0} />
                </div>
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
                <h3>流程</h3>
                {document.logicGraph.flows.length > 0 ? (
                    <div className="flowList">
                        {document.logicGraph.flows.map((flow) => (
                            <button
                                className={flow.id === selectedFlow?.id ? 'flowItem selected' : 'flowItem'}
                                key={flow.id}
                                onClick={() => setSelectedFlowId(flow.id)}
                                type="button"
                            >
                                <span>{flow.action}</span>
                                <strong>{flow.name ?? flow.id}</strong>
                                <small>{flow.steps.map((step) => step.type).join(' -> ') || '无步骤'}</small>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="emptyInline">暂无逻辑流</div>
                )}
            </section>
            <section className="inspectorSection logicGraphSection">
                <h3>可视化</h3>
                {selectedFlow ? (
                    <div className="logicGraphCanvas">
                        <ReactFlow
                            edges={graph.edges}
                            fitView
                            nodes={graph.nodes}
                            nodesDraggable={false}
                            nodesConnectable={false}
                            panOnDrag
                            zoomOnScroll
                        >
                            <Background />
                            <Controls showInteractive={false} />
                        </ReactFlow>
                    </div>
                ) : (
                    <div className="emptyInline">添加逻辑流后显示图</div>
                )}
            </section>
            <section className="inspectorSection">
                <h3>TS 摘要</h3>
                <pre className="codePreview">{compileLogicGraphToTypescript(document.logicGraph)}</pre>
            </section>
        </div>
    );
}
