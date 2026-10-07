import { cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const kitsRoot = path.join(root, 'ui-kits');
const kits = (await readdir(kitsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const name = process.argv[2];
if (!kits.includes(name)) {
    throw new Error(`用法：bun run ui:apply <${kits.join('|')}>。此命令覆盖 UI Scene 外观和同名图片，保留 src/ui/*.ts 行为脚本。`);
}

const source = path.join(kitsRoot, name);
for (const file of await readdir(path.join(source, 'src/ui'))) {
    if (file.endsWith('.scene')) {
        await cp(path.join(source, 'src/ui', file), path.join(root, 'src/ui', file));
    }
}
await cp(path.join(source, 'assets/ui'), path.join(root, 'assets/ui'), { recursive: true });
console.log(`已应用 ${name} UI。运行 bun run validate、bun run compile 和 bun run typecheck；开发服务需重新启动。`);
