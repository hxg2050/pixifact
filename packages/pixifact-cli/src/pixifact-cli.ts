#!/usr/bin/env bun
import fs from 'node:fs/promises';
import { createPixifactAutomation } from './automation';
import { hintForCommandError } from 'pixifact';
import { CompileSceneError, compileScenes } from 'pixifact/compiler-node';
import type { SceneProposalDiagnostic } from 'pixifact/compiler';
import { createLiveBridgeServer } from './liveBridgeServer';

type Automation = ReturnType<typeof createPixifactAutomation>;
type LiveBridge = Pick<ReturnType<typeof createLiveBridgeServer>, 'connected' | 'callAction' | 'stop'> & {
    waitForConnection?: (timeoutMs?: number) => Promise<void>;
};

interface CliOptions {
    automation?: Automation;
    input?: string | NodeJS.ReadableStream;
    liveBridge?: LiveBridge;
}

interface CliResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

interface CliJsonResult {
    ok?: boolean;
    [key: string]: unknown;
}

interface ParsedArgs {
    positionals: string[];
    flags: Record<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
    const positionals: string[] = [];
    const flags: Record<string, string | true> = {};

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith('--')) {
            positionals.push(arg);
            continue;
        }

        const name = arg.slice(2);
        if (name === 'help') {
            flags[name] = true;
            continue;
        }

        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`--${name} must include a value.`);
        }
        flags[name] = value;
        index += 1;
    }

    return { positionals, flags };
}

function requireFlag(flags: Record<string, string | true>, name: string) {
    const value = flags[name];
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`--${name} must include a value.`);
    }
    return value;
}

async function readInput(input: string | NodeJS.ReadableStream | undefined) {
    if (typeof input === 'string') {
        return input;
    }

    const stream = input ?? process.stdin;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString('utf8');
}

async function readProposal(flags: Record<string, string | true>, input: string | NodeJS.ReadableStream | undefined) {
    const proposalPath = requireFlag(flags, 'proposal');
    const text = proposalPath === '-'
        ? await readInput(input)
        : await fs.readFile(proposalPath, 'utf8');
    return JSON.parse(text);
}

function jsonLine(value: unknown) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function isFailedResult(value: unknown): value is CliJsonResult {
    return typeof value === 'object'
        && value !== null
        && (value as CliJsonResult).ok === false;
}

function compileScenesFailure(error: unknown): CliJsonResult {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof CompileSceneError) {
        const sourceDiagnostic = sourceDiagnosticFromMessage(error.source ?? '', message);
        if (sourceDiagnostic) {
            return {
                ok: false,
                scene: error.scene,
                error: 'Scene compile failed.',
                diagnostics: [sourceDiagnostic],
                hint: 'Fix the listed diagnostics, then run compile-scenes again.',
            };
        }
    }
    const basenameMismatch = message.match(/^Scene "([^"]+)" name "([^"]+)" must match file basename "([^"]+)"\.$/);
    if (basenameMismatch) {
        const [, scene, actual, expectedName] = basenameMismatch;
        return {
            ok: false,
            scene,
            error: 'Scene compile failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'name',
                expected: `file basename "${expectedName}"`,
                actual,
                hint: 'Rename the <Scene name> to match the .scene file basename, or rename the .scene/.ts pair.',
            } satisfies SceneProposalDiagnostic],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        };
    }
    const missingPair = message.match(/^Scene "([^"]+)" requires paired script "([^"]+)"\.$/);
    if (missingPair) {
        const [, scene, scriptPath] = missingPair;
        return {
            ok: false,
            scene,
            error: 'Scene compile failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'script',
                expected: `paired script "${scriptPath}"`,
                actual: 'missing script',
                hint: 'Create a colocated TypeScript file with the same basename as the .scene file.',
            } satisfies SceneProposalDiagnostic],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        };
    }
    const classMismatch = message.match(/^Scene "([^"]+)" name "([^"]+)" must match @scene class "([^"]+)"\.$/);
    if (classMismatch) {
        const [, scene, actual, expectedClass] = classMismatch;
        return {
            ok: false,
            scene,
            error: 'Scene compile failed.',
            diagnostics: [{
                path: '__scene__',
                prop: 'name',
                expected: `paired @scene class name "${expectedClass}"`,
                actual,
                hint: 'Rename the <Scene name> to match the paired @scene class, or update the class name in the paired script.',
            } satisfies SceneProposalDiagnostic],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        };
    }
    return {
        ok: false,
        error: message,
        hint: hintForCommandError(message),
    };
}

function sourceDiagnosticFromMessage(source: string, message: string): SceneProposalDiagnostic | undefined {
    if (!message.includes('offset')) {
        return undefined;
    }
    return {
        path: '__scene__',
        prop: 'source',
        expected: 'valid Pixifact .scene source',
        actual: message,
        hint: 'Fix the .scene source syntax near the reported location.',
        ...sourcePositionFromMessage(source, message),
    };
}

function sourcePositionFromMessage(source: string, message: string) {
    const match = message.match(/\boffset (\d+)\b/);
    if (!match) {
        return {};
    }
    const offset = Number(match[1]);
    if (!Number.isInteger(offset) || offset < 0) {
        return {};
    }
    const before = source.slice(0, offset);
    const lines = before.split('\n');
    return {
        line: lines.length,
        column: lines.at(-1)!.length + 1,
    };
}

async function executeFileCommand(positionals: string[], flags: Record<string, string | true>, automation: Automation, input: string | NodeJS.ReadableStream | undefined) {
    const [area, action, subaction] = positionals;

    if (area === 'compile-scenes' && action === undefined) {
        const projectRoot = typeof flags['project-root'] === 'string' ? flags['project-root'] : process.cwd();
        try {
            await compileScenes({ projectRoot });
        } catch (error) {
            return compileScenesFailure(error);
        }
        return {
            ok: true,
            projectRoot,
        };
    }

    if (area === 'summary' && action === undefined) {
        return automation.getProjectSummary({
            projectRoot: requireFlag(flags, 'project-root'),
        });
    }

    if (area === 'scene' && action === 'get') {
        return automation.getScene({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
        });
    }

    if (area === 'scene' && action === 'create') {
        return automation.createScene({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
            name: requireFlag(flags, 'name'),
        });
    }

    if (area === 'scene' && action === 'inspect') {
        return automation.inspectCompilerScene({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
        });
    }

    if (area === 'scene' && action === 'validate') {
        return automation.validateCompilerScene({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
        });
    }

    if (area === 'scene' && action === 'proposal' && subaction === 'check') {
        return automation.checkCompilerSceneProposal({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
            proposal: await readProposal(flags, input),
        });
    }

    if (area === 'scene' && action === 'proposal' && subaction === 'apply') {
        return automation.applyCompilerSceneProposal({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
            proposal: await readProposal(flags, input),
        });
    }

    if (area === 'node' && action === 'inspect') {
        return automation.inspectNode({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
            node: requireFlag(flags, 'node'),
        });
    }

    throw new Error(`Unknown Pixifact CLI command "${positionals.join(' ')}".`);
}

async function executeLiveCommand(positionals: string[], flags: Record<string, string | true>, bridge: LiveBridge) {
    if (!bridge.connected && bridge.waitForConnection) {
        await bridge.waitForConnection();
    }
    if (!bridge.connected) {
        throw new Error('No live Pixifact editor is connected.');
    }

    const [area, action] = positionals;
    if (area === 'summary' && action === undefined) {
        return bridge.callAction('summary', {});
    }
    if (area === 'scene' && action === 'get') {
        return bridge.callAction('scene.get', {});
    }
    if (area === 'node' && action === 'inspect') {
        return bridge.callAction('node.inspect', {
            node: requireFlag(flags, 'node'),
        });
    }

    throw new Error(`Unknown Pixifact live command "${positionals.join(' ')}".`);
}

export async function executePixifactCli(argv: string[], options: CliOptions = {}): Promise<CliResult> {
    let ownedBridge: ReturnType<typeof createLiveBridgeServer> | undefined;
    try {
        const parsed = parseArgs(argv);
        if (parsed.flags.help === true) {
            return {
                exitCode: 0,
                stdout: jsonLine({
                    commands: [
                        'compile-scenes',
                        'summary',
                        'scene create',
                        'scene get',
                        'scene inspect',
                        'scene validate',
                        'scene proposal check',
                        'scene proposal apply',
                        'node inspect',
                        'live summary',
                        'live scene get',
                        'live node inspect',
                    ],
                }),
                stderr: '',
            };
        }

        const automation = options.automation ?? createPixifactAutomation();
        const isLive = parsed.positionals[0] === 'live';
        const result = isLive
            ? await executeLiveCommand(
                parsed.positionals.slice(1),
                parsed.flags,
                options.liveBridge ?? (ownedBridge = createLiveBridgeServer()),
            )
            : await executeFileCommand(parsed.positionals, parsed.flags, automation, options.input);
        if (isFailedResult(result)) {
            return {
                exitCode: 1,
                stdout: '',
                stderr: jsonLine(result),
            };
        }
        return {
            exitCode: 0,
            stdout: jsonLine(result),
            stderr: '',
        };
    } catch (error) {
        return {
            exitCode: 1,
            stdout: '',
            stderr: jsonLine({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
                hint: hintForCommandError(error instanceof Error ? error.message : String(error)),
            }),
        };
    } finally {
        ownedBridge?.stop();
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await executePixifactCli(process.argv.slice(2));
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
}
