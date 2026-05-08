const defaultTimeoutMs = 30000;

function stripCodeFence(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonText(text, source) {
    try {
        return JSON.parse(stripCodeFence(text));
    } catch (error) {
        throw new Error(`${source} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function firstChoiceContent(payload) {
    const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
    if (!choice) {
        return undefined;
    }
    return choice.message?.content ?? choice.text;
}

function firstResponseOutputText(payload) {
    if (typeof payload?.output_text === 'string') {
        return payload.output_text;
    }

    const output = Array.isArray(payload?.output) ? payload.output : [];
    for (const item of output) {
        const content = Array.isArray(item?.content) ? item.content : [];
        for (const part of content) {
            if (typeof part?.text === 'string') {
                return part.text;
            }
        }
    }

    return undefined;
}

export function normalizeModelResponse(payload) {
    if (payload && typeof payload === 'object') {
        if ('proposal' in payload || 'commands' in payload) {
            return payload;
        }

        const choiceContent = firstChoiceContent(payload);
        if (typeof choiceContent === 'string') {
            return parseJsonText(choiceContent, 'Upstream model');
        }

        const outputText = firstResponseOutputText(payload);
        if (typeof outputText === 'string') {
            return parseJsonText(outputText, 'Upstream model');
        }
    }

    throw new Error('Upstream model response must be an AiProposal, { proposal }, or JSON text content.');
}

export function createSampleProposal(request) {
    return {
        prompt: request.prompt,
        explanation: 'Gateway adapter sample response. Configure apps/editor/ai-gateway.config.local.json or PIXIFACT_AI_UPSTREAM_URL to call a real model.',
        commands: [],
        annotations: [{
            message: 'Sample adapter returned an empty proposal.',
        }],
        risks: [
            'No project changes were proposed by the sample adapter.',
        ],
    };
}

function systemPrompt() {
    return [
        'You generate Pixifact AI-first editor proposals.',
        'Return JSON only. Do not use markdown.',
        'The JSON must be an AiProposal object or { "proposal": AiProposal }.',
        'AiProposal fields: id?, prompt?, explanation?, commands, annotations?, risks?.',
        'commands must contain only valid Pixifact SceneCommand objects.',
        'The request context includes commandSchemas and commandSummary. Treat them as the allowed SceneCommand protocol.',
        'Do not claim command specs are missing when commandSummary is present.',
        'Use createNode with NodeSpec objects to create UI, and setTransform or setNodeData to edit existing UI.',
        'Authored node kinds are only container, image, text, input, and shape. Only container nodes can contain children.',
        'Use setNodeData for display data such as text.value, image.src/image.mode, input.value, and shape.color/radius.',
        'Do not expose ui.TextGraphic, ui.ImageGraphic, or ui.RoundedRectGraphic as authored components.',
        'Buttons are container templates with shape/text children plus ui.Button behavior. For ui.Button onClick, use only declared context.actions keys.',
        'Do not write files. Do not invent actions that are not declared in context.actions.',
        'If no safe change is possible, return an empty commands array with an explanation and risk.',
    ].join('\n');
}

function modelEnvFromConfig(config) {
    if (!config || typeof config !== 'object') {
        return {};
    }

    return {
        PIXIFACT_AI_UPSTREAM_URL: config.endpoint,
        PIXIFACT_AI_UPSTREAM_TOKEN: config.token,
        PIXIFACT_AI_UPSTREAM_MODEL: config.model,
        PIXIFACT_AI_UPSTREAM_TIMEOUT_MS: config.timeoutMs,
        PIXIFACT_AI_UPSTREAM_AUTH_HEADER: config.authHeader,
        PIXIFACT_AI_UPSTREAM_AUTH_PREFIX: config.authPrefix,
        PIXIFACT_AI_UPSTREAM_TEMPERATURE: config.temperature,
        PIXIFACT_AI_UPSTREAM_API: config.api,
        PIXIFACT_AI_UPSTREAM_REASONING_EFFORT: config.reasoningEffort,
        PIXIFACT_AI_UPSTREAM_SERVICE_TIER: config.serviceTier,
        PIXIFACT_AI_UPSTREAM_STORE: config.store,
    };
}

function effectiveEnv(request, env) {
    const modelEnv = Object.fromEntries(
        Object.entries(modelEnvFromConfig(request.model))
            .filter(([, value]) => value !== undefined && value !== null),
    );
    const envKey = typeof request.model?.envKey === 'string' ? request.model.envKey : undefined;
    const envToken = envKey ? env[envKey] : undefined;

    return {
        ...env,
        ...modelEnv,
        PIXIFACT_AI_UPSTREAM_TOKEN: modelEnv.PIXIFACT_AI_UPSTREAM_TOKEN || envToken || env.PIXIFACT_AI_UPSTREAM_TOKEN,
    };
}

function requestForModel(request) {
    const { model: _model, ...safeRequest } = request;
    return safeRequest;
}

function promptSuffix(env) {
    return env.PIXIFACT_AI_UPSTREAM_PROMPT_SUFFIX
        ? `\n\nAdditional instruction:\n${env.PIXIFACT_AI_UPSTREAM_PROMPT_SUFFIX}`
        : '';
}

export function createUpstreamRequestBody(request, env = process.env) {
    const model = env.PIXIFACT_AI_UPSTREAM_MODEL ?? 'pixifact-ai-editor';
    const temperature = Number(env.PIXIFACT_AI_UPSTREAM_TEMPERATURE ?? 0.2);
    const safeRequest = requestForModel(request);

    if (env.PIXIFACT_AI_UPSTREAM_API === 'responses') {
        return {
            model,
            input: `${systemPrompt()}${promptSuffix(env)}\n\nRequest JSON:\n${JSON.stringify(safeRequest)}`,
            reasoning: env.PIXIFACT_AI_UPSTREAM_REASONING_EFFORT
                ? { effort: env.PIXIFACT_AI_UPSTREAM_REASONING_EFFORT }
                : undefined,
            service_tier: env.PIXIFACT_AI_UPSTREAM_SERVICE_TIER || undefined,
            store: String(env.PIXIFACT_AI_UPSTREAM_STORE) === 'true',
            text: {
                format: {
                    type: 'json_object',
                },
            },
        };
    }

    return {
        model,
        messages: [{
            role: 'system',
            content: `${systemPrompt()}${promptSuffix(env)}`,
        }, {
            role: 'user',
            content: JSON.stringify(safeRequest),
        }],
        temperature,
        response_format: {
            type: 'json_object',
        },
    };
}

function looksLikeMissingCommandSpec(proposal) {
    const text = [
        proposal?.explanation,
        ...(Array.isArray(proposal?.risks) ? proposal.risks : []),
        ...(Array.isArray(proposal?.annotations) ? proposal.annotations.map((item) => item?.message) : []),
    ].filter(Boolean).join('\n');

    return /缺少.*命令|命令.*规范|SceneCommand.*缺少|SceneCommand.*规范|command spec|command.*missing|cannot.*command/i.test(text);
}

function createHeaders(env) {
    const headers = {
        'content-type': 'application/json',
    };

    const token = env.PIXIFACT_AI_UPSTREAM_TOKEN;
    if (token) {
        const header = env.PIXIFACT_AI_UPSTREAM_AUTH_HEADER ?? 'authorization';
        const prefix = env.PIXIFACT_AI_UPSTREAM_AUTH_PREFIX ?? 'Bearer';
        const value = prefix ? `${prefix} ${token}` : token;
        validateAsciiHeader('Model auth header', header);
        validateAsciiHeader('Model auth token', value);
        headers[header] = value;
    }

    return headers;
}

function validateAsciiHeader(label, value) {
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
        if (text.charCodeAt(index) > 255) {
            throw new Error(`${label} contains non-ASCII text. Check the gateway model auth config; token should be an API key, not an error message or Chinese text.`);
        }
    }
}

export function normalizeUpstreamUrl(url, env = process.env) {
    if (!url || env.PIXIFACT_AI_UPSTREAM_API !== 'responses') {
        return url;
    }

    const trimmed = String(url).replace(/\/+$/, '');
    return trimmed.endsWith('/v1/responses') ? trimmed : `${trimmed}/v1/responses`;
}

export async function callUpstreamModel(request, options = {}) {
    const env = effectiveEnv(request, options.env ?? process.env);
    const url = normalizeUpstreamUrl(env.PIXIFACT_AI_UPSTREAM_URL, env);
    if (!url) {
        return createSampleProposal(request);
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
        throw new Error('Gateway model adapter requires fetch.');
    }

    const timeoutMs = Number(env.PIXIFACT_AI_UPSTREAM_TIMEOUT_MS ?? defaultTimeoutMs);
    const controller = timeoutMs > 0 ? new AbortController() : undefined;
    const timeout = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;

    let response;
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: createHeaders(env),
            body: JSON.stringify(createUpstreamRequestBody(request, env)),
            signal: controller?.signal,
        });
    } catch (error) {
        if (controller?.signal.aborted) {
            throw new Error(`Upstream model timed out after ${timeoutMs}ms.`);
        }
        throw error;
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Upstream model failed with ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const proposal = normalizeModelResponse(await response.json());
    if (!options.skipCommandRetry && looksLikeMissingCommandSpec(proposal) && request?.context?.commandSummary) {
        return callUpstreamModel(request, {
            ...options,
            env: {
                ...env,
                PIXIFACT_AI_UPSTREAM_PROMPT_SUFFIX: [
                    'You previously claimed command specs were missing, but they are present in context.commandSchemas and context.commandSummary.',
                    'Generate a valid AiProposal now. Use createNode, batch, setNodeData, setComponentProp, and setTransform as needed.',
                    'For an inventory panel, create container, shape, text, image, and input nodes. Use ui.Button only as a behavior component on a button template container.',
                ].join('\n'),
            },
            skipCommandRetry: true,
        });
    }

    return proposal;
}

export async function generateProposalWithModel(request, options = {}) {
    return callUpstreamModel(request, options);
}
