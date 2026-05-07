import { describe, expect, it } from 'vitest';
import { createAiProposalRequest, createMockAiProposal, group, prefab, roundedRect, textGraphic } from '../src';
import { createMockAiResponse } from '../apps/editor/src/mock/mockAiCore.mjs';

function createMockPrefab() {
    return prefab('MockProject',
        group('Root', {
            key: 'root',
            width: 320,
            height: 180,
            components: [
                roundedRect({ color: 0x2563eb }, 'bg'),
            ],
            children: [
                group('Label', {
                    key: 'submitButtonLabel',
                    components: [
                        textGraphic({ text: 'Submit' }, 'text'),
                    ],
                }),
            ],
        }),
    );
}

describe('mock AI server core', () => {
    it('creates remote proposal responses', () => {
        const request = createAiProposalRequest('开始游戏并居中', {
            prefab: createMockPrefab(),
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
