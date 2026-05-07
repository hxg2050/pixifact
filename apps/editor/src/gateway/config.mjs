import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const defaultConfigPath = 'apps/editor/ai-gateway.config.local.json';

function readConfigFile(path) {
    const resolved = resolve(process.cwd(), path);
    if (!existsSync(resolved)) {
        return {};
    }

    return JSON.parse(readFileSync(resolved, 'utf8'));
}

function firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
}

export function loadGatewayConfig(env = process.env) {
    const fileConfig = readConfigFile(env.PIXIFACT_AI_GATEWAY_CONFIG ?? defaultConfigPath);

    return {
        port: Number(firstDefined(env.PORT, fileConfig.port, 8788)),
        host: firstDefined(env.HOST, fileConfig.host, '127.0.0.1'),
        gatewayToken: firstDefined(env.PIXIFACT_AI_GATEWAY_TOKEN, fileConfig.gatewayToken),
        upstreamUrl: firstDefined(env.PIXIFACT_AI_UPSTREAM_URL, fileConfig.upstreamUrl),
        upstreamToken: firstDefined(env.PIXIFACT_AI_UPSTREAM_TOKEN, fileConfig.upstreamToken, env.OPENAI_API_KEY),
        upstreamModel: firstDefined(env.PIXIFACT_AI_UPSTREAM_MODEL, fileConfig.upstreamModel),
        upstreamTimeoutMs: firstDefined(env.PIXIFACT_AI_UPSTREAM_TIMEOUT_MS, fileConfig.upstreamTimeoutMs),
        upstreamAuthHeader: firstDefined(env.PIXIFACT_AI_UPSTREAM_AUTH_HEADER, fileConfig.upstreamAuthHeader),
        upstreamAuthPrefix: firstDefined(env.PIXIFACT_AI_UPSTREAM_AUTH_PREFIX, fileConfig.upstreamAuthPrefix),
        upstreamTemperature: firstDefined(env.PIXIFACT_AI_UPSTREAM_TEMPERATURE, fileConfig.upstreamTemperature),
        upstreamApi: firstDefined(env.PIXIFACT_AI_UPSTREAM_API, fileConfig.upstreamApi),
        upstreamReasoningEffort: firstDefined(env.PIXIFACT_AI_UPSTREAM_REASONING_EFFORT, fileConfig.upstreamReasoningEffort),
        upstreamServiceTier: firstDefined(env.PIXIFACT_AI_UPSTREAM_SERVICE_TIER, fileConfig.upstreamServiceTier),
        upstreamStore: firstDefined(env.PIXIFACT_AI_UPSTREAM_STORE, fileConfig.upstreamStore),
    };
}

export function modelEnvFromGatewayConfig(config) {
    return {
        PIXIFACT_AI_UPSTREAM_URL: config.upstreamUrl,
        PIXIFACT_AI_UPSTREAM_TOKEN: config.upstreamToken,
        PIXIFACT_AI_UPSTREAM_MODEL: config.upstreamModel,
        PIXIFACT_AI_UPSTREAM_TIMEOUT_MS: config.upstreamTimeoutMs,
        PIXIFACT_AI_UPSTREAM_AUTH_HEADER: config.upstreamAuthHeader,
        PIXIFACT_AI_UPSTREAM_AUTH_PREFIX: config.upstreamAuthPrefix,
        PIXIFACT_AI_UPSTREAM_TEMPERATURE: config.upstreamTemperature,
        PIXIFACT_AI_UPSTREAM_API: config.upstreamApi,
        PIXIFACT_AI_UPSTREAM_REASONING_EFFORT: config.upstreamReasoningEffort,
        PIXIFACT_AI_UPSTREAM_SERVICE_TIER: config.upstreamServiceTier,
        PIXIFACT_AI_UPSTREAM_STORE: config.upstreamStore,
    };
}
