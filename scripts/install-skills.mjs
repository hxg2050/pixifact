#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'skills');

function usage() {
    console.log(`Install pixif Codex skills.

Usage:
  pixif-skills [--target <skills-dir>] [--replace] [--dry-run]
  node scripts/install-skills.mjs [--target <skills-dir>] [--replace] [--dry-run]

Options:
  --target <skills-dir>  Destination skills directory.
                         Defaults to $CODEX_HOME/skills or ~/.codex/skills.
  --replace              Remove each destination skill before copying.
  --dry-run              Print planned operations without writing files.
  -h, --help             Show this help.
`);
}

function parseArgs(argv) {
    const options = {
        target: path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'),
        replace: false,
        dryRun: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--target') {
            const value = argv[i + 1];
            if (!value) {
                throw new Error('--target requires a directory path.');
            }
            options.target = path.resolve(value);
            i += 1;
        } else if (arg === '--replace') {
            options.replace = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '-h' || arg === '--help') {
            options.help = true;
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }

    return options;
}

function listSkills() {
    if (!fs.existsSync(sourceRoot)) {
        throw new Error(`Skills directory does not exist: ${sourceRoot}`);
    }

    return fs.readdirSync(sourceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => fs.existsSync(path.join(sourceRoot, name, 'SKILL.md')))
        .sort();
}

function copySkill(name, targetRoot, options) {
    const from = path.join(sourceRoot, name);
    const to = path.join(targetRoot, name);

    if (options.dryRun) {
        console.log(`${options.replace ? 'replace' : 'copy'} ${from} -> ${to}`);
        return;
    }

    fs.mkdirSync(targetRoot, { recursive: true });
    if (options.replace && fs.existsSync(to)) {
        fs.rmSync(to, { recursive: true, force: true });
    }
    fs.cpSync(from, to, { recursive: true, force: true });
    console.log(`Installed ${name} -> ${to}`);
}

try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        process.exit(0);
    }

    const skills = listSkills();
    if (skills.length === 0) {
        throw new Error(`No installable pixif skills found under ${sourceRoot}`);
    }

    for (const skill of skills) {
        copySkill(skill, options.target, options);
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Run with --help for usage.');
    process.exit(1);
}
