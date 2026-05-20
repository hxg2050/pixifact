import fs from 'node:fs';
import path from 'node:path';
import {
    applyCommand,
    buttonScene,
    commandFailureDetails,
    container,
    dryRunProposal,
    input,
    progressBarScene,
    scene,
    SceneDocument,
    scrollViewScene,
    shape,
    text,
} from 'pixifact';
import type { CommandResult, SceneCommand, SceneSpec, NodeSpec } from 'pixifact';
import type { SceneProjectState } from 'pixifact';

interface ProjectFileSummary {
    path: string;
    kind: 'folder' | 'scene' | 'file';
}

interface EditableDocument {
    projectRoot: string;
    target: string;
    document: SceneDocument;
    isProjectFile: boolean;
}

interface ToolInput {
    projectRoot?: unknown;
    scenePath?: unknown;
    node?: unknown;
    commands?: unknown;
    name?: unknown;
    kind?: unknown;
    parent?: unknown;
    key?: unknown;
    label?: unknown;
}

type DetailedNode = NodeSpec & {
    locator: string;
    depth: number;
    parent?: string;
    childCount: number;
}

interface NodeSummary {
    id?: string;
    key?: string;
    role?: string;
    name?: string;
    kind: NodeSpec['kind'];
    locator: string;
    depth: number;
    transform?: NodeSpec['transform'];
    components: Array<{
        id?: string;
        type: string;
        propKeys: string[];
    }>;
    childCount: number;
    children: NodeSummary[];
}

const projectStateType = 'pixifact.aiEditorProject';
const sceneType = 'scene';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, name: string) {
    if (!isRecord(value)) {
        throw new Error(`${name} must be an object.`);
    }
    return value;
}

function assertString(value: unknown, name: string) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${name} must be a non-empty string.`);
    }
    return value;
}

function assertCommands(value: unknown): SceneCommand[] {
    if (!Array.isArray(value)) {
        throw new Error('commands must be an array.');
    }
    return value as SceneCommand[];
}

function isInside(root: string, target: string) {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveProjectPath(projectRoot: unknown, filePath: unknown = '.') {
    const root = path.resolve(assertString(projectRoot, 'projectRoot'));
    const target = path.resolve(root, assertString(filePath, 'filePath'));
    if (!isInside(root, target)) {
        throw new Error('filePath must stay inside projectRoot.');
    }
    return { root, target };
}

function readJsonFile(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath: string, value: unknown) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeNewJsonFile(filePath: string, value: unknown) {
    try {
        fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
            encoding: 'utf8',
            flag: 'wx',
        });
    } catch (error) {
        if (isRecord(error) && error.code === 'EEXIST') {
            throw new Error('Scene file already exists.');
        }
        throw error;
    }
}

function isProjectState(value: unknown): value is SceneProjectState {
    return isRecord(value)
        && value.version === 1
        && value.type === projectStateType
        && isRecord(value.scene)
        && (value.scene as { type?: unknown }).type === sceneType;
}

function isScene(value: unknown): value is SceneSpec {
    return isRecord(value)
        && value.version === 1
        && value.type === sceneType
        && isRecord(value.root);
}

function loadEditableDocument(projectRoot: unknown, scenePath: unknown): EditableDocument {
    const { root, target } = resolveProjectPath(projectRoot, scenePath);
    const content = readJsonFile(target);
    if (isProjectState(content)) {
        const document = new SceneDocument(content.scene);
        document.loadState(content);
        return {
            projectRoot: root,
            target,
            document,
            isProjectFile: true,
        };
    }
    if (!isScene(content)) {
        throw new Error('Target file must be a Pixifact Scene or AI editor project JSON.');
    }
    const document = new SceneDocument(content);
    return {
        projectRoot: root,
        target,
        document,
        isProjectFile: false,
    };
}

function saveEditableDocument(editable: EditableDocument) {
    if (editable.isProjectFile) {
        writeJsonFile(editable.target, editable.document.getState());
    } else {
        writeJsonFile(editable.target, editable.document.scene);
    }
}

function optionalString(value: unknown) {
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function nodeLocator(node: NodeSpec) {
    return node.id ?? node.key ?? node.name ?? '';
}

function summarizeNode(node: NodeSpec, depth = 0): NodeSummary {
    const children = node.kind === 'container' ? node.children ?? [] : [];
    return {
        id: node.id,
        key: node.key,
        role: node.role,
        name: node.name,
        kind: node.kind,
        locator: nodeLocator(node),
        depth,
        transform: node.transform,
        components: (node.components ?? []).map((component) => ({
            id: component.id,
            type: component.type,
            propKeys: Object.keys(component.props ?? {}),
        })),
        childCount: children.length,
        children: children.map((child) => summarizeNode(child, depth + 1)),
    };
}

function collectNodes(node: NodeSpec, depth = 0, parent?: string): Array<{
    id?: string;
    key?: string;
    role?: string;
    name?: string;
    kind: NodeSpec['kind'];
    locator: string;
    depth: number;
    parent?: string;
    componentCount: number;
    childCount: number;
}> {
    return [
        {
            id: node.id,
            key: node.key,
            role: node.role,
            name: node.name,
            kind: node.kind,
            locator: nodeLocator(node),
            depth,
            parent,
            componentCount: node.components?.length ?? 0,
            childCount: node.kind === 'container' ? node.children?.length ?? 0 : 0,
        },
        ...(node.kind === 'container' ? (node.children ?? []).flatMap((child) => collectNodes(child, depth + 1, nodeLocator(node))) : []),
    ];
}

function summarizeScene(scene: SceneSpec) {
    const nodes = collectNodes(scene.root);
    return {
        name: scene.name,
        version: scene.version,
        nodeCount: nodes.length,
        componentCount: nodes.reduce((sum, node) => sum + node.componentCount, 0),
        root: summarizeNode(scene.root),
    };
}

function loginFormNode(options: { key: string; label?: string }): NodeSpec {
    const key = options.key;
    return container('登录表单', {
        id: key,
        key,
        role: 'login-form',
        x: 40,
        y: 28,
        width: 280,
        height: 220,
        children: [
            shape('背景', {
                id: `${key}Card`,
                key: `${key}Card`,
                width: 280,
                height: 220,
                type: 'roundedRect',
                color: 0xffffff,
                radius: 10,
                strokeColor: 0xcbd5e1,
                strokeWidth: 1,
            }),
            text('标题', {
                id: `${key}Title`,
                key: `${key}Title`,
                x: 24,
                y: 20,
                width: 232,
                height: 32,
                value: options.label ?? '登录',
                color: 0x111827,
                fontSize: 24,
                fontWeight: '700',
            }),
            input('用户名', {
                id: `${key}Username`,
                key: `${key}Username`,
                x: 24,
                y: 72,
                width: 232,
                height: 36,
                value: '',
                backgroundColor: 0xffffff,
                borderColor: 0x94a3b8,
                borderSize: 1,
                fontSize: 16,
            }),
            input('密码', {
                id: `${key}Password`,
                key: `${key}Password`,
                x: 24,
                y: 120,
                width: 232,
                height: 36,
                value: '',
                backgroundColor: 0xffffff,
                borderColor: 0x94a3b8,
                borderSize: 1,
                fontSize: 16,
            }),
            buttonScene('提交按钮', {
                id: `${key}Submit`,
                key: `${key}Submit`,
                x: 24,
                y: 172,
                width: 232,
                height: 36,
                label: options.label ?? '登录',
                color: 0x2563eb,
                radius: 6,
            }),
        ],
    });
}

function createTemplateNode(args: ToolInput): NodeSpec {
    const kind = assertString(args.kind, 'kind');
    const key = assertString(args.key, 'key');
    const label = optionalString(args.label);

    switch (kind) {
        case 'button':
            return buttonScene(label ?? '按钮', {
                id: key,
                key,
                width: 120,
                height: 36,
                label: label ?? '按钮',
                color: 0x2563eb,
                radius: 6,
            });
        case 'progressBar':
            return progressBarScene(label ?? '进度条', {
                id: key,
                key,
                width: 180,
                height: 18,
                value: 0.5,
            });
        case 'scrollView':
            return scrollViewScene(label ?? '滚动视图', {
                id: key,
                key,
                width: 220,
                height: 160,
                contentHeight: 320,
            });
        case 'loginForm':
            return loginFormNode({ key, label });
        default:
            throw new Error(`Unknown template kind "${kind}".`);
    }
}

function templateCommands(args: ToolInput): SceneCommand[] {
    return [{
        op: 'createNode',
        parent: optionalString(args.parent),
        node: createTemplateNode(args),
    }];
}

function walkFiles(root: string, directory: string, depth: number, maxDepth: number, results: ProjectFileSummary[]) {
    if (depth > maxDepth) {
        return;
    }
    const entries = fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'target')
        .sort((left, right) => {
            if (left.isDirectory() !== right.isDirectory()) {
                return left.isDirectory() ? -1 : 1;
            }
            return left.name.localeCompare(right.name);
        });

    for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        const relative = path.relative(root, absolute);
        if (entry.isDirectory()) {
            results.push({
                path: relative,
                kind: 'folder',
            });
            walkFiles(root, absolute, depth + 1, maxDepth, results);
        } else {
            results.push({
                path: relative,
                kind: entry.name.endsWith('.scene') ? 'scene' : 'file',
            });
        }
    }
}

export function createPixifactAutomation() {
    return {
        getProjectSummary(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const { root } = resolveProjectPath(args.projectRoot, '.');
            const files: ProjectFileSummary[] = [];
            walkFiles(root, root, 0, 4, files);
            return {
                projectRoot: root,
                files,
                scenes: files.filter((file) => file.kind === 'scene').map((file) => file.path),
            };
        },

        getScene(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const editable = loadEditableDocument(args.projectRoot, args.scenePath);
            return {
                scenePath: path.relative(editable.projectRoot, editable.target),
                sourceType: editable.isProjectFile ? 'project' : 'scene',
                scene: editable.document.scene,
                summary: summarizeScene(editable.document.scene),
            };
        },

        createScene(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const { root, target } = resolveProjectPath(args.projectRoot, args.scenePath);
            const sceneName = assertString(args.name, 'name');
            const nextScene = scene(sceneName, container('Root', {
                id: 'root',
                key: 'root',
                width: 320,
                height: 180,
                children: [],
            }));

            writeNewJsonFile(target, nextScene);
            return {
                ok: true,
                scenePath: path.relative(root, target),
                scene: nextScene,
                summary: summarizeScene(nextScene),
            };
        },

        inspectNode(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const editable = loadEditableDocument(args.projectRoot, args.scenePath);
            const nodeId = assertString(args.node, 'node');
            const node = collectDetailedNodes(editable.document.scene.root).find((item) => item.locator === nodeId);
            if (!node) {
                throw new Error(`Node "${nodeId}" was not found.`);
            }
            return node;
        },

        dryRunCommands(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const editable = loadEditableDocument(args.projectRoot, args.scenePath);
            const proposal = {
                id: 'cli-dry-run',
                prompt: 'CLI dry run',
                explanation: 'Commands submitted through Pixifact CLI.',
                commands: assertCommands(args.commands),
                annotations: [],
                risks: [],
            };
            const result = dryRunProposal(editable.document.scene, proposal, {
                locks: editable.document.locks,
                designTokens: editable.document.designTokens,
                actions: editable.document.actions,
            });
            return {
                ok: result.ok,
                error: result.error,
                ...(!result.ok ? commandFailureDetails(proposal.commands, result.results, result.error) : {}),
                diffs: result.diffs,
                warnings: result.warnings,
                results: result.results,
                scene: result.scene,
            };
        },

        applyCommands(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const editable = loadEditableDocument(args.projectRoot, args.scenePath);
            const commands = assertCommands(args.commands);
            const proposal = {
                id: 'cli-apply',
                prompt: 'CLI apply',
                explanation: 'Commands submitted through Pixifact CLI.',
                commands,
                annotations: [],
                risks: [],
            };
            const dryRun = dryRunProposal(editable.document.scene, proposal, {
                locks: editable.document.locks,
                designTokens: editable.document.designTokens,
                actions: editable.document.actions,
            });
            if (!dryRun.ok) {
                return {
                    ok: false,
                    error: dryRun.error,
                    ...commandFailureDetails(commands, dryRun.results, dryRun.error),
                    diffs: dryRun.diffs,
                    warnings: dryRun.warnings,
                    results: dryRun.results,
                };
            }

            const results: CommandResult[] = [];
            for (const command of commands) {
                const result = editable.document.apply(command, 'ai');
                results.push(result);
                if (!result.ok) {
                    return {
                        ok: false,
                        error: result.error,
                        ...commandFailureDetails(commands, results, result.error),
                        results,
                    };
                }
            }
            saveEditableDocument(editable);
            return {
                ok: true,
                scenePath: path.relative(editable.projectRoot, editable.target),
                diffs: dryRun.diffs,
                warnings: dryRun.warnings,
                results,
                summary: summarizeScene(editable.document.scene),
            };
        },

        validateCommands(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const editable = loadEditableDocument(args.projectRoot, args.scenePath);
            const commands = assertCommands(args.commands);
            const draft = structuredClone(editable.document.scene);
            const results: CommandResult[] = [];
            for (const command of commands) {
                const result = applyCommand(draft, command, {
                    actions: editable.document.actions,
                });
                results.push(result);
                if (!result.ok) {
                    return {
                        ok: false,
                        error: result.error,
                        ...commandFailureDetails(commands, results, result.error),
                        results,
                    };
                }
            }
            return {
                ok: true,
                results,
            };
        },

        dryRunTemplateAdd(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const commands = templateCommands(args);
            const result = this.dryRunCommands({
                projectRoot: args.projectRoot,
                scenePath: args.scenePath,
                commands,
            });
            return {
                ...result,
                commands,
            };
        },

        applyTemplateAdd(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const commands = templateCommands(args);
            const result = this.applyCommands({
                projectRoot: args.projectRoot,
                scenePath: args.scenePath,
                commands,
            });
            return {
                ...result,
                commands,
            };
        },
    };
}

function collectDetailedNodes(node: NodeSpec, depth = 0, parent?: string): DetailedNode[] {
    return [
        {
            ...structuredClone(node),
            locator: nodeLocator(node),
            depth,
            parent,
            childCount: node.kind === 'container' ? node.children?.length ?? 0 : 0,
        },
        ...(node.kind === 'container' ? (node.children ?? []).flatMap((child) => collectDetailedNodes(child, depth + 1, nodeLocator(node))) : []),
    ];
}
