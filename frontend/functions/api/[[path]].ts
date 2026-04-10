interface FunctionContext<TEnv> {
    request: Request;
    env: TEnv;
}

const ALLOWED_ORIGIN = 'https://urbanpulse.syu.nl.eu.org';

const FORWARDED_REQUEST_HEADERS = [
    'accept',
    'accept-language',
    'authorization',
    'cache-control',
    'content-type',
    'if-none-match',
] as const;

function normalizeBaseUrl(value: string): string {
    return value.replace(/\/+$/, '');
}

function createTargetUrl(requestUrl: string, backendBaseUrl: string): string {
    const incomingUrl = new URL(requestUrl);
    const path = incomingUrl.pathname;

    return `${normalizeBaseUrl(backendBaseUrl)}${path}${incomingUrl.search}`;
}

function buildForwardedHeaders(request: Request): Headers {
    const headers = new Headers();

    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value) {
            headers.set(name, value);
        }
    }

    headers.set('Origin', ALLOWED_ORIGIN);

    return headers;
}

export const onRequest = async ({
    request,
}: FunctionContext<Record<string, never>>): Promise<Response> => {
    const method = request.method.toUpperCase();
    const backendBaseUrl = 'https://urbanpulse-api.syu.nl.eu.org';
    const targetUrl = createTargetUrl(request.url, backendBaseUrl);

    const response = await fetch(targetUrl, {
        method,
        headers: buildForwardedHeaders(request),
        body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
        redirect: 'follow',
    });

    return response;
};
