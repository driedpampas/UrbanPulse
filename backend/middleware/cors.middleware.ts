import { FORBIDDEN } from './error.middleware';

const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://urbanpulse.syu.nl.eu.org',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, PATCH, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

export function withCors(response: Response): Response {
    const res = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });

    for (const [key, value] of Object.entries(corsHeaders)) {
        res.headers.set(key, value);
    }

    return res;
}

export function isAllowedOrigin(origin: string): boolean {
    return (
        origin === 'https://urbanpulse.syu.nl.eu.org' ||
        origin === 'https://pets.urbanpulse-1rw.pages.dev' ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    );
}

export async function validate(
    request: Request,
    handler: () => Response | Promise<Response>
): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (origin !== null && !isAllowedOrigin(origin)) {
        return withCors(FORBIDDEN);
    }

    const res = await handler();
    if (origin && isAllowedOrigin(origin)) {
        res.headers.set('Access-Control-Allow-Origin', origin);
    }
    return res;
}
