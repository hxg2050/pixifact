import type { EditorDocument } from '../../../../src';
import { collectHierarchy } from './common';

export function SummaryBar({ document }: { document: EditorDocument }) {
    const hierarchy = collectHierarchy(document.prefab.root);
    const componentCount = hierarchy.reduce((total, item) => total + (item.node.components?.length ?? 0), 0);

    return (
        <div className="summaryBar" aria-label="项目摘要" data-testid="summary-bar">
            <span>{document.prefab.name}</span>
            <span>{hierarchy.length} 个节点</span>
            <span>{componentCount} 个组件</span>
            <span>{document.actions.length} 个动作</span>
            <span>{document.dirty ? '有修改' : '已保存'}</span>
        </div>
    );
}
