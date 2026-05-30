import fs from 'node:fs';
import path from 'node:path';
import {
    applySceneProposal,
    checkSceneProposal,
    createSceneRevision,
    defaultSceneSourceRoots,
    extractSceneScriptInterface,
    inspectSceneTemplate,
    isIgnoredSceneSourceDirectory,
    normalizeSceneAssetId,
    pairedSceneScriptPath,
    parseSceneTemplate,
    resolveSceneReference,
    sceneLocalName,
    validateSceneContent,
} from 'pixifact/compiler';
import {
    container,
    scene,
    SceneDocument,
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    summarizePixifactProjectConfig,
} from 'pixifact';
import type { SceneSpec, NodeSpec } from 'pixifact';
import type { SceneProjectState } from 'pixifact';
import type { SceneProposalDiagnostic, SceneTemplate, SceneTemplateInterface } from 'pixifact/compiler';

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
    name?: unknown;
    proposal?: unknown;
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

function readTextFile(filePath: string) {
    return fs.readFileSync(filePath, 'utf8');
}

function readPixifactProjectSummary(root: string) {
    const configPath = path.join(root, pixifactProjectConfigFileName);
    if (!fs.existsSync(configPath)) {
        return undefined;
    }
    return summarizePixifactProjectConfig(parsePixifactProjectConfig(readJsonFile(configPath)));
}

function writeTextFile(filePath: string, value: string) {
    fs.writeFileSync(filePath, value, 'utf8');
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

function assertProposal(value: unknown) {
    const proposal = assertRecord(value, 'proposal');
    if (proposal.kind !== 'pixifact.sceneProposal.v1') {
        throw new Error('proposal.kind must be "pixifact.sceneProposal.v1".');
    }
    return {
        kind: 'pixifact.sceneProposal.v1' as const,
        scene: assertString(proposal.scene, 'proposal.scene'),
        baseRevision: assertString(proposal.baseRevision, 'proposal.baseRevision'),
        content: assertString(proposal.content, 'proposal.content'),
    };
}

function loadCompilerScene(projectRoot: unknown, scenePath: unknown) {
    const { root, target } = resolveProjectPath(projectRoot, scenePath);
    const content = readTextFile(target);
    return {
        root,
        target,
        scenePath: normalizeSceneAssetId(path.relative(root, target)),
        content,
    };
}

function collectProjectAssets(root: string) {
    const assets = new Set<string>();
    const assetsRoot = path.join(root, 'assets');
    if (!fs.existsSync(assetsRoot)) {
        return assets;
    }
    collectAssetFiles(root, assetsRoot, assets);
    return assets;
}

function collectAssetFiles(root: string, directory: string, assets: Set<string>) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            collectAssetFiles(root, absolute, assets);
            continue;
        }
        if (entry.isFile()) {
            assets.add(path.relative(root, absolute).replaceAll(path.sep, '/'));
        }
    }
}

function collectCompilerSceneInterfaces(root: string, skippedScene?: string) {
    const interfaces: Record<string, SceneTemplateInterface> = {};

    for (const scenePath of collectCompilerScenePaths(root)) {
        if (scenePath === skippedScene) {
            continue;
        }
        try {
            const template = parseSceneTemplate(readTextFile(path.join(root, scenePath)));
            const pair = readCompilerScenePairContract(root, scenePath, template);
            if (pair.diagnostics.length > 0 || !pair.sceneInterface) {
                continue;
            }
            interfaces[scenePath] = pair.sceneInterface;
        } catch {
            continue;
        }
    }
    return interfaces;
}

function collectCompilerScenePaths(root: string) {
    const results: string[] = [];
    for (const sourceRoot of defaultSceneSourceRoots) {
        const absoluteSourceRoot = path.join(root, sourceRoot);
        if (fs.existsSync(absoluteSourceRoot)) {
            collectCompilerScenePathsIn(root, absoluteSourceRoot, results);
        }
    }
    return results.sort();
}

function collectCompilerScenePathsIn(root: string, directory: string, results: string[]) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!isIgnoredSceneSourceDirectory(entry.name)) {
                collectCompilerScenePathsIn(root, path.join(directory, entry.name), results);
            }
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.scene')) {
            results.push(normalizeSceneAssetId(path.relative(root, path.join(directory, entry.name))));
        }
    }
}

function compilerSceneSourceRootDiagnostic(scenePath: string) {
    const normalized = normalizeSceneAssetId(scenePath);
    const insideRoot = defaultSceneSourceRoots.some((sourceRoot) => normalized.startsWith(`${sourceRoot}/`));
    if (insideRoot) {
        return undefined;
    }
    return {
        path: '__scene__',
        prop: 'path',
        expected: 'Scene under source root "src/"',
        actual: normalized,
        hint: 'Move the .scene/.ts pair under src/ or configure an explicit Scene source root.',
    };
}

function normalizeCompilerSceneReference(scenePath: string) {
    return (scene: string) => resolveSceneReference(scenePath, scene);
}

function compilerSceneSourceRootFailure(scenePath: string) {
    const diagnostic = compilerSceneSourceRootDiagnostic(scenePath);
    if (!diagnostic) {
        return undefined;
    }
    return {
        ok: false as const,
        scene: scenePath,
        error: 'Scene validation failed.',
        diagnostics: [diagnostic],
        hint: 'Fix the listed diagnostics, then run scene validate again.',
    };
}

function readCompilerScenePairContract(
    root: string,
    scenePath: string,
    template: SceneTemplate,
): { diagnostics: SceneProposalDiagnostic[]; sceneInterface?: SceneTemplateInterface } {
    const expectedName = sceneLocalName(scenePath);
    if (template.name !== expectedName) {
        return {
            diagnostics: [compilerSceneBasenameDiagnostic(template.name, expectedName)],
        };
    }

    const scriptPath = pairedSceneScriptPath(scenePath);
    const absoluteScriptPath = path.join(root, scriptPath);
    if (!fs.existsSync(absoluteScriptPath)) {
        return {
            diagnostics: [missingCompilerSceneScriptDiagnostic(scriptPath)],
        };
    }

    const descriptor = extractSceneScriptInterface(readTextFile(absoluteScriptPath), absoluteScriptPath, { scene: scenePath });
    if (descriptor.className !== template.name) {
        return {
            diagnostics: [compilerSceneClassDiagnostic(template.name, descriptor.className)],
        };
    }

    return {
        diagnostics: [],
        sceneInterface: descriptor.interface,
    };
}

function compilerSceneBasenameDiagnostic(actual: string, expectedName: string): SceneProposalDiagnostic {
    return {
        path: '__scene__',
        prop: 'name',
        expected: `file basename "${expectedName}"`,
        actual,
        hint: 'Rename the <Scene name> to match the .scene file basename, or rename the .scene/.ts pair.',
    };
}

function missingCompilerSceneScriptDiagnostic(scriptPath: string): SceneProposalDiagnostic {
    return {
        path: '__scene__',
        prop: 'script',
        expected: `paired script "${scriptPath}"`,
        actual: 'missing script',
        hint: 'Create a colocated TypeScript file with the same basename as the .scene file.',
    };
}

function compilerSceneClassDiagnostic(actual: string, expectedClass: string): SceneProposalDiagnostic {
    return {
        path: '__scene__',
        prop: 'name',
        expected: `@scene class name "${expectedClass}"`,
        actual,
        hint: 'Rename the <Scene name> to match the bound @scene class, or update the class name in the bound script.',
    };
}

function compilerSceneValidationFailure(scenePath: string, content: string, diagnostics: SceneProposalDiagnostic[]) {
    return {
        ok: false as const,
        scene: scenePath,
        revision: createSceneRevision(content),
        error: 'Scene validation failed.',
        diagnostics,
        hint: 'Fix the listed diagnostics, then run scene validate again.',
    };
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
                project: readPixifactProjectSummary(root),
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

        inspectCompilerScene(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const template = parseSceneTemplate(loaded.content);
            return {
                ok: true,
                scenePath: loaded.scenePath,
                revision: createSceneRevision(loaded.content),
                summary: inspectSceneTemplate(template),
            };
        },

        validateCompilerScene(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const sourceRootFailure = compilerSceneSourceRootFailure(loaded.scenePath);
            if (sourceRootFailure) {
                return sourceRootFailure;
            }
            const result = validateSceneContent({
                scene: loaded.scenePath,
                content: loaded.content,
                existingAssets: collectProjectAssets(loaded.root),
                sceneInterfaces: collectCompilerSceneInterfaces(loaded.root, loaded.scenePath),
                normalizeSceneReference: normalizeCompilerSceneReference(loaded.scenePath),
            });
            if (!result.ok) {
                return result;
            }
            const pair = readCompilerScenePairContract(loaded.root, loaded.scenePath, parseSceneTemplate(loaded.content));
            if (pair.diagnostics.length > 0) {
                return compilerSceneValidationFailure(loaded.scenePath, loaded.content, pair.diagnostics);
            }
            return {
                ...result,
                scenePath: loaded.scenePath,
            };
        },

        checkCompilerSceneProposal(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const proposal = assertProposal(args.proposal);
            return checkSceneProposal({
                currentContent: loaded.content,
                existingAssets: collectProjectAssets(loaded.root),
                sceneInterfaces: collectCompilerSceneInterfaces(loaded.root),
                normalizeSceneReference: normalizeCompilerSceneReference(loaded.scenePath),
                proposal,
            });
        },

        applyCompilerSceneProposal(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const proposal = assertProposal(args.proposal);
            const result = applySceneProposal({
                currentContent: loaded.content,
                existingAssets: collectProjectAssets(loaded.root),
                sceneInterfaces: collectCompilerSceneInterfaces(loaded.root),
                normalizeSceneReference: normalizeCompilerSceneReference(loaded.scenePath),
                proposal,
            });
            if (!result.ok) {
                return result;
            }
            writeTextFile(loaded.target, result.content);
            return {
                ...result,
                scenePath: loaded.scenePath,
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
