import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneTemplate, SceneTemplateNode } from './spec';
import { extractSceneScriptInterface } from './scriptInterfaceExtractor';
import { parseSceneTemplate } from './templateParser';
import { compileSceneTemplateToTs } from './typescriptCompiler';

export interface CompileScenesOptions {
    projectRoot: string | URL;
    scenesDir?: string;
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

export async function compileScenes(options: CompileScenesOptions) {
    const projectRoot = typeof options.projectRoot === 'string'
        ? options.projectRoot
        : fileURLToPath(options.projectRoot);
    const scenesDir = path.resolve(projectRoot, options.scenesDir ?? 'scenes');
    const generatedDir = path.resolve(projectRoot, options.generatedDir ?? '.pixifact/generated');
    const sceneFiles = (await readdir(scenesDir))
        .filter((file) => file.endsWith('.scene'))
        .sort();

    await mkdir(generatedDir, { recursive: true });

    const templates = new Map<string, SceneTemplate>();
    for (const file of sceneFiles) {
        const source = await readFile(path.join(scenesDir, file), 'utf8');
        const scenePath = `scenes/${file}`;
        try {
            const template = parseSceneTemplate(source);
            const descriptor = await readBoundSceneScript(projectRoot, scenePath, template);
            if (!template.script) {
                throw new Error(`Scene "${scenePath}" must declare script.`);
            }
            template.interface = descriptor.interface;
            templates.set(file, template);
        } catch (error) {
            throw new CompileSceneError(error instanceof Error ? error.message : String(error), scenePath, source);
        }
    }

    const registryImports: string[] = [];
    for (const file of sceneFiles) {
        const template = templates.get(file);
        if (!template) {
            throw new Error(`Missing parsed template for ${file}.`);
        }
        const outputFile = `${path.basename(file, '.scene')}.scene.generated.ts`;
        const registrationPath = `scenes/${file}`;
        const code = compileSceneTemplateToTs(template, {
            registrationPath,
            scriptImport: scriptImportFor(template, projectRoot, generatedDir),
            sceneImports: sceneImportsFor(file, sceneFiles, templates, projectRoot, generatedDir),
            textureImports: textureImportsFor(template, projectRoot, generatedDir),
        });

        await writeFile(path.join(generatedDir, outputFile), code);
        registryImports.push(`import './${outputFile.replace(/\.ts$/, '')}';`);
    }

    await writeFile(path.join(generatedDir, 'scenes.generated.ts'), `${registryImports.join('\n')}\n`);
}

function textureImportsFor(template: SceneTemplate, projectRoot: string, generatedDir: string) {
    const textures = new Set<string>();
    for (const child of template.children) {
        collectTextureReferences(child, textures);
    }
    return Object.fromEntries([...textures].map((texture) => {
        const normalized = texture.replace(/^\.\/+/, '').replace(/^\/+/, '');
        const assetPath = path.resolve(projectRoot, normalized);
        const source = path.relative(generatedDir, assetPath).replaceAll(path.sep, '/');
        return [texture, `${source.startsWith('.') ? source : `./${source}`}?url`];
    }));
}

function scriptImportFor(template: SceneTemplate, projectRoot: string, generatedDir: string) {
    if (!template.script) {
        throw new Error(`Scene "${template.name}" must declare script.`);
    }
    const scriptPath = path.resolve(projectRoot, template.script.path);
    const source = path.relative(generatedDir, scriptPath).replaceAll(path.sep, '/').replace(/\.ts$/, '');
    return {
        className: template.name,
        source: source.startsWith('.') ? source : `./${source}`,
    };
}

function sceneImportsFor(
    file: string,
    sceneFiles: string[],
    templates: Map<string, SceneTemplate>,
    projectRoot: string,
    generatedDir: string,
) {
    const imports: Record<string, string> = {};
    const template = templates.get(file);
    if (!template) {
        throw new Error(`Missing parsed template for ${file}.`);
    }
    const sceneInstanceTypes = new Set<string>();

    for (const child of template.children) {
        collectSceneInstanceTypes(child, sceneInstanceTypes);
    }

    for (const sceneFile of sceneFiles) {
        const sceneTemplate = templates.get(sceneFile);
        if (!sceneTemplate?.script || !sceneInstanceTypes.has(sceneTemplate.name)) {
            continue;
        }
        const scriptPath = path.resolve(projectRoot, sceneTemplate.script.path);
        const source = path.relative(generatedDir, scriptPath).replaceAll(path.sep, '/').replace(/\.ts$/, '');
        imports[sceneTemplate.name] = source.startsWith('.') ? source : `./${source}`;
    }

    return imports;
}

async function readBoundSceneScript(projectRoot: string, scenePath: string, template: SceneTemplate) {
    if (!template.script) {
        throw new Error(`Scene "${scenePath}" must declare script.`);
    }
    const scriptPath = path.resolve(projectRoot, template.script.path);
    const scriptSource = await readFile(scriptPath, 'utf8');
    const descriptor = extractSceneScriptInterface(scriptSource, scriptPath, { scene: scenePath });
    if (descriptor.className !== template.name) {
        throw new Error(`Scene "${scenePath}" name "${template.name}" must match @scene class "${descriptor.className}".`);
    }
    return descriptor;
}

function collectSceneInstanceTypes(node: SceneTemplateNode, types: Set<string>) {
    if (node.kind === 'slotOutlet') {
        return;
    }
    if (node.kind === 'sceneInstance') {
        types.add(node.type);
        for (const children of Object.values(node.slots)) {
            for (const child of children) {
                collectSceneInstanceTypes(child, types);
            }
        }
        return;
    }
    for (const child of node.children) {
        collectSceneInstanceTypes(child, types);
    }
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
