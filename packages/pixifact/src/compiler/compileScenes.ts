import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneTemplate, SceneTemplateNode } from './spec';
import { extractSceneScriptInterface } from './scriptInterfaceExtractor';
import { parseSceneTemplate } from './templateParser';
import { serializeSceneTemplate } from './templateSerializer';
import { compileSceneTemplateToTs } from './typescriptCompiler';

export interface CompileScenesOptions {
    projectRoot: string | URL;
    scenesDir?: string;
    generatedDir?: string;
}

export async function compileScenes(options: CompileScenesOptions) {
    const projectRoot = typeof options.projectRoot === 'string'
        ? options.projectRoot
        : fileURLToPath(options.projectRoot);
    const scenesDir = path.resolve(projectRoot, options.scenesDir ?? 'scenes');
    const generatedDir = path.resolve(projectRoot, options.generatedDir ?? 'src/generated');
    const sceneFiles = (await readdir(scenesDir))
        .filter((file) => file.endsWith('.scene'))
        .sort();

    await mkdir(generatedDir, { recursive: true });

    const templates = new Map<string, SceneTemplate>();
    const descriptors = new Map<string, ReturnType<typeof extractSceneScriptInterface>>();
    for (const file of sceneFiles) {
        const source = await readFile(path.join(scenesDir, file), 'utf8');
        const template = parseSceneTemplate(source);
        const descriptor = await readBoundSceneScript(projectRoot, `scenes/${file}`, template);
        template.interface = descriptor.interface;
        templates.set(file, template);
        descriptors.set(file, descriptor);
        await writeFile(path.join(scenesDir, file), serializeSceneTemplate(template));
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
            sceneImports: sceneImportsFor(file, sceneFiles, templates, projectRoot, generatedDir),
        });

        await writeFile(path.join(generatedDir, outputFile), code);
        const descriptor = descriptors.get(file);
        if (!descriptor) {
            throw new Error(`Missing script descriptor for ${file}.`);
        }
        const interfaceFile = `${path.basename(file, '.scene')}.scene.interface.json`;
        await writeFile(
            path.join(generatedDir, interfaceFile),
            `${JSON.stringify(descriptor, null, 2)}\n`,
        );
        registryImports.push(`import './${outputFile.replace(/\.ts$/, '')}';`);
    }

    await writeFile(path.join(generatedDir, 'scenes.generated.ts'), `${registryImports.join('\n')}\n`);
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
        if (!sceneTemplate?.script || !sceneInstanceTypes.has(sceneTemplate.script.className)) {
            continue;
        }
        const scriptPath = path.resolve(projectRoot, sceneTemplate.script.path);
        const source = path.relative(generatedDir, scriptPath).replaceAll(path.sep, '/').replace(/\.ts$/, '');
        imports[sceneTemplate.script.className] = source.startsWith('.') ? source : `./${source}`;
    }

    return imports;
}

async function readBoundSceneScript(projectRoot: string, scenePath: string, template: SceneTemplate) {
    if (!template.script) {
        throw new Error(`Scene "${scenePath}" must declare script and class.`);
    }
    const scriptPath = path.resolve(projectRoot, template.script.path);
    const scriptSource = await readFile(scriptPath, 'utf8');
    const descriptor = extractSceneScriptInterface(scriptSource, scriptPath);
    if (descriptor.scene !== scenePath) {
        throw new Error(`Scene "${scenePath}" script @scene must reference "${scenePath}", received "${descriptor.scene}".`);
    }
    if (descriptor.className !== template.script.className) {
        throw new Error(`Scene "${scenePath}" class must be "${descriptor.className}", received "${template.script.className}".`);
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
