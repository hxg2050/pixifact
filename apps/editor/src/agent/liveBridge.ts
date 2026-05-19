export const pixifactAgentBridgePort = 8791;
export const pixifactAgentBridgePath = '/pixifact-agent';
export const pixifactAgentBridgeUrl = `ws://127.0.0.1:${pixifactAgentBridgePort}${pixifactAgentBridgePath}`;

export type LiveBridgeRole = 'editor';

export interface LiveBridgeHelloMessage {
    type: 'hello';
    role: LiveBridgeRole;
}

export interface LiveBridgeRequestMessage {
    type: 'request';
    id: string;
    action: string;
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
