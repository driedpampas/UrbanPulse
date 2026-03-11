import * as bun from 'bun';
import * as db from './db';
import * as auth from './auth';
import { z } from 'zod';
import swaggerDoc from './swagger.json';
import type { JwtPayload } from 'jsonwebtoken';

const PORT = 3000;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};

const SUCCESS = new Response(null, { status: 200 });
const OPTIONS_RESPONSE = new Response(null, { status: 204 });
const BAD_REQUEST = new Response(null, { status: 400 });
const UNAUTHORIZED = new Response(null, { status: 401 });
const FORBIDDEN = new Response(null, { status: 403 });
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

function caught(handler: () => Response | Promise<Response>): Response | Promise<Response> {
    try {
        return handler();
    } catch (err) {
        if (err instanceof z.ZodError) {
            return BAD_REQUEST;
        }
        console.log(err);
        return SERVER_ERROR;
    }
}

function authorize(
    request: Request,
    handler: (payload: string | JwtPayload) => Response | Promise<Response>
): Response | Promise<Response> {
    const session = auth.verifyToken(request);

    if (session === null) {
        return withCors(UNAUTHORIZED);
    }

    return handler(session);
}

function unauthorize(
    request: Request,
    handler: () => Response | Promise<Response>
): Response | Promise<Response> {
    const session = auth.verifyToken(request);

    if (session !== null) {
        return withCors(FORBIDDEN);
    }

    return handler();
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

const updateUserSchema = z.strictObject({
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
            start: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM'),
            end: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM'),
        })
        .nullish(),
    quietDays: z.array(z.number().min(0).max(6)).max(7).nullish(),
});

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
    error(err) {
        console.log(err);
    },
    routes: {
        '/api/docs/swagger.json': {
            GET: withCors(Response.json(swaggerDoc)),
        },
        '/api/docs/': {
            GET: (r) => {
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
                ),
        },
        '/api/auth/login': {
            POST: async (req) =>
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
                }),
        },
        '/api/user': {
            PATCH: async (req) =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload: JwtPayload = session as JwtPayload;
                        const body: UpdateUserBody = await req
                            .json()
                            .then((raw) => updateUserSchema.parse(raw));

                        await db.updateUserProfile({ id: payload.id, ...body });

                        return SUCCESS;
                    })
                ),
        },
        '/api/user/password': {
            PATCH: async (req) =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload: JwtPayload = session as JwtPayload;
                        const body: UpdatePassBody = await req
                            .json()
                            .then((raw) => updatePassSchema.parse(raw));

                        const [{ password_hash }] = await db.selectPasswordHash(payload.id);

                        const isCorrect = await bun.password.verify(
                            body.oldPassword,
                            password_hash
                        );

                        if (!isCorrect) {
                            return UNAUTHORIZED;
                        }

                        const newPassHash = await bun.password.hash(body.newPassword);
                        await db.updateUserPassword(payload.id, newPassHash);

                        return SUCCESS;
                    })
                ),
        },
    },
});
