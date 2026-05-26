import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distRoot = fileURLToPath(new URL('../dist/', import.meta.url));

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

function hasExtension(specifier) {
    return /\.[a-zA-Z0-9]+$/.test(specifier);
}

function rewriteRelativeSpecifiers(source) {
    const lines = source.split('\n');
    return lines.map((line) => line.replace(
        /^(\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?)(['"])(\.\.?\/[^'"]+)\2/g,
        (match, prefix, quote, specifier) => {
            if (hasExtension(specifier)) {
                return match;
            }
            return `${prefix}${quote}${specifier}.js${quote}`;
        },
    )).join('\n');
}

for (const filePath of await walk(distRoot)) {
    const source = await readFile(filePath, 'utf8');
    const next = rewriteRelativeSpecifiers(source);
    if (next !== source) {
        await writeFile(filePath, next, 'utf8');
    }
}
