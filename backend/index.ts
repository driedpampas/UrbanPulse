import * as bun from 'bun';
import type { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import * as auth from './auth';
import type { PulseType, Timerange, UserSearchParams } from './db';
import * as db from './db';
import swaggerDoc from './swagger.json';

const PORT = 3000;
const PULSE_FEED_TOPIC = 'pulse-feed';
const PULSE_TYPES = ['need', 'emergency', 'skill', 'item', 'pet', 'update'] as const;
const PULSE_TYPE_ALIASES = ['Need', 'Emergency', 'Skill', 'Item', 'Pet', 'Update'] as const;
const DEFAULT_PULSE_URGENCY: Record<PulseType, number> = {
    update: 1,
    emergency: 5,
    skill: 2,
    item: 1,
    need: 4,
    pet: 3,
};

const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://urbanpulse.syu.nl.eu.org',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, PATCH, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
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
    handler: () => Response | Promise<Response>
): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (origin !== null && !isAllowedOrigin(origin)) {
        return withCors(FORBIDDEN);
    }

    return await handler();
}

function isAllowedOrigin(origin: string): boolean {
    return (
        origin === 'https://urbanpulse.syu.nl.eu.org' ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    );
}

async function authorize(
    request: Request,
    handler: (payload: string | JwtPayload) => Response | Promise<Response>,
    fallback: () => Response | Promise<Response> = () => withCors(UNAUTHORIZED)
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
    fallback: () => Response | Promise<Response> = () => withCors(UNAUTHORIZED)
): Promise<Response> {
    const session = auth.verifyToken(request);

    if (session === null) {
        return await fallback();
    }

    const payload = session as JwtPayload;
    const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();

    if (role !== 'admin' && role !== 'mod') {
        return withCors(FORBIDDEN);
    }

    return await handler(session);
}

async function unauthorize(
    request: Request,
    handler: () => Response | Promise<Response>
): Promise<Response> {
    const session = auth.verifyToken(request);

    if (session !== null) {
        return await withCors(FORBIDDEN);
    }

    return await handler();
}

const registerUserSchema = z.strictObject({
    email: z.string().email(),
    displayName: z.string().nonempty(),
    password: z.string().min(8),
});

const loginUserSchema = z.strictObject({
    email: z.string().email(),
    password: z.string(),
});

const pulseTypeSchema = z.union([z.enum(PULSE_TYPES), z.enum(PULSE_TYPE_ALIASES)]);

const createPulseSchema = z.strictObject({
    type: pulseTypeSchema,
    urgencyLevel: z.number().int().min(1).max(5).optional(),
    content: z.string().nonempty(),
    location: z.object({
        lat: z.number(),
        lng: z.number(),
    }),
    requiredSkills: z.array(z.string()).optional(),
});

const createChatSchema = z.strictObject({
    isGroup: z.boolean(),
    participantIds: z.array(z.uuid()).min(1).max(50),
});

const messageNotificationPayloadSchema = z.strictObject({
    event: z.literal('notification.message'),
    message: z.strictObject({
        id: z.uuid(),
        threadId: z.uuid(),
        senderId: z.uuid(),
        content: z.string(),
        timestamp: z.union([z.number(), z.string()]),
    }),
    senderName: z.string(),
    threadName: z.string().optional(),
});

const createMessageSchema = z.strictObject({
    content: z.string().trim().min(1).max(5000),
});

const deleteMessageSchema = z.strictObject({
    messageId: z.uuid(),
    scope: z.enum(['me', 'everyone']).optional(),
});

const addChatParticipantsSchema = z.strictObject({
    participantIds: z.array(z.uuid()).min(1).max(20),
});

const subscribeChatSocketSchema = z.strictObject({
    action: z.literal('chat.subscribe'),
    threadId: z.uuid(),
    token: z.string().nonempty(),
});

const unsubscribeChatSocketSchema = z.strictObject({
    action: z.literal('chat.unsubscribe'),
    threadId: z.uuid(),
});

const identifySocketSchema = z.strictObject({
    action: z.literal('auth.identify'),
    token: z.string().nonempty(),
});

const chatSocketMessageSchema = z.union([
    subscribeChatSocketSchema,
    unsubscribeChatSocketSchema,
    identifySocketSchema,
]);

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
            })
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
    email: z.string().email().nullish(),
    displayName: z.string().nullish(),
    anyskillres: z.enum(['true', 'false']).nullish(),
    skillres: z.array(z.coerce.string()).nullish(),
    min_trust: z.coerce.number().nullish(),
    max_trust: z.coerce.number().nullish(),
    created_before: z.coerce.date().nullish(),
    created_after: z.coerce.date().nullish(),
    role: z.string().nullish(),
    verified: z.enum(['true', 'false']).nullish(),
    radius: z.coerce.number().nullish(),
    location: z
        .object({
            lat: z.coerce.number().nullish(),
            lng: z.coerce.number().nullish(),
        })
        .nullish(),
    availableDays: z.array(z.coerce.number().min(0).max(6)).max(7).nullish(),
    availableHours: z
        .array(z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}(,\d{2}:\d{2}-\d{2}:\d{2})*$/))
        .nullish(),
    bio: z.string().nullish(),
    limit: z.coerce.number().optional(),
    offset: z.coerce.number().optional(),
});

const createLibraryItemSchema = z.strictObject({
    type: z.enum(['item', 'skill']),
    title: z.string().nonempty().max(255),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string()).max(10),
});

const updateLibraryItemSchema = z.strictObject({
    isAvailable: z.boolean(),
});

const createReportSchema = z.strictObject({
    targetId: z.uuid(),
    targetType: z.enum(['pulse', 'user', 'message']),
    reason: z.string().nonempty().max(500),
    content: z.string().nonempty(),
});

const updateReportStatusSchema = z.strictObject({
    status: z.enum(['resolved', 'dismissed']),
});

type RegisterUserBody = z.infer<typeof registerUserSchema>;
type LoginUserBody = z.infer<typeof loginUserSchema>;
type UpdateUserBody = z.infer<typeof updateUserSchema>;
type UpdatePassBody = z.infer<typeof updatePassSchema>;
type SearchUsersQuery = z.infer<typeof searchUsersSchema>;
type CreatePulseBody = z.infer<typeof createPulseSchema>;
type CreateChatBody = z.infer<typeof createChatSchema>;
type CreateMessageBody = z.infer<typeof createMessageSchema>;
type DeleteMessageBody = z.infer<typeof deleteMessageSchema>;
type AddChatParticipantsBody = z.infer<typeof addChatParticipantsSchema>;
type CreateLibraryItemBody = z.infer<typeof createLibraryItemSchema>;
type UpdateLibraryItemBody = z.infer<typeof updateLibraryItemSchema>;
type CreateReportBody = z.infer<typeof createReportSchema>;
type UpdateReportStatusBody = z.infer<typeof updateReportStatusSchema>;

const adminRoleSchema = z.enum(['admin', 'resident']);

const updateAdminUserRoleBodySchema = z.strictObject({
    role: adminRoleSchema,
});

const adminUsersQuerySchema = z.strictObject({
    role: z.string().nullish(),
    limit: z.coerce.number().optional(),
    offset: z.coerce.number().optional(),
});

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
        created_before: query.created_before ? query.created_before.toISOString() : null,
        created_after: query.created_after ? query.created_after.toISOString() : null,
        displayName: query.displayName ?? null,
        role: query.role ?? null,
        verified: query.verified ?? null,
        radius: query.radius !== null && query.radius !== undefined ? String(query.radius) : null,
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
            query.availableHours && query.availableHours.length > 0 ? query.availableHours : null,
        availableDays:
            query.availableDays && query.availableDays.length > 0
                ? query.availableDays.map(String)
                : null,
        bio: query.bio ?? null,
        skillsAndResources: query.skillres && query.skillres.length !== 0 ? query.skillres : null,
        anySkillRes: query.anyskillres ?? null,
    };
}

async function handleSocketMessage(ws: bun.ServerWebSocket<unknown>, message: string) {
    let parsedMessage: unknown;
    try {
        parsedMessage = JSON.parse(message);
    } catch {
        return;
    }

    const parsed = chatSocketMessageSchema.safeParse(parsedMessage);
    if (!parsed.success) {
        return;
    }

    if (parsed.data.action === 'auth.identify') {
        const payload = auth.verifyBearerToken(parsed.data.token);
        if (!payload || typeof payload === 'string') {
            ws.send(
                JSON.stringify({
                    event: 'auth.error',
                    reason: 'unauthorized',
                })
            );
            return;
        }

        ws.subscribe(`user-${payload.id}`);
        ws.send(
            JSON.stringify({
                event: 'auth.identified',
                userId: payload.id,
            })
        );
        return;
    }

    const threadId = parsed.data.threadId;

    if (parsed.data.action === 'chat.unsubscribe') {
        ws.unsubscribe(`chat-${threadId}`);
        ws.send(
            JSON.stringify({
                event: 'chat.unsubscribed',
                threadId,
            })
        );
        return;
    }

    const payload = auth.verifyBearerToken(parsed.data.token);
    if (!payload || typeof payload === 'string') {
        ws.send(
            JSON.stringify({
                event: 'chat.error',
                reason: 'unauthorized',
                threadId,
            })
        );
        return;
    }

    const chats = await db.selectChats(payload.id as string);
    const isParticipant = chats.some((chat) => chat.chatId === threadId);

    if (!isParticipant) {
        ws.send(
            JSON.stringify({
                event: 'chat.error',
                reason: 'forbidden',
                threadId,
            })
        );
        return;
    }

    ws.subscribe(`chat-${threadId}`);
    ws.send(
        JSON.stringify({
            event: 'chat.subscribed',
            threadId,
        })
    );
}

bun.serve({
    port: PORT,
    error(err) {
        console.log(err);
    },
    routes: {
        '/api/docs/swagger.json': {
            GET: withCors(Response.json(swaggerDoc)),
        },
        '/api/docs': {
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
                            'Content-Type': 'text/html',
                        },
                    })
                );
            },
        },
        '/api/auth/register': {
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
                                    })
                                );
                            }

                            return withCors(
                                Response.json({ token: res.token, user: res.user }, { status: 200 })
                            );
                        })
                    )
                ),
        },
        '/api/auth/login': {
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
                                })
                            );
                        }

                        return withCors(
                            Response.json({ token: res.token, user: res.user }, { status: 200 })
                        );
                    })
                ),
        },
        '/api/auth/password': {
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
                                passwordRow.password_hash
                            );

                            if (!isCorrect) {
                                return UNAUTHORIZED;
                            }

                            const newPassHash = await bun.password.hash(body.newPassword);
                            await db.updateUserPassword(payload.id, newPassHash);

                            return SUCCESS;
                        })
                    )
                ),
        },
        '/api/user': {
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
                                skillsAndResources: body.skills_and_resources as string[] | null,
                            });

                            return SUCCESS;
                        })
                    )
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
                        })
                ),
            DELETE: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload: JwtPayload = session as JwtPayload;
                            await db.deleteUser(payload.id);
                            return SUCCESS;
                        })
                    )
                ),
        },
        '/api/users': {
            GET: async (req) => {
                return validate(req, async () =>
                    authorize(
                        req,
                        async (session) =>
                            caught(async () => {
                                const url = new URL(req.url);
                                const payload = session as JwtPayload;

                                const query: SearchUsersQuery = searchUsersSchema.parse({
                                    id: url.searchParams.get('id'),
                                    email: url.searchParams.get('email'),
                                    anyskillres: url.searchParams.get('anyskillres'),
                                    skillres: url.searchParams.getAll('skillres'),
                                    min_trust: url.searchParams.get('min_trust'),
                                    max_trust: url.searchParams.get('max_trust'),
                                    created_before: url.searchParams.get('created_before'),
                                    created_after: url.searchParams.get('created_after'),
                                    displayName: url.searchParams.get('displayName'),
                                    role: url.searchParams.get('role'),
                                    verified: url.searchParams.get('verified'),
                                    radius: url.searchParams.get('radius'),
                                    location:
                                        url.searchParams.get('lat') || url.searchParams.get('lng')
                                            ? {
                                                  lat: url.searchParams.get('lat'),
                                                  lng: url.searchParams.get('lng'),
                                              }
                                            : null,
                                    availableDays: url.searchParams.getAll('available_days'),
                                    availableHours: url.searchParams.getAll('available_hours'),
                                    bio: url.searchParams.get('bio'),
                                    limit: url.searchParams.get('limit'),
                                    offset: url.searchParams.get('offset'),
                                });

                                let users = await db.searchUsers(
                                    buildSearchParams(query),
                                    query.limit,
                                    query.offset
                                );

                                const requesterRole = (
                                    await db.selectUserRole(payload.id as string)
                                )?.toLowerCase();
                                const isAdmin =
                                    requesterRole === 'admin' || requesterRole === 'mod';

                                users = users.map((u) => {
                                    if (!isAdmin && u.id !== payload.id) {
                                        const { email: _email, ...rest } = u;
                                        return rest as any;
                                    }
                                    return u;
                                });

                                return withCors(Response.json(users, { status: 200 }));
                            }),
                        () =>
                            caught(async () => {
                                // For public access, return users without emails
                                const url = new URL(req.url);
                                const query: SearchUsersQuery = searchUsersSchema.parse({
                                    id: url.searchParams.get('id'),
                                    displayName: url.searchParams.get('displayName'),
                                    limit: url.searchParams.get('limit'),
                                    offset: url.searchParams.get('offset'),
                                });

                                let users = await db.searchUsers(
                                    buildSearchParams(query),
                                    query.limit,
                                    query.offset
                                );

                                users = users.map((u) => {
                                    const { email: _email, ...rest } = u;
                                    return rest as any;
                                });

                                return withCors(Response.json(users, { status: 200 }));
                            })
                    )
                );
            },
            DELETE: async (req) => {
                return validate(req, async () =>
                    adminAuthorize(req, async (payload) =>
                        caught(async () => {
                            const url = new URL(req.url);

                            const session = payload as JwtPayload;

                            const query: SearchUsersQuery = searchUsersSchema.parse({
                                id: url.searchParams.get('id'),
                                email: url.searchParams.get('email'),
                                anyskillres: url.searchParams.get('anyskillres'),
                                skillres: url.searchParams.getAll('skillres'),
                                min_trust: url.searchParams.get('min_trust'),
                                max_trust: url.searchParams.get('max_trust'),
                                created_before: url.searchParams.get('created_before'),
                                created_after: url.searchParams.get('created_after'),
                                displayName: url.searchParams.get('displayName'),
                                role: url.searchParams.get('role'),
                                verified: url.searchParams.get('verified'),
                                radius: url.searchParams.get('radius'),
                                location:
                                    url.searchParams.get('lat') || url.searchParams.get('lng')
                                        ? {
                                              lat: url.searchParams.get('lat'),
                                              lng: url.searchParams.get('lng'),
                                          }
                                        : null,
                                availableDays: url.searchParams.getAll('available_days'),
                                availableHours: url.searchParams.getAll('available_hours'),
                                bio: url.searchParams.get('bio'),
                            });

                            await db.deleteUsers(session.id, buildSearchParams(query));

                            return SUCCESS;
                        })
                    )
                );
            },
        },
        '/api/admin/overview': {
            GET: async (req) =>
                validate(req, async () =>
                    adminAuthorize(req, async () =>
                        caught(async () => {
                            const overview = await db.selectAdminOverview();
                            return withCors(Response.json(overview, { status: 200 }));
                        })
                    )
                ),
        },
        '/api/admin/users': {
            GET: async (req) =>
                validate(req, async () =>
                    adminAuthorize(req, async () =>
                        caught(async () => {
                            const url = new URL(req.url);
                            const query = adminUsersQuerySchema.parse({
                                role: url.searchParams.get('role'),
                                limit: url.searchParams.get('limit'),
                                offset: url.searchParams.get('offset'),
                            });

                            const users = await db.searchUsers(
                                buildSearchParams({
                                    id: null,
                                    email: null,
                                    anyskillres: null,
                                    skillres: null,
                                    min_trust: null,
                                    max_trust: null,
                                    created_before: null,
                                    created_after: null,
                                    displayName: null,
                                    role: query.role,
                                    verified: null,
                                    radius: null,
                                    location: null,
                                    availableDays: null,
                                    availableHours: null,
                                    bio: null,
                                }),
                                query.limit,
                                query.offset
                            );

                            return withCors(Response.json({ users }, { status: 200 }));
                        })
                    )
                ),
        },
        '/api/admin/users/:id/role': {
            PATCH: async (req) =>
                validate(req, async () =>
                    adminAuthorize(req, async () =>
                        caught(async () => {
                            const body = updateAdminUserRoleBodySchema.parse(
                                await req.json().then((raw) => raw)
                            );
                            const updated = await db.updateUserRole(req.params.id, body.role);

                            if (!updated) {
                                return withCors(NOT_FOUND);
                            }

                            return withCors(SUCCESS);
                        })
                    )
                ),
        },
        '/api/admin/pulses': {
            GET: async (req) =>
                validate(req, async () =>
                    adminAuthorize(req, async () =>
                        caught(async () => {
                            const url = new URL(req.url);
                            const limit = Number(url.searchParams.get('limit') ?? '25');
                            const offset = Number(url.searchParams.get('offset') ?? '0');
                            const pulses = await db.selectPulses(
                                Number.isFinite(limit) ? limit : 25,
                                null,
                                null,
                                null,
                                Number.isFinite(offset) ? offset : 0
                            );
                            return withCors(Response.json({ pulses }, { status: 200 }));
                        })
                    )
                ),
        },
        '/api/admin/library': {
            GET: async (req) =>
                validate(req, async () =>
                    adminAuthorize(req, async () =>
                        caught(async () => {
                            const url = new URL(req.url);
                            const limit = Number(url.searchParams.get('limit') ?? '25');
                            const offset = Number(url.searchParams.get('offset') ?? '0');
                            const items = await db.selectAdminLibraryItems(
                                Number.isFinite(limit) ? limit : 25,
                                Number.isFinite(offset) ? offset : 0
                            );
                            return withCors(Response.json({ items }, { status: 200 }));
                        })
                    )
                ),
        },
        '/api/admin/reports': {
            GET: async (req) =>
                validate(req, async () =>
                    adminAuthorize(req, async () =>
                        caught(async () => {
                            const url = new URL(req.url);
                            const limit = Number(url.searchParams.get('limit') ?? '50');
                            const offset = Number(url.searchParams.get('offset') ?? '0');
                            const reports = await db.selectReports(limit, offset);
                            return withCors(Response.json({ reports }, { status: 200 }));
                        })
                    )
                ),
        },
        '/api/admin/reports/:id/status': {
            PATCH: async (req) =>
                validate(req, async () =>
                    adminAuthorize(req, async () =>
                        caught(async () => {
                            const body = updateReportStatusSchema.parse(await req.json());
                            const updated = await db.updateReportStatus(req.params.id, body.status);
                            if (!updated) return withCors(NOT_FOUND);
                            return withCors(SUCCESS);
                        })
                    )
                ),
        },
        '/api/reports': {
            POST: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const body = createReportSchema.parse(await req.json());
                            const report = await db.insertReport({
                                reporterId: payload.id,
                                targetId: body.targetId,
                                targetType: body.targetType,
                                reason: body.reason,
                                content: body.content,
                            });
                            return withCors(Response.json(report, { status: 201 }));
                        })
                    )
                ),
        },
        '/api/pulse': {
            GET: async (req) =>
                validate(req, async () =>
                    caught(async () => {
                        const url = new URL(req.url);
                        const requestedLimit = Number(url.searchParams.get('limit') ?? '50');
                        const offset = Number(url.searchParams.get('offset') ?? '0');
                        const lat = url.searchParams.get('lat')
                            ? Number(url.searchParams.get('lat'))
                            : null;
                        const lng = url.searchParams.get('lng')
                            ? Number(url.searchParams.get('lng'))
                            : null;
                        const radius = url.searchParams.get('radius')
                            ? Number(url.searchParams.get('radius'))
                            : null;

                        const pulses = await db.selectPulses(
                            Number.isFinite(requestedLimit) ? requestedLimit : 50,
                            lat,
                            lng,
                            radius,
                            Number.isFinite(offset) ? offset : 0
                        );

                        return withCors(Response.json(pulses, { status: 200 }));
                    })
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
                                    requiredSkills: body.requiredSkills ?? [],
                                });

                                server.publish(
                                    PULSE_FEED_TOPIC,
                                    JSON.stringify({
                                        event: 'pulse.created',
                                        pulse: createdPulse,
                                    })
                                );

                                // Hero Alerts
                                const heroes = await db.findHeroesForPulse(createdPulse.id);
                                for (const heroId of heroes) {
                                    server.publish(
                                        `user-${heroId}`,
                                        JSON.stringify({
                                            event: 'hero.alert',
                                            pulse: createdPulse,
                                        })
                                    );
                                }

                                return withCors(Response.json(createdPulse, { status: 201 }));
                            })
                    )
                ),
        },
        '/api/pulse/live': {
            GET: (req, server) => {
                const origin = req.headers.get('Origin');
                if (origin !== null && !isAllowedOrigin(origin)) {
                    return withCors(FORBIDDEN);
                }

                if (server.upgrade(req)) {
                    return;
                }

                return withCors(BAD_REQUEST);
            },
        },
        '/api/pulse/:id': {
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

                            const role = (
                                await db.selectUserRole(payload.id as string)
                            )?.toLowerCase();
                            const canDeletePulse =
                                role === 'admin' || role === 'mod' || payload.id === pulse.userId;

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
                                    event: 'pulse.deleted',
                                    pulseId: pulse.id,
                                })
                            );

                            return withCors(new Response(null, { status: 204 }));
                        })
                    )
                ),
        },
        '/api/chats': {
            GET: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const chats = await db.selectChatSummaries(payload.id);
                            return withCors(Response.json(chats, { status: 200 }));
                        })
                    )
                ),
            POST: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const body: CreateChatBody = await req
                                .json()
                                .then((raw) => createChatSchema.parse(raw));

                            const participantIds = Array.from(
                                new Set([...body.participantIds, payload.id])
                            );

                            if (!body.isGroup && participantIds.length !== 2) {
                                return withCors(BAD_REQUEST);
                            }

                            if (body.isGroup && participantIds.length < 2) {
                                return withCors(BAD_REQUEST);
                            }

                            const existingUsers = await db.selectExistingUserIds(participantIds);
                            if (existingUsers.length !== participantIds.length) {
                                return withCors(NOT_FOUND);
                            }

                            if (!body.isGroup) {
                                const otherUserId = participantIds.find((id) => id !== payload.id);
                                if (!otherUserId) {
                                    return withCors(BAD_REQUEST);
                                }

                                const blocked = await db.isEitherUserBlocked(
                                    payload.id,
                                    otherUserId
                                );
                                if (blocked) {
                                    return withCors(FORBIDDEN);
                                }

                                const existingThread = await db.findDirectChatId(
                                    payload.id,
                                    otherUserId
                                );
                                if (existingThread !== null) {
                                    return withCors(
                                        Response.json(
                                            {
                                                chatId: existingThread,
                                            },
                                            { status: 409 }
                                        )
                                    );
                                }
                            }

                            const createdChat = await db.insertChat(
                                participantIds,
                                body.isGroup,
                                payload.id
                            );

                            return withCors(Response.json(createdChat, { status: 201 }));
                        })
                    )
                ),
        },
        '/api/chats/:id/messages': {
            GET: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const threadId = req.params.id;

                            const chats = await db.selectChats(payload.id);
                            const isParticipant = chats.some((chat) => chat.chatId === threadId);

                            if (!isParticipant) {
                                return withCors(FORBIDDEN);
                            }

                            const messages = await db.selectMessages(threadId, payload.id);

                            return withCors(Response.json(messages, { status: 200 }));
                        })
                    )
                ),
            POST: async (req, server) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const threadId = req.params.id;
                            const body: CreateMessageBody = await req
                                .json()
                                .then((raw) => createMessageSchema.parse(raw));

                            const chats = await db.selectChats(payload.id);
                            const isParticipant = chats.some((chat) => chat.chatId === threadId);

                            if (!isParticipant) {
                                return withCors(FORBIDDEN);
                            }

                            const chat = await db.selectChat(threadId, payload.id);
                            if (!chat) {
                                return withCors(NOT_FOUND);
                            }

                            if (!chat.isGroup) {
                                const blockedCounterpartyIds =
                                    await db.selectBlockedCounterpartyIds(payload.id);
                                const blockedSet = new Set(blockedCounterpartyIds);
                                const blockedInThread = chat.participants.some(
                                    (participant) =>
                                        participant.userId !== payload.id &&
                                        blockedSet.has(participant.userId)
                                );

                                if (blockedInThread) {
                                    return withCors(FORBIDDEN);
                                }
                            }

                            const message = await db.insertMessage(
                                threadId,
                                payload.id,
                                body.content
                            );

                            const thread = await db.selectChat(threadId, payload.id);
                            const threadSummary = (
                                await db.selectChatSummaries(payload.id as string)
                            ).find((chat) => chat.id === threadId);
                            const sender = await db.selectUserSummary(payload.id as string);
                            const notificationPayload = messageNotificationPayloadSchema.parse({
                                event: 'notification.message',
                                message: {
                                    ...message,
                                    timestamp: Number(message.timestamp),
                                },
                                senderName:
                                    sender?.displayName?.trim() ||
                                    `Neighbor ${payload.id.slice(0, 6)}`,
                                threadName:
                                    threadSummary?.participants
                                        .filter((participant) => participant.userId !== payload.id)
                                        .map(
                                            (participant) =>
                                                participant.displayName?.trim() ||
                                                `Neighbor ${participant.userId.slice(0, 6)}`
                                        )
                                        .join(', ') || undefined,
                            });

                            server.publish(
                                `chat-${threadId}`,
                                JSON.stringify({
                                    event: 'message.created',
                                    message,
                                })
                            );

                            for (const participant of thread?.participants ?? []) {
                                if (participant.userId === payload.id) {
                                    continue;
                                }

                                server.publish(
                                    `user-${participant.userId}`,
                                    JSON.stringify(notificationPayload)
                                );
                            }

                            return withCors(Response.json(message, { status: 201 }));
                        })
                    )
                ),
            DELETE: async (req, server) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const threadId = req.params.id;
                            const body: DeleteMessageBody = await req
                                .json()
                                .then((raw) => deleteMessageSchema.parse(raw));

                            const chats = await db.selectChats(payload.id);
                            const isParticipant = chats.some((chat) => chat.chatId === threadId);

                            if (!isParticipant) {
                                return withCors(FORBIDDEN);
                            }

                            const message = await db.selectMessage(body.messageId, payload.id);

                            if (!message) {
                                return withCors(NOT_FOUND);
                            }

                            const deleteScope = body.scope ?? 'everyone';

                            if (deleteScope === 'me') {
                                await db.hideMessageForUser(body.messageId, payload.id);
                                return withCors(SUCCESS);
                            }

                            const role = (
                                await db.selectUserRole(payload.id as string)
                            )?.toLowerCase();
                            const chat = await db.selectChat(threadId, payload.id);
                            if (!chat) {
                                return withCors(NOT_FOUND);
                            }

                            const participantRoles = await db.selectChatParticipantRoles(threadId);
                            const currentRoles = participantRoles[payload.id as string] ?? [];
                            const isChatOwner = chat.ownerId === payload.id;
                            const canManageChat = isChatOwner || currentRoles.includes('admin');
                            const canDeleteMessage =
                                role === 'admin' ||
                                role === 'mod' ||
                                payload.id === message.senderId ||
                                canManageChat;

                            if (!canDeleteMessage) {
                                return withCors(FORBIDDEN);
                            }

                            await db.deleteMessage(body.messageId, payload.id);

                            server.publish(
                                `chat-${threadId}`,
                                JSON.stringify({
                                    event: 'message.deleted',
                                    messageId: body.messageId,
                                    scope: 'everyone',
                                })
                            );

                            return withCors(SUCCESS);
                        })
                    )
                ),
        },
        '/api/users/blocked': {
            GET: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const blockedUserIds = await db.selectBlockedCounterpartyIds(
                                payload.id
                            );
                            return withCors(
                                Response.json(
                                    {
                                        userIds: blockedUserIds,
                                    },
                                    { status: 200 }
                                )
                            );
                        })
                    )
                ),
        },
        '/api/users/:id/block': {
            POST: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const parsedTargetId = z.uuid().safeParse(req.params.id);
                            if (!parsedTargetId.success) {
                                return withCors(BAD_REQUEST);
                            }

                            const payload = session as JwtPayload;
                            if (payload.id === parsedTargetId.data) {
                                return withCors(BAD_REQUEST);
                            }

                            const existingUsers = await db.selectExistingUserIds([
                                payload.id,
                                parsedTargetId.data,
                            ]);
                            if (existingUsers.length !== 2) {
                                return withCors(NOT_FOUND);
                            }

                            await db.blockUser(payload.id, parsedTargetId.data);
                            return withCors(SUCCESS);
                        })
                    )
                ),
            DELETE: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const parsedTargetId = z.uuid().safeParse(req.params.id);
                            if (!parsedTargetId.success) {
                                return withCors(BAD_REQUEST);
                            }

                            const payload = session as JwtPayload;
                            if (payload.id === parsedTargetId.data) {
                                return withCors(BAD_REQUEST);
                            }

                            await db.unblockUser(payload.id, parsedTargetId.data);
                            return withCors(SUCCESS);
                        })
                    )
                ),
        },
        '/api/chats/:id': {
            GET: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const threadId = req.params.id;

                            const chats = await db.selectChats(payload.id);
                            const isParticipant = chats.some((chat) => chat.chatId === threadId);
                            if (!isParticipant) {
                                return withCors(FORBIDDEN);
                            }

                            const participants = await db.selectChat(threadId, payload.id);
                            if (!participants) {
                                return withCors(NOT_FOUND);
                            }
                            return withCors(Response.json(participants, { status: 200 }));
                        })
                    )
                ),
        },
        '/api/chats/:id/participants': {
            POST: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const body: AddChatParticipantsBody = await req
                                .json()
                                .then((raw) => addChatParticipantsSchema.parse(raw));

                            const chat = await db.selectChat(req.params.id, payload.id);
                            if (!chat || !chat.isGroup) {
                                return withCors(FORBIDDEN);
                            }

                            const existingUsers = await db.selectExistingUserIds([
                                payload.id,
                                ...body.participantIds,
                            ]);
                            if (existingUsers.length !== body.participantIds.length + 1) {
                                return withCors(NOT_FOUND);
                            }

                            await db.addChatParticipants(
                                req.params.id,
                                body.participantIds,
                                payload.id
                            );
                            return withCors(SUCCESS);
                        })
                    )
                ),
        },
        '/api/chats/:id/participants/:userId': {
            DELETE: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const participantId = z.uuid().safeParse(req.params.userId);
                            if (!participantId.success) {
                                return withCors(BAD_REQUEST);
                            }

                            const chat = await db.selectChat(req.params.id, payload.id);
                            if (!chat || !chat.isGroup) {
                                return withCors(FORBIDDEN);
                            }

                            const participantRoles = await db.selectChatParticipantRoles(
                                req.params.id
                            );
                            const currentRoles = participantRoles[payload.id as string] ?? [];
                            const canRemove =
                                chat.ownerId === payload.id || currentRoles.includes('admin');
                            if (!canRemove) {
                                return withCors(FORBIDDEN);
                            }

                            if (participantId.data === chat.ownerId) {
                                return withCors(FORBIDDEN);
                            }

                            await db.removeChatParticipant(
                                req.params.id,
                                participantId.data,
                                payload.id
                            );
                            return withCors(SUCCESS);
                        })
                    )
                ),
        },
        '/api/chats/:id/participants/:userId/admin': {
            POST: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const participantId = z.uuid().safeParse(req.params.userId);
                            if (!participantId.success) {
                                return withCors(BAD_REQUEST);
                            }

                            const chat = await db.selectChat(req.params.id, payload.id);
                            if (!chat || !chat.isGroup || chat.ownerId !== payload.id) {
                                return withCors(FORBIDDEN);
                            }

                            const targetRoles = await db.selectChatParticipantRoles(req.params.id);
                            if ((targetRoles[participantId.data] ?? []).includes('owner')) {
                                return withCors(BAD_REQUEST);
                            }

                            await db.promoteChatParticipantToAdmin(
                                req.params.id,
                                participantId.data,
                                payload.id
                            );
                            return withCors(SUCCESS);
                        })
                    )
                ),
        },
        '/api/library': {
            GET: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const user = await db.selectFullUser(payload.id);
                            if (!user || !user.location) {
                                return withCors(BAD_REQUEST);
                            }

                            const items = await db.selectLibraryItems(
                                user.location.lat!,
                                user.location.lng!,
                                user.radius ?? 5000 // Default to 5km if not set
                            );
                            return withCors(Response.json(items, { status: 200 }));
                        })
                    )
                ),
            POST: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const body: CreateLibraryItemBody = await req
                                .json()
                                .then((raw) => createLibraryItemSchema.parse(raw));

                            const item = await db.insertLibraryItem({
                                authorId: payload.id,
                                type: body.type,
                                title: body.title,
                                description: body.description ?? '',
                                tags: body.tags,
                            });

                            return withCors(Response.json(item, { status: 201 }));
                        })
                    )
                ),
        },
        '/api/library/:id': {
            PATCH: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const body: UpdateLibraryItemBody = await req
                                .json()
                                .then((raw) => updateLibraryItemSchema.parse(raw));

                            const success = await db.updateLibraryItemAvailability(
                                req.params.id,
                                payload.id,
                                body.isAvailable
                            );

                            return withCors(
                                Response.json({ success }, { status: success ? 200 : 403 })
                            );
                        })
                    )
                ),
            DELETE: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const success = await db.deleteLibraryItem(req.params.id, payload.id);

                            return withCors(
                                Response.json({ success }, { status: success ? 200 : 403 })
                            );
                        })
                    )
                ),
        },
        '/api/pulses/:id/confirm': {
            POST: async (req) =>
                validate(req, async () =>
                    authorize(req, async (session) =>
                        caught(async () => {
                            const payload = session as JwtPayload;
                            const result = await db.confirmPulse(req.params.id, payload.id);

                            if (!result.success && result.alreadyConfirmed) {
                                return withCors(
                                    Response.json({ error: 'Already confirmed' }, { status: 409 })
                                );
                            }

                            if (!result.success) {
                                return withCors(BAD_REQUEST);
                            }

                            return withCors(SUCCESS);
                        })
                    )
                ),
        },
        '/*': {
            OPTIONS: withCors(OPTIONS_RESPONSE),
        },
    },
    websocket: {
        idleTimeout: 0,
        publishToSelf: true,
        open(ws) {
            ws.subscribe(PULSE_FEED_TOPIC);
        },
        message(ws, message) {
            if (typeof message !== 'string') return;
            void handleSocketMessage(ws, message);
        },
    },
});
