import * as bun from "bun";
import * as db from "./db";
import * as auth from "./auth";
import { z } from "zod";
import swaggerDoc from "./swagger.json";
import type { JwtPayload } from "jsonwebtoken";

const PORT = 3000;

const corsHeaders = {
	"Access-Control-Allow-Origin": "https://urbanpulse.syu.nl.eu.org",
	"Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS, PATCH",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Max-Age": "86400",
};

const OPTIONS_RESPONSE = new Response(null, {
	status: 204,
	headers: corsHeaders,
});
const BAD_REQUEST = new Response(null, { status: 400, headers: corsHeaders });
const FORBIDDEN = new Response(null, { status: 403, headers: corsHeaders });
const UNAUTHORIZED = new Response(null, { status: 401, headers: corsHeaders });
const SERVER_ERROR = new Response(null, { status: 500, headers: corsHeaders });
const SUCCESS = new Response(null, { status: 200, headers: corsHeaders });

function withCors(response: Response): Response {
	const headers = new Headers(response.headers);

	for (const [key, value] of Object.entries(corsHeaders)) {
		headers.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

async function handleRoute(
	req: Request,
	handler: () => Response | Promise<Response>,
): Promise<Response> {
	if (req.method === "OPTIONS") {
		return OPTIONS_RESPONSE;
	}

	return withCors(await handler());
}

const registerUserSchema = z
	.object({
		email: z.email(),
		displayName: z.string().nonempty(),
		password: z.string().min(8),
	})
	.strict();

const loginUserSchema = z
	.object({
		email: z.email(),
		password: z.string(),
	})
	.strict();

const updateUserSchema = z
	.object({
		email: z.email().optional(),
		displayName: z.string().nonempty().optional(),
		radius: z.number().min(0).optional(),
		location: z
			.object({
				lat: z.number(),
				lng: z.number(),
			})
			.optional(),
		quietHours: z
			.object({
				start: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
				end: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
			})
			.nullish(),
		quietDays: z.array(z.number().min(0).max(6)).max(7).nullish(),
	})
	.strict();

const updatePassSchema = z
	.object({
		newPassword: z.string().nonempty().min(8),
		oldPassword: z.string().nonempty(),
	})
	.strict();

type RegisterUserBody = z.infer<typeof registerUserSchema>;
type LoginUserBody = z.infer<typeof loginUserSchema>;
type UpdateUserBody = z.infer<typeof updateUserSchema>;
type UpdatePassBody = z.infer<typeof updatePassSchema>;

bun.serve({
	port: PORT,
	routes: {
		"/api/docs/swagger.json": async (req) => {
			return handleRoute(req, () => {
				if (req.method !== "GET") {
					return BAD_REQUEST;
				}

				return Response.json(swaggerDoc, { headers: corsHeaders });
			});
		},
		"/api/docs": async (req) => {
			return handleRoute(req, () => {
				if (req.method !== "GET") {
					return BAD_REQUEST;
				}

				const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="utf-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1" />
                  <title>UrbanPulse API Docs</title>
                  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
                </head>
                <body>
                  <div id="swagger-ui"></div>
                  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
                  <script>
                    window.onload = () => {
                      window.ui = SwaggerUIBundle({
                        url: '/api/docs/swagger.json',
                        dom_id: '#swagger-ui',
                      });
                    };
                  </script>
                </body>
                </html>
          `;
				return new Response(html, {
					headers: {
						...corsHeaders,
						"Content-Type": "text/html",
					},
				});
			});
		},
		"/api/auth/register": async (req) => {
			return handleRoute(req, async () => {
				if (req.method !== "POST") {
					return BAD_REQUEST;
				}
				const session = auth.verifyToken(req);

				if (session != null) {
					return FORBIDDEN;
				}

				try {
					const body: RegisterUserBody = await req
						.json()
						.then((raw) => registerUserSchema.parse(raw));

					const res = await auth.registerUser(body as auth.RegisterUser);

					if (!res.success) {
						return new Response(null, {
							status: res.status,
							headers: corsHeaders,
						});
					}

					return Response.json(
						{ token: res.token, user: res.user },
						{ status: 200, headers: corsHeaders },
					);
				} catch (err) {
					if (err instanceof z.ZodError) {
						return BAD_REQUEST;
					}
					console.error(err);
					return SERVER_ERROR;
				}
			});
		},
		"/api/auth/login": async (req) => {
			return handleRoute(req, async () => {
				if (req.method !== "POST") {
					return BAD_REQUEST;
				}

				try {
					const body: LoginUserBody = await req
						.json()
						.then((raw) => loginUserSchema.parse(raw));

					const res = await auth.loginUser(body as auth.LoginUser);

					if (!res.success) {
						return new Response(null, {
							status: res.status,
							headers: corsHeaders,
						});
					}

					return Response.json(
						{ token: res.token, user: res.user },
						{ status: 200, headers: corsHeaders },
					);
				} catch (err) {
					if (err instanceof z.ZodError) {
						return BAD_REQUEST;
					}
					console.log(err);
					return SERVER_ERROR;
				}
			});
		},
		"/api/user": async (req) => {
			return handleRoute(req, async () => {
				if (req.method !== "PATCH") {
					return BAD_REQUEST;
				}

				const session = auth.verifyToken(req);

				if (!session) {
					return UNAUTHORIZED;
				}

				try {
					const payload: JwtPayload = session as JwtPayload;
					const body: UpdateUserBody = await req
						.json()
						.then((raw) => updateUserSchema.parse(raw));

					await db.updateUserProfile({ id: payload.id, ...body });

					return SUCCESS;
				} catch (err) {
					if (err instanceof z.ZodError) {
						return BAD_REQUEST;
					}
					console.log(err);
					return SERVER_ERROR;
				}
			});
		},
		"/api/user/password": async (req) => {
			return handleRoute(req, async () => {
				if (req.method !== "PATCH") {
					return BAD_REQUEST;
				}

				const session = auth.verifyToken(req);

				if (!session) {
					return UNAUTHORIZED;
				}

				try {
					const payload: JwtPayload = session as JwtPayload;
					const body: UpdatePassBody = await req
						.json()
						.then((raw) => updatePassSchema.parse(raw));

					const [{ password_hash }] = await db.selectPasswordHash(payload.id);

					const isCorrect = await bun.password.verify(
						body.oldPassword,
						password_hash,
					);

					if (!isCorrect) {
						return UNAUTHORIZED;
					}

					const newPassHash = await bun.password.hash(body.newPassword);
					await db.updateUserPassword(payload.id, newPassHash);

					return SUCCESS;
				} catch (err) {
					if (err instanceof z.ZodError) {
						return BAD_REQUEST;
					}
					console.log(err);
					return SERVER_ERROR;
				}
			});
		},
	},
});
