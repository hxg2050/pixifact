import { ComponentRegistry } from "../../core";
import { applyCommand } from "../commands";
import type { CommandResult, EditorCommand } from "../commands";
import type { ComponentSpec, NodeSpec } from "../prefab";
import type { PrefabSpec } from "../prefab";

export interface AiComponentSummary {
    id?: string;
    type: string;
    props?: Record<string, unknown>;
}

export interface AiNodeSummary {
    id?: string;
    key?: string;
    role?: string;
    name?: string;
    transform?: NodeSpec['transform'];
    components: AiComponentSummary[];
    children: AiNodeSummary[];
}

export interface AiPrefabSummary {
    name: string;
    version: number;
    root: AiNodeSummary;
}

export interface AiCommandListResult {
    ok: boolean;
    results: CommandResult[];
    prefab?: PrefabSpec;
    error?: string;
}

function clonePrefab(prefab: PrefabSpec): PrefabSpec {
    return structuredClone(prefab);
}

function summarizeComponent(component: ComponentSpec): AiComponentSummary {
    return {
        id: component.id,
        type: component.type,
        props: component.props,
    };
}

function summarizeNode(node: NodeSpec): AiNodeSummary {
    return {
        id: node.id,
        key: node.key,
        role: node.role,
        name: node.name,
        transform: node.transform,
        components: (node.components ?? []).map(summarizeComponent),
        children: (node.children ?? []).map(summarizeNode),
    };
}

export function summarizePrefabForAi(prefab: PrefabSpec): AiPrefabSummary {
    return {
        name: prefab.name,
        version: prefab.version,
        root: summarizeNode(prefab.root),
    };
}

export function getAiComponentSchemas() {
    return ComponentRegistry.list().map((schema) => ({
        type: schema.type,
        displayName: schema.displayName,
        category: schema.category,
        description: schema.description,
        disallowMultiple: schema.disallowMultiple,
        require: schema.require,
        props: schema.props.map((prop) => ({
            key: prop.key,
            type: prop.type,
            default: prop.default,
            description: prop.description,
            options: prop.options,
            component: prop.component,
            min: prop.min,
            max: prop.max,
        })),
    }));
}

export function dryRunCommands(prefab: PrefabSpec, commands: EditorCommand[]): AiCommandListResult {
    const draft = clonePrefab(prefab);
    const results: CommandResult[] = [];

    for (const command of commands) {
        const result = applyCommand(draft, command);
        results.push(result);
        if (!result.ok) {
            return {
                ok: false,
                results,
                error: result.error,
            };
        }
    }

    return {
        ok: true,
        results,
        prefab: draft,
    };
}
