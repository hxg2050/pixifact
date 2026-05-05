import { createServer } from 'node:http';
import { createGatewayResponse } from './gatewayCore.mjs';
import { generateProposalWithModel } from './modelAdapter.mjs';

const port = Number(process.env.PORT ?? 8788);
const host = process.env.HOST ?? '127.0.0.1';
const gatewayToken = process.env.PIXIF_AI_GATEWAY_TOKEN;

function send(res, status, headers, body) {
    res.writeHead(status, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        ...headers,
    });
    res.end(body);
}

async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : undefined;
}

const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        send(res, 204, {}, '');
        return;
    }

    if (req.method !== 'POST' || req.url !== '/proposal') {
        send(res, 404, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({
            error: {
                code: 'not_found',
                message: '只支持 POST /proposal。',
            },
        }));
        return;
    }

    try {
        const response = await createGatewayResponse(await readJson(req), {
            headers: req.headers,
            gatewayToken,
            generateProposal: (request) => generateProposalWithModel(request),
        });
        send(res, response.status, response.headers, response.body);
    } catch (error) {
        send(res, 400, { 'content-type': 'application/json; charset=utf-8' }, JSON.stringify({
            error: {
                code: 'invalid_json',
                message: error instanceof Error ? error.message : String(error),
            },
        }));
    }
});

server.listen(port, host, () => {
    console.log(`Pixif AI gateway adapter listening on http://${host}:${port}/proposal`);
});

function shutdown() {
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
