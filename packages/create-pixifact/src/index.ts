#!/usr/bin/env bun
import { createPixifactProject } from './createPixifactProject';

function usage() {
    return [
        '用法：',
        '  bun create pixifact <project-name>',
        '',
    ].join('\n');
}

const name = process.argv[2];

if (!name || name === '--help' || name === '-h') {
    process.stdout.write(usage());
    process.exitCode = name ? 0 : 1;
} else {
    try {
        const result = await createPixifactProject({ name });
        process.stdout.write(`已创建 ${result.name}：${result.root}\n`);
        process.stdout.write(`下一步：cd ${result.name} && bun install && bun run dev\n`);
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}

export { createPixifactProject };
