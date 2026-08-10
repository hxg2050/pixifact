import {
    buildMiniGameTarget,
    devMiniGameTarget,
    douyinTargetDescriptor,
    validateMiniGameTarget,
    MiniGameTargetError,
    type MiniGameBuildReport,
    type MiniGameDevEvent,
    type MiniGameDevSession,
    type MiniGameTargetDiagnostic,
} from './miniGameTarget';

export type DouyinTargetDiagnostic = MiniGameTargetDiagnostic;
export type DouyinBuildReport = MiniGameBuildReport;
export type DouyinDevEvent = MiniGameDevEvent;
export type DouyinDevSession = MiniGameDevSession;

export class DouyinTargetError extends Error {
    constructor(
        message: string,
        readonly diagnostics: DouyinTargetDiagnostic[],
    ) {
        super(message);
        this.name = 'DouyinTargetError';
    }
}

export async function validateDouyinTarget(projectRootInput: string) {
    return validateMiniGameTarget(projectRootInput, douyinTargetDescriptor);
}

export async function buildDouyinTarget(
    projectRootInput: string,
    mode: 'development' | 'production',
): Promise<DouyinBuildReport> {
    try {
        return await buildMiniGameTarget(projectRootInput, mode, douyinTargetDescriptor);
    } catch (error) {
        if (error instanceof MiniGameTargetError) {
            throw new DouyinTargetError(error.message, error.diagnostics);
        }
        throw error;
    }
}

export async function devDouyinTarget(
    projectRootInput: string,
    onEvent: (event: DouyinDevEvent) => void = () => undefined,
): Promise<DouyinDevSession> {
    try {
        return await devMiniGameTarget(projectRootInput, douyinTargetDescriptor, onEvent);
    } catch (error) {
        if (error instanceof MiniGameTargetError) {
            throw new DouyinTargetError(error.message, error.diagnostics);
        }
        throw error;
    }
}
