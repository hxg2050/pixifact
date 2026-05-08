export const pixifactMcpBridgePort = 8791;
export const pixifactMcpBridgePath = '/pixifact-editor';
export const pixifactMcpBridgeUrl = `ws://127.0.0.1:${pixifactMcpBridgePort}${pixifactMcpBridgePath}`;

export type LiveBridgeRole = 'editor';

export interface LiveBridgeHelloMessage {
    type: 'hello';
    role: LiveBridgeRole;
}

export interface LiveBridgeRequestMessage {
    type: 'request';
    id: string;
    tool: string;
    arguments: unknown;
}

export interface LiveBridgeResponseMessage {
    type: 'response';
    id: string;
    ok: boolean;
    result?: unknown;
    error?: string;
}

export type LiveBridgeClientMessage = LiveBridgeHelloMessage | LiveBridgeResponseMessage;
export type LiveBridgeServerMessage = LiveBridgeRequestMessage;
