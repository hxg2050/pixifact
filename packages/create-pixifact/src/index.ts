#!/usr/bin/env bun
import { createPixifactProject } from './createPixifactProject';

function usage() {
    return [
        'Usage:',
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
        process.stdout.write(`Created ${result.name} at ${result.root}\n`);
        process.stdout.write(`Next: cd ${result.name} && bun install && bun run dev\n`);
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}

export { createPixifactProject };
