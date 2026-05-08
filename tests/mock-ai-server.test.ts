import { describe, expect, it } from 'vitest';
import { container, createAiProposalRequest, createMockAiProposal, scene, shape, text } from 'pixifact';
import { createMockAiResponse } from '../apps/editor/src/mock/mockAiCore.mjs';

function createMockScene() {
    return scene('MockProject',
        container('Root', {
            key: 'root',
            width: 320,
            height: 180,
            children: [
                shape('背景', {
                    key: 'bg',
                    color: 0x2563eb,
                }),
                text('Label', {
                    key: 'submitButtonLabel',
                    value: 'Submit',
                }),
            ],
        }),
    );
}

describe('mock AI server core', () => {
    it('creates remote proposal responses', () => {
        const request = createAiProposalRequest('开始游戏并居中', {
            scene: createMockScene(),
            selection: 'root',
            actions: [{ key: 'submitLogin' }],
        });

        const response = createMockAiResponse(request, createMockAiProposal);
        const body = JSON.parse(response.body) as { proposal?: { explanation: string; commands: unknown[] } };

        expect(response.status).toBe(200);
        expect(body.proposal?.explanation).toContain('MockAiServer');
        expect(body.proposal?.commands.length).toBeGreaterThan(0);
    });

    it('rejects invalid protocol payloads', () => {
        const response = createMockAiResponse({
            protocol: 'invalid',
            prompt: 'test',
        }, createMockAiProposal);
        const body = JSON.parse(response.body) as { error?: string };

        expect(response.status).toBe(400);
        expect(body.error).toContain('protocol');
    });
});
