import { createServer } from 'node:http';
import { loadGatewayConfig, modelEnvFromGatewayConfig } from './config.mjs';
import { createGatewayResponse } from './gatewayCore.mjs';
import { generateProposalWithModel } from './modelAdapter.mjs';

const config = loadGatewayConfig();
const modelEnv = modelEnvFromGatewayConfig(config);

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
            gatewayToken: config.gatewayToken,
            generateProposal: (request) => generateProposalWithModel(request, {
                env: {
                    ...process.env,
                    ...modelEnv,
                },
            }),
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

server.listen(config.port, config.host, () => {
    console.log(`Pixif AI gateway adapter listening on http://${config.host}:${config.port}/proposal`);
});

function shutdown() {
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
