import { describe, expect, it } from 'vitest';
import { createAiProposalRequest, group, prefab } from '../src';
import { createGatewayResponse } from '../apps/editor/src/gateway/gatewayCore.mjs';

function createGatewayPrefab() {
    return prefab('GatewayProject',
        group('Root', {
            key: 'root',
            width: 320,
            height: 180,
        }),
    );
}

describe('AI gateway adapter core', () => {
    it('creates protocol-compatible proposal responses', async () => {
        const request = createAiProposalRequest('rename root', {
            prefab: createGatewayPrefab(),
            selection: 'root',
        });

        const response = await createGatewayResponse(request, {
            headers: { authorization: 'Bearer local-test' },
            gatewayToken: 'local-test',
            generateProposal: async () => ({
                explanation: 'Gateway proposal.',
                commands: [{
                    op: 'setNodeProp',
                    node: 'root',
                    prop: 'name',
                    value: 'Gateway Root',
                }],
            }),
        });
        const body = JSON.parse(response.body) as { proposal?: { commands: unknown[] } };

        expect(response.status).toBe(200);
        expect(body.proposal?.commands).toHaveLength(1);
    });

    it('repairs common model command field aliases', async () => {
        const request = createAiProposalRequest('rename root', {
            prefab: createGatewayPrefab(),
            selection: 'root',
        });

        const response = await createGatewayResponse(request, {
            generateProposal: async () => ({
                explanation: 'Gateway proposal.',
                commands: [{
                    type: 'setComponentProp',
                    nodeId: 'submitButtonLabel',
                    componentId: 'text',
                    prop: 'text',
                    value: 'Start Game',
                }],
            }),
        });
        const body = JSON.parse(response.body) as { proposal?: { commands: Array<Record<string, unknown>> } };

        expect(response.status).toBe(200);
        expect(body.proposal?.commands[0]).toMatchObject({
            op: 'setComponentProp',
            node: 'submitButtonLabel',
            component: 'text',
            prop: 'text',
        });
        expect(body.proposal?.commands[0].type).toBeUndefined();
    });


    it('rejects unauthorized requests', async () => {
        const response = await createGatewayResponse(createAiProposalRequest('test', {
            prefab: createGatewayPrefab(),
        }), {
            headers: { authorization: 'Bearer wrong' },
            gatewayToken: 'local-test',
            generateProposal: async () => ({ commands: [] }),
        });
        const body = JSON.parse(response.body) as { error?: { code: string } };

        expect(response.status).toBe(401);
        expect(body.error?.code).toBe('unauthorized');
    });

    it('rejects invalid protocol payloads', async () => {
        const response = await createGatewayResponse({
            protocol: 'invalid',
            prompt: 'test',
        }, {
            generateProposal: async () => ({ commands: [] }),
        });
        const body = JSON.parse(response.body) as { error?: { code: string; details?: string[] } };

        expect(response.status).toBe(400);
        expect(body.error?.code).toBe('invalid_request');
        expect(body.error?.details?.join('\n')).toContain('protocol');
    });

    it('reports invalid model proposals', async () => {
        const response = await createGatewayResponse(createAiProposalRequest('test', {
            prefab: createGatewayPrefab(),
        }), {
            generateProposal: async () => ({
                explanation: 'Missing commands.',
            }),
        });
        const body = JSON.parse(response.body) as { error?: { code: string; message: string } };

        expect(response.status).toBe(502);
        expect(body.error?.code).toBe('invalid_proposal');
        expect(body.error?.message).toContain('commands array');
    });
});
