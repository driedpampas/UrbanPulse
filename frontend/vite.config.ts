import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

function apiProxyPlugin(): Plugin {
    return {
        name: 'api-proxy',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (!req.url?.startsWith('/api/')) {
                    return next();
                }

                const apiToken = process.env.API_TOKEN;
                if (!apiToken) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'API_TOKEN not set in environment' }));
                    return;
                }

                const backendUrl = 'https://urbanpulse-api.syu.nl.eu.org';
                const targetUrl = `${backendUrl}${req.url}`;

                try {
                    const headers = new Headers();
                    const forwardHeaders = [
                        'accept',
                        'accept-language',
                        'authorization',
                        'cache-control',
                        'content-type',
                        'if-none-match',
                    ];

                    for (const name of forwardHeaders) {
                        const value = req.headers[name];
                        if (value) {
                            headers.set(name, Array.isArray(value) ? value[0] : value);
                        }
                    }

                    headers.set('UPI', apiToken);

                    const chunks: Uint8Array[] = [];
                    for await (const chunk of req) {
                        chunks.push(chunk as Uint8Array);
                    }
                    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

                    const response = await fetch(targetUrl, {
                        method: req.method,
                        headers,
                        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
                        redirect: 'follow',
                    });

                    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

                    if (response.body) {
                        const reader = response.body.getReader();
                        const pump = async () => {
                            const { done, value } = await reader.read();
                            if (done) {
                                res.end();
                                return;
                            }
                            res.write(value);
                            await pump();
                        };
                        await pump();
                    } else {
                        res.end();
                    }
                } catch (err) {
                    console.error('API proxy error:', err);
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Bad gateway' }));
                }
            });
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [preact(), tailwindcss(), apiProxyPlugin()],
});
