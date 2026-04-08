import * as bun from "bun";
import type { JwtPayload } from "jsonwebtoken";
import { z } from "zod";
import * as auth from "./auth";
import type { PulseType, Timerange, UserSearchParams } from "./db";
import * as db from "./db";
import swaggerDoc from "./swagger.json";

const PORT = 3000;
const PULSE_FEED_TOPIC = "pulse-feed";
const PULSE_TYPES = [
	"need",
	"emergency",
	"skill",
	"item",
	"pet",
	"update",
] as const;
const PULSE_TYPE_ALIASES = [
	"Need",
	"Emergency",
	"Skill",
	"Item",
	"Pet",
	"Update",
] as const;
const DEFAULT_PULSE_URGENCY: Record<PulseType, number> = {
	update: 1,
	emergency: 5,
	skill: 2,
	item: 1,
	need: 4,
	pet: 3,
};

const corsHeaders = {
	"Access-Control-Allow-Origin": "https://urbanpulse.syu.nl.eu.org",
	"Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS, PATCH, DELETE",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Max-Age": "86400",
};

const SUCCESS = new Response(null, { status: 200 });
const OPTIONS_RESPONSE = new Response(null, { status: 204 });
const BAD_REQUEST = new Response(null, { status: 400 });
const UNAUTHORIZED = new Response(null, { status: 401 });
const FORBIDDEN = new Response(null, { status: 403 });
const NOT_FOUND = new Response(null, { status: 404 });
const SERVER_ERROR = new Response(null, { status: 500 });

function withCors(response: Response): Response {
	var res = new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});

	for (const [key, value] of Object.entries(corsHeaders)) {
		res.headers.set(key, value);
	}

	return res;
}

async function caught(handler: () => Promise<Response>): Promise<Response> {
	try {
		return await handler();
	} catch (err) {
		if (err instanceof z.ZodError) {
			return BAD_REQUEST;
		}
		console.log(err);
		return SERVER_ERROR;
	}
}

async function validate(
	request: Request,
	handler: () => Response | Promise<Response>,
): Promise<Response> {
	const origin = request.headers.get("Origin");
	if (origin !== null && !isAllowedOrigin(origin)) {
		return withCors(FORBIDDEN);
	}

	return await handler();
}

function isAllowedOrigin(origin: string): boolean {
	return (
		origin === "https://urbanpulse.syu.nl.eu.org" ||
		/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
	);
}

async function authorize(
	request: Request,
	handler: (payload: string | JwtPayload) => Response | Promise<Response>,
	fallback: () => Response | Promise<Response> = () => withCors(UNAUTHORIZED),
): Promise<Response> {
	const session = auth.verifyToken(request);

	if (session === null) {
		return await fallback();
	}

	return await handler(session);
}

async function adminAuthorize(
	request: Request,
	handler: (payload: string | JwtPayload) => Response | Promise<Response>,
	fallback: () => Response | Promise<Response> = () => withCors(UNAUTHORIZED),
): Promise<Response> {
	const session = auth.verifyToken(request);

	if (session === null) {
		return await fallback();
	}

	const payload = session as JwtPayload;

	if (payload.role !== "admin") {
		return withCors(FORBIDDEN);
	}

	return await handler(session);
}

async function unauthorize(
	request: Request,
	handler: () => Response | Promise<Response>,
): Promise<Response> {
	const session = auth.verifyToken(request);

	if (session !== null) {
		return await withCors(FORBIDDEN);
	}

	return await handler();
}

const registerUserSchema = z.strictObject({
	email: z.email(),
	displayName: z.string().nonempty(),
	password: z.string().min(8),
});

const loginUserSchema = z.strictObject({
	email: z.email(),
	password: z.string(),
});

const pulseTypeSchema = z.union([
	z.enum(PULSE_TYPES),
	z.enum(PULSE_TYPE_ALIASES),
]);

const createPulseSchema = z.strictObject({
	type: pulseTypeSchema,
	urgencyLevel: z.number().int().min(1).max(5).optional(),
	content: z.string().nonempty(),
	location: z.object({
		lat: z.number(),
		lng: z.number(),
	}),
});

const updateUserSchema = z.strictObject({
	displayName: z.string().nonempty().optional(),
	bio: z.string().optional(),
	radius: z.number().min(0).optional(),
	skills_and_resources: z.array(z.string()).optional(),
	location: z
		.object({
			lat: z.number().optional(),
			lng: z.number().optional(),
		})
		.optional(),
	quietHours: z
		.array(
			z.object({
				start: z
					.string()
					.regex(/^\d{2}:\d{2}$/)
					.optional(),
				end: z
					.string()
					.regex(/^\d{2}:\d{2}$/)
					.optional(),
			}),
		)
		.nullish(),
	quietDays: z.array(z.number().min(0).max(6)).max(7).nullish(),
});

const updatePassSchema = z
	.object({
		newPassword: z.string().nonempty().min(8),
		oldPassword: z.string().nonempty(),
	})
	.strict();

const searchUsersSchema = z.strictObject({
	id: z.uuid().nullish(),
	email: z.email().nullish(),
	displayName: z.string().nullish(),
	anyskillres: z.enum(["true", "false"]).nullish(),
	skillres: z.array(z.coerce.string()).nullish(),
	min_trust: z.coerce.number().nullish(),
	max_trust: z.coerce.number().nullish(),
	created_before: z.coerce.date().nullish(),
	created_after: z.coerce.date().nullish(),
	role: z.string().nullish(),
	verified: z.enum(["true", "false"]).nullish(),
	radius: z.coerce.number().nullish(),
	location: z
		.object({
			lat: z.coerce.number().nullish(),
			lng: z.coerce.number().nullish(),
		})
		.nullish(),
	availableDays: z.array(z.coerce.number().min(0).max(6)).max(7).nullish(),
	availableHours: z
		.array(
			z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}(,\d{2}:\d{2}-\d{2}:\d{2})*$/),
		)
		.nullish(),
	bio: z.string().nullish(),
});

type RegisterUserBody = z.infer<typeof registerUserSchema>;
type LoginUserBody = z.infer<typeof loginUserSchema>;
type UpdateUserBody = z.infer<typeof updateUserSchema>;
type UpdatePassBody = z.infer<typeof updatePassSchema>;
type SearchUsersQuery = z.infer<typeof searchUsersSchema>;
type CreatePulseBody = z.infer<typeof createPulseSchema>;

function buildSearchParams(query: SearchUsersQuery): UserSearchParams {
	return {
		id: query.id ?? null,
		email: query.email ?? null,
		min_trust:
			query.min_trust !== null && query.min_trust !== undefined
				? String(query.min_trust)
				: null,
		max_trust:
			query.max_trust !== null && query.max_trust !== undefined
				? String(query.max_trust)
				: null,
		created_before: query.created_before
			? query.created_before.toISOString()
			: null,
		created_after: query.created_after
			? query.created_after.toISOString()
			: null,
		displayName: query.displayName ?? null,
		role: query.role ?? null,
		verified: query.verified ?? null,
		radius:
			query.radius !== null && query.radius !== undefined
				? String(query.radius)
				: null,
		location: query.location
			? {
					lat:
						query.location.lat !== null && query.location.lat !== undefined
							? String(query.location.lat)
							: null,
					lng:
						query.location.lng !== null && query.location.lng !== undefined
							? String(query.location.lng)
							: null,
				}
			: null,
		availableHours:
			query.availableHours && query.availableHours.length > 0
				? query.availableHours
				: null,
		availableDays:
			query.availableDays && query.availableDays.length > 0
				? query.availableDays.map(String)
				: null,
		bio: query.bio ?? null,
		skillsAndResources:
			query.skillres && query.skillres.length !== 0 ? query.skillres : null,
		anySkillRes: query.anyskillres ?? null,
	};
}

bun.serve({
	port: PORT,
	error(err) {
		console.log(err);
	},
	routes: {
		"/api/docs/swagger.json": {
			GET: withCors(Response.json(swaggerDoc)),
		},
		"/api/docs": {
			GET: (_r) => {
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
				return withCors(
					new Response(html, {
						headers: {
							"Content-Type": "text/html",
						},
					}),
				);
			},
		},
		"/api/auth/register": {
			POST: async (req) =>
				validate(req, async () =>
					unauthorize(req, async () =>
						caught(async () => {
							const body: RegisterUserBody = await req
								.json()
								.then((raw) => registerUserSchema.parse(raw));

							const res = await auth.registerUser(body as auth.RegisterUser);

							if (!res.success) {
								return withCors(
									new Response(null, {
										status: res.status,
									}),
								);
							}

							return withCors(
								Response.json(
									{ token: res.token, user: res.user },
									{ status: 200 },
								),
							);
						}),
					),
				),
		},
		"/api/auth/login": {
			POST: async (req) =>
				validate(req, async () =>
					caught(async () => {
						const body: LoginUserBody = await req
							.json()
							.then((raw) => loginUserSchema.parse(raw));

						const res = await auth.loginUser(body as auth.LoginUser);

						if (!res.success) {
							return withCors(
								new Response(null, {
									status: res.status,
								}),
							);
						}

						return withCors(
							Response.json(
								{ token: res.token, user: res.user },
								{ status: 200 },
							),
						);
					}),
				),
		},
		"/api/auth/password": {
			PATCH: async (req) =>
				validate(req, async () =>
					authorize(req, async (session) =>
						caught(async () => {
							const payload: JwtPayload = session as JwtPayload;
							const body: UpdatePassBody = await req
								.json()
								.then((raw) => updatePassSchema.parse(raw));

							const [passwordRow] = await db.selectPasswordHash(payload.id);
							if (!passwordRow?.password_hash) {
								return UNAUTHORIZED;
							}

							const isCorrect = await bun.password.verify(
								body.oldPassword,
								passwordRow.password_hash,
							);

							if (!isCorrect) {
								return UNAUTHORIZED;
							}

							const newPassHash = await bun.password.hash(body.newPassword);
							await db.updateUserPassword(payload.id, newPassHash);

							return SUCCESS;
						}),
					),
				),
		},
		"/api/user": {
			PATCH: async (req) =>
				validate(req, async () =>
					authorize(req, async (session) =>
						caught(async () => {
							const payload: JwtPayload = session as JwtPayload;
							const body: UpdateUserBody = await req
								.json()
								.then((raw) => updateUserSchema.parse(raw));

							await db.updateUserProfile({
								id: payload.id,
								displayName: body.displayName,
								bio: body.bio,
								radius: body.radius,
								location: body.location,
								quietHours: body.quietHours as Timerange[] | null,
								quietDays: body.quietDays as number[] | null,
								skillsAndResources: body.skills_and_resources as
									| string[]
									| null,
							});

							return SUCCESS;
						}),
					),
				),
			GET: async (req) =>
				validate(
					req,
					async () =>
						await authorize(req, async (session) => {
							return caught(async () => {
								const payload = session as JwtPayload;
								const [user] = await db.searchUsers({
									id: payload.id,
									anySkillRes: null,
									skillsAndResources: null,
									email: null,
									min_trust: null,
									max_trust: null,
									created_before: null,
									created_after: null,
									displayName: null,
									role: null,
									verified: null,
									radius: null,
									location: null,
									availableHours: null,
									availableDays: null,
									bio: null,
								});
								if (!user) {
									return withCors(NOT_FOUND);
								}
								return withCors(Response.json(user, { status: 200 }));
							});
						}),
				),
			DELETE: async (req) =>
				validate(req, async () =>
					authorize(req, async (session) =>
						caught(async () => {
							const payload: JwtPayload = session as JwtPayload;
							await db.deleteUser(payload.id);
							return SUCCESS;
						}),
					),
				),
		},
		"/api/users": {
			GET: async (req) => {
				return validate(req, async () =>
					caught(async () => {
						const url = new URL(req.url);

						const query: SearchUsersQuery = searchUsersSchema.parse({
							id: url.searchParams.get("id"),
							email: url.searchParams.get("email"),
							anyskillres: url.searchParams.get("anyskillres"),
							skillres: url.searchParams.getAll("skillres"),
							min_trust: url.searchParams.get("min_trust"),
							max_trust: url.searchParams.get("max_trust"),
							created_before: url.searchParams.get("created_before"),
							created_after: url.searchParams.get("created_after"),
							displayName: url.searchParams.get("displayName"),
							role: url.searchParams.get("role"),
							verified: url.searchParams.get("verified"),
							radius: url.searchParams.get("radius"),
							location:
								url.searchParams.get("lat") || url.searchParams.get("lng")
									? {
											lat: url.searchParams.get("lat"),
											lng: url.searchParams.get("lng"),
										}
									: null,
							availableDays: url.searchParams.getAll("available_days"),
							availableHours: url.searchParams.getAll("available_hours"),
							bio: url.searchParams.get("bio"),
						});

						const users = await db.searchUsers(buildSearchParams(query));

						return withCors(Response.json(users, { status: 200 }));
					}),
				);
			},
			DELETE: async (req) => {
				return validate(req, async () =>
					adminAuthorize(req, async (payload) =>
						caught(async () => {
							const url = new URL(req.url);

							const session = payload as JwtPayload;

							const query: SearchUsersQuery = searchUsersSchema.parse({
								id: url.searchParams.get("id"),
								email: url.searchParams.get("email"),
								anyskillres: url.searchParams.get("anyskillres"),
								skillres: url.searchParams.getAll("skillres"),
								min_trust: url.searchParams.get("min_trust"),
								max_trust: url.searchParams.get("max_trust"),
								created_before: url.searchParams.get("created_before"),
								created_after: url.searchParams.get("created_after"),
								displayName: url.searchParams.get("displayName"),
								role: url.searchParams.get("role"),
								verified: url.searchParams.get("verified"),
								radius: url.searchParams.get("radius"),
								location:
									url.searchParams.get("lat") || url.searchParams.get("lng")
										? {
												lat: url.searchParams.get("lat"),
												lng: url.searchParams.get("lng"),
											}
										: null,
								availableDays: url.searchParams.getAll("available_days"),
								availableHours: url.searchParams.getAll("available_hours"),
								bio: url.searchParams.get("bio"),
							});

							await db.deleteUsers(session.id, buildSearchParams(query));

							return SUCCESS;
						}),
					),
				);
			},
		},
		"/api/pulse": {
			GET: async (req) =>
				validate(req, async () =>
					caught(async () => {
						const url = new URL(req.url);
						const requestedLimit = Number(
							url.searchParams.get("limit") ?? "50",
						);
						const pulses = await db.selectPulses(
							Number.isFinite(requestedLimit) ? requestedLimit : 50,
						);

						return withCors(Response.json(pulses, { status: 200 }));
					}),
				),
			POST: async (req, server) =>
				validate(req, async () =>
					authorize(
						req,
						async (session) =>
							await caught(async () => {
								const body: CreatePulseBody = await req
									.json()
									.then((raw) => createPulseSchema.parse(raw));

								const payload = session as JwtPayload;
								const pulseType = body.type.toLowerCase() as PulseType;
								const urgencyLevel =
									body.urgencyLevel ?? DEFAULT_PULSE_URGENCY[pulseType];

								const createdPulse = await db.insertPulse({
									authorId: payload.id,
									type: pulseType,
									urgencyLevel,
									content: body.content,
									location: body.location,
								});

								server.publish(
									PULSE_FEED_TOPIC,
									JSON.stringify({
										event: "pulse.created",
										pulse: createdPulse,
									}),
								);

								return withCors(Response.json(createdPulse, { status: 201 }));
							}),
					),
				),
		},
		"/api/pulse/live": {
			GET: (req, server) => {
				const origin = req.headers.get("Origin");
				if (origin !== null && !isAllowedOrigin(origin)) {
					return withCors(FORBIDDEN);
				}

				if (server.upgrade(req)) {
					return;
				}

				return withCors(BAD_REQUEST);
			},
		},
		"/api/pulse/:id": {
			DELETE: async (req, server) =>
				validate(req, async () =>
					authorize(req, async (session) =>
						caught(async () => {
							const payload = session as JwtPayload;
							const pulseId = req.params.id;
							const pulse = await db.selectPulseById(pulseId);

							if (!pulse) {
								return withCors(NOT_FOUND);
							}

							const canDeletePulse =
								payload.role === "admin" ||
								payload.role === "mod" ||
								payload.id === pulse.userId;

							if (!canDeletePulse) {
								return withCors(FORBIDDEN);
							}

							const deleted = await db.deletePulse(pulse.id);

							if (!deleted) {
								return withCors(NOT_FOUND);
							}

							server.publish(
								PULSE_FEED_TOPIC,
								JSON.stringify({
									event: "pulse.deleted",
									pulseId: pulse.id,
								}),
							);

							return withCors(new Response(null, { status: 204 }));
						}),
					),
				),
		},
		"/*": {
			OPTIONS: withCors(OPTIONS_RESPONSE),
		},
	},
	websocket: {
		idleTimeout: 0,
		publishToSelf: true,
		open(ws) {
			ws.subscribe(PULSE_FEED_TOPIC);
		},
		message() {
			// No-op: pulse feed is server-pushed only.
		},
	},
});
