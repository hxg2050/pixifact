import React, { useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent, IDockviewPanelProps } from 'dockview';
import 'dockview/dist/styles/dockview.css';
import './styles.css';

type FileKind = 'folder' | 'scene' | 'script' | 'component' | 'asset' | 'doc';
type AiStage = 'idle' | 'applied';

interface FileItem {
    id: string;
    name: string;
    kind: FileKind;
    depth: number;
    detail?: string;
    path: string;
}

interface SceneItem {
    id: string;
    name: string;
    nodeCount: number;
    componentCount: number;
}

interface NodeItem {
    id: string;
    name: string;
    type: string;
    depth: number;
    transform: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    components: Array<{
        name: string;
        fields: Array<[string, string]>;
    }>;
    canvasClass?: string;
}

interface ComponentInstance {
    name: string;
    fields: Array<[string, string]>;
}

interface ComponentDefinition {
    id: string;
    name: string;
    fileId: string;
    fileName: string;
    description: string;
    fields: Array<[string, string]>;
}

interface PrototypeState {
    selectedFile: string;
    selectedScene: string;
    selectedNode: string;
    fileAction: string;
    componentPickerOpen: boolean;
    addedComponents: Record<string, string[]>;
    lockedFields: Record<string, boolean>;
    inspectorAction: string;
    prompt: string;
    aiStage: AiStage;
    dirty: boolean;
}

interface PanelParams {
    state: PrototypeState;
    setState: React.Dispatch<React.SetStateAction<PrototypeState>>;
}

const files: FileItem[] = [
    { id: 'assets', name: 'assets', kind: 'folder', depth: 0, detail: '资源目录', path: 'assets/' },
    { id: 'icons', name: 'icons', kind: 'folder', depth: 1, detail: '图标目录', path: 'assets/icons/' },
    { id: 'ui-atlas', name: 'ui-atlas.png', kind: 'asset', depth: 1, detail: '纹理', path: 'assets/ui-atlas.png' },
    { id: 'scripts', name: 'scripts', kind: 'folder', depth: 0, detail: '脚本目录', path: 'scripts/' },
    { id: 'logic-handlers', name: 'logic-handlers.ts', kind: 'script', depth: 1, detail: 'TS', path: 'scripts/logic-handlers.ts' },
    { id: 'player-actions', name: 'player-actions.ts', kind: 'script', depth: 1, detail: 'TS', path: 'scripts/player-actions.ts' },
    { id: 'components', name: 'components', kind: 'folder', depth: 1, detail: '组件目录', path: 'scripts/components/' },
    { id: 'component-health-bar', name: 'HealthBarBinding.ts', kind: 'component', depth: 2, detail: 'Component', path: 'scripts/components/HealthBarBinding.ts' },
    { id: 'component-cooldown', name: 'CooldownTimer.ts', kind: 'component', depth: 2, detail: 'Component', path: 'scripts/components/CooldownTimer.ts' },
    { id: 'component-action', name: 'ActionBinder.ts', kind: 'component', depth: 2, detail: 'Component', path: 'scripts/components/ActionBinder.ts' },
    { id: 'scenes', name: 'scenes', kind: 'folder', depth: 0, detail: 'Scene 目录', path: 'scenes/' },
    { id: 'battle-hud-file', name: 'BattleHUD.scene', kind: 'scene', depth: 1, detail: '当前打开', path: 'scenes/BattleHUD.scene' },
    { id: 'inventory-file', name: 'InventoryPanel.scene', kind: 'scene', depth: 1, detail: '可复用', path: 'scenes/InventoryPanel.scene' },
    { id: 'quest-file', name: 'QuestCard.scene', kind: 'scene', depth: 1, detail: '可复用', path: 'scenes/QuestCard.scene' },
    { id: 'readme', name: 'README.md', kind: 'doc', depth: 0, detail: '文档', path: 'README.md' },
];

const scenes: SceneItem[] = [
    { id: 'battle-hud', name: 'BattleHUD', nodeCount: 21, componentCount: 34 },
    { id: 'inventory-panel', name: 'InventoryPanel', nodeCount: 14, componentCount: 22 },
    { id: 'quest-card', name: 'QuestCard', nodeCount: 6, componentCount: 9 },
    { id: 'skill-button', name: 'SkillButton', nodeCount: 3, componentCount: 5 },
];

const projectComponents: ComponentDefinition[] = [
    {
        id: 'health-bar-binding',
        name: 'HealthBarBinding',
        fileId: 'component-health-bar',
        fileName: 'HealthBarBinding.ts',
        description: '把节点绑定到玩家 HP 数据。',
        fields: [['source', 'player.hp'], ['max', 'player.maxHp']],
    },
    {
        id: 'cooldown-timer',
        name: 'CooldownTimer',
        fileId: 'component-cooldown',
        fileName: 'CooldownTimer.ts',
        description: '驱动倒计时文本和冷却状态。',
        fields: [['duration', '30'], ['autoStart', 'true']],
    },
    {
        id: 'action-binder',
        name: 'ActionBinder',
        fileId: 'component-action',
        fileName: 'ActionBinder.ts',
        description: '把 UI 事件绑定到项目动作。',
        fields: [['event', 'click'], ['action', 'startBattle']],
    },
];

const nodesByScene: Record<string, NodeItem[]> = {
    'battle-hud': [
        {
            id: 'root',
            name: '游戏画布',
            type: 'Container',
            depth: 0,
            transform: { x: 0, y: 0, width: 960, height: 540 },
            components: [{ name: 'Shape', fields: [['Color', '#0f172a'], ['Radius', '0']] }],
            canvasClass: 'root',
        },
        {
            id: 'topBar',
            name: '顶部状态栏',
            type: 'Container',
            depth: 1,
            transform: { x: 24, y: 20, width: 912, height: 72 },
            components: [{ name: 'Shape', fields: [['Color', '#1e293b'], ['Radius', '14']] }],
            canvasClass: 'topHud',
        },
        {
            id: 'questCard',
            name: '任务卡片',
            type: 'Container',
            depth: 1,
            transform: { x: 24, y: 116, width: 304, height: 162 },
            components: [{ name: 'Shape', fields: [['Color', '#1e293b'], ['Radius', '12']] }],
            canvasClass: 'questCard',
        },
        {
            id: 'startBattleButton',
            name: '开始战斗按钮',
            type: 'Button',
            depth: 1,
            transform: { x: 372, y: 334, width: 216, height: 56 },
            components: [
                { name: 'Shape', fields: [['Color', '#2563eb'], ['Radius', '12'], ['Stroke', '#1d4ed8 / 1']] },
                { name: 'Button', fields: [['onClick', 'startBattle'], ['Transition', 'colorTint'], ['Interactable', 'true']] },
            ],
            canvasClass: 'startButton',
        },
        {
            id: 'inventoryButton',
            name: '背包按钮',
            type: 'Button',
            depth: 1,
            transform: { x: 612, y: 334, width: 144, height: 56 },
            components: [
                { name: 'Shape', fields: [['Color', '#334155'], ['Radius', '12']] },
                { name: 'Button', fields: [['onClick', 'openInventory'], ['Transition', 'colorTint']] },
            ],
            canvasClass: 'inventoryButton',
        },
        {
            id: 'skillBar',
            name: '技能栏',
            type: 'Container',
            depth: 1,
            transform: { x: 258, y: 438, width: 444, height: 72 },
            components: [{ name: 'Shape', fields: [['Color', '#1e293b'], ['Radius', '16']] }],
            canvasClass: 'skillBar',
        },
        {
            id: 'skillAttack',
            name: '普通攻击',
            type: 'Button',
            depth: 2,
            transform: { x: 18, y: 12, width: 124, height: 48 },
            components: [{ name: 'Button', fields: [['onClick', 'castSkill'], ['Transition', 'scale']] }],
            canvasClass: 'skillAttack',
        },
        {
            id: 'skillGuard',
            name: '防御',
            type: 'Button',
            depth: 2,
            transform: { x: 160, y: 12, width: 124, height: 48 },
            components: [{ name: 'Button', fields: [['onClick', 'castSkill'], ['Transition', 'scale']] }],
            canvasClass: 'skillGuard',
        },
        {
            id: 'skillPotion',
            name: '治疗',
            type: 'Button',
            depth: 2,
            transform: { x: 302, y: 12, width: 124, height: 48 },
            components: [{ name: 'Button', fields: [['onClick', 'castSkill'], ['Transition', 'scale']] }],
            canvasClass: 'skillPotion',
        },
    ],
    'inventory-panel': [
        {
            id: 'inventoryRoot',
            name: '背包面板',
            type: 'Container',
            depth: 0,
            transform: { x: 0, y: 0, width: 520, height: 420 },
            components: [{ name: 'Shape', fields: [['Color', '#1e293b'], ['Radius', '14']] }],
            canvasClass: 'inventoryPanel',
        },
        {
            id: 'inventoryTitle',
            name: '标题',
            type: 'Text',
            depth: 1,
            transform: { x: 24, y: 18, width: 240, height: 32 },
            components: [{ name: 'Text', fields: [['Text', '背包'], ['Font Size', '22']] }],
        },
        {
            id: 'slotGrid',
            name: '格子网格',
            type: 'Container',
            depth: 1,
            transform: { x: 24, y: 72, width: 472, height: 272 },
            components: [{ name: 'Grid', fields: [['Columns', '4'], ['Rows', '3']] }],
        },
        {
            id: 'useButton',
            name: '使用按钮',
            type: 'Button',
            depth: 1,
            transform: { x: 360, y: 360, width: 136, height: 40 },
            components: [{ name: 'Button', fields: [['onClick', 'useInventoryItem']] }],
        },
    ],
    'quest-card': [
        {
            id: 'questCard',
            name: '任务卡片',
            type: 'Container',
            depth: 0,
            transform: { x: 0, y: 0, width: 304, height: 162 },
            components: [{ name: 'Shape', fields: [['Color', '#1e293b'], ['Radius', '12']] }],
            canvasClass: 'questCard',
        },
        {
            id: 'questTitle',
            name: '任务标题',
            type: 'Text',
            depth: 1,
            transform: { x: 18, y: 16, width: 260, height: 28 },
            components: [{ name: 'Text', fields: [['Text', '当前任务']] }],
        },
    ],
    'skill-button': [
        {
            id: 'skillButton',
            name: '技能按钮',
            type: 'Button',
            depth: 0,
            transform: { x: 0, y: 0, width: 124, height: 48 },
            components: [
                { name: 'Shape', fields: [['Color', '#334155'], ['Radius', '10']] },
                { name: 'Button', fields: [['onClick', 'castSkill']] },
            ],
        },
    ],
};

const initialState: PrototypeState = {
    selectedFile: 'battle-hud-file',
    selectedScene: 'battle-hud',
    selectedNode: 'startBattleButton',
    fileAction: '双击 Scene 文件开始编辑；代码文件只允许跳转到 VS Code。',
    componentPickerOpen: false,
    addedComponents: {},
    lockedFields: {},
    inspectorAction: '可点击添加 Component，或从文件面板拖动 Component 到 Inspector 空白区域。',
    prompt: '基于当前 HUD，新增一个战斗倒计时区域，保持紧凑、可读，不破坏技能栏。',
    aiStage: 'idle',
    dirty: false,
};

function currentNodes(state: PrototypeState) {
    return nodesByScene[state.selectedScene] ?? nodesByScene['battle-hud'];
}

function currentScene(state: PrototypeState) {
    return scenes.find((scene) => scene.id === state.selectedScene) ?? scenes[0];
}

function currentNode(state: PrototypeState) {
    const nodes = currentNodes(state);
    return nodes.find((node) => node.id === state.selectedNode) ?? nodes[0];
}

function selectedNodeKey(state: PrototypeState) {
    return `${state.selectedScene}:${state.selectedNode}`;
}

function selectedFileItem(state: PrototypeState) {
    return files.find((file) => file.id === state.selectedFile) ?? files[0];
}

function componentByFileId(fileId: string) {
    return projectComponents.find((component) => component.fileId === fileId);
}

function componentById(componentId: string) {
    return projectComponents.find((component) => component.id === componentId);
}

function instantiateComponent(componentId: string) {
    const component = componentById(componentId);
    return component
        ? { name: component.name, fields: component.fields }
        : undefined;
}

function addComponentToState(previous: PrototypeState, componentId: string) {
    const component = componentById(componentId);
    if (!component) {
        return {
            ...previous,
            inspectorAction: '拖入的文件不是可挂载 Component。',
        };
    }
    const nodeKey = selectedNodeKey(previous);
    const existing = previous.addedComponents[nodeKey] ?? [];
    if (existing.includes(componentId)) {
        return {
            ...previous,
            inspectorAction: `${component.name} 已经在当前节点上。`,
        };
    }
    return {
        ...previous,
        addedComponents: {
            ...previous.addedComponents,
            [nodeKey]: [...existing, componentId],
        },
        componentPickerOpen: false,
        dirty: true,
        inspectorAction: `已添加 ${component.name} 到当前节点。`,
    };
}

function fieldLockKey(state: PrototypeState, groupName: string, fieldName: string) {
    return `${selectedNodeKey(state)}:${groupName}:${fieldName}`;
}

function sceneFileId(sceneId: string) {
    switch (sceneId) {
        case 'inventory-panel':
            return 'inventory-file';
        case 'quest-card':
            return 'quest-file';
        default:
            return 'battle-hud-file';
    }
}

function FileSystemPanel({ params }: IDockviewPanelProps<PanelParams>) {
    const { state, setState } = params;
    const file = selectedFileItem(state);

    const selectFile = (item: FileItem) => {
        setState((previous) => {
            const action = item.kind === 'asset'
                ? '图片已在文件面板中预览；双击会调用系统图片查看器。'
                : item.kind === 'component'
                    ? 'Component 可拖动到 Inspector 空白区域，或在 Inspector 中点击添加。'
                    : item.kind === 'script'
                    ? '代码文件只读；双击会跳转到 VS Code 打开。'
                    : item.kind === 'scene'
                        ? 'Scene 已选中；双击会进入 Scene 编辑。'
                        : item.kind === 'folder'
                            ? '目录只用于浏览项目结构。'
                            : '文档只读预览；编辑交给外部工具。';
            return { ...previous, selectedFile: item.id, fileAction: action };
        });
    };

    const openFile = (item: FileItem) => {
        setState((previous) => {
            if (item.kind === 'scene') {
                const selectedScene = item.id === 'inventory-file'
                    ? 'inventory-panel'
                    : item.id === 'quest-file'
                        ? 'quest-card'
                        : 'battle-hud';
                const firstNode = nodesByScene[selectedScene][0]?.id ?? previous.selectedNode;
                return {
                    ...previous,
                    selectedFile: item.id,
                    selectedScene,
                    selectedNode: firstNode,
                    fileAction: `已打开 ${item.name} 进行 Scene 编辑。`,
                };
            }
            if (item.kind === 'script') {
                return {
                    ...previous,
                    selectedFile: item.id,
                    fileAction: `已请求 VS Code 打开 ${item.path}；编辑器内不直接修改代码。`,
                };
            }
            if (item.kind === 'component') {
                return {
                    ...previous,
                    selectedFile: item.id,
                    fileAction: `${item.name} 是可挂载 Component；拖到 Inspector 空白区域即可添加。`,
                };
            }
            if (item.kind === 'asset') {
                return {
                    ...previous,
                    selectedFile: item.id,
                    fileAction: `已请求系统图片查看器打开 ${item.path}。`,
                };
            }
            return {
                ...previous,
                selectedFile: item.id,
                fileAction: `${item.name} 没有内置编辑动作。`,
            };
        });
    };

    return (
        <div className="panelSurface">
            <div className="searchBox">basic-game</div>
            <section className="panelSection">
                <div className="sectionTitle">项目文件</div>
                <div className="fileTree">
                    {files.map((file) => (
                        <button
                            className={[
                                'fileRow',
                                file.kind,
                                file.depth > 0 ? 'indent' : '',
                                state.selectedFile === file.id ? 'selected' : '',
                            ].filter(Boolean).join(' ')}
                            key={file.id}
                            onClick={() => selectFile(file)}
                            onDoubleClick={() => openFile(file)}
                            draggable={file.kind === 'component'}
                            onDragStart={(event) => {
                                const component = componentByFileId(file.id);
                                if (!component) {
                                    return;
                                }
                                event.dataTransfer.setData('application/x-pixifact-component', component.id);
                                event.dataTransfer.effectAllowed = 'copy';
                            }}
                            type="button"
                        >
                            <strong>{file.name}</strong>
                        </button>
                    ))}
                </div>
            </section>
            <section className="filePreview">
                <span>文件</span>
                <strong>{file.name}</strong>
                <small>{file.path}</small>
                {file.kind === 'asset' ? (
                    <div className="imagePreview">
                        <div className="atlasPreview">
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                        </div>
                        <p>单击预览图片，双击使用系统图片查看器打开。</p>
                    </div>
                ) : file.kind === 'component' ? (
                    <div className="fileRule">Component 文件。拖到 Inspector 空白区域，或从 Inspector 的添加列表挂到当前节点。</div>
                ) : file.kind === 'script' ? (
                    <div className="fileRule">只读代码文件。双击跳转 VS Code，编辑器不直接修改源码。</div>
                ) : file.kind === 'scene' ? (
                    <div className="fileRule">双击进入 Scene 编辑，节点树和 Viewport 会切换到该 Scene。</div>
                ) : (
                    <div className="fileRule">当前条目仅用于项目浏览。</div>
                )}
                <div className="fileAction">{state.fileAction}</div>
            </section>
        </div>
    );
}

function NodeTreePanel({ params }: IDockviewPanelProps<PanelParams>) {
    const { state, setState } = params;
    const selectedScene = currentScene(state);
    const nodes = currentNodes(state);

    return (
        <div className="panelSurface">
            <section className="resourceMeta">
                <span>Scene</span>
                <strong>{selectedScene.name}</strong>
                <small>{selectedScene.nodeCount} nodes · {selectedScene.componentCount} components</small>
            </section>
            <div className="nodeTree">
                <div className="sectionTitle">节点树</div>
                {nodes.map((node) => (
                    <button
                        className={node.id === state.selectedNode ? 'nodeRow selected' : 'nodeRow'}
                        key={node.id}
                        onClick={() => setState((previous) => ({ ...previous, selectedNode: node.id }))}
                        style={{ paddingLeft: 10 + node.depth * 18 }}
                        type="button"
                    >
                        <strong>{node.name}</strong>
                        <small>{node.type}</small>
                    </button>
                ))}
            </div>
        </div>
    );
}

function ViewportPanel({ params }: IDockviewPanelProps<PanelParams>) {
    const { state, setState } = params;
    const selectedScene = currentScene(state);
    const selectedNode = currentNode(state);

    const selectNode = (nodeId: string) => {
        setState((previous) => ({ ...previous, selectedNode: nodeId }));
    };

    return (
        <div className="viewportSurface">
            <div className="viewportToolbar">
                <span>{selectedScene.name}.scene · {selectedNode.name}</span>
                <div>
                    <button type="button">100%</button>
                    <button type="button">适配</button>
                    <button type="button">网格</button>
                </div>
            </div>
            <div className="canvasWrap">
                {state.selectedScene === 'battle-hud' ? (
                    <div className="canvas">
                        <button className={state.selectedNode === 'topBar' ? 'hud topHud canvasSelectable selectedOverlay' : 'hud topHud canvasSelectable'} onClick={() => selectNode('topBar')} type="button">
                            <span>
                                <strong>探索者 Lv.1</strong>
                                <small>HP 100/100 · MP 30/30</small>
                            </span>
                            <span className="coins">金币 1,280</span>
                        </button>
                        <button className={state.selectedNode === 'questCard' ? 'questCard canvasSelectable selectedOverlay' : 'questCard canvasSelectable'} onClick={() => selectNode('questCard')} type="button">
                            <strong>当前任务</strong>
                            <p>清理森林入口的史莱姆</p>
                            <span className="progress"><span /></span>
                            <small>进度 2 / 3</small>
                        </button>
                        <button className={state.selectedNode === 'startBattleButton' ? 'gameButton selectedOverlay' : 'gameButton'} onClick={() => selectNode('startBattleButton')} type="button">
                            {state.aiStage === 'applied' ? '准备战斗' : '开始战斗'}
                        </button>
                        <button className={state.selectedNode === 'inventoryButton' ? 'gameButton secondaryButton selectedOverlay' : 'gameButton secondaryButton'} onClick={() => selectNode('inventoryButton')} type="button">背包</button>
                        {state.aiStage !== 'idle' ? (
                            <button className={state.selectedNode === 'countdownPanel' ? 'countdownPanel selectedOverlay' : 'countdownPanel'} onClick={() => selectNode('countdownPanel')} type="button">
                                <strong>战斗倒计时</strong>
                                <span>00:30</span>
                            </button>
                        ) : null}
                        <div className={state.selectedNode === 'skillBar' ? 'skillBar selectedOverlay' : 'skillBar'}>
                            <button onClick={() => selectNode('skillAttack')} type="button">攻击</button>
                            <button onClick={() => selectNode('skillGuard')} type="button">防御</button>
                            <button onClick={() => selectNode('skillPotion')} type="button">治疗</button>
                        </div>
                    </div>
                ) : (
                    <div className="canvas smallCanvas">
                        <div className="prototypeCard">
                            <strong>{selectedScene.name}</strong>
                            <span>{selectedNode.name}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function AiPanel({ params }: IDockviewPanelProps<PanelParams>) {
    const { state, setState } = params;
    const selectedNode = currentNode(state);
    const hasResult = state.aiStage === 'applied';

    const generate = () => setState((previous) => ({
        ...previous,
        aiStage: 'applied',
        dirty: true,
        selectedNode: 'countdownPanel',
    }));

    return (
        <div className="aiSurface">
            <div className="messages">
                <div className="message assistant">
                    <span>AI</span>
                    <p>当前选中：{selectedNode.name}。点击发送后，我会先生成编辑命令，内部自动校验；如果命令非法，会把错误反馈给 AI 继续修正，直到合法后再写入模拟项目。</p>
                </div>
                <div className="message user">
                    <span>你</span>
                    <p>{state.prompt}</p>
                </div>
                {hasResult ? (
                    <div className="resultBox">
                        <strong>自动修正完成</strong>
                        <p>共 3 轮：前两轮被校验器拒绝，第三轮通过并写入。</p>
                        <div className="repairTrace">
                            <div className="traceRow rejected">
                                <span>第 1 轮</span>
                                <small>失败：目标节点 `startBattleLabel` 不存在，已反馈给 AI。</small>
                            </div>
                            <div className="traceRow rejected">
                                <span>第 2 轮</span>
                                <small>失败：`skillBar.transform` 被锁定，改为不移动技能栏。</small>
                            </div>
                            <div className="traceRow accepted">
                                <span>第 3 轮</span>
                                <small>通过：创建 `countdownPanel`，只修改允许的文本属性。</small>
                            </div>
                        </div>
                        <div className="resultGrid">
                            <span>createNode</span>
                            <small>root 创建 战斗倒计时</small>
                            <span>setText</span>
                            <small>startBattleLabel {'->'} 准备战斗</small>
                        </div>
                        <div className="successLine">合法命令已应用到模拟项目。</div>
                    </div>
                ) : null}
            </div>
            <div className="promptBox">
                <textarea
                    onChange={(event) => setState((previous) => ({ ...previous, prompt: event.target.value }))}
                    value={state.prompt}
                />
                <div className="aiButtons">
                    <button onClick={generate} type="button">发送</button>
                </div>
            </div>
        </div>
    );
}

function InspectorPanel({ params }: IDockviewPanelProps<PanelParams>) {
    const { state, setState } = params;
    const baseSelectedNode = state.selectedNode === 'countdownPanel'
        ? {
            id: 'countdownPanel',
            name: '战斗倒计时',
            type: 'Container',
            depth: 1,
            transform: { x: 388, y: 256, width: 184, height: 54 },
            components: [
                { name: 'Shape', fields: [['Color', '#020617'], ['Radius', '12']] },
                { name: 'Text', fields: [['Text', '00:30'], ['Font Size', '20']] },
            ],
        }
        : currentNode(state);
    const addedComponents = state.addedComponents[selectedNodeKey(state)] ?? [];
    const dynamicComponents = addedComponents
        .map((componentId) => instantiateComponent(componentId))
        .filter((component): component is ComponentInstance => Boolean(component));
    const selectedNode = {
        ...baseSelectedNode,
        components: [...baseSelectedNode.components, ...dynamicComponents],
    };

    const addComponent = (componentId: string) => {
        setState((previous) => addComponentToState(previous, componentId));
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const componentId = event.dataTransfer.getData('application/x-pixifact-component');
        if (componentId) {
            addComponent(componentId);
            return;
        }
        setState((previous) => ({
            ...previous,
            inspectorAction: '这里只接受从文件面板拖入的 Component。',
        }));
    };
    const renderField = (groupName: string, fieldName: string, value: string | number) => {
        const lockKey = fieldLockKey(state, groupName, fieldName);
        const locked = Boolean(state.lockedFields[lockKey]);
        return (
            <div className={locked ? 'fieldRow locked' : 'fieldRow'} key={fieldName}>
                <span>{fieldName}</span>
                <input
                    disabled={locked}
                    onChange={() => setState((previous) => ({ ...previous, dirty: true }))}
                    value={value}
                />
                <button
                    aria-label={locked ? `解锁 ${fieldName}` : `锁定 ${fieldName}`}
                    className="lockButton"
                    onClick={() => setState((previous) => ({
                        ...previous,
                        lockedFields: {
                            ...previous.lockedFields,
                            [lockKey]: !locked,
                        },
                        inspectorAction: locked ? `已解锁 ${fieldName}。` : `已锁定 ${fieldName}。`,
                    }))}
                    title={locked ? '解锁属性' : '锁定属性'}
                    type="button"
                >
                    {locked ? (
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                            <rect height="10" rx="2" width="14" x="5" y="11" />
                            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                        </svg>
                    ) : (
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                            <rect height="10" rx="2" width="14" x="5" y="11" />
                            <path d="M8 11V8a4 4 0 0 1 7.4-2.1" />
                        </svg>
                    )}
                </button>
            </div>
        );
    };

    return (
        <div className="panelSurface inspectorSurface">
            <section className="identity">
                <span>选中节点</span>
                <strong>{selectedNode.name}</strong>
                <small>{selectedNode.id} · {selectedNode.type}</small>
            </section>
            <section className="inspectorSection">
                <h3>Transform</h3>
                <div className="fieldGrid four">
                    {renderField('Transform', 'X', selectedNode.transform.x)}
                    {renderField('Transform', 'Y', selectedNode.transform.y)}
                    {renderField('Transform', 'W', selectedNode.transform.width)}
                    {renderField('Transform', 'H', selectedNode.transform.height)}
                </div>
            </section>
            {selectedNode.components.map((component) => (
                <section className="inspectorSection" key={component.name}>
                    <h3>{component.name}</h3>
                    <div className="fieldStack">
                        {component.fields.map(([key, value]) => (
                            renderField(component.name, key, value)
                        ))}
                    </div>
                </section>
            ))}
            <section className="inspectorSection addComponentSection">
                <div className="sectionHeader">
                    <h3>Components</h3>
                    <button
                        onClick={() => setState((previous) => ({
                            ...previous,
                            componentPickerOpen: !previous.componentPickerOpen,
                        }))}
                        type="button"
                    >
                        添加
                    </button>
                </div>
                {state.componentPickerOpen ? (
                    <div className="componentPicker">
                        {projectComponents.map((component) => (
                            <button
                                key={component.id}
                                onClick={() => addComponent(component.id)}
                                type="button"
                            >
                                <strong>{component.name}</strong>
                                <span>{component.fileName}</span>
                                <small>{component.description}</small>
                            </button>
                        ))}
                    </div>
                ) : null}
                <div
                    className="componentDropZone"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDrop}
                >
                    从文件面板拖动 Component 到这里，或点击添加从项目 Component 列表选择。
                </div>
                <div className="inspectorAction">{state.inspectorAction}</div>
            </section>
        </div>
    );
}

function createComponents(state: PrototypeState, setState: React.Dispatch<React.SetStateAction<PrototypeState>>) {
    const params = { state, setState };
    return {
        fileSystem: (props: IDockviewPanelProps<PanelParams>) => <FileSystemPanel {...props} params={params} />,
        nodeTree: (props: IDockviewPanelProps<PanelParams>) => <NodeTreePanel {...props} params={params} />,
        viewport: (props: IDockviewPanelProps<PanelParams>) => <ViewportPanel {...props} params={params} />,
        ai: (props: IDockviewPanelProps<PanelParams>) => <AiPanel {...props} params={params} />,
        inspector: (props: IDockviewPanelProps<PanelParams>) => <InspectorPanel {...props} params={params} />,
    };
}

function addInitialPanels(event: DockviewReadyEvent) {
    const fileSystem = event.api.addPanel({
        id: 'filesystem',
        component: 'fileSystem',
        title: '文件系统',
    });
    const nodeTree = event.api.addPanel({
        id: 'nodes',
        component: 'nodeTree',
        title: 'Scene',
        position: { referencePanel: fileSystem, direction: 'right' },
    });
    const viewport = event.api.addPanel({
        id: 'viewport',
        component: 'viewport',
        title: 'Viewport',
        position: { referencePanel: nodeTree, direction: 'right' },
    });
    event.api.addPanel({
        id: 'inspector',
        component: 'inspector',
        title: 'Inspector',
        position: { referencePanel: viewport, direction: 'right' },
    });
    event.api.addPanel({
        id: 'ai',
        component: 'ai',
        title: 'AI 对话',
        position: { referencePanel: viewport, direction: 'below' },
    });
}

function App() {
    const [state, setState] = useState(initialState);
    const components = useMemo(() => createComponents(state, setState), [state]);
    const onReady = useCallback(addInitialPanels, []);

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand">
                    <span className="mark">P</span>
                    <div>
                        <strong>Pixifact Editor</strong>
                        <small>Dockview prototype · 使用统一 Scene 资源模型</small>
                    </div>
                </div>
                <div className="statusBar">
                    <span>{currentScene(state).name}.scene</span>
                    <span>{state.dirty ? '有未保存修改' : '已保存'}</span>
                    <span>AI {state.aiStage === 'idle' ? 'Ready' : '已修正并应用'}</span>
                </div>
                <div className="topActions">
                    <button onClick={() => setState(initialState)} type="button">重置模拟</button>
                    <button type="button">保存</button>
                    <button type="button">预览</button>
                    <button className="primary" type="button">运行</button>
                </div>
            </header>
            <main className="dockHost dockview-theme-light">
                <DockviewReact components={components} onReady={onReady} />
            </main>
        </div>
    );
}

const root = document.getElementById('root');

if (!root) {
    throw new Error('缺少根节点。');
}

createRoot(root).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
