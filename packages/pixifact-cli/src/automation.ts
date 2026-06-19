import fs from 'node:fs';
import path from 'node:path';
import {
    createSceneRevision,
    builtinSceneInterfaces,
    defaultSceneSourceRoots,
    extractSceneScriptInterface,
    findMissingScenePartReferences,
    inspectSceneTemplate,
    isIgnoredSceneSourceDirectory,
    normalizeSceneAssetId,
    pairedSceneScriptPath,
    parseSceneTemplate,
    resolveSceneReference,
    sceneLocalName,
    toPosixPath,
    validateSceneContent,
} from 'pixifact/compiler';
import {
    parsePixifactProjectConfig,
    pixifactProjectConfigFileName,
    summarizePixifactProjectConfig,
} from 'pixifact';
import type { SceneTemplate, SceneTemplateInterface, SceneTemplateNode, SceneValidationDiagnostic } from 'pixifact/compiler';

interface ProjectFileSummary {
    path: string;
    kind: 'folder' | 'scene' | 'file';
}

interface ToolInput {
    projectRoot?: unknown;
    scenePath?: unknown;
    node?: unknown;
    name?: unknown;
}

type CompilerSceneValidationSuccess = ReturnType<typeof validateCompilerSceneFile> & { ok: true };
type CompilerSceneValidationFailure = ReturnType<typeof validateCompilerSceneFile> & { ok: false };

type DetailedCompilerNode = SceneTemplateNode & {
    locator: string;
    depth: number;
    parent?: string;
    childCount: number;
}

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

function writeNewTextFile(filePath: string, value: string, errorMessage: string) {
    try {
        fs.writeFileSync(filePath, value, {
            encoding: 'utf8',
            flag: 'wx',
        });
    } catch (error) {
        if (isRecord(error) && error.code === 'EEXIST') {
            throw new Error(errorMessage);
        }
        throw error;
    }
}

function assertNewFile(filePath: string, errorMessage: string) {
    if (fs.existsSync(filePath)) {
        throw new Error(errorMessage);
    }
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
    const interfaces: Record<string, SceneTemplateInterface> = {
        ...builtinSceneInterfaces(),
    };

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
): { diagnostics: SceneValidationDiagnostic[]; sceneInterface?: SceneTemplateInterface } {
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

    let descriptor: ReturnType<typeof extractSceneScriptInterface>;
    try {
        descriptor = extractSceneScriptInterface(readTextFile(absoluteScriptPath), absoluteScriptPath, { scene: scenePath });
    } catch (error) {
        return {
            diagnostics: [compilerSceneScriptContractDiagnostic(error)],
        };
    }
    if (descriptor.className !== template.name) {
        return {
            diagnostics: [compilerSceneClassDiagnostic(template.name, descriptor.className)],
        };
    }
    const missingParts = findMissingScenePartReferences(template, descriptor.parts);
    if (missingParts.length > 0) {
        return {
            diagnostics: missingParts.map((part) => compilerScenePartDiagnostic(part.property, part.id)),
        };
    }

    return {
        diagnostics: [],
        sceneInterface: descriptor.interface,
    };
}

function compilerSceneBasenameDiagnostic(actual: string, expectedName: string): SceneValidationDiagnostic {
    return {
        path: '__scene__',
        prop: 'name',
        expected: `file basename "${expectedName}"`,
        actual,
        hint: 'Rename the <Scene name> to match the .scene file basename, or rename the .scene/.ts pair.',
    };
}

function missingCompilerSceneScriptDiagnostic(scriptPath: string): SceneValidationDiagnostic {
    return {
        path: '__scene__',
        prop: 'script',
        expected: `paired script "${scriptPath}"`,
        actual: 'missing script',
        hint: 'Create a colocated TypeScript file with the same basename as the .scene file.',
    };
}

function compilerSceneClassDiagnostic(actual: string, expectedClass: string): SceneValidationDiagnostic {
    return {
        path: '__scene__',
        prop: 'name',
        expected: `paired @scene class name "${expectedClass}"`,
        actual,
        hint: 'Rename the <Scene name> to match the paired @scene class, or update the class name in the paired script.',
    };
}

function compilerSceneScriptContractDiagnostic(error: unknown): SceneValidationDiagnostic {
    return {
        path: '__scene__',
        prop: 'script',
        expected: 'paired script with one @scene class',
        actual: error instanceof Error ? error.message : String(error),
        hint: 'Add a @scene() class to the paired TypeScript file and keep its class name aligned with the .scene basename.',
    };
}

function compilerScenePartDiagnostic(property: string, id: string): SceneValidationDiagnostic {
    return {
        path: '__scene__',
        prop: `@part ${property}`,
        expected: `node id "${id}"`,
        actual: 'missing node',
        hint: 'Add a node with this id to the .scene file or update @part({ id }).',
    };
}

function compilerSceneValidationFailure(scenePath: string, content: string, diagnostics: SceneValidationDiagnostic[]) {
    return {
        ok: false as const,
        scene: scenePath,
        revision: createSceneRevision(content),
        error: 'Scene validation failed.',
        diagnostics,
        hint: 'Fix the listed diagnostics, then run scene validate again.',
    };
}

function validateCompilerSceneFile(root: string, scenePath: string) {
    const content = readTextFile(path.join(root, scenePath));
    const sourceRootFailure = compilerSceneSourceRootFailure(scenePath);
    if (sourceRootFailure) {
        return sourceRootFailure;
    }
    const result = validateSceneContent({
        scene: scenePath,
        content,
        existingAssets: collectProjectAssets(root),
        sceneInterfaces: collectCompilerSceneInterfaces(root, scenePath),
        normalizeSceneReference: normalizeCompilerSceneReference(scenePath),
    });
    if (!result.ok) {
        return result;
    }
    const pair = readCompilerScenePairContract(root, scenePath, parseSceneTemplate(content));
    if (pair.diagnostics.length > 0) {
        return compilerSceneValidationFailure(scenePath, content, pair.diagnostics);
    }
    return {
        ...result,
        scenePath,
    };
}

function validateAllCompilerScenes(root: string) {
    const results = collectCompilerScenePaths(root).map((scenePath) => validateCompilerSceneFile(root, scenePath));
    const failures = results.filter((result): result is CompilerSceneValidationFailure => !result.ok);
    const scenes = results
        .filter((result): result is CompilerSceneValidationSuccess => result.ok)
        .map(({ scenePath, revision, summary }) => ({ scenePath, revision, summary }));
    if (failures.length > 0) {
        return {
            ok: false as const,
            projectRoot: root,
            sceneCount: results.length,
            scenes,
            failures,
            hint: 'Fix the listed diagnostics, then run scene validate --all again.',
        };
    }
    return {
        ok: true as const,
        projectRoot: root,
        sceneCount: results.length,
        scenes,
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

function compilerNodeChildren(node: SceneTemplateNode): SceneTemplateNode[] {
    if (node.kind === 'pixi') {
        return node.children;
    }
    if (node.kind === 'sceneInstance') {
        return Object.values(node.slots).flat();
    }
    return [];
}

function compilerNodeSegment(index: number, node: SceneTemplateNode) {
    if (node.kind === 'slotOutlet') {
        return `${index}:slot:${node.name}`;
    }
    return `${index}:${node.id ?? node.kind}`;
}

function collectDetailedCompilerNodes(
    nodes: readonly SceneTemplateNode[],
    depth = 0,
    parent?: string,
): DetailedCompilerNode[] {
    return nodes.flatMap((node, index) => {
        const locator = parent ? `${parent}/${compilerNodeSegment(index, node)}` : compilerNodeSegment(index, node);
        const children = node.kind === 'pixi'
            ? collectDetailedCompilerNodes(node.children, depth + 1, locator)
            : node.kind === 'sceneInstance'
                ? Object.entries(node.slots).flatMap(([slot, slotChildren]) => (
                    collectDetailedCompilerNodes(slotChildren, depth + 1, `${locator}/slot:${slot}`)
                ))
                : [];
        return [
            {
                ...structuredClone(node),
                locator,
                depth,
                parent,
                childCount: compilerNodeChildren(node).length,
            },
            ...children,
        ];
    });
}

function createBlankCompilerSceneSource(sceneName: string) {
    return [
        `<Scene name="${sceneName}" width="960" height="540">`,
        '</Scene>',
        '',
    ].join('\n');
}

function createBlankCompilerSceneScript(sceneName: string) {
    return [
        "import { Group } from 'pixifact/runtime';",
        "import { scene } from 'pixifact/compiler';",
        '',
        '@scene()',
        `export class ${sceneName} extends Group {}`,
        '',
    ].join('\n');
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
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const template = parseSceneTemplate(loaded.content);
            return {
                ok: true,
                sourceType: 'compiler-scene',
                scenePath: loaded.scenePath,
                revision: createSceneRevision(loaded.content),
                template,
                summary: inspectSceneTemplate(template),
            };
        },

        createScene(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const { root, target } = resolveProjectPath(args.projectRoot, args.scenePath);
            const sceneName = assertString(args.name, 'name');
            const scenePath = normalizeSceneAssetId(path.relative(root, target));
            const sourceRootFailure = compilerSceneSourceRootFailure(scenePath);
            if (sourceRootFailure) {
                return sourceRootFailure;
            }
            const scriptPath = path.resolve(root, pairedSceneScriptPath(scenePath));
            const source = createBlankCompilerSceneSource(sceneName);
            const template = parseSceneTemplate(source);

            assertNewFile(target, 'Scene file already exists.');
            assertNewFile(scriptPath, 'Scene script already exists.');
            writeNewTextFile(target, source, 'Scene file already exists.');
            writeNewTextFile(scriptPath, createBlankCompilerSceneScript(sceneName), 'Scene script already exists.');
            return {
                ok: true,
                scenePath,
                scriptPath: toPosixPath(path.relative(root, scriptPath)),
                revision: createSceneRevision(source),
                template,
                summary: inspectSceneTemplate(template),
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
            return validateCompilerSceneFile(loaded.root, loaded.scenePath);
        },

        validateAllCompilerScenes(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const { root } = resolveProjectPath(args.projectRoot, '.');
            return validateAllCompilerScenes(root);
        },

        inspectNode(input: unknown) {
            const args = assertRecord(input, 'input') as ToolInput;
            const loaded = loadCompilerScene(args.projectRoot, args.scenePath);
            const template = parseSceneTemplate(loaded.content);
            const nodeId = assertString(args.node, 'node');
            const node = collectDetailedCompilerNodes(template.children).find((item) => item.locator === nodeId);
            if (!node) {
                throw new Error(`Node "${nodeId}" was not found.`);
            }
            return node;
        },
    };
}
