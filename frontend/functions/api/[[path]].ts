interface Env {
	BACKEND_API_BASE_URL: string;
	API_TOKEN: string;
}

interface FunctionContext<TEnv> {
	request: Request;
	env: TEnv;
}

const FORWARDED_REQUEST_HEADERS = [
	"accept",
	"accept-language",
	"authorization",
	"cache-control",
	"content-type",
	"if-none-match",
] as const;

function normalizeBaseUrl(value: string): string {
	return value.replace(/\/+$/, "");
}

function createTargetUrl(requestUrl: string, backendBaseUrl: string): string {
	const incomingUrl = new URL(requestUrl);
	const path = incomingUrl.pathname;

	return `${normalizeBaseUrl(backendBaseUrl)}${path}${incomingUrl.search}`;
}

function buildForwardedHeaders(request: Request, env: Env): Headers {
	const headers = new Headers();

	for (const name of FORWARDED_REQUEST_HEADERS) {
		const value = request.headers.get(name);
		if (value) {
			headers.set(name, value);
		}
	}

	headers.set("UPI", env.API_TOKEN);

	return headers;
}

function createErrorResponse(message: string, status: number) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			"Content-Type": "application/json",
		},
	});
}

export const onRequest = async ({
	request,
	env,
}: FunctionContext<Env>): Promise<Response> => {
	if (!env.BACKEND_API_BASE_URL || !env.API_TOKEN) {
		return createErrorResponse("Proxy is not configured on the server", 500);
	}

	const method = request.method.toUpperCase();
	const targetUrl = createTargetUrl(request.url, env.BACKEND_API_BASE_URL);

	const response = await fetch(targetUrl, {
		method,
		headers: buildForwardedHeaders(request, env),
		body: method === "GET" || method === "HEAD" ? undefined : request.body,
		redirect: "follow",
	});

	return response;
};
