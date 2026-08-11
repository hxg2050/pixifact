import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distRoot = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : fileURLToPath(new URL('../dist/', import.meta.url));

await rm(distRoot, {
    recursive: true,
    force: true,
});
