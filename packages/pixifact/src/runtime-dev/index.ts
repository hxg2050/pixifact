import type { Application } from 'pixi.js';
import {
    createPixifactRuntimeClient,
    type PixifactRuntimeHotContext,
    type RegisterPixiRuntimeOptions,
} from './runtimeClient';

const runtimeHotKey = Symbol.for('pixifact.runtime.hot');
const runtimeClientKey = Symbol.for('pixifact.runtime.client');
const runtimeGlobal = globalThis as { [key: symbol]: unknown };
const injectedHot = runtimeGlobal[runtimeHotKey] as
    | PixifactRuntimeHotContext
    | undefined;
const existingRuntimeClient = runtimeGlobal[runtimeClientKey] as
    | ReturnType<typeof createPixifactRuntimeClient>
    | undefined;
const runtimeClient = existingRuntimeClient ?? (injectedHot
    ? createPixifactRuntimeClient({
        runtimeId: crypto.randomUUID(),
        hot: injectedHot,
        console,
        window,
    })
    : undefined);

if (runtimeClient && !existingRuntimeClient) runtimeGlobal[runtimeClientKey] = runtimeClient;

export function registerPixiRuntime(app: Application, options: RegisterPixiRuntimeOptions = {}) {
    if (!runtimeClient) {
        throw new Error('registerPixiRuntime requires pixifactRuntimePlugin in the Vite development server.');
    }
    runtimeClient.register(app, options);
}

export type { RegisterPixiRuntimeOptions } from './runtimeClient';
export type {
    RuntimeJsonValue,
    RuntimeLogLevel,
    RuntimePageDescriptor,
    RuntimeRequest,
} from './protocol';
