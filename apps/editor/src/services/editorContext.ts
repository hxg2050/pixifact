import type { SceneTemplate, SceneTemplateValue } from 'pixifact/compiler';
import { findSceneTreeEntry } from '../document/sceneTree';

type EditorNodeContext =
    | {
        kind: 'pixi';
        type: string;
        id?: string;
        props: Record<string, SceneTemplateValue>;
        childCount: number;
    }
    | {
        kind: 'sceneInstance';
        type: string;
        id?: string;
        scene: string;
        props: Record<string, SceneTemplateValue>;
        events: Record<string, string>;
        slots: Record<string, number>;
    }
    | {
        kind: 'slotOutlet';
        name: string;
    };

export type EditorSelectionContext =
    | { kind: 'scene' }
    | {
        kind: 'node';
        locator: string;
        node: EditorNodeContext;
    };

export function editorSelectionContext(template: SceneTemplate, locator?: string): EditorSelectionContext {
    if (!locator) {
        return { kind: 'scene' };
    }
    const entry = findSceneTreeEntry(template.children, locator);
    if (!entry) {
        throw new Error(`Scene node "${locator}" was not found.`);
    }
    const node = entry.node;
    if (node.kind === 'slotOutlet') {
        return {
            kind: 'node',
            locator,
            node: { kind: 'slotOutlet', name: node.name },
        };
    }
    if (node.kind === 'sceneInstance') {
        return {
            kind: 'node',
            locator,
            node: {
                kind: 'sceneInstance',
                type: node.type,
                id: node.id,
                scene: node.scene,
                props: structuredClone(node.props),
                events: { ...node.events },
                slots: Object.fromEntries(
                    Object.entries(node.slots).map(([name, children]) => [name, children.length]),
                ),
            },
        };
    }
    return {
        kind: 'node',
        locator,
        node: {
            kind: 'pixi',
            type: node.type,
            id: node.id,
            props: structuredClone(node.props),
            childCount: node.children.length,
        },
    };
}
