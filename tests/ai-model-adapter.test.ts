import { describe, expect, it } from 'vitest';
import { createAiProposalRequest, group, prefab } from '../src';
import {
    callUpstreamModel,
    createUpstreamRequestBody,
    normalizeUpstreamUrl,
    normalizeModelResponse,
} from '../apps/editor/src/gateway/modelAdapter.mjs';

function createModelRequest() {
    return createAiProposalRequest('rename root', {
        prefab: prefab('ModelProject',
            group('Root', {
                key: 'root',
                width: 320,
                height: 180,
            }),
        ),
        selection: 'root',
    });
}

describe('AI gateway model adapter', () => {
    it('falls back to a sample proposal when no upstream URL is configured', async () => {
        const proposal = await callUpstreamModel(createModelRequest(), {
            env: {},
        });

        expect(proposal.commands).toEqual([]);
        expect(proposal.explanation).toContain('Model endpoint');
    });

    it('creates OpenAI-compatible upstream request bodies', () => {
        const body = createUpstreamRequestBody(createModelRequest(), {
            PIXIF_AI_UPSTREAM_MODEL: 'test-model',
            PIXIF_AI_UPSTREAM_TEMPERATURE: '0.1',
        });

        expect(body.model).toBe('test-model');
        expect(body.temperature).toBe(0.1);
        expect(body.response_format.type).toBe('json_object');
        expect(body.messages[0].role).toBe('system');
        expect(body.messages[1].content).toContain('pixif.aiProposal.v1');
    });

    it('creates OpenAI Responses API request bodies', () => {
        const body = createUpstreamRequestBody(createModelRequest(), {
            PIXIF_AI_UPSTREAM_API: 'responses',
            PIXIF_AI_UPSTREAM_MODEL: 'gpt-5.5',
            PIXIF_AI_UPSTREAM_REASONING_EFFORT: 'xhigh',
            PIXIF_AI_UPSTREAM_SERVICE_TIER: 'fast',
            PIXIF_AI_UPSTREAM_STORE: 'false',
            PIXIF_AI_UPSTREAM_TEMPERATURE: '0.2',
        });

        expect(body.model).toBe('gpt-5.5');
        expect(body.input).toContain('You generate Pixif AI-first editor proposals.');
        expect(body.input).toContain('pixif.aiProposal.v1');
        expect(body.input).toContain('commandSummary');
        expect(body.input).toContain('createNode');
        expect(body.input).toContain('Do not claim command specs are missing');
        expect(body.reasoning.effort).toBe('xhigh');
        expect(body.service_tier).toBe('fast');
        expect(body.store).toBe(false);
        expect(body.temperature).toBeUndefined();
        expect(body.text.format.type).toBe('json_object');
    });

    it('normalizes Responses base URLs to the responses endpoint', () => {
        expect(normalizeUpstreamUrl('https://code.ylsagi.com/codex', {
            PIXIF_AI_UPSTREAM_API: 'responses',
        })).toBe('https://code.ylsagi.com/codex/v1/responses');
        expect(normalizeUpstreamUrl('https://code.ylsagi.com/codex/', {
            PIXIF_AI_UPSTREAM_API: 'responses',
        })).toBe('https://code.ylsagi.com/codex/v1/responses');
        expect(normalizeUpstreamUrl('https://code.ylsagi.com/codex/v1/responses', {
            PIXIF_AI_UPSTREAM_API: 'responses',
        })).toBe('https://code.ylsagi.com/codex/v1/responses');
        expect(normalizeUpstreamUrl('https://model.example.test/chat/completions', {
            PIXIF_AI_UPSTREAM_API: 'chatCompletions',
        })).toBe('https://model.example.test/chat/completions');
    });

    it('calls Responses base URLs through the normalized endpoint', async () => {
        const calls: string[] = [];
        await callUpstreamModel({
            ...createModelRequest(),
            model: {
                api: 'responses',
                endpoint: 'https://code.ylsagi.com/codex',
                token: 'secret',
                model: 'gpt-5.5',
            },
        }, {
            env: {},
            fetch: async (url) => {
                calls.push(String(url));
                return new Response(JSON.stringify({
                    output_text: JSON.stringify({
                        explanation: 'normalized ok.',
                        commands: [],
                    }),
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            },
        });

        expect(calls[0]).toBe('https://code.ylsagi.com/codex/v1/responses');
    });

    it('normalizes OpenAI-compatible JSON message content', () => {
        const proposal = normalizeModelResponse({
            choices: [{
                message: {
                    content: JSON.stringify({
                        proposal: {
                            explanation: 'Model proposal.',
                            commands: [{
                                op: 'setNodeProp',
                                node: 'root',
                                prop: 'name',
                                value: 'Model Root',
                            }],
                        },
                    }),
                },
            }],
        }) as { proposal: { commands: unknown[] } };

        expect(proposal.proposal.commands).toHaveLength(1);
    });

    it('normalizes Responses API output content text', () => {
        const proposal = normalizeModelResponse({
            output: [{
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'output_text',
                    text: JSON.stringify({
                        explanation: 'Responses proposal.',
                        commands: [],
                    }),
                }],
            }],
        }) as { commands: unknown[] };

        expect(proposal.commands).toEqual([]);
    });

    it('calls configured upstream models with auth headers', async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const result = await callUpstreamModel(createModelRequest(), {
            env: {
                PIXIF_AI_UPSTREAM_URL: 'https://model.example.test/chat/completions',
                PIXIF_AI_UPSTREAM_TOKEN: 'secret',
                PIXIF_AI_UPSTREAM_MODEL: 'model-x',
            },
            fetch: async (url, init) => {
                calls.push({ url: String(url), init });
                return new Response(JSON.stringify({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                explanation: 'Upstream ok.',
                                commands: [],
                            }),
                        },
                    }],
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            },
        });

        expect(result.commands).toEqual([]);
        expect(calls[0].url).toBe('https://model.example.test/chat/completions');
        expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer secret');
        expect(String(calls[0].init?.body)).toContain('model-x');
    });

    it('uses per-request model config without forwarding model secrets to the model prompt', async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const request = {
            ...createModelRequest(),
            model: {
                api: 'responses',
                endpoint: 'https://model.example.test/from-ui',
                token: 'ui-secret',
                envKey: 'OPENAI_API_KEY',
                model: 'ui-model',
                timeoutMs: 30000,
                authHeader: 'x-api-key',
                authPrefix: '',
                temperature: 0.4,
                reasoningEffort: 'xhigh',
                serviceTier: 'fast',
                store: false,
            },
        };

        await callUpstreamModel(request, {
            env: {
                PIXIF_AI_UPSTREAM_URL: 'https://model.example.test/from-env',
                PIXIF_AI_UPSTREAM_TOKEN: 'env-secret',
                PIXIF_AI_UPSTREAM_MODEL: 'env-model',
            },
            fetch: async (url, init) => {
                calls.push({ url: String(url), init });
                return new Response(JSON.stringify({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                explanation: 'UI config ok.',
                                commands: [],
                            }),
                        },
                    }],
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            },
        });

        const body = JSON.parse(String(calls[0].init?.body)) as {
            model: string;
            temperature?: number;
            input: string;
            reasoning: { effort: string };
            service_tier: string;
            store: boolean;
        };

        expect(calls[0].url).toBe('https://model.example.test/from-ui/v1/responses');
        expect((calls[0].init?.headers as Record<string, string>)['x-api-key']).toBe('ui-secret');
        expect(body.model).toBe('ui-model');
        expect(body.temperature).toBeUndefined();
        expect(body.reasoning.effort).toBe('xhigh');
        expect(body.service_tier).toBe('fast');
        expect(body.store).toBe(false);
        expect(body.input).not.toContain('ui-secret');
        expect(body.input).not.toContain('from-ui');
    });

    it('can resolve per-request model tokens from envKey', async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        await callUpstreamModel({
            ...createModelRequest(),
            model: {
                api: 'responses',
                endpoint: 'https://model.example.test/from-ui',
                envKey: 'OPENAI_API_KEY',
                model: 'gpt-5.5',
            },
        }, {
            env: {
                OPENAI_API_KEY: 'env-key-secret',
            },
            fetch: async (url, init) => {
                calls.push({ url: String(url), init });
                return new Response(JSON.stringify({
                    output_text: JSON.stringify({
                        explanation: 'envKey ok.',
                        commands: [],
                    }),
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            },
        });

        expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer env-key-secret');
    });

    it('retries when the model incorrectly claims command specs are missing', async () => {
        const calls: Array<{ body: string }> = [];
        const result = await callUpstreamModel({
            ...createModelRequest(),
            model: {
                api: 'responses',
                endpoint: 'https://model.example.test/from-ui',
                token: 'secret',
                model: 'gpt-5.5',
            },
        }, {
            env: {},
            fetch: async (_url, init) => {
                calls.push({ body: String(init?.body) });
                const content = calls.length === 1
                    ? {
                        explanation: '缺少可用的 EditorCommand 规范。',
                        commands: [],
                    }
                    : {
                        explanation: 'Created command after retry.',
                        commands: [{
                            op: 'setNodeProp',
                            node: 'root',
                            prop: 'name',
                            value: 'Retried',
                        }],
                    };
                return new Response(JSON.stringify({
                    output_text: JSON.stringify(content),
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            },
        });

        expect(calls).toHaveLength(2);
        expect(calls[1].body).toContain('You previously claimed command specs were missing');
        expect(result.commands).toHaveLength(1);
    });

    it('reports non-ASCII model auth headers before fetch', async () => {
        await expect(callUpstreamModel({
            ...createModelRequest(),
            model: {
                api: 'responses',
                endpoint: 'https://model.example.test/from-ui',
                token: '请求的接口不存在',
                model: 'gpt-5.5',
            },
        }, {
            env: {},
            fetch: async () => new Response('{}'),
        })).rejects.toThrow('Model auth token contains non-ASCII text');
    });

    it('reports upstream model errors', async () => {
        await expect(callUpstreamModel(createModelRequest(), {
            env: {
                PIXIF_AI_UPSTREAM_URL: 'https://model.example.test/chat/completions',
            },
            fetch: async () => new Response('bad upstream', { status: 502 }),
        })).rejects.toThrow('Upstream model failed with 502');
    });

    it('times out upstream model calls', async () => {
        await expect(callUpstreamModel(createModelRequest(), {
            env: {
                PIXIF_AI_UPSTREAM_URL: 'https://model.example.test/chat/completions',
                PIXIF_AI_UPSTREAM_TIMEOUT_MS: '1',
            },
            fetch: (_url, init) => new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    reject(new DOMException('Aborted', 'AbortError'));
                });
            }),
        })).rejects.toThrow('Upstream model timed out after 1ms');
    });
});
