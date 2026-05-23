import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneTemplateNode } from 'pixifact/compiler';
import { compileSceneTemplateToTs, parseSceneTemplate } from 'pixifact/compiler';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenesDir = path.join(projectRoot, 'scenes');
const generatedDir = path.join(projectRoot, 'src', 'generated');

const sceneFiles = (await readdir(scenesDir))
    .filter((file) => file.endsWith('.scene'))
    .sort();

await mkdir(generatedDir, { recursive: true });

const registryImports: string[] = [];
const templates = new Map<string, ReturnType<typeof parseSceneTemplate>>();

for (const file of sceneFiles) {
    const source = await readFile(path.join(scenesDir, file), 'utf8');
    templates.set(file, parseSceneTemplate(source));
}

for (const file of sceneFiles) {
    const template = templates.get(file);
    if (!template) {
        throw new Error(`Missing parsed template for ${file}.`);
    }
    const outputFile = `${path.basename(file, '.scene')}.scene.generated.ts`;
    const registrationPath = `./scenes/${file}`;
    const code = compileSceneTemplateToTs(template, {
        registrationPath,
        sceneImports: sceneImportsFor(file),
    });

    await writeFile(path.join(generatedDir, outputFile), code);
    registryImports.push(`import './${outputFile.replace(/\.ts$/, '')}';`);
}

await writeFile(path.join(generatedDir, 'scenes.generated.ts'), `${registryImports.join('\n')}\n`);

function sceneImportsFor(file: string) {
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
        const scriptPath = path.resolve(scenesDir, sceneTemplate.script.path);
        const source = path.relative(generatedDir, scriptPath).replaceAll(path.sep, '/').replace(/\.ts$/, '');
        imports[sceneTemplate.script.className] = source.startsWith('.') ? source : `./${source}`;
    }

    return imports;
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
