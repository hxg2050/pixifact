import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);

export interface CreatePixifactProjectOptions {
    cwd?: string;
    name: string;
    template?: 'minimal';
}

export interface CreatePixifactProjectResult {
    name: string;
    root: string;
    template: 'minimal';
}

function packageDirectory() {
    const currentFile = fileURLToPath(import.meta.url);
    const sourceDirectory = path.basename(path.dirname(currentFile));
    return sourceDirectory === 'src' || sourceDirectory === 'dist'
        ? path.resolve(currentFile, '../..')
        : path.resolve(currentFile, '..');
}

function templateDirectory(template: 'minimal') {
    return path.join(packageDirectory(), 'templates', template);
}

function skillDirectory() {
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
    return path.basename(currentDirectory) === 'src'
        ? path.resolve(currentDirectory, '../../../skills/pixifact')
        : path.join(currentDirectory, 'skills/pixifact');
}

function projectDisplayName(name: string) {
    return name
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ');
}

async function directoryIsEmpty(target: string) {
    try {
        const targetStat = await stat(target);
        if (!targetStat.isDirectory()) {
            throw new Error('Target path exists and is not a directory.');
        }
        return (await readdir(target)).length === 0;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return true;
        }
        throw error;
    }
}

async function writeJson(filePath: string, value: unknown) {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function createPixifactProject(options: CreatePixifactProjectOptions): Promise<CreatePixifactProjectResult> {
    const template = options.template ?? 'minimal';
    const cwd = options.cwd ?? process.cwd();
    const projectRoot = path.resolve(cwd, options.name);

    if (!(await directoryIsEmpty(projectRoot))) {
        throw new Error('Target directory is not empty.');
    }

    await mkdir(projectRoot, { recursive: true });
    await cp(templateDirectory(template), projectRoot, { recursive: true });

    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as Record<string, unknown>;
    packageJson.name = options.name;
    await writeJson(packageJsonPath, packageJson);

    const projectJsonPath = path.join(projectRoot, 'pixifact.project.json');
    const projectJson = JSON.parse(await readFile(projectJsonPath, 'utf8')) as Record<string, unknown>;
    projectJson.name = projectDisplayName(options.name);
    await writeJson(projectJsonPath, projectJson);

    await cp(skillDirectory(), path.join(projectRoot, '.agents/skills/pixifact'), { recursive: true });
    await writeFile(path.join(projectRoot, '.gitignore'), [
        'node_modules/',
        'dist/',
        '.pixifact/',
        '.env.local',
        '.env.*.local',
        '',
    ].join('\n'), 'utf8');
    await runFile('git', ['init', '--quiet'], { cwd: projectRoot });

    return {
        name: options.name,
        root: projectRoot,
        template,
    };
}
