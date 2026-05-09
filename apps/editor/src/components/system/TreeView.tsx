import type { KeyboardEvent, ReactNode } from 'react';
import {
    Button as AriaButton,
    Tree,
    TreeItem,
    TreeItemContent,
} from 'react-aria-components';
import type { Selection } from 'react-aria-components';

export type TreeViewKey = string | number;

export interface TreeViewItem<T> {
    children?: TreeViewItem<T>[];
    className?: string;
    id: TreeViewKey;
    item: T;
    textValue: string;
}

export interface TreeViewRenderProps<T> {
    hasChildItems: boolean;
    isExpanded: boolean;
    item: T;
    level: number;
    node: TreeViewItem<T>;
}

export interface TreeViewProps<T> {
    ariaLabel: string;
    expandedKeys?: Iterable<TreeViewKey>;
    items: TreeViewItem<T>[];
    onExpandedChange?(keys: Set<TreeViewKey>): void;
    onItemAction?(item: T, node: TreeViewItem<T>): void;
    onItemKeyDown?(event: KeyboardEvent, item: T, node: TreeViewItem<T>): void;
    onSelectedKeyChange?(key: TreeViewKey, item: T, node: TreeViewItem<T>): void;
    onSelectionChange?(keys: Selection): void;
    renderItem(props: TreeViewRenderProps<T>): ReactNode;
    selectedKeys?: Iterable<TreeViewKey>;
}

function findTreeItem<T>(items: TreeViewItem<T>[], key: TreeViewKey): TreeViewItem<T> | undefined {
    for (const item of items) {
        if (item.id === key) {
            return item;
        }
        const child = item.children ? findTreeItem(item.children, key) : undefined;
        if (child) {
            return child;
        }
    }
    return undefined;
}

function selectedKeyFromSelection(keys: Selection): TreeViewKey | undefined {
    if (keys === 'all') {
        return undefined;
    }
    const [key] = keys;
    return typeof key === 'string' || typeof key === 'number' ? key : undefined;
}

function firstIterableKey(keys: Iterable<TreeViewKey> | undefined): TreeViewKey | undefined {
    if (!keys) {
        return undefined;
    }
    const [key] = [...keys];
    return key;
}

function renderTreeItem<T>({
    node,
    onItemAction,
    renderItem,
}: {
    node: TreeViewItem<T>;
    onItemAction?(item: T, node: TreeViewItem<T>): void;
    renderItem(props: TreeViewRenderProps<T>): ReactNode;
}) {
    return (
        <TreeItem
            className={node.className}
            id={node.id}
            key={node.id}
            onAction={() => onItemAction?.(node.item, node)}
            textValue={node.textValue}
        >
            <TreeItemContent>
                {({ hasChildItems, isExpanded, level }) => (
                    <>
                        {hasChildItems ? (
                            <AriaButton className={isExpanded ? 'treeChevron treeChevron--expanded' : 'treeChevron'} slot="chevron">
                                <span aria-hidden="true">›</span>
                            </AriaButton>
                        ) : (
                            <span className="treeChevron treeChevron--empty" aria-hidden="true" />
                        )}
                        {renderItem({
                            hasChildItems,
                            isExpanded,
                            item: node.item,
                            level,
                            node,
                        })}
                    </>
                )}
            </TreeItemContent>
            {node.children?.map((child) => renderTreeItem({
                node: child,
                onItemAction,
                renderItem,
            }))}
        </TreeItem>
    );
}

export function TreeView<T>({
    ariaLabel,
    expandedKeys,
    items,
    onExpandedChange,
    onItemAction,
    onItemKeyDown,
    onSelectedKeyChange,
    onSelectionChange,
    renderItem,
    selectedKeys,
}: TreeViewProps<T>) {
    const handleSelectionChange = (keys: Selection) => {
        onSelectionChange?.(keys);

        const key = selectedKeyFromSelection(keys);
        if (key === undefined) {
            return;
        }
        const node = findTreeItem(items, key);
        if (node) {
            onSelectedKeyChange?.(key, node.item, node);
        }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        const selectedKey = firstIterableKey(selectedKeys);
        if (selectedKey === undefined) {
            return;
        }
        const node = findTreeItem(items, selectedKey);
        if (node) {
            onItemKeyDown?.(event, node.item, node);
        }
    };

    return (
        <div className="systemTreeKeyboardLayer" onKeyDown={handleKeyDown}>
            <Tree
                aria-label={ariaLabel}
                className="systemTree"
                expandedKeys={expandedKeys}
                onExpandedChange={onExpandedChange}
                onSelectionChange={handleSelectionChange}
                selectedKeys={selectedKeys}
                selectionMode="single"
            >
                {items.map((item) => renderTreeItem({
                    node: item,
                    onItemAction,
                    renderItem,
                }))}
            </Tree>
        </div>
    );
}
