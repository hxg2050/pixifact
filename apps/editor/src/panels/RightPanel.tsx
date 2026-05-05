import type { EditorDocument } from '../../../../src';
import { useEditorStore } from '../editorStore';
import { ActionRegistryPanel } from './ActionRegistryPanel';
import { AiPanel } from './AiPanel';
import { ComponentPalettePanel } from './ComponentPalettePanel';
import { InspectorPanel } from './InspectorPanel';
import { LogicGraphPanel } from './LogicGraphPanel';
import { MemoryPanel } from './MemoryPanel';
import { ProjectPanel } from './ProjectPanel';

export function RightPanel({ document }: { document: EditorDocument }) {
    const rightPanel = useEditorStore((state) => state.rightPanel);
    const setRightPanel = useEditorStore((state) => state.setRightPanel);
    const inspectorModel = document.getInspectorModel();

    return (
        <aside className="panel rightPanel" aria-label="检查器和 AI">
            <header className="panelHeader">
                <div className="tabs">
                    <button
                        className={rightPanel === 'inspector' ? 'active' : ''}
                        data-testid="tab-inspector"
                        onClick={() => setRightPanel('inspector')}
                        type="button"
                    >
                        检查器
                    </button>
                    <button
                        className={rightPanel === 'ai' ? 'active' : ''}
                        data-testid="tab-ai"
                        onClick={() => setRightPanel('ai')}
                        type="button"
                    >
                        AI
                    </button>
                    <button
                        className={rightPanel === 'components' ? 'active' : ''}
                        data-testid="tab-components"
                        onClick={() => setRightPanel('components')}
                        type="button"
                    >
                        组件
                    </button>
                    <button
                        className={rightPanel === 'actions' ? 'active' : ''}
                        data-testid="tab-actions"
                        onClick={() => setRightPanel('actions')}
                        type="button"
                    >
                        动作
                    </button>
                    <button
                        className={rightPanel === 'logic' ? 'active' : ''}
                        data-testid="tab-logic"
                        onClick={() => setRightPanel('logic')}
                        type="button"
                    >
                        逻辑
                    </button>
                    <button
                        className={rightPanel === 'memory' ? 'active' : ''}
                        data-testid="tab-memory"
                        onClick={() => setRightPanel('memory')}
                        type="button"
                    >
                        记忆
                    </button>
                    <button
                        className={rightPanel === 'project' ? 'active' : ''}
                        data-testid="tab-project"
                        onClick={() => setRightPanel('project')}
                        type="button"
                    >
                        项目
                    </button>
                </div>
            </header>
            {rightPanel === 'inspector' ? <InspectorPanel document={document} model={inspectorModel} /> : null}
            {rightPanel === 'ai' ? <AiPanel document={document} /> : null}
            {rightPanel === 'components' ? <ComponentPalettePanel document={document} /> : null}
            {rightPanel === 'actions' ? <ActionRegistryPanel document={document} /> : null}
            {rightPanel === 'logic' ? <LogicGraphPanel document={document} /> : null}
            {rightPanel === 'memory' ? <MemoryPanel document={document} /> : null}
            {rightPanel === 'project' ? <ProjectPanel document={document} /> : null}
        </aside>
    );
}
