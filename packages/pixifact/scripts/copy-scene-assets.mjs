import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await cp(
    fileURLToPath(new URL('../src/builtin-scenes/', import.meta.url)),
    fileURLToPath(new URL('../dist/builtin-scenes/', import.meta.url)),
    {
        recursive: true,
        filter: (source) => source.endsWith('.scene') || !path.basename(source).includes('.'),
    },
);
