import fs from 'node:fs/promises';
import { createPixifactAutomation } from './automation';
import { hintForCommandError } from 'pixifact';
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

const commandActions = {
    'dry-run': 'commands.dryRun',
    apply: 'commands.apply',
    validate: 'commands.validate',
} as const;

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

async function readCommands(flags: Record<string, string | true>, input: string | NodeJS.ReadableStream | undefined) {
    const commandsPath = requireFlag(flags, 'commands');
    const text = commandsPath === '-'
        ? await readInput(input)
        : await fs.readFile(commandsPath, 'utf8');
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

async function executeFileCommand(positionals: string[], flags: Record<string, string | true>, automation: Automation, input: string | NodeJS.ReadableStream | undefined) {
    const [area, action] = positionals;

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

    if (area === 'node' && action === 'inspect') {
        return automation.inspectNode({
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
            node: requireFlag(flags, 'node'),
        });
    }

    if (area === 'commands' && action in commandActions) {
        const commands = await readCommands(flags, input);
        const args = {
            projectRoot: requireFlag(flags, 'project-root'),
            scenePath: requireFlag(flags, 'scene'),
            commands,
        };
        if (action === 'dry-run') {
            return automation.dryRunCommands(args);
        }
        if (action === 'apply') {
            return automation.applyCommands(args);
        }
        return automation.validateCommands(args);
    }

    throw new Error(`Unknown Pixifact CLI command "${positionals.join(' ')}".`);
}

async function executeLiveCommand(positionals: string[], flags: Record<string, string | true>, bridge: LiveBridge, input: string | NodeJS.ReadableStream | undefined) {
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
    if (area === 'commands' && action in commandActions) {
        return bridge.callAction(commandActions[action as keyof typeof commandActions], {
            commands: await readCommands(flags, input),
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
                        'summary',
                        'scene get',
                        'node inspect',
                        'commands dry-run',
                        'commands apply',
                        'commands validate',
                        'live scene get',
                        'live commands apply',
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
                options.input,
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
