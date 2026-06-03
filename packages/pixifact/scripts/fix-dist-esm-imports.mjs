import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function defaultDistRoot() {
    return fileURLToPath(new URL('../dist/', import.meta.url));
}

async function walk(directory) {
    const files = [];
    for (const entry of await readdir(directory)) {
        const filePath = path.join(directory, entry);
        const fileStat = await stat(filePath);
        if (fileStat.isDirectory()) {
            files.push(...await walk(filePath));
        } else if (filePath.endsWith('.js') || filePath.endsWith('.d.ts')) {
            files.push(filePath);
        }
    }
    return files;
}

export function hasExtension(specifier) {
    return /\.[a-zA-Z0-9]+$/.test(specifier);
}

async function isFile(filePath) {
    try {
        const fileStat = await stat(filePath);
        return fileStat.isFile();
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

export async function resolveRelativeSpecifier(filePath, specifier) {
    if (hasExtension(specifier)) {
        return specifier;
    }

    const resolvedPath = path.resolve(path.dirname(filePath), specifier);
    if (await isFile(`${resolvedPath}.js`) || await isFile(`${resolvedPath}.d.ts`)) {
        return `${specifier}.js`;
    }
    if (await isFile(path.join(resolvedPath, 'index.js')) || await isFile(path.join(resolvedPath, 'index.d.ts'))) {
        return `${specifier}/index.js`;
    }

    throw new Error(`Cannot resolve ${specifier} from ${filePath}`);
}

export async function rewriteRelativeSpecifiers(source, filePath) {
    const lines = source.split('\n');
    const rewritten = [];

    for (const line of lines) {
        const match = line.match(/^(\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?)(['"])(\.\.?\/[^'"]+)\2(.*)$/);
        if (!match) {
            rewritten.push(line);
            continue;
        }

        const [, prefix, quote, specifier, suffix] = match;
        const resolvedSpecifier = await resolveRelativeSpecifier(filePath, specifier);
        rewritten.push(`${prefix}${quote}${resolvedSpecifier}${quote}${suffix}`);
    }

    return rewritten.join('\n');
}

export async function fixDistEsmImports(distRoot = defaultDistRoot()) {
    for (const filePath of await walk(distRoot)) {
        const source = await readFile(filePath, 'utf8');
        const next = await rewriteRelativeSpecifiers(source, filePath);
        if (next !== source) {
            await writeFile(filePath, next, 'utf8');
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await fixDistEsmImports();
}
