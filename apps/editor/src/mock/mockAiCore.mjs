function json(status, body) {
    return {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
    };
}

export function createMockAiResponse(payload, createMockAiProposal) {
    if (typeof createMockAiProposal !== 'function') {
        return json(500, { error: 'Mock AI provider 未配置。' });
    }

    if (!payload || typeof payload !== 'object') {
        return json(400, { error: '请求体必须是 JSON 对象。' });
    }

    if (payload.protocol !== 'pixif.aiProposal.v1') {
        return json(400, { error: 'protocol 必须是 pixif.aiProposal.v1。' });
    }

    if (typeof payload.prompt !== 'string') {
        return json(400, { error: 'prompt 必须是字符串。' });
    }

    const context = payload.context;
    if (!context || typeof context !== 'object' || !context.prefab) {
        return json(400, { error: 'context.prefab 不能为空。' });
    }

    const proposal = createMockAiProposal(payload.prompt, {
        prefab: context.prefab,
        selection: context.selection?.node,
        designTokens: context.designTokens,
        actions: context.actions,
        logicGraph: context.logicGraph,
        locks: context.locks,
        memory: context.memory,
    }, 'MockAiServer');

    return json(200, { proposal });
}
