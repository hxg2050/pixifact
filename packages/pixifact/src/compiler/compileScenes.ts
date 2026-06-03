import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneTemplate, SceneTemplateNode } from './spec';
import {
    builtinSceneAssetIds,
    builtinSceneInterface,
    isBuiltinSceneAssetId,
} from './builtinScenes';
import {
    defaultSceneSourceRoots,
    generatedSceneModuleImport,
    generatedSceneModulePath,
    isIgnoredSceneSourceDirectory,
    normalizeSceneAssetId,
    pairedSceneScriptPath,
    resolveSceneReference,
    sceneClassAlias,
    sceneLocalName,
    toPosixPath,
} from './sceneAssetPair';
import {
    builtinSceneScriptPath,
    readBuiltinSceneSource,
} from '../compiler-node/builtinSceneAssets';
import { extractSceneScriptInterface } from './scriptInterfaceExtractor';
import { findMissingScenePartReferences } from './scenePartValidation';
import { parseSceneTemplate } from './templateParser';
import { compileSceneTemplateToTs } from './typescriptCompiler';

export interface CompileScenesOptions {
    projectRoot: string | URL;
    sourceRoots?: string[];
    generatedDir?: string;
}

export class CompileSceneError extends Error {
    constructor(
        message: string,
        public readonly scene: string,
        public readonly source?: string,
    ) {
        super(message);
        this.name = 'CompileSceneError';
    }
}

interface SceneAssetRecord {
    scenePath: string;
    kind: 'project' | 'builtin';
}

export async function compileScenes(options: CompileScenesOptions) {
    const projectRoot = typeof options.projectRoot === 'string'
        ? options.projectRoot
        : fileURLToPath(options.projectRoot);
    const generatedDir = path.resolve(projectRoot, options.generatedDir ?? '.pixifact/generated');
    const projectScenePaths = await collectSceneAssetIds(projectRoot, options.sourceRoots);
    const sceneRecords = [
        ...projectScenePaths.map((scenePath): SceneAssetRecord => ({ scenePath, kind: 'project' })),
        ...builtinSceneAssetIds().map((scenePath): SceneAssetRecord => ({ scenePath, kind: 'builtin' })),
    ];

    await mkdir(generatedDir, { recursive: true });

    const templates = new Map<string, SceneTemplate>();
    for (const record of sceneRecords) {
        const { scenePath } = record;
        const source = record.kind === 'builtin'
            ? await readBuiltinSceneSource(scenePath)
            : await readFile(path.resolve(projectRoot, scenePath), 'utf8');
        try {
            const template = parseSceneTemplate(source);
            assertSceneLocalName(scenePath, template);
            template.interface = record.kind === 'builtin'
                ? builtinSceneInterface(scenePath)
                : (await readPairedSceneScript(projectRoot, scenePath, template)).interface;
            templates.set(scenePath, normalizeSceneReferences(scenePath, template));
        } catch (error) {
            throw new CompileSceneError(error instanceof Error ? error.message : String(error), scenePath, source);
        }
    }

    const projectRegistryImports: string[] = [];
    const builtinRegistryImports: string[] = [];
    for (const record of sceneRecords) {
        const { scenePath } = record;
        const template = templates.get(scenePath);
        if (!template) {
            throw new Error(`Missing parsed template for ${scenePath}.`);
        }

        const outputFile = generatedSceneModulePath(scenePath);
        const generatedFile = path.join(generatedDir, outputFile);
        const generatedFileDir = path.dirname(generatedFile);
        const code = compileSceneTemplateToTs(template, {
            registrationPath: scenePath,
            scriptImport: {
                exportName: template.name,
                localName: sceneClassAlias(scenePath),
                source: importSourceFor(sceneScriptAbsolutePath(projectRoot, scenePath), generatedFileDir),
            },
            sceneImports: sceneImportsFor(template, templates, projectRoot, generatedFileDir),
            sceneClassAliases: sceneClassAliasesFor(template),
            sceneInterfaces: sceneInterfacesFor(template, templates),
            textureImports: textureImportsFor(template, projectRoot, generatedFileDir),
        });

        await mkdir(path.dirname(generatedFile), { recursive: true });
        await writeFile(generatedFile, code);
        if (record.kind === 'project') {
            projectRegistryImports.push(`import ${JSON.stringify(generatedSceneModuleImport(scenePath))};`);
        } else if (sceneIsReferencedByProjectScenes(scenePath, projectScenePaths, templates)) {
            builtinRegistryImports.push(`import ${JSON.stringify(generatedSceneModuleImport(scenePath))};`);
        }
    }

    await writeFile(path.join(generatedDir, 'scenes.generated.ts'), `${[
        ...builtinRegistryImports,
        ...projectRegistryImports,
    ].join('\n')}\n`);
}

function sceneIsReferencedByProjectScenes(
    scenePath: string,
    projectScenePaths: readonly string[],
    templates: Map<string, SceneTemplate>,
) {
    if (!isBuiltinSceneAssetId(scenePath)) {
        return false;
    }
    const visited = new Set<string>();
    const stack = [...projectScenePaths];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) {
            continue;
        }
        visited.add(current);
        for (const referencedScenePath of collectSceneInstancePaths(templates.get(current)?.children ?? [])) {
            if (referencedScenePath === scenePath) {
                return true;
            }
            stack.push(referencedScenePath);
        }
    }
    return false;
}

function sceneScriptAbsolutePath(projectRoot: string, scenePath: string) {
    return isBuiltinSceneAssetId(scenePath)
        ? builtinSceneScriptPath(scenePath)
        : path.resolve(projectRoot, pairedSceneScriptPath(scenePath));
}

async function collectSceneAssetIds(projectRoot: string, sourceRoots: readonly string[] = defaultSceneSourceRoots) {
    const scenes: string[] = [];
    for (const sourceRoot of sourceRoots) {
        const absoluteRoot = path.resolve(projectRoot, sourceRoot);
        if (!await exists(absoluteRoot)) {
            continue;
        }
        await collectScenesInDirectory(projectRoot, absoluteRoot, scenes);
    }
    return scenes.sort();
}

async function collectScenesInDirectory(projectRoot: string, directory: string, scenes: string[]) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!isIgnoredSceneSourceDirectory(entry.name)) {
                await collectScenesInDirectory(projectRoot, path.join(directory, entry.name), scenes);
            }
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.scene')) {
            scenes.push(normalizeSceneAssetId(toPosixPath(path.relative(projectRoot, path.join(directory, entry.name)))));
        }
    }
}

async function exists(filePath: string) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

function assertSceneLocalName(scenePath: string, template: SceneTemplate) {
    const expected = sceneLocalName(scenePath);
    if (template.name !== expected) {
        throw new Error(`Scene "${scenePath}" name "${template.name}" must match file basename "${expected}".`);
    }
}

async function readPairedSceneScript(projectRoot: string, scenePath: string, template: SceneTemplate) {
    const scriptPath = pairedSceneScriptPath(scenePath);
    const absoluteScriptPath = path.resolve(projectRoot, scriptPath);
    if (!await exists(absoluteScriptPath)) {
        throw new Error(`Scene "${scenePath}" requires paired script "${scriptPath}".`);
    }
    const descriptor = extractSceneScriptInterface(await readFile(absoluteScriptPath, 'utf8'), absoluteScriptPath, { scene: scenePath });
    if (descriptor.className !== template.name) {
        throw new Error(`Scene "${scenePath}" name "${template.name}" must match @scene class "${descriptor.className}".`);
    }
    const missingPart = findMissingScenePartReferences(template, descriptor.parts)[0];
    if (missingPart) {
        throw new Error(scenePartReferenceError(scenePath, missingPart.property, missingPart.id));
    }
    return descriptor;
}

function scenePartReferenceError(scenePath: string, property: string, id: string) {
    return `Scene "${scenePath}" @part "${property}" references missing node id "${id}".`;
}

function normalizeSceneReferences(scenePath: string, template: SceneTemplate): SceneTemplate {
    const next = structuredClone(template);
    function visit(node: SceneTemplateNode) {
        if (node.kind === 'slotOutlet') {
            return;
        }
        if (node.kind === 'pixi') {
            node.children.forEach(visit);
            return;
        }
        node.scene = resolveSceneReference(scenePath, node.scene);
        for (const children of Object.values(node.slots)) {
            children.forEach(visit);
        }
    }
    next.children.forEach(visit);
    return next;
}

function sceneImportsFor(
    template: SceneTemplate,
    templates: Map<string, SceneTemplate>,
    projectRoot: string,
    generatedFileDir: string,
) {
    return [...collectSceneInstancePaths(template.children)]
        .sort()
        .map((scenePath) => {
            const sceneTemplate = templates.get(scenePath);
            if (!sceneTemplate) {
                throw new Error(`Scene "${template.name}" references unknown Scene "${scenePath}".`);
            }
            return {
                exportName: sceneTemplate.name,
                localName: sceneClassAlias(scenePath),
                source: importSourceFor(sceneScriptAbsolutePath(projectRoot, scenePath), generatedFileDir),
            };
        });
}

function sceneClassAliasesFor(template: SceneTemplate) {
    return Object.fromEntries(
        [...collectSceneInstancePaths(template.children)].map((scenePath) => [scenePath, sceneClassAlias(scenePath)]),
    );
}

function sceneInterfacesFor(template: SceneTemplate, templates: Map<string, SceneTemplate>) {
    return Object.fromEntries(
        [...collectSceneInstancePaths(template.children)].map((scenePath) => {
            const sceneTemplate = templates.get(scenePath);
            if (!sceneTemplate) {
                throw new Error(`Scene "${template.name}" references unknown Scene "${scenePath}".`);
            }
            return [scenePath, sceneTemplate.interface];
        }),
    );
}

function importSourceFor(sourcePath: string, generatedFileDir: string) {
    const source = path.relative(generatedFileDir, sourcePath).replaceAll(path.sep, '/').replace(/\.ts$/, '');
    return source.startsWith('.') ? source : `./${source}`;
}

function textureImportsFor(template: SceneTemplate, projectRoot: string, generatedFileDir: string) {
    const textures = new Set<string>();
    for (const child of template.children) {
        collectTextureReferences(child, textures);
    }
    return Object.fromEntries([...textures].map((texture) => {
        const normalized = texture.replace(/^\.\/+/, '').replace(/^\/+/, '');
        const assetPath = path.resolve(projectRoot, normalized);
        const source = path.relative(generatedFileDir, assetPath).replaceAll(path.sep, '/');
        return [texture, `${source.startsWith('.') ? source : `./${source}`}?url`];
    }));
}

function collectSceneInstancePaths(nodes: readonly SceneTemplateNode[], scenePaths = new Set<string>()) {
    for (const node of nodes) {
        if (node.kind === 'slotOutlet') {
            continue;
        }
        if (node.kind === 'pixi') {
            collectSceneInstancePaths(node.children, scenePaths);
            continue;
        }
        scenePaths.add(node.scene);
        for (const children of Object.values(node.slots)) {
            collectSceneInstancePaths(children, scenePaths);
        }
    }
    return scenePaths;
}

function collectTextureReferences(node: SceneTemplateNode, textures: Set<string>) {
    if (node.kind === 'slotOutlet') {
        return;
    }
    if (node.kind === 'pixi') {
        if (typeof node.props.texture === 'string') {
            textures.add(node.props.texture);
        }
        for (const child of node.children) {
            collectTextureReferences(child, textures);
        }
        return;
    }
    for (const children of Object.values(node.slots)) {
        for (const child of children) {
            collectTextureReferences(child, textures);
        }
    }
}
