export const pixifactRuntimeProtocolVersion = 1;

export type RuntimeJsonPrimitive = boolean | number | string | null;
export type RuntimeJsonValue = RuntimeJsonPrimitive | RuntimeJsonValue[] | {
    [key: string]: RuntimeJsonValue;
};

export type RuntimeLogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error';

export interface RuntimeLogEntry {
    seq: number;
    time: string;
    level: RuntimeLogLevel;
    message: string;
    args: RuntimeJsonValue[];
    stack?: string;
}

export type RuntimeInputRequest =
    | { type: 'input'; action: 'click' | 'move'; x: number; y: number }
    | { type: 'input'; action: 'key' | 'keydown' | 'keyup'; key: string };

export type RuntimeObservationRequest =
    | { type: 'tree' }
    | { type: 'node'; uid: number }
    | { type: 'state' }
    | { type: 'logs'; after?: number; level?: RuntimeLogLevel }
    | RuntimeInputRequest;

export type RuntimeScreenshotRequest = { type: 'screenshot' };

export type RuntimeRequest = RuntimeObservationRequest | RuntimeScreenshotRequest;

export interface RuntimeScreenshotResult {
    [key: string]: RuntimeJsonValue;
    runtimeId: string;
    width: number;
    height: number;
    dataUrl: string;
}

export interface RuntimePageDescriptor {
    runtimeId: string;
    url: string;
    title: string;
    ready: boolean;
}

export interface RuntimeHmrRequest {
    requestId: string;
    runtimeId: string;
    request: RuntimeRequest;
}

export type RuntimeHmrResponse =
    | {
        requestId: string;
        runtimeId: string;
        ok: true;
        result: RuntimeJsonValue;
    }
    | {
        requestId: string;
        runtimeId: string;
        ok: false;
        error: string;
    };
