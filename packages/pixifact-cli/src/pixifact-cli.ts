#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { createPixifactAutomation } from './automation';
import { hintForCommandError } from 'pixifact';
import { CompileSceneError, compileScenes } from 'pixifact/compiler-node';
import type { SceneValidationDiagnostic } from 'pixifact/compiler';
import { startEditorServer } from './editorServer';
import { captureEditorScreenshot, queryEditorContext } from './editorSession';
import { queryRuntime, queryRuntimeList } from './runtimeSession';
import type { RuntimeLogLevel, RuntimeRequest } from 'pixifact/runtime-dev';
import {
    buildWechatTarget,
    devWechatTarget,
    validateWechatTarget,
    type WechatDevEvent,
    WechatTargetError,
} from './wechatTarget';

type Automation = ReturnType<typeof createPixifactAutomation>;

interface CliOptions {
    automation?: Automation;
    captureEditorScreenshot?: typeof captureEditorScreenshot;
    onWechatDevEvent?: (event: WechatDevEvent) => void;
    readEditorContext?: typeof queryEditorContext;
    listRuntimes?: typeof queryRuntimeList;
    queryRuntime?: typeof queryRuntime;
    startEditor?: typeof startEditorServer;
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
        if (name === 'help' || name === 'all') {
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

function projectRootFlag(flags: Record<string, string | true>) {
    const value = flags['project-root'];
    if (value === undefined) {
        return process.cwd();
    }
    return requireFlag(flags, 'project-root');
}

function optionalFlag(flags: Record<string, string | true>, name: string) {
    const value = flags[name];
    return value === undefined ? undefined : requireFlag(flags, name);
}

function finiteNumberFlag(flags: Record<string, string | true>, name: string) {
    const value = Number(requireFlag(flags, name));
    if (!Number.isFinite(value)) throw new Error(`--${name} must be a finite number.`);
    return value;
}

function nonNegativeInteger(value: string | undefined, error: string) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) throw new Error(error);
    return number;
}

function jsonLine(value: unknown) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function isFailedResult(value: unknown): value is CliJsonResult {
    return typeof value === 'object'
        && value !== null
        && (value as CliJsonResult).ok === false;
}

function isRuntimeTreeResult(value: unknown): value is { runtimeId: string; root: unknown } {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { runtimeId?: unknown }).runtimeId === 'string'
        && 'root' in value;
}

function compileScenesFailure(error: unknown): CliJsonResult {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof CompileSceneError) {
        if (error.diagnostics) {
            return {
                ok: false,
                scene: error.scene,
                error: 'Scene compile failed.',
                diagnostics: error.diagnostics,
                hint: 'Fix the listed diagnostics, then run compile-scenes again.',
            };
        }
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
            } satisfies SceneValidationDiagnostic],
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
            } satisfies SceneValidationDiagnostic],
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
            } satisfies SceneValidationDiagnostic],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        };
    }
    const missingPart = message.match(/^Scene "([^"]+)" @part "([^"]+)" references missing node id "([^"]+)"\.$/);
    if (missingPart) {
        const [, scene, property, id] = missingPart;
        return {
            ok: false,
            scene,
            error: 'Scene compile failed.',
            diagnostics: [{
                path: '__scene__',
                prop: `@part ${property}`,
                expected: `node id "${id}"`,
                actual: 'missing node',
                hint: 'Add a node with this id to the .scene file or update @part({ id }).',
            } satisfies SceneValidationDiagnostic],
            hint: 'Fix the listed diagnostics, then run compile-scenes again.',
        };
    }
    return {
        ok: false,
        error: message,
        hint: hintForCommandError(message),
    };
}

function sourceDiagnosticFromMessage(source: string, message: string): SceneValidationDiagnostic | undefined {
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

async function executeFileCommand(
    positionals: string[],
    flags: Record<string, string | true>,
    automation: Automation,
    onWechatDevEvent?: (event: WechatDevEvent) => void,
    startEditor: typeof startEditorServer = startEditorServer,
    readEditorContext: typeof queryEditorContext = queryEditorContext,
    captureScreenshot: typeof captureEditorScreenshot = captureEditorScreenshot,
    listRuntimes: typeof queryRuntimeList = queryRuntimeList,
    sendRuntimeRequest: typeof queryRuntime = queryRuntime,
) {
    const [area, action] = positionals;
    const projectRoot = projectRootFlag(flags);

    if (area === 'runtime' && action === 'list') {
        return listRuntimes({ projectRoot });
    }

    if (area === 'runtime' && action !== undefined) {
        const runtimeId = optionalFlag(flags, 'runtime');
        let request: RuntimeRequest;
        if (action === 'tree') {
            request = { type: 'tree' };
        } else if (action === 'node') {
            request = {
                type: 'node',
                uid: nonNegativeInteger(
                    positionals[2],
                    'Runtime node uid must be a non-negative integer.',
                ),
            };
        } else if (action === 'state') {
            request = { type: 'state' };
        } else if (action === 'logs') {
            const after = flags.after === undefined
                ? undefined
                : nonNegativeInteger(requireFlag(flags, 'after'), '--after must be a non-negative integer.');
            const level = optionalFlag(flags, 'level');
            if (level && !['debug', 'log', 'info', 'warn', 'error'].includes(level)) {
                throw new Error('--level must be debug, log, info, warn, or error.');
            }
            request = {
                type: 'logs',
                ...(after === undefined ? {} : { after }),
                ...(level === undefined ? {} : { level: level as RuntimeLogLevel }),
            };
        } else if (action === 'input') {
            const inputAction = positionals[2];
            if (inputAction === 'click' || inputAction === 'move') {
                request = {
                    type: 'input',
                    action: inputAction,
                    x: finiteNumberFlag(flags, 'x'),
                    y: finiteNumberFlag(flags, 'y'),
                };
            } else if (inputAction === 'key' || inputAction === 'keydown' || inputAction === 'keyup') {
                const key = positionals[3];
                if (!key) throw new Error(`runtime input ${inputAction} requires a key.`);
                request = { type: 'input', action: inputAction, key };
            } else {
                throw new Error(`Unknown Pixifact Runtime input "${inputAction ?? ''}".`);
            }
        } else {
            throw new Error(`Unknown Pixifact CLI command "${positionals.join(' ')}".`);
        }
        const result = await sendRuntimeRequest({ projectRoot, runtimeId, request });
        if (action !== 'tree' || flags.output === undefined || isFailedResult(result)) {
            return result;
        }
        if (!isRuntimeTreeResult(result)) {
            throw new Error('Pixifact Runtime returned an invalid tree response.');
        }
        const output = path.resolve(requireFlag(flags, 'output'));
        const capturedAt = new Date().toISOString();
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, jsonLine({
            schemaVersion: 1,
            capturedAt,
            runtimeId: result.runtimeId,
            root: result.root,
        }), 'utf8');
        return {
            ok: true,
            output,
            runtimeId: result.runtimeId,
            capturedAt,
        };
    }

    if (area === 'editor' && action === undefined) {
        const session = await startEditor({ projectRoot });
        return {
            ok: true,
            projectRoot,
            url: session.url,
        };
    }

    if (area === 'editor' && action === 'context') {
        return readEditorContext({ projectRoot });
    }

    if (area === 'editor' && action === 'screenshot') {
        const output = path.resolve(requireFlag(flags, 'output'));
        const screenshot = await captureScreenshot({ projectRoot });
        if (!screenshot.ok) return screenshot;
        fs.writeFileSync(output, screenshot.data);
        return {
            ok: true,
            scene: screenshot.scene,
            revision: screenshot.revision,
            width: screenshot.width,
            height: screenshot.height,
            bytes: screenshot.data.byteLength,
            output,
        };
    }

    if ((area === 'build' || area === 'dev' || area === 'validate') && action === undefined) {
        const target = requireFlag(flags, 'target');
        if (target !== 'wechat') {
            throw new Error(`Unknown Pixifact target "${target}".`);
        }
        if (area === 'validate') {
            const result = await validateWechatTarget(projectRoot);
            return result.diagnostics.length > 0
                ? {
                    ok: false,
                    target,
                    diagnostics: result.diagnostics,
                    hint: 'Fix the listed WeChat target diagnostics, then validate again.',
                }
                : { ok: true, projectRoot, target };
        }
        if (area === 'dev') {
            if (flags.mode !== undefined) {
                throw new Error('dev --target wechat always uses development mode; remove --mode.');
            }
            try {
                const session = await devWechatTarget(projectRoot, onWechatDevEvent);
                return {
                    ok: true,
                    projectRoot,
                    target,
                    mode: 'development',
                    watching: true,
                    report: session.initialReport,
                };
            } catch (error) {
                if (error instanceof WechatTargetError) {
                    return {
                        ok: false,
                        target,
                        error: error.message,
                        diagnostics: error.diagnostics,
                        hint: 'Fix the listed WeChat target diagnostics, then start dev again.',
                    };
                }
                throw error;
            }
        }
        const mode = flags.mode === undefined ? 'production' : requireFlag(flags, 'mode');
        if (mode !== 'development' && mode !== 'production') {
            throw new Error('--mode must be development or production.');
        }
        try {
            return {
                ok: true,
                projectRoot,
                target,
                mode,
                report: await buildWechatTarget(projectRoot, mode),
            };
        } catch (error) {
            if (error instanceof WechatTargetError) {
                return {
                    ok: false,
                    target,
                    error: error.message,
                    diagnostics: error.diagnostics,
                    hint: 'Fix the listed WeChat target diagnostics, then build again.',
                };
            }
            throw error;
        }
    }

    if (area === 'compile-scenes' && action === undefined) {
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
            projectRoot,
        });
    }

    if (area === 'scene' && action === 'create') {
        return automation.createScene({
            projectRoot,
            scenePath: requireFlag(flags, 'scene'),
            name: requireFlag(flags, 'name'),
        });
    }

    if (area === 'scene' && action === 'inspect') {
        return automation.inspectCompilerScene({
            projectRoot,
            scenePath: requireFlag(flags, 'scene'),
        });
    }

    if (area === 'scene' && action === 'validate') {
        if (flags.all === true) {
            if (typeof flags.scene === 'string') {
                throw new Error('Use either --all or --scene, not both.');
            }
            return automation.validateAllCompilerScenes({
                projectRoot,
            });
        }
        return automation.validateCompilerScene({
            projectRoot,
            scenePath: requireFlag(flags, 'scene'),
        });
    }

    if (area === 'node' && action === 'inspect') {
        return automation.inspectNode({
            projectRoot,
            scenePath: requireFlag(flags, 'scene'),
            node: requireFlag(flags, 'node'),
        });
    }

    throw new Error(`Unknown Pixifact CLI command "${positionals.join(' ')}".`);
}

export async function executePixifactCli(argv: string[], options: CliOptions = {}): Promise<CliResult> {
    try {
        const parsed = parseArgs(argv);
        if (parsed.flags.help === true) {
            return {
                exitCode: 0,
                stdout: jsonLine({
                    aiPrimaryCommands: [
                        'summary',
                        'scene inspect --scene <scene-path>',
                        'scene validate --scene <scene-path>',
                        'compile-scenes',
                        'validate --target wechat',
                        'build --target wechat',
                        'dev --target wechat',
                    ],
                    aiValidationAlternatives: [
                        'scene validate --all',
                    ],
                    runtimeCommands: [
                        'runtime list',
                        'runtime tree [--output <json-path>] [--runtime <runtime-id>]',
                        'runtime node <pixi-uid> [--runtime <runtime-id>]',
                        'runtime state [--runtime <runtime-id>]',
                        'runtime logs [--after <seq>] [--level <level>] [--runtime <runtime-id>]',
                        'runtime input click --x <x> --y <y> [--runtime <runtime-id>]',
                        'runtime input move --x <x> --y <y> [--runtime <runtime-id>]',
                        'runtime input key <key> [--runtime <runtime-id>]',
                        'runtime input keydown <key> [--runtime <runtime-id>]',
                        'runtime input keyup <key> [--runtime <runtime-id>]',
                    ],
                    auxiliaryCommands: [
                        'editor',
                        'editor context',
                        'editor screenshot --output <png-path>',
                        'scene create --scene <scene-path> --name <SceneName>',
                        'node inspect --scene <scene-path> --node <locator>',
                    ],
                    nodeLocatorSource: 'scene inspect --scene <scene-path> returns node locator values',
                    defaults: {
                        projectRoot: 'current working directory',
                    },
                }),
                stderr: '',
            };
        }

        const automation = options.automation ?? createPixifactAutomation();
        const result = await executeFileCommand(
            parsed.positionals,
            parsed.flags,
            automation,
            options.onWechatDevEvent,
            options.startEditor,
            options.readEditorContext,
            options.captureEditorScreenshot,
            options.listRuntimes,
            options.queryRuntime,
        );
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
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await executePixifactCli(process.argv.slice(2), {
        onWechatDevEvent: (event) => process.stdout.write(jsonLine(event)),
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exitCode = result.exitCode;
}
