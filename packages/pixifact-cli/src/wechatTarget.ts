import {
    buildMiniGameTarget,
    devMiniGameTarget,
    validateMiniGameTarget,
    wechatTargetDescriptor,
    MiniGameTargetError,
    type MiniGameBuildReport,
    type MiniGameDevEvent,
    type MiniGameDevSession,
    type MiniGameTargetDiagnostic,
} from './miniGameTarget';

export type WechatTargetDiagnostic = MiniGameTargetDiagnostic;
export type WechatBuildReport = MiniGameBuildReport;
export type WechatDevEvent = MiniGameDevEvent;
export type WechatDevSession = MiniGameDevSession;

export class WechatTargetError extends Error {
    constructor(
        message: string,
        readonly diagnostics: WechatTargetDiagnostic[],
    ) {
        super(message);
        this.name = 'WechatTargetError';
    }
}

export async function validateWechatTarget(projectRootInput: string) {
    return validateMiniGameTarget(projectRootInput, wechatTargetDescriptor);
}

export async function buildWechatTarget(
    projectRootInput: string,
    mode: 'development' | 'production',
): Promise<WechatBuildReport> {
    try {
        return await buildMiniGameTarget(projectRootInput, mode, wechatTargetDescriptor);
    } catch (error) {
        if (error instanceof MiniGameTargetError) {
            throw new WechatTargetError(error.message, error.diagnostics);
        }
        throw error;
    }
}

export async function devWechatTarget(
    projectRootInput: string,
    onEvent: (event: WechatDevEvent) => void = () => undefined,
): Promise<WechatDevSession> {
    try {
        return await devMiniGameTarget(projectRootInput, wechatTargetDescriptor, onEvent);
    } catch (error) {
        if (error instanceof MiniGameTargetError) {
            throw new WechatTargetError(error.message, error.diagnostics);
        }
        throw error;
    }
}
