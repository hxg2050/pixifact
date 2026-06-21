/// <reference path="../vite-env.d.ts" />

import ts from 'typescript';
import * as Pixi from 'pixi.js';
import { Container } from 'pixi.js';
import { Control, Group, HBoxContainer, Image, NineImage, Rect, TileImage, VBoxContainer, getFrameLayout, layoutFrameChildren, requestFrameLayout, setFrameLayout } from 'pixifact/runtime';
import * as compilerRuntime from 'pixifact/compiler';
import {
    compileSceneTemplateToTs,
    builtinSceneInterface,
    builtinSceneInterfaces,
    builtinSceneNameFromAssetId,
    isBuiltinSceneAssetId,
    normalizeSceneAssetId,
    pairedSceneScriptPath,
    resolveSceneReference,
    sceneClassAlias,
    toPosixPath,
    parseSceneTemplate,
} from 'pixifact/compiler';
import type { PixifactProjectResolution } from 'pixifact';
import type { SceneTemplate, SceneTemplateInterface, SceneTemplateNode } from 'pixifact/compiler';
import { compilerSceneNodeLocator } from '../document/compilerSceneDocumentController';
import type { CompilerSceneDocument } from '../document/compilerSceneDocumentController';
import { builtinSceneScriptSources } from './builtinSceneScriptSources';
import {
    findFileByPath,
    readProjectFileBytes,
    readProjectFileText,
} from '../services/projectFileTree';
import { readCompilerSceneBindingIndex } from '../services/sceneBindingIndex';
import type { CompilerSceneBindingIndex } from '../services/sceneBindingIndex';
import type { ProjectFileTreeNode } from '../services/projectFileTree';

interface CreateCompilerSceneRuntimePreviewOptions {
    document: CompilerSceneDocument;
    projectResolution?: PixifactProjectResolution;
    projectTree: ProjectFileTreeNode;
    scenePath: string;
}

export interface CompilerSceneRuntimePreview {
    root: Group;
    nodes: Map<string, Container>;
    width: number;
    height: number;
    dispose: () => void;
}

interface PreviewModule {
    id: string;
    kind: 'generated' | 'project' | 'builtin';
    source: string;
}

interface PreviewModuleRecord {
    exports: Record<string, unknown>;
    loaded: boolean;
}

type PreviewSceneConstructor = new () => unknown;

interface PreviewRuntimeContext {
    projectResolution?: PixifactProjectResolution;
    projectTree: ProjectFileTreeNode;
    scenePath: string;
    templates: Map<string, SceneTemplate>;
    sceneInterfaces: Record<string, SceneTemplateInterface>;
    slotsByTarget: WeakMap<Container, Map<string, Container>>;
    mountedChildrenByTarget: WeakMap<Container, Map<string, Container[]>>;
    objectUrls: string[];
}

const compilerModuleId = 'pixifact/compiler';
const runtimeModuleId = 'pixifact/runtime';
const pixiModuleId = 'pixi.js';
const projectModulePrefix = 'pixifact-preview:project:';
const builtinModulePrefix = 'pixifact-preview:builtin:';
const generatedModulePrefix = 'pixifact-preview:generated:';
const projectScriptExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;
const assetMimeTypes: Record<string, string> = {
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};

const assetParsers: Record<string, string> = {
    '.jpg': 'texture',
    '.jpeg': 'texture',
    '.png': 'texture',
    '.svg': 'svg',
    '.webp': 'texture',
};

const builtinPreviewSources: Record<string, string> = {};

function numericProp(value: unknown, defaultValue: number) {
    return typeof value === 'number' ? value : defaultValue;
}

function sceneSize(template: SceneTemplate, defaultSize?: PixifactProjectResolution) {
    const hasExplicitSize = template.props.width !== undefined || template.props.height !== undefined;
    return {
        width: numericProp(template.props.width, hasExplicitSize ? 960 : defaultSize?.width ?? 960),
        height: numericProp(template.props.height, hasExplicitSize ? 540 : defaultSize?.height ?? 540),
    };
}

function sceneScriptModuleId(scenePath: string) {
    return isBuiltinSceneAssetId(scenePath)
        ? builtinModuleId(`${builtinSceneNameFromAssetId(scenePath)}.ts`)
        : projectModuleId(pairedSceneScriptPath(scenePath));
}

function sceneGeneratedModuleId(scenePath: string) {
    return `${generatedModulePrefix}${scenePath}`;
}

function builtinSceneSource(scenePath: string) {
    return builtinPreviewSources[`${builtinSceneNameFromAssetId(scenePath)}.scene`];
}

function projectAbsolutePath(projectTree: ProjectFileTreeNode, relativePath: string) {
    return `${projectTree.path}/${relativePath}`;
}

function projectModuleId(projectPath: string) {
    return `${projectModulePrefix}${normalizeProjectPath(projectPath)}`;
}

function projectModulePath(moduleId: string) {
    return moduleId.startsWith(projectModulePrefix)
        ? moduleId.slice(projectModulePrefix.length)
        : undefined;
}

function builtinModuleId(modulePath: string) {
    return `${builtinModulePrefix}${normalizeProjectPath(modulePath)}`;
}

function builtinModulePath(moduleId: string) {
    return moduleId.startsWith(builtinModulePrefix)
        ? moduleId.slice(builtinModulePrefix.length)
        : undefined;
}

function normalizeProjectPath(value: string) {
    const segments: string[] = [];
    for (const segment of toPosixPath(value).split('/')) {
        if (!segment || segment === '.') {
            continue;
        }
        if (segment === '..') {
            if (segments.length === 0) {
                throw new Error(`项目模块路径不能离开项目根目录：${value}`);
            }
            segments.pop();
            continue;
        }
        segments.push(segment);
    }
    return segments.join('/');
}

function projectDirname(projectPath: string) {
    const index = projectPath.lastIndexOf('/');
    return index >= 0 ? projectPath.slice(0, index) : '';
}

function projectExtension(projectPath: string) {
    const fileName = projectPath.split('/').at(-1) ?? projectPath;
    const index = fileName.lastIndexOf('.');
    return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function projectJoin(...parts: string[]) {
    return normalizeProjectPath(parts.filter(Boolean).join('/'));
}

function isRelativeModuleSpecifier(value: string) {
    return value.startsWith('./') || value.startsWith('../') || value.startsWith('/');
}

function projectModuleCandidates(projectPath: string) {
    if (projectScriptExtensions.includes(projectExtension(projectPath) as typeof projectScriptExtensions[number])) {
        return [projectPath];
    }
    return [
        ...projectScriptExtensions.map((extension) => `${projectPath}${extension}`),
        ...projectScriptExtensions.map((extension) => `${projectPath}/index${extension}`),
    ];
}

function resolveProjectModulePath(projectTree: ProjectFileTreeNode, importerPath: string, source: string) {
    const basePath = source.startsWith('/')
        ? normalizeProjectPath(source)
        : projectJoin(projectDirname(importerPath), source);
    for (const candidate of projectModuleCandidates(basePath)) {
        if (findFileByPath(projectTree, projectAbsolutePath(projectTree, candidate))) {
            return candidate;
        }
    }
    throw new Error(`找不到项目模块：${source}（来自 ${importerPath}）`);
}

function moduleIdFromImport(context: PreviewRuntimeContext, importerId: string, source: string) {
    if (
        source === pixiModuleId
        || source === compilerModuleId
        || source === runtimeModuleId
        || source.startsWith(projectModulePrefix)
        || source.startsWith(builtinModulePrefix)
        || source.startsWith(generatedModulePrefix)
    ) {
        return source;
    }
    if (isRelativeModuleSpecifier(source)) {
        const importerPath = projectModulePath(importerId);
        const builtinImporterPath = builtinModulePath(importerId);
        if (builtinImporterPath) {
            return builtinModuleId(resolveBuiltinModulePath(builtinImporterPath, source));
        }
        if (!importerPath) {
            throw new Error(`预览模块 ${importerId} 不能使用相对导入 ${source}。`);
        }
        return projectModuleId(resolveProjectModulePath(context.projectTree, importerPath, source));
    }
    return source;
}

function resolveBuiltinModulePath(importerPath: string, source: string) {
    const basePath = source.startsWith('/')
        ? normalizeProjectPath(source)
        : projectJoin(projectDirname(importerPath), source);
    for (const candidate of projectModuleCandidates(basePath)) {
        if (builtinPreviewSources[candidate]) {
            return candidate;
        }
    }
    throw new Error(`找不到内置模块：${source}（来自 ${importerPath}）`);
}

function transpilePreviewModule(source: string) {
    return ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            experimentalDecorators: true,
            importHelpers: false,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            useDefineForClassFields: true,
        },
    }).outputText;
}

function collectStaticModuleSpecifiers(source: string) {
    const specifiers = new Set<string>();
    const sourceFile = ts.createSourceFile('pixifact-preview.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

    function addModuleSpecifier(moduleSpecifier: ts.Expression | undefined) {
        if (moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)) {
            specifiers.add(moduleSpecifier.text);
        }
    }

    function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            addModuleSpecifier(node.moduleSpecifier);
            return;
        }
        if (
            ts.isImportEqualsDeclaration(node)
            && ts.isExternalModuleReference(node.moduleReference)
        ) {
            addModuleSpecifier(node.moduleReference.expression);
            return;
        }
        if (
            ts.isCallExpression(node)
            && ts.isIdentifier(node.expression)
            && node.expression.text === 'require'
        ) {
            addModuleSpecifier(node.arguments[0]);
            return;
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return [...specifiers];
}

function collectSceneInstancePaths(
    scenePath: string,
    nodes: readonly SceneTemplateNode[],
    paths = new Set<string>(),
) {
    for (const node of nodes) {
        if (node.kind === 'slotOutlet') {
            continue;
        }
        if (node.kind === 'pixi') {
            collectSceneInstancePaths(scenePath, node.children, paths);
            continue;
        }
        const resolved = resolveSceneReference(scenePath, node.scene);
        paths.add(resolved);
        for (const children of Object.values(node.slots)) {
            collectSceneInstancePaths(scenePath, children, paths);
        }
    }
    return paths;
}

function sceneImportsFor(scenePath: string, template: SceneTemplate, templates: Map<string, SceneTemplate>) {
    return [...collectSceneImportPaths(scenePath, template, templates)]
        .sort()
        .map((referencedScenePath) => {
            const sceneTemplate = templates.get(referencedScenePath);
            if (!sceneTemplate) {
                throw new Error(`Scene "${scenePath}" references unknown Scene "${referencedScenePath}".`);
            }
            return {
                scene: referencedScenePath,
                exportName: sceneTemplate.name,
                localName: sceneClassAlias(referencedScenePath),
                source: sceneScriptModuleId(referencedScenePath),
            };
        });
}

function collectSceneImportPaths(scenePath: string, template: SceneTemplate, templates: Map<string, SceneTemplate>) {
    const scenePaths = collectSceneInstancePaths(scenePath, template.children);
    collectSceneStructSourcePaths(scenePath, template.children, templates, scenePaths);
    return scenePaths;
}

function collectSceneStructSourcePaths(
    scenePath: string,
    nodes: readonly SceneTemplateNode[],
    templates: Map<string, SceneTemplate>,
    scenePaths: Set<string>,
) {
    for (const node of nodes) {
        if (node.kind === 'slotOutlet') {
            continue;
        }
        if (node.kind === 'pixi') {
            collectSceneStructSourcePaths(scenePath, node.children, templates, scenePaths);
            continue;
        }
        const resolvedScenePath = resolveSceneReference(scenePath, node.scene);
        const sceneInterface = templates.get(resolvedScenePath)?.interface;
        for (const [key, value] of Object.entries(node.props)) {
            const contract = value && typeof value === 'object' ? sceneInterface?.props[key] : undefined;
            if (contract?.type === 'struct' && contract.sourceScene) {
                scenePaths.add(contract.sourceScene);
            }
        }
        for (const children of Object.values(node.slots)) {
            collectSceneStructSourcePaths(scenePath, children, templates, scenePaths);
        }
    }
}

function sceneClassAliasesFor(scenePath: string, template: SceneTemplate) {
    const aliases: Record<string, string> = {};
    function visit(nodes: readonly SceneTemplateNode[]) {
        for (const node of nodes) {
            if (node.kind === 'slotOutlet') {
                continue;
            }
            if (node.kind === 'pixi') {
                visit(node.children);
                continue;
            }
            const referencedScenePath = resolveSceneReference(scenePath, node.scene);
            aliases[node.scene] = sceneClassAlias(referencedScenePath);
            aliases[referencedScenePath] = sceneClassAlias(referencedScenePath);
            for (const children of Object.values(node.slots)) {
                visit(children);
            }
        }
    }
    visit(template.children);
    return aliases;
}

function sceneInterfacesFor(scenePath: string, template: SceneTemplate, sceneInterfaces: Record<string, SceneTemplateInterface>) {
    const interfaces: Record<string, SceneTemplateInterface> = {};
    function visit(nodes: readonly SceneTemplateNode[]) {
        for (const node of nodes) {
            if (node.kind === 'slotOutlet') {
                continue;
            }
            if (node.kind === 'pixi') {
                visit(node.children);
                continue;
            }
            const referencedScenePath = resolveSceneReference(scenePath, node.scene);
            const sceneInterface = sceneInterfaces[referencedScenePath];
            if (sceneInterface) {
                interfaces[node.scene] = sceneInterface;
                interfaces[referencedScenePath] = sceneInterface;
            }
            for (const children of Object.values(node.slots)) {
                visit(children);
            }
        }
    }
    visit(template.children);
    return interfaces;
}

async function readProjectModule(
    projectTree: ProjectFileTreeNode,
    projectPath: string,
    modulesById: Map<string, PreviewModule>,
): Promise<PreviewModule> {
    const normalizedPath = normalizeProjectPath(projectPath);
    const id = projectModuleId(normalizedPath);
    const existing = modulesById.get(id);
    if (existing) {
        return existing;
    }

    const file = findFileByPath(projectTree, projectAbsolutePath(projectTree, normalizedPath));
    if (!file) {
        throw new Error(`找不到项目脚本：${normalizedPath}`);
    }
    const module: PreviewModule = {
        id,
        kind: 'project',
        source: await readProjectFileText(projectTree, file),
    };
    modulesById.set(id, module);

    for (const source of collectStaticModuleSpecifiers(transpilePreviewModule(module.source))) {
        if (isRelativeModuleSpecifier(source)) {
            await readProjectModule(
                projectTree,
                resolveProjectModulePath(projectTree, normalizedPath, source),
                modulesById,
            );
        }
    }

    return module;
}

async function readBuiltinModule(
    modulePath: string,
    modulesById: Map<string, PreviewModule>,
) {
    const normalizedPath = normalizeProjectPath(modulePath);
    const id = builtinModuleId(normalizedPath);
    const existing = modulesById.get(id);
    if (existing) {
        return existing;
    }

    const source = builtinPreviewSources[normalizedPath];
    if (!source) {
        throw new Error(`找不到内置脚本：${normalizedPath}`);
    }
    const module: PreviewModule = {
        id,
        kind: 'builtin',
        source,
    };
    modulesById.set(id, module);

    for (const dependency of collectStaticModuleSpecifiers(transpilePreviewModule(source))) {
        if (isRelativeModuleSpecifier(dependency)) {
            await readBuiltinModule(resolveBuiltinModulePath(normalizedPath, dependency), modulesById);
        }
    }

    return module;
}

function createGeneratedSceneModule(
    scenePath: string,
    template: SceneTemplate,
    templates: Map<string, SceneTemplate>,
    sceneInterfaces: Record<string, SceneTemplateInterface>,
    defaultRootSize?: PixifactProjectResolution,
): PreviewModule {
    return {
        id: sceneGeneratedModuleId(scenePath),
        kind: 'generated',
        source: compileSceneTemplateToTs(template, {
            registrationPath: scenePath,
            defaultRootSize,
            scriptImport: {
                exportName: template.name,
                localName: sceneClassAlias(scenePath),
                source: sceneScriptModuleId(scenePath),
            },
            sceneImports: sceneImportsFor(scenePath, template, templates),
            sceneClassAliases: sceneClassAliasesFor(scenePath, template),
            sceneInterfaces: sceneInterfacesFor(scenePath, template, sceneInterfaces),
        }),
    };
}

async function collectPreviewModules(
    context: PreviewRuntimeContext,
    bindingIndex: CompilerSceneBindingIndex,
    document: CompilerSceneDocument,
) {
    const scenePaths = new Set<string>();

    function includeScene(scenePath: string) {
        if (scenePaths.has(scenePath)) {
            return;
        }
        scenePaths.add(scenePath);
        if (scenePath === context.scenePath) {
            context.templates.set(scenePath, document.template);
        } else if (isBuiltinSceneAssetId(scenePath)) {
            const source = builtinSceneSource(scenePath);
            if (!source) {
                throw new Error(`找不到内置 Scene：${scenePath}`);
            }
            const template = parseSceneTemplate(source);
            template.interface = builtinSceneInterface(scenePath, builtinSceneScriptSources);
            context.templates.set(scenePath, template);
            context.sceneInterfaces[scenePath] = template.interface;
        } else {
            const binding = bindingIndex[scenePath];
            if (!binding) {
                throw new Error(`找不到 Scene：${scenePath}`);
            }
            context.templates.set(scenePath, binding.template);
            context.sceneInterfaces[scenePath] = binding.interface;
        }
        const template = context.templates.get(scenePath)!;
        for (const referencedScenePath of collectSceneInstancePaths(scenePath, template.children)) {
            includeScene(referencedScenePath);
        }
        for (const referencedScenePath of collectSceneImportPaths(scenePath, template, context.templates)) {
            includeScene(referencedScenePath);
        }
    }

    includeScene(context.scenePath);

    const modulesById = new Map<string, PreviewModule>();
    for (const scenePath of [...scenePaths].sort()) {
        if (isBuiltinSceneAssetId(scenePath)) {
            await readBuiltinModule(`${builtinSceneNameFromAssetId(scenePath)}.ts`, modulesById);
        } else {
            await readProjectModule(context.projectTree, pairedSceneScriptPath(scenePath), modulesById);
        }
    }
    for (const scenePath of [...scenePaths].sort()) {
        const module = createGeneratedSceneModule(
            scenePath,
            context.templates.get(scenePath)!,
            context.templates,
            context.sceneInterfaces,
            scenePath === context.scenePath ? context.projectResolution : undefined,
        );
        modulesById.set(module.id, module);
    }
    return [...modulesById.values()];
}

function createPreviewCompilerRuntime(context: PreviewRuntimeContext) {
    return {
        ...compilerRuntime,
        registerSlot(target: Container, name: string, host: Container) {
            compilerRuntime.registerSlot(target, name, host);
            let slots = context.slotsByTarget.get(target);
            if (!slots) {
                slots = new Map();
                context.slotsByTarget.set(target, slots);
            }
            slots.set(name, host);
        },
        mount<T extends Container>(target: Container, child: T, slot = 'default') {
            const mounted = compilerRuntime.mount(target, child, slot);
            let slots = context.mountedChildrenByTarget.get(target);
            if (!slots) {
                slots = new Map();
                context.mountedChildrenByTarget.set(target, slots);
            }
            const children = slots.get(slot) ?? [];
            children.push(child);
            slots.set(slot, children);
            return mounted;
        },
    };
}

function createModuleLoader(context: PreviewRuntimeContext, modules: PreviewModule[]) {
    const moduleSources = new Map(modules.map((module) => [module.id, transpilePreviewModule(module.source)]));
    const records = new Map<string, PreviewModuleRecord>();
    const runtime = createPreviewCompilerRuntime(context);
    const pixiRuntime = createPreviewPixiRuntime(context);

    function requireModule(id: string, importerId?: string): Record<string, unknown> {
        const resolvedId = importerId ? moduleIdFromImport(context, importerId, id) : id;
        if (resolvedId === pixiModuleId) {
            return pixiRuntime as unknown as Record<string, unknown>;
        }
        if (resolvedId === compilerModuleId) {
            return runtime as unknown as Record<string, unknown>;
        }
        if (resolvedId === runtimeModuleId) {
            return {
                Control,
                Group,
                HBoxContainer,
                Image,
                NineImage,
                Rect,
                TileImage,
                VBoxContainer,
                getFrameLayout,
                layoutFrameChildren,
                requestFrameLayout,
                setFrameLayout,
            };
        }

        const existing = records.get(resolvedId);
        if (existing) {
            return existing.exports;
        }

        const source = moduleSources.get(resolvedId);
        if (!source) {
            throw new Error(`预览暂不支持导入模块：${resolvedId}`);
        }

        const record = { exports: {}, loaded: false };
        records.set(resolvedId, record);
        const module = { exports: record.exports };
        const execute = new Function('exports', 'require', 'module', source);
        execute(record.exports, (source: string) => requireModule(source, resolvedId), module);
        record.exports = module.exports as Record<string, unknown>;
        record.loaded = true;
        records.set(resolvedId, record);
        return record.exports;
    }

    async function loadModule(id: string) {
        const existing = records.get(id);
        if (existing?.loaded) {
            return existing.exports;
        }
        const source = moduleSources.get(id);
        if (!source) {
            throw new Error(`预览暂不支持导入模块：${id}`);
        }

        const record = existing ?? { exports: {}, loaded: false };
        records.set(id, record);
        const module = { exports: record.exports };
        const execute = new Function('exports', 'require', 'module', `return (async () => {\n${source}\n})();`);
        await execute(record.exports, (source: string) => requireModule(source, id), module);
        record.exports = module.exports as Record<string, unknown>;
        record.loaded = true;
        records.set(id, record);
        return record.exports;
    }

    return { loadModule, requireModule };
}

function createPreviewPixiRuntime(context: PreviewRuntimeContext) {
    return {
        ...Pixi,
        Assets: {
            ...Pixi.Assets,
            load: (source: unknown) => loadPreviewAsset(context, source),
        },
    };
}

async function loadPreviewAsset(context: PreviewRuntimeContext, source: unknown) {
    if (typeof source !== 'string' || !isProjectAssetReference(source)) {
        return Pixi.Assets.load(source as Parameters<typeof Pixi.Assets.load>[0]);
    }

    const assetPath = normalizeProjectPath(source);
    const file = findFileByPath(context.projectTree, projectAbsolutePath(context.projectTree, assetPath));
    if (!file) {
        return Pixi.Assets.load(source);
    }

    const bytes = await readProjectFileBytes(context.projectTree, file);
    const objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: assetMimeType(assetPath) }));
    context.objectUrls.push(objectUrl);
    return Pixi.Assets.load({
        src: objectUrl,
        parser: assetParser(assetPath),
    });
}

function isProjectAssetReference(source: string) {
    return source.trim() !== ''
        && !source.startsWith('/')
        && !source.startsWith('./')
        && !source.includes('\\')
        && !source.split('/').includes('..')
        && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(source);
}

function assetMimeType(projectPath: string) {
    return assetMimeTypes[projectExtension(projectPath)] ?? 'application/octet-stream';
}

function assetParser(projectPath: string) {
    return assetParsers[projectExtension(projectPath)];
}

function directRenderedChildren(parent: Container, expectedCount: number) {
    return parent.children.slice(0, expectedCount).filter((child): child is Container => child instanceof Container);
}

function mapRenderedNodes(
    context: PreviewRuntimeContext,
    scenePath: string,
    parent: Container,
    nodes: readonly SceneTemplateNode[],
    locatorPath: string,
    output: Map<string, Container>,
    providedChildren?: readonly Container[],
) {
    const visibleNodes = nodes.filter((node) => node.kind !== 'slotOutlet');
    const renderedChildren = providedChildren ?? directRenderedChildren(parent, visibleNodes.length);
    let renderedIndex = 0;

    for (const [index, node] of nodes.entries()) {
        if (node.kind === 'slotOutlet') {
            continue;
        }
        const rendered = renderedChildren[renderedIndex];
        renderedIndex += 1;
        if (!rendered) {
            continue;
        }

        const path = locatorPath ? `${locatorPath}/${index}` : String(index);
        const locator = compilerSceneNodeLocator(node, path);
        output.set(locator, rendered);

        if (node.kind === 'pixi') {
            mapRenderedNodes(context, scenePath, rendered, node.children, locator, output);
            continue;
        }

        for (const [slot, children] of Object.entries(node.slots)) {
            const mountedChildren = context.mountedChildrenByTarget.get(rendered)?.get(slot) ?? [];
            mapRenderedNodes(
                context,
                resolveSceneReference(scenePath, node.scene),
                rendered,
                children,
                `${locator}/slot:${slot}`,
                output,
                mountedChildren,
            );
        }
    }
}

export async function createCompilerSceneRuntimePreview(options: CreateCompilerSceneRuntimePreviewOptions): Promise<CompilerSceneRuntimePreview> {
    const bindingIndex = await readCompilerSceneBindingIndex(options.projectTree);
    const context: PreviewRuntimeContext = {
        projectResolution: options.projectResolution,
        projectTree: options.projectTree,
        scenePath: normalizeSceneAssetId(options.scenePath),
        templates: new Map([[normalizeSceneAssetId(options.scenePath), options.document.template]]),
        sceneInterfaces: {
            ...builtinSceneInterfaces(builtinSceneScriptSources),
            ...options.document.sceneInterfaces,
            [normalizeSceneAssetId(options.scenePath)]: options.document.template.interface,
        },
        slotsByTarget: new WeakMap(),
        mountedChildrenByTarget: new WeakMap(),
        objectUrls: [],
    };
    const modules = await collectPreviewModules(context, bindingIndex, options.document);
    const loader = createModuleLoader(context, modules);

    for (const module of modules.filter((module) => module.kind === 'project' || module.kind === 'builtin')) {
        loader.requireModule(module.id);
    }
    for (const module of modules.filter((module) => module.kind === 'generated')) {
        await loader.loadModule(module.id);
    }

    const scriptExports = loader.requireModule(sceneScriptModuleId(context.scenePath));
    const SceneClass = scriptExports[options.document.template.name];
    if (typeof SceneClass !== 'function') {
        throw new Error(`Scene 脚本没有导出 ${options.document.template.name}。`);
    }
    const root = new (SceneClass as PreviewSceneConstructor)();
    if (!(root instanceof Group)) {
        throw new Error(`Scene 脚本 ${options.document.template.name} 必须继承 Group。`);
    }

    const nodes = new Map<string, Container>();
    mapRenderedNodes(context, context.scenePath, root, options.document.template.children, '', nodes);
    const size = sceneSize(options.document.template, context.projectResolution);
    return {
        root,
        nodes,
        width: size.width,
        height: size.height,
        dispose: () => {
            root.destroy({ children: true });
            for (const objectUrl of context.objectUrls) {
                URL.revokeObjectURL(objectUrl);
            }
        },
    };
}

export function destroyCompilerSceneRuntimePreview(preview?: CompilerSceneRuntimePreview) {
    preview?.dispose();
}
