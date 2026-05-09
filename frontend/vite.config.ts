import { execSync } from 'node:child_process';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin} from 'vite';
import 'dotenv';

function apiProxyPlugin(backendUrl: string, origin: string): Plugin {
    return {
        name: 'api-proxy',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (!req.url?.startsWith('/api/')) {
                    return next();
                }

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

                    headers.set('Origin', origin);

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

const commitHash = execSync('git rev-parse --short HEAD').toString().trim();

// https://vite.dev/config/
export default defineConfig( ({mode}) => {
    const env = loadEnv(mode, process.cwd());

    if(!env.VITE_BACKEND_URL) {
        throw new Error("VITE_BACKEND_URL not found in .env")
    }
    if(!env.VITE_ORIGIN) {
        throw new Error("VITE_ORIGIN not found in .env")
    }

    return {
        plugins: [preact(), tailwindcss(), apiProxyPlugin(env.VITE_BACKEND_URL, env.VITE_ORIGIN)],
        define: {
            __COMMIT_HASH__: JSON.stringify(commitHash),
        },
    }
});
