import { describe, expect, it } from 'vitest';
import { loadGatewayConfig, modelEnvFromGatewayConfig } from '../apps/editor/src/gateway/config.mjs';

describe('AI gateway config', () => {
    it('loads local defaults and resolves upstream token from env', () => {
        const config = loadGatewayConfig({
            PIXIFACT_AI_GATEWAY_CONFIG: 'apps/editor/does-not-exist.local.json',
            OPENAI_API_KEY: 'env-key',
        });

        expect(config.port).toBe(8788);
        expect(config.host).toBe('127.0.0.1');
        expect(config.upstreamToken).toBe('env-key');
    });

    it('maps gateway config to model adapter env names', () => {
        const env = modelEnvFromGatewayConfig({
            upstreamApi: 'responses',
            upstreamUrl: 'https://model.example.test',
            upstreamToken: 'secret',
            upstreamModel: 'gpt-5.5',
            upstreamTimeoutMs: 300000,
            upstreamReasoningEffort: 'medium',
            upstreamServiceTier: 'fast',
            upstreamStore: false,
        });

        expect(env).toMatchObject({
            PIXIFACT_AI_UPSTREAM_API: 'responses',
            PIXIFACT_AI_UPSTREAM_URL: 'https://model.example.test',
            PIXIFACT_AI_UPSTREAM_TOKEN: 'secret',
            PIXIFACT_AI_UPSTREAM_MODEL: 'gpt-5.5',
            PIXIFACT_AI_UPSTREAM_TIMEOUT_MS: 300000,
            PIXIFACT_AI_UPSTREAM_REASONING_EFFORT: 'medium',
            PIXIFACT_AI_UPSTREAM_SERVICE_TIER: 'fast',
            PIXIFACT_AI_UPSTREAM_STORE: false,
        });
    });
});
