export const gatewayErrorCodes = {
    invalidRequest: 'invalid_request',
    unauthorized: 'unauthorized',
    upstreamFailed: 'upstream_failed',
    invalidProposal: 'invalid_proposal',
    gatewayMisconfigured: 'gateway_misconfigured',
};

export function json(status, body) {
    return {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
    };
}

function error(status, code, message, details) {
    return json(status, {
        error: {
            code,
            message,
            details,
        },
    });
}

function headerValue(headers, name) {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers ?? {})) {
        if (key.toLowerCase() === lowerName) {
            return Array.isArray(value) ? value.join(', ') : value;
        }
    }
    return undefined;
}

function isAuthorized(headers, gatewayToken) {
    if (!gatewayToken) {
        return true;
    }

    const authorization = headerValue(headers, 'authorization');
    return authorization === `Bearer ${gatewayToken}`;
}

export function validateGatewayPayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
        return ['请求体必须是 JSON 对象。'];
    }

    if (payload.protocol !== 'pixifact.aiProposal.v1') {
        errors.push('protocol 必须是 pixifact.aiProposal.v1。');
    }

    if (typeof payload.prompt !== 'string') {
        errors.push('prompt 必须是字符串。');
    }

    if (!payload.context || typeof payload.context !== 'object') {
        errors.push('context 必须是对象。');
    } else if (!payload.context.scene || typeof payload.context.scene !== 'object') {
        errors.push('context.scene 不能为空。');
    }

    return errors;
}

function normalizeProposal(prompt, value) {
    const candidate = value && typeof value === 'object' && 'proposal' in value
        ? value.proposal
        : value;

    if (!candidate || typeof candidate !== 'object') {
        throw new Error('Gateway adapter must return an AiProposal object or { proposal }.');
    }

    if (!Array.isArray(candidate.commands)) {
        throw new Error('Gateway adapter proposal must include a commands array.');
    }

    return {
        id: candidate.id ?? `proposal-${Date.now()}`,
        prompt: candidate.prompt ?? prompt,
        explanation: candidate.explanation ?? '',
        commands: candidate.commands,
        annotations: Array.isArray(candidate.annotations) ? candidate.annotations : [],
        risks: Array.isArray(candidate.risks) ? candidate.risks : [],
    };
}

export async function createGatewayResponse(payload, options = {}) {
    const {
        headers,
        gatewayToken,
        generateProposal,
    } = options;

    if (!isAuthorized(headers, gatewayToken)) {
        return error(401, gatewayErrorCodes.unauthorized, 'Remote gateway authorization failed.');
    }

    if (typeof generateProposal !== 'function') {
        return error(500, gatewayErrorCodes.gatewayMisconfigured, 'Gateway adapter 未配置。');
    }

    const validationErrors = validateGatewayPayload(payload);
    if (validationErrors.length > 0) {
        return error(400, gatewayErrorCodes.invalidRequest, '请求不符合 pixifact.aiProposal.v1。', validationErrors);
    }

    try {
        const proposal = normalizeProposal(
            payload.prompt,
            await generateProposal(payload),
        );
        return json(200, { proposal });
    } catch (adapterError) {
        const message = adapterError instanceof Error ? adapterError.message : String(adapterError);
        const code = message.includes('commands array') || message.includes('AiProposal')
            ? gatewayErrorCodes.invalidProposal
            : gatewayErrorCodes.upstreamFailed;
        return error(502, code, message);
    }
}
