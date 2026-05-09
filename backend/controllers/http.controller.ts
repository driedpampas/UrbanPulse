import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as bun from 'bun';
import type { JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import * as auth from '../auth';
import type { PulseType, Timerange } from '../db';
import * as db from '../db';
import { adminAuthorize, authorize, unauthorize } from '../middleware/auth.middleware';
import { isAllowedOrigin, validate, withCors } from '../middleware/cors.middleware';
import {
    BAD_REQUEST,
    caught,
    FORBIDDEN,
    NOT_FOUND,
    OPTIONS_RESPONSE,
    SERVER_ERROR,
    SUCCESS,
    UNAUTHORIZED,
} from '../middleware/error.middleware';
import swaggerDoc from '../swagger.json';
import type {
    AddChatParticipantsBody,
    CreateChatBody,
    CreateLibraryItemBody,
    CreateMessageBody,
    CreatePulseBody,
    DeleteMessageBody,
    InteractionFeedbackBody,
    LoginUserBody,
    PasswordConfirmBody,
    PasswordRequestBody,
    PulseListQuery,
    PulseMatchBody,
    RegisterUserBody,
    SearchUsersQuery,
    UpdateChatNameBody,
    UpdateEmailBody,
    UpdateLibraryItemBody,
    UpdateMessageBody,
    UpdatePassBody,
    UpdatePulseBody,
    UpdateUserBody,
    VerifyEmailQuery,
} from '../validators/http.validators';
import {
    addChatParticipantsSchema,
    adminMessageReportActionSchema,
    adminMessageReportsQuerySchema,
    adminUsersQuerySchema,
    buildSearchParams,
    chatSocketMessageSchema,
    createChatSchema,
    createLibraryItemSchema,
    createMessageReportSchema,
    createMessageSchema,
    createPulseSchema,
    createReportSchema,
    deleteMessageSchema,
    interactionFeedbackSchema,
    loginUserSchema,
    messageNotificationPayloadSchema,
    PROFILE_PICTURE_ALLOWED_MIME_TYPES,
    PROFILE_PICTURE_MAX_BYTES,
    passwordConfirmSchema,
    passwordRequestSchema,
    profilePictureRouteParamsSchema,
    pulseListQuerySchema,
    pulseMatchSchema,
    registerUserSchema,
    resourceCatalogQuerySchema,
    searchUsersSchema,
    sendMessageResponseSchema,
    updateAdminUserRoleBodySchema,
    updateChatNameSchema,
    updateEmailSchema,
    updateLibraryItemSchema,
    updateMessageSchema,
    updatePassSchema,
    updatePulseSchema,
    updateReportStatusSchema,
    updateUserSchema,
    verifyEmailQuerySchema,
} from '../validators/http.validators';

const PULSE_FEED_TOPIC = 'pulse-feed';
const DEFAULT_PULSE_URGENCY: Record<PulseType, number> = {
    update: 1,
    emergency: 5,
    skill: 2,
    item: 1,
    need: 4,
    pet: 2,
};

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_PICTURE_DIR = path.join(BACKEND_ROOT, 'storage', 'profile-pictures');

type DetectedImageMime = (typeof PROFILE_PICTURE_ALLOWED_MIME_TYPES)[number];

function detectImageMimeType(buffer: Uint8Array): DetectedImageMime | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }

    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return 'image/png';
    }

    if (
        buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    ) {
        return 'image/webp';
    }

    return null;
}

function fileExtensionForMimeType(mimeType: DetectedImageMime): string {
    if (mimeType === 'image/jpeg') {
        return 'jpg';
    }
    if (mimeType === 'image/png') {
        return 'png';
    }
    return 'webp';
}

function buildProfilePictureFilename(userId: string, mimeType: DetectedImageMime): string {
    return `${userId}.${fileExtensionForMimeType(mimeType)}`;
}

function resolveProfilePicturePath(filename: string): string {
    const safeName = path.basename(filename);
    const absolutePath = path.resolve(PROFILE_PICTURE_DIR, safeName);
    if (!absolutePath.startsWith(`${PROFILE_PICTURE_DIR}${path.sep}`)) {
        throw new Error('Invalid profile picture path');
    }
    return absolutePath;
}

async function removeProfilePictureFile(filename: string | null | undefined): Promise<void> {
    if (!filename) {
        return;
    }

    try {
        await rm(resolveProfilePicturePath(filename), { force: true });
    } catch (error) {
        console.warn('Failed to remove profile picture file:', error);
    }
}

type HttpRoutes = NonNullable<Parameters<typeof bun.serve>[0]['routes']>;

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
        if (!payload) {
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
    if (!payload) {
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

export const httpRoutes: HttpRoutes = {
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
    '/api/auth/verify': {
        GET: async (req) =>
            validate(req, async () =>
                caught(async () => {
                    const url = new URL(req.url);
                    const query: VerifyEmailQuery = verifyEmailQuerySchema.parse({
                        token: url.searchParams.get('token'),
                    });

                    const result = await auth.verifyEmailToken(query.token);

                    if (!result.success) {
                        if (result.status === 404) {
                            return withCors(
                                Response.json(
                                    { error: 'Verification token is invalid or expired.' },
                                    { status: 404 }
                                )
                            );
                        }

                        return withCors(
                            Response.json({ error: 'Invalid verification token.' }, { status: 400 })
                        );
                    }

                    return withCors(
                        Response.json(
                            { success: true, message: 'Email verified successfully.' },
                            { status: 200 }
                        )
                    );
                })
            ),
    },
    '/api/auth/verify/request': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload: JwtPayload = session as JwtPayload;

                        const rawBody = await req.text();
                        if (rawBody.length > 0) {
                            try {
                                JSON.parse(rawBody);
                            } catch {
                                return withCors(BAD_REQUEST);
                            }
                        }

                        const result = await auth.requestVerificationEmail(payload.id);

                        if (!result.success) {
                            if (result.status === 404) {
                                return withCors(NOT_FOUND);
                            }

                            if (result.status === 409) {
                                return withCors(
                                    Response.json(
                                        { error: 'Email is already verified.' },
                                        { status: 409 }
                                    )
                                );
                            }

                            return withCors(
                                Response.json(
                                    { error: 'Unable to send verification email.' },
                                    { status: result.status }
                                )
                            );
                        }

                        return withCors(
                            Response.json(
                                {
                                    success: true,
                                    message: 'Verification link sent to your email address.',
                                },
                                { status: 200 }
                            )
                        );
                    })
                )
            ),
    },
    '/api/auth/password': {
        PATCH: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const _payload: JwtPayload = session as JwtPayload;
                        const _body: UpdatePassBody = await req
                            .json()
                            .then((raw) => updatePassSchema.parse(raw));

                        return withCors(
                            Response.json(
                                {
                                    error: 'Direct password updates are disabled. Use /api/password/request and /api/password/confirm.',
                                },
                                { status: 403 }
                            )
                        );
                    })
                )
            ),
    },
    '/api/auth/password-reset': {
        POST: async (req) =>
            validate(req, async () =>
                unauthorize(req, async () =>
                    caught(async () => {
                        const body: { email: string } = await req.json();
                        if (!body.email || typeof body.email !== 'string') {
                            return withCors(BAD_REQUEST);
                        }

                        const result = await auth.requestPasswordResetByEmail(body.email);

                        if (!result.success) {
                            return withCors(
                                Response.json(
                                    { error: 'Unable to process password reset request.' },
                                    { status: result.status }
                                )
                            );
                        }

                        return withCors(
                            Response.json(
                                {
                                    success: true,
                                    message:
                                        'If an account with that email exists, a reset link has been sent.',
                                },
                                { status: 200 }
                            )
                        );
                    })
                )
            ),
    },
    '/api/password/request': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload: JwtPayload = session as JwtPayload;
                        const rawBody = await req.text();
                        let parsedBody: unknown = {};
                        if (rawBody.length > 0) {
                            try {
                                parsedBody = JSON.parse(rawBody);
                            } catch {
                                return withCors(BAD_REQUEST);
                            }
                        }
                        const _body: PasswordRequestBody = passwordRequestSchema.parse(parsedBody);

                        const result = await auth.requestPasswordChange(payload.id);

                        if (!result.success) {
                            if (result.status === 404) {
                                return withCors(NOT_FOUND);
                            }

                            return withCors(
                                Response.json(
                                    { error: 'Unable to send password change email.' },
                                    { status: result.status }
                                )
                            );
                        }

                        return withCors(
                            Response.json(
                                {
                                    success: true,
                                    message:
                                        'Password change link sent to your current email address.',
                                },
                                { status: 200 }
                            )
                        );
                    })
                )
            ),
    },
    '/api/password/confirm': {
        POST: async (req) =>
            validate(req, async () =>
                caught(async () => {
                    const body: PasswordConfirmBody = await req
                        .json()
                        .then((raw) => passwordConfirmSchema.parse(raw));

                    const result = await auth.confirmPasswordChange(body.token, body.newPassword);

                    if (!result.success) {
                        if (result.status === 404) {
                            return withCors(
                                Response.json(
                                    { error: 'Password reset token is invalid.' },
                                    { status: 404 }
                                )
                            );
                        }

                        if (result.status === 410) {
                            return withCors(
                                Response.json(
                                    { error: 'Password reset token has expired.' },
                                    { status: 410 }
                                )
                            );
                        }

                        return withCors(
                            Response.json(
                                { error: 'Invalid password reset request.' },
                                { status: result.status }
                            )
                        );
                    }

                    return withCors(
                        Response.json(
                            { success: true, message: 'Password updated successfully.' },
                            { status: 200 }
                        )
                    );
                })
            ),
    },
    '/api/settings/email': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload: JwtPayload = session as JwtPayload;
                        const body: UpdateEmailBody = await req
                            .json()
                            .then((raw) => updateEmailSchema.parse(raw));

                        const result = await auth.changeUserEmail(payload.id, body.email);

                        if (!result.success) {
                            if (result.status === 409) {
                                return withCors(
                                    Response.json(
                                        { error: 'Email is already in use.' },
                                        { status: 409 }
                                    )
                                );
                            }

                            if (result.status === 400) {
                                return withCors(
                                    Response.json(
                                        {
                                            error: 'Please choose a different email address to update your account.',
                                        },
                                        { status: 400 }
                                    )
                                );
                            }

                            if (result.status === 404) {
                                return withCors(NOT_FOUND);
                            }

                            return withCors(
                                Response.json(
                                    {
                                        error: 'Unable to send verification email to the new address.',
                                    },
                                    { status: result.status }
                                )
                            );
                        }

                        return withCors(
                            Response.json(
                                {
                                    success: true,
                                    email: result.email,
                                    isEmailVerified: result.isEmailVerified,
                                    message:
                                        'Email updated. Please verify your new email address to unlock high-trust features.',
                                },
                                { status: 200 }
                            )
                        );
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
                            timezone: body.timezone,
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
                        const scheduled = await db.requestUserDeletion(payload.id);
                        return withCors(scheduled ? SUCCESS : NOT_FOUND);
                    })
                )
            ),
    },
    '/api/user/deletion/cancel': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload: JwtPayload = session as JwtPayload;
                        const cancelled = await db.cancelUserDeletion(payload.id);
                        return withCors(cancelled ? SUCCESS : NOT_FOUND);
                    })
                )
            ),
    },
    '/api/user/pfp': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const formData = await req.formData();
                        const candidate =
                            formData.get('pfp') ?? formData.get('file') ?? formData.get('image');

                        if (!(candidate instanceof File)) {
                            return withCors(
                                Response.json(
                                    { error: 'Attach an image file in field pfp, file, or image.' },
                                    { status: 400 }
                                )
                            );
                        }

                        if (candidate.size <= 0 || candidate.size > PROFILE_PICTURE_MAX_BYTES) {
                            return withCors(
                                Response.json(
                                    {
                                        error: `Profile picture must be between 1 byte and ${PROFILE_PICTURE_MAX_BYTES} bytes.`,
                                    },
                                    { status: 400 }
                                )
                            );
                        }

                        const bytes = new Uint8Array(await candidate.arrayBuffer());
                        const detectedMimeType = detectImageMimeType(bytes);
                        if (!detectedMimeType) {
                            return withCors(
                                Response.json(
                                    { error: 'Only JPEG, PNG, and WEBP images are supported.' },
                                    { status: 400 }
                                )
                            );
                        }

                        if (bytes.byteLength > PROFILE_PICTURE_MAX_BYTES) {
                            return withCors(
                                Response.json(
                                    {
                                        error: `Profile picture exceeds ${PROFILE_PICTURE_MAX_BYTES} bytes after processing.`,
                                    },
                                    { status: 400 }
                                )
                            );
                        }

                        const previous = await db.selectUserProfilePicture(payload.id);

                        await mkdir(PROFILE_PICTURE_DIR, { recursive: true });
                        const filename = buildProfilePictureFilename(payload.id, detectedMimeType);
                        const destination = resolveProfilePicturePath(filename);
                        await writeFile(destination, bytes);

                        const saved = await db.setUserProfilePicture(
                            payload.id,
                            filename,
                            detectedMimeType,
                            bytes.byteLength
                        );

                        if (!saved) {
                            await removeProfilePictureFile(filename);
                            return withCors(NOT_FOUND);
                        }

                        if (previous?.filename && previous.filename !== filename) {
                            await removeProfilePictureFile(previous.filename);
                        }

                        return withCors(
                            Response.json(
                                {
                                    success: true,
                                    mimeType: detectedMimeType,
                                    sizeBytes: bytes.byteLength,
                                },
                                { status: 200 }
                            )
                        );
                    })
                )
            ),
        DELETE: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const existing = await db.selectUserProfilePicture(payload.id);
                        const cleared = await db.clearUserProfilePicture(payload.id);
                        if (!cleared) {
                            return withCors(NOT_FOUND);
                        }

                        await removeProfilePictureFile(existing?.filename);

                        return withCors(
                            Response.json(
                                {
                                    success: true,
                                },
                                { status: 200 }
                            )
                        );
                    })
                )
            ),
    },
    '/api/user/pfp/:userId': {
        GET: async (req) =>
            validate(req, async () =>
                authorize(req, async () =>
                    caught(async () => {
                        const parsedParams = profilePictureRouteParamsSchema.safeParse({
                            userId: req.params.userId,
                        });
                        if (!parsedParams.success) {
                            return withCors(BAD_REQUEST);
                        }

                        const picture = await db.selectUserProfilePicture(parsedParams.data.userId);
                        if (!picture) {
                            return withCors(NOT_FOUND);
                        }

                        if (
                            !PROFILE_PICTURE_ALLOWED_MIME_TYPES.includes(
                                picture.mimeType as DetectedImageMime
                            )
                        ) {
                            return withCors(BAD_REQUEST);
                        }

                        const filePath = resolveProfilePicturePath(picture.filename);

                        try {
                            const data = await readFile(filePath);

                            return withCors(
                                new Response(data, {
                                    status: 200,
                                    headers: {
                                        'Content-Type': picture.mimeType,
                                        'Content-Length': String(data.byteLength),
                                        'Cache-Control': 'private, max-age=3600',
                                        'X-Content-Type-Options': 'nosniff',
                                    },
                                })
                            );
                        } catch (err) {
                            await db.clearUserProfilePicture(parsedParams.data.userId);
                            console.error('Profile picture not found: ', err);
                            return withCors(SERVER_ERROR);
                        }
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
                            const isAdmin = requesterRole === 'admin' || requesterRole === 'mod';

                            users = users.map((u) => {
                                if (!isAdmin && u.id !== payload.id) {
                                    const {
                                        email: _email,
                                        location: _loc,
                                        radius: _rad,
                                        ...rest
                                    } = u;
                                    return rest;
                                }
                                return u;
                            });

                            return withCors(Response.json(users, { status: 200 }));
                        }),
                    () =>
                        caught(async () => {
                            const url = new URL(req.url);
                            const query: SearchUsersQuery = searchUsersSchema.parse({
                                id: url.searchParams.get('id'),
                                displayName: url.searchParams.get('displayName'),
                                radius: url.searchParams.get('radius'),
                                location:
                                    url.searchParams.get('lat') || url.searchParams.get('lng')
                                        ? {
                                              lat: url.searchParams.get('lat'),
                                              lng: url.searchParams.get('lng'),
                                          }
                                        : null,
                                limit: url.searchParams.get('limit'),
                                offset: url.searchParams.get('offset'),
                            });

                            let users = await db.searchUsers(
                                buildSearchParams(query),
                                query.limit,
                                query.offset
                            );

                            users = users.map((u) => {
                                const { email: _email, location: _loc, radius: _rad, ...rest } = u;
                                return rest;
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
                            id: url.searchParams.get('id'),
                            displayName: url.searchParams.get('displayName'),
                            role: url.searchParams.get('role'),
                            limit: url.searchParams.get('limit'),
                            offset: url.searchParams.get('offset'),
                        });

                        const users = await db.searchUsers(
                            buildSearchParams({
                                id: query.id,
                                email: null,
                                anyskillres: null,
                                skillres: null,
                                min_trust: null,
                                max_trust: null,
                                created_before: null,
                                created_after: null,
                                displayName: query.displayName,
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
                adminAuthorize(req, async (session) =>
                    caught(async () => {
                        const body = updateAdminUserRoleBodySchema.parse(
                            await req.json().then((raw) => raw)
                        );
                        const actorRole = (await db.selectUserRole(session.id))?.toLowerCase();
                        if (actorRole !== 'admin' && actorRole !== 'mod') {
                            return withCors(FORBIDDEN);
                        }

                        const targetRole = (
                            await db.selectUserRole(req.params.id as string)
                        )?.toLowerCase();
                        if (!targetRole) {
                            return withCors(NOT_FOUND);
                        }

                        const nextRole = body.role.toLowerCase();

                        const actorIsAdmin = actorRole === 'admin';
                        if (!actorIsAdmin && (nextRole === 'admin' || targetRole === 'admin')) {
                            return withCors(FORBIDDEN);
                        }

                        const updated = await db.updateUserRole(req.params.id as string, nextRole);

                        if (!updated) {
                            return withCors(NOT_FOUND);
                        }

                        return withCors(SUCCESS);
                    })
                )
            ),
    },
    '/api/admin/users/:id': {
        DELETE: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const scheduled = await db.requestUserDeletion(req.params.id as string);
                        return withCors(scheduled ? SUCCESS : NOT_FOUND);
                    })
                )
            ),
    },
    '/api/admin/user-deletions': {
        GET: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const url = new URL(req.url);
                        const limit = Number(url.searchParams.get('limit') ?? '50');
                        const offset = Number(url.searchParams.get('offset') ?? '0');
                        const deletions = await db.selectPendingUserDeletions(
                            Number.isFinite(limit) ? limit : 50,
                            Number.isFinite(offset) ? offset : 0
                        );

                        return withCors(Response.json({ deletions }, { status: 200 }));
                    })
                )
            ),
    },
    '/api/admin/user-deletions/:id/cancel': {
        POST: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const cancelled = await db.cancelUserDeletion(req.params.id as string);
                        return withCors(cancelled ? SUCCESS : NOT_FOUND);
                    })
                )
            ),
    },
    '/api/admin/requests': {
        GET: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const url = new URL(req.url);
                        const limit = Number(url.searchParams.get('limit') ?? '50');
                        const offset = Number(url.searchParams.get('offset') ?? '0');
                        const requests = await db.selectAdminRequests(
                            Number.isFinite(limit) ? limit : 50,
                            Number.isFinite(offset) ? offset : 0
                        );

                        return withCors(Response.json({ requests }, { status: 200 }));
                    })
                )
            ),
    },
    '/api/admin/requests/:id/interactions': {
        GET: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const interactions = await db.selectPulseInteractionsAsAdmin(
                            req.params.id as string
                        );

                        return withCors(Response.json({ interactions }, { status: 200 }));
                    })
                )
            ),
    },
    '/api/admin/requests/:id/interactions/:interactionId/success': {
        POST: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const result = await db.confirmPulseInteractionAsAdmin({
                            pulseId: req.params.id as string,
                            interactionId: req.params.interactionId as string,
                        });

                        if (!result.success && result.solved) {
                            return withCors(
                                Response.json({ error: 'Pulse already solved' }, { status: 409 })
                            );
                        }

                        if (!result.success && result.nonRequestType) {
                            return withCors(
                                Response.json(
                                    {
                                        error: 'Only need pulse interactions can be marked successful',
                                    },
                                    { status: 409 }
                                )
                            );
                        }

                        if (!result.success || !result.interaction) {
                            return withCors(BAD_REQUEST);
                        }

                        return withCors(
                            Response.json({ interaction: result.interaction }, { status: 200 })
                        );
                    })
                )
            ),
    },
    '/api/admin/requests/:id/solve': {
        POST: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const result = await db.markPulseSolvedAsAdmin(req.params.id as string);

                        if (!result.pulse && result.noSuccessfulInteractions) {
                            return withCors(
                                Response.json(
                                    {
                                        error: 'A pulse can only be marked solved after at least one successful interaction',
                                    },
                                    { status: 409 }
                                )
                            );
                        }

                        if (!result.pulse) {
                            return withCors(NOT_FOUND);
                        }

                        return withCors(Response.json({ pulse: result.pulse }, { status: 200 }));
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
        DELETE: async (req, server) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const url = new URL(req.url);
                        const pulseId = url.searchParams.get('id');

                        if (!pulseId) {
                            return withCors(BAD_REQUEST);
                        }

                        const pulse = await db.selectPulseById(pulseId);
                        if (!pulse) {
                            return withCors(NOT_FOUND);
                        }

                        const deleted = await db.deletePulse(pulse.id);
                        if (!deleted) {
                            return withCors(NOT_FOUND);
                        }

                        server.publish(
                            PULSE_FEED_TOPIC,
                            JSON.stringify({ event: 'pulse.deleted', pulseId: pulse.id })
                        );

                        return withCors(new Response(null, { status: 204 }));
                    })
                )
            ),
    },
    '/api/admin/pulses/:id': {
        GET: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const pulse = await db.selectPulseById(req.params.id as string);
                        if (!pulse) {
                            return withCors(NOT_FOUND);
                        }

                        return withCors(Response.json(pulse, { status: 200 }));
                    })
                )
            ),
        DELETE: async (req, server) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const pulse = await db.selectPulseById(req.params.id as string);
                        if (!pulse) {
                            return withCors(NOT_FOUND);
                        }

                        const deleted = await db.deletePulse(pulse.id);
                        if (!deleted) {
                            return withCors(NOT_FOUND);
                        }

                        server.publish(
                            PULSE_FEED_TOPIC,
                            JSON.stringify({ event: 'pulse.deleted', pulseId: pulse.id })
                        );

                        return withCors(new Response(null, { status: 204 }));
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
    '/api/admin/reports/messages': {
        GET: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const url = new URL(req.url);
                        const query = adminMessageReportsQuerySchema.parse({
                            status: url.searchParams.get('status') ?? undefined,
                            limit: url.searchParams.get('limit') ?? undefined,
                            offset: url.searchParams.get('offset') ?? undefined,
                        });

                        const reports = await db.selectAdminMessageReports({
                            status: query.status ?? 'pending',
                            limit: query.limit,
                            offset: query.offset,
                        });

                        return withCors(Response.json({ reports }, { status: 200 }));
                    })
                )
            ),
    },
    '/api/admin/reports/messages/:reportId/action': {
        POST: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const body = adminMessageReportActionSchema.parse(await req.json());
                        const result = await db.applyAdminMessageReportAction({
                            reportId: req.params.reportId as string,
                            action: body.action,
                        });

                        if (!result.success && result.notFound) {
                            return withCors(NOT_FOUND);
                        }

                        if (!result.success && result.invalidState) {
                            return withCors(
                                Response.json(
                                    { error: 'Report already processed.' },
                                    { status: 409 }
                                )
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
    '/api/admin/reports/:id/status': {
        PATCH: async (req) =>
            validate(req, async () =>
                adminAuthorize(req, async () =>
                    caught(async () => {
                        const body = updateReportStatusSchema.parse(await req.json());
                        const updated = await db.updateReportStatus(
                            req.params.id as string,
                            body.status
                        );
                        if (!updated) return withCors(NOT_FOUND);
                        return withCors(SUCCESS);
                    })
                )
            ),
    },
    '/api/messages/:messageId': {
        PATCH: async (req, server) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const parsedMessageId = z.uuid().safeParse(req.params.messageId as string);
                        if (!parsedMessageId.success) {
                            return withCors(BAD_REQUEST);
                        }

                        const body: UpdateMessageBody = await req
                            .json()
                            .then((raw) => updateMessageSchema.parse(raw));

                        const result = await db.editMessage(
                            parsedMessageId.data,
                            payload.id,
                            body.content
                        );

                        if (!result.success && result.reason === 'not_found') {
                            return withCors(NOT_FOUND);
                        }

                        if (!result.success && result.reason === 'forbidden') {
                            return withCors(FORBIDDEN);
                        }

                        if (!result.success) {
                            return withCors(BAD_REQUEST);
                        }

                        server.publish(
                            `chat-${result.message.threadId}`,
                            JSON.stringify({
                                event: 'message.updated',
                                message: result.message,
                            })
                        );

                        return withCors(
                            Response.json(
                                {
                                    message: result.message,
                                },
                                { status: 200 }
                            )
                        );
                    })
                )
            ),
    },
    '/api/messages/:messageId/report': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const body = createMessageReportSchema.parse(await req.json());
                        const parsedMessageId = z.uuid().safeParse(req.params.messageId as string);

                        if (!parsedMessageId.success) {
                            return withCors(BAD_REQUEST);
                        }

                        if (body.targetId && body.targetId !== parsedMessageId.data) {
                            return withCors(BAD_REQUEST);
                        }

                        const message = await db.selectMessage(parsedMessageId.data, payload.id);

                        if (!message) {
                            return withCors(NOT_FOUND);
                        }

                        if (message.senderId === payload.id) {
                            return withCors(
                                Response.json(
                                    { error: 'You cannot report your own message.' },
                                    { status: 400 }
                                )
                            );
                        }

                        const report = await db.insertMessageReport({
                            reporterId: payload.id,
                            offenderId: message.senderId,
                            messageId: message.id,
                            reason: body.reason,
                        });

                        return withCors(Response.json(report, { status: 201 }));
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
    '/api/pulse/resources': {
        GET: async (req) =>
            validate(req, async () =>
                caught(async () => {
                    const url = new URL(req.url);
                    const query = resourceCatalogQuerySchema.parse({
                        q: url.searchParams.get('q') ?? undefined,
                        limit: url.searchParams.get('limit') ?? undefined,
                    });

                    const resources = await db.selectResourceCatalog(query.q, query.limit ?? 120);
                    return withCors(Response.json({ resources }, { status: 200 }));
                })
            ),
    },
    '/api/pulse/match': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const body: PulseMatchBody = await req
                            .json()
                            .then((raw) => pulseMatchSchema.parse(raw));

                        let location = body.location;
                        const fullUser = await db.selectFullUser(payload.id);
                        const requesterTimezone =
                            body.timezone?.trim() || fullUser?.timezone || 'UTC';

                        if (!location) {
                            if (!fullUser?.location) {
                                return withCors(BAD_REQUEST);
                            }

                            location = {
                                lat: Number(fullUser.location.lat),
                                lng: Number(fullUser.location.lng),
                            };
                        }

                        const matches = await db.matchHeroesByResources({
                            authorId: payload.id,
                            lat: location.lat,
                            lng: location.lng,
                            requestedResources: body.resources,
                            requesterTimezone,
                        });

                        return withCors(Response.json({ matches }, { status: 200 }));
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

                    const type = url.searchParams.get('type') as PulseType | null;

                    const pulses = await db.selectPulses(
                        Number.isFinite(requestedLimit) ? requestedLimit : 50,
                        lat,
                        lng,
                        radius,
                        Number.isFinite(offset) ? offset : 0,
                        type || undefined,
                        !type
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
                            const requestedType = body.type.toLowerCase() as PulseType;
                            const isEmergency =
                                Boolean(body.isEmergency) || requestedType === 'emergency';
                            const pulseType: PulseType =
                                requestedType === 'emergency' ||
                                requestedType === 'skill' ||
                                requestedType === 'item'
                                    ? 'need'
                                    : requestedType;
                            const urgencyLevel =
                                body.urgencyLevel ??
                                (isEmergency
                                    ? Math.max(DEFAULT_PULSE_URGENCY[pulseType], 5)
                                    : DEFAULT_PULSE_URGENCY[pulseType]);
                            const selectedResources =
                                pulseType === 'need'
                                    ? (body.selectedResources ?? body.requiredSkills ?? [])
                                          .map((value) => value.trim())
                                          .filter((value) => value.length > 0)
                                    : [];
                            const fullUser = await db.selectFullUser(payload.id);
                            const requesterTimezone =
                                body.timezone?.trim() || fullUser?.timezone || 'UTC';

                            const createdPulse = await db.insertPulse({
                                authorId: payload.id,
                                type: pulseType,
                                isEmergency,
                                urgencyLevel,
                                content: body.content,
                                location: body.location,
                                requiredSkills: selectedResources,
                            });

                            server.publish(
                                PULSE_FEED_TOPIC,
                                JSON.stringify({
                                    event: 'pulse.created',
                                    pulse: createdPulse,
                                })
                            );

                            const heroMatches = await db.matchHeroesByResources({
                                authorId: payload.id,
                                lat: createdPulse.lat,
                                lng: createdPulse.lng,
                                requestedResources: selectedResources,
                                requesterTimezone,
                            });

                            for (const match of heroMatches) {
                                if (match.suppressedByQuietHours) {
                                    continue;
                                }

                                server.publish(
                                    `user-${match.id}`,
                                    JSON.stringify({
                                        event: 'hero.alert',
                                        pulse: createdPulse,
                                        matchedResources: match.matchedResources,
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

            if (server.upgrade(req, { data: null })) {
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
                        const pulseId = req.params.id as string;
                        const pulse = await db.selectPulseById(pulseId);

                        if (!pulse) {
                            return withCors(NOT_FOUND);
                        }

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
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
    '/api/pulses/:id': {
        PATCH: async (req, server) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const parsedPulseId = z.uuid().safeParse(req.params.id as string);

                        if (!parsedPulseId.success) {
                            return withCors(BAD_REQUEST);
                        }

                        const body: UpdatePulseBody = await req
                            .json()
                            .then((raw) => updatePulseSchema.parse(raw));
                        const pulse = await db.selectPulseById(parsedPulseId.data);

                        if (!pulse) {
                            return withCors(NOT_FOUND);
                        }

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
                        const isModerator = role === 'admin' || role === 'mod';
                        const isAuthor = payload.id === pulse.userId;

                        if (!isAuthor && !isModerator) {
                            return withCors(FORBIDDEN);
                        }

                        if (body.requiredSkills !== undefined && pulse.type !== 'need') {
                            return withCors(
                                Response.json(
                                    {
                                        error: 'Only need pulses can update required skills.',
                                    },
                                    { status: 400 }
                                )
                            );
                        }

                        if (body.isEmergency !== undefined && pulse.type !== 'need') {
                            return withCors(
                                Response.json(
                                    {
                                        error: 'Only need pulses can be marked as emergency.',
                                    },
                                    { status: 400 }
                                )
                            );
                        }

                        const updates: {
                            content?: string;
                            isEmergency?: boolean;
                            requiredSkills?: string[];
                        } = {};

                        if (body.content !== undefined) {
                            updates.content = body.content.trim();
                        }

                        if (body.isEmergency !== undefined) {
                            updates.isEmergency = body.isEmergency;
                        }

                        if (body.requiredSkills !== undefined) {
                            updates.requiredSkills = body.requiredSkills
                                .map((value) => value.trim())
                                .filter((value) => value.length > 0);
                        }

                        const updatedPulse = await db.updatePulse(pulse.id, pulse.userId, updates);

                        if (!updatedPulse) {
                            return withCors(NOT_FOUND);
                        }

                        server.publish(
                            PULSE_FEED_TOPIC,
                            JSON.stringify({ event: 'pulse.updated', pulse: updatedPulse })
                        );

                        return withCors(Response.json(updatedPulse, { status: 200 }));
                    })
                )
            ),
    },
    '/api/pulses/me': {
        GET: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const url = new URL(req.url);
                        const query: PulseListQuery = pulseListQuerySchema.parse({
                            limit: url.searchParams.get('limit') ?? undefined,
                            offset: url.searchParams.get('offset') ?? undefined,
                        });

                        const pulses = await db.selectPulsesByAuthor(
                            payload.id,
                            query.limit,
                            query.offset
                        );

                        return withCors(Response.json({ pulses }, { status: 200 }));
                    })
                )
            ),
    },
    '/api/pulses/accepted': {
        GET: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const url = new URL(req.url);
                        const query: PulseListQuery = pulseListQuerySchema.parse({
                            limit: url.searchParams.get('limit') ?? undefined,
                            offset: url.searchParams.get('offset') ?? undefined,
                        });

                        const accepted = await db.selectAcceptedInteractionsForHelper(
                            payload.id,
                            query.limit,
                            query.offset
                        );

                        return withCors(Response.json({ accepted }, { status: 200 }));
                    })
                )
            ),
    },
    '/api/pulses/:id/accept': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const result = await db.insertPulseInteraction({
                            pulseId: req.params.id as string,
                            helperId: payload.id,
                        });

                        if (!result.success && result.solved) {
                            return withCors(
                                Response.json({ error: 'Pulse already solved' }, { status: 409 })
                            );
                        }

                        if (!result.success && result.nonRequestType) {
                            return withCors(
                                Response.json(
                                    { error: 'Only need pulses can be accepted' },
                                    { status: 409 }
                                )
                            );
                        }

                        if (!result.success && result.alreadyAccepted) {
                            return withCors(
                                Response.json({ error: 'Already accepted' }, { status: 409 })
                            );
                        }

                        if (!result.success || !result.interaction) {
                            return withCors(BAD_REQUEST);
                        }

                        return withCors(
                            Response.json({ interaction: result.interaction }, { status: 201 })
                        );
                    })
                )
            ),
    },
    '/api/pulses/:id/interactions': {
        GET: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const interactions = await db.selectPulseInteractions(
                            req.params.id as string,
                            payload.id
                        );

                        return withCors(Response.json({ interactions }, { status: 200 }));
                    })
                )
            ),
    },
    '/api/interactions/:id/feedback': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const body: InteractionFeedbackBody = await req
                            .json()
                            .then((raw) => interactionFeedbackSchema.parse(raw));

                        const result = await db.submitInteractionFeedback({
                            interactionId: req.params.id as string,
                            actorId: payload.id,
                            positive: body.positive,
                        });

                        if (!result.success && result.notFound) {
                            return withCors(NOT_FOUND);
                        }

                        if (!result.success && result.forbidden) {
                            return withCors(FORBIDDEN);
                        }

                        if (!result.success && result.positiveRequired) {
                            return withCors(BAD_REQUEST);
                        }

                        if (!result.success && result.solved) {
                            return withCors(
                                Response.json({ error: 'Pulse already solved' }, { status: 409 })
                            );
                        }

                        if (!result.success && result.nonRequestType) {
                            return withCors(
                                Response.json(
                                    {
                                        error: 'Feedback is only available for help interactions on need pulses',
                                    },
                                    { status: 409 }
                                )
                            );
                        }

                        if (!result.success || !result.interaction) {
                            return withCors(BAD_REQUEST);
                        }

                        return withCors(
                            Response.json(
                                {
                                    interaction: result.interaction,
                                    trustIncremented: Boolean(result.trustIncremented),
                                    successfulInteractions: result.helperSuccessfulCount ?? null,
                                    trustScore: result.helperTrustScore ?? null,
                                },
                                { status: 200 }
                            )
                        );
                    })
                )
            ),
    },
    '/api/pulses/:id/interactions/:interactionId/confirm': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const result = await db.confirmPulseInteraction({
                            pulseId: req.params.id as string,
                            interactionId: req.params.interactionId as string,
                            authorId: payload.id,
                        });

                        if (!result.success && result.solved) {
                            return withCors(
                                Response.json({ error: 'Pulse already solved' }, { status: 409 })
                            );
                        }

                        if (!result.success && result.nonRequestType) {
                            return withCors(
                                Response.json(
                                    {
                                        error: 'Only need pulse interactions can be marked successful',
                                    },
                                    { status: 409 }
                                )
                            );
                        }

                        if (!result.success || !result.interaction) {
                            return withCors(BAD_REQUEST);
                        }

                        return withCors(
                            Response.json({ interaction: result.interaction }, { status: 200 })
                        );
                    })
                )
            ),
    },
    '/api/pulses/:id/solve': {
        POST: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const result = await db.markPulseSolved(
                            req.params.id as string,
                            payload.id
                        );

                        if (!result.pulse && result.noSuccessfulInteractions) {
                            return withCors(
                                Response.json(
                                    {
                                        error: 'A pulse can only be marked solved after at least one successful interaction',
                                    },
                                    { status: 409 }
                                )
                            );
                        }

                        if (!result.pulse) {
                            return withCors(NOT_FOUND);
                        }

                        return withCors(Response.json({ pulse: result.pulse }, { status: 200 }));
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

                            const blocked = await db.isEitherUserBlocked(payload.id, otherUserId);
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
                        const threadId = req.params.id as string;

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
                        const chats = await db.selectChats(payload.id);
                        const isParticipant = chats.some((chat) => chat.chatId === threadId);

                        if (!isParticipant) {
                            if (role !== 'admin') {
                                return withCors(FORBIDDEN);
                            }

                            const chat = await db.selectChatById(threadId);
                            if (!chat || !chat.isGroup) {
                                return withCors(FORBIDDEN);
                            }
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
                        const threadId = req.params.id as string;
                        const rawBody = await req.json().catch(() => null);
                        if (rawBody === null) {
                            return withCors(BAD_REQUEST);
                        }

                        const parsedBody = createMessageSchema.safeParse(rawBody);
                        if (!parsedBody.success) {
                            return withCors(
                                Response.json(
                                    {
                                        error: 'Invalid message payload.',
                                        issues: parsedBody.error.issues,
                                    },
                                    { status: 400 }
                                )
                            );
                        }

                        const body: CreateMessageBody = parsedBody.data;

                        const chats = await db.selectChats(payload.id);
                        const isParticipant = chats.some((chat) => chat.chatId === threadId);

                        if (!isParticipant) {
                            return withCors(FORBIDDEN);
                        }

                        const chat = await db.selectChat(threadId, payload.id);
                        if (!chat) {
                            return withCors(NOT_FOUND);
                        }

                        if (body.replyToId) {
                            const replyTarget = await db.selectThreadMessageById(
                                threadId,
                                body.replyToId
                            );

                            if (!replyTarget) {
                                return withCors(BAD_REQUEST);
                            }
                        }

                        if (!chat.isGroup) {
                            const blockedCounterpartyIds = await db.selectBlockedCounterpartyIds(
                                payload.id
                            );
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
                            body.content,
                            'text',
                            body.replyToId ?? null
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
                                sender?.displayName?.trim() || `Neighbor ${payload.id.slice(0, 6)}`,
                            threadName:
                                (thread?.isGroup && thread.name?.trim()) ||
                                threadSummary?.participants
                                    .filter((participant) => participant.userId !== payload.id)
                                    .map(
                                        (participant) =>
                                            participant.displayName?.trim() ||
                                            `Neighbor ${participant.userId.slice(0, 6)}`
                                    )
                                    .join(', ') ||
                                undefined,
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

                        return withCors(
                            Response.json(
                                sendMessageResponseSchema.parse({
                                    message: {
                                        ...message,
                                        timestamp: Number(message.timestamp),
                                    },
                                    senderName:
                                        sender?.displayName?.trim() ||
                                        `Neighbor ${payload.id.slice(0, 6)}`,
                                    threadName:
                                        threadSummary?.participants
                                            .filter(
                                                (participant) => participant.userId !== payload.id
                                            )
                                            .map(
                                                (participant) =>
                                                    participant.displayName?.trim() ||
                                                    `Neighbor ${participant.userId.slice(0, 6)}`
                                            )
                                            .join(', ') || undefined,
                                }),
                                { status: 201 }
                            )
                        );
                    })
                )
            ),
        DELETE: async (req, server) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const threadId = req.params.id as string;
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

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
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
                        const blockedUserIds = await db.selectBlockedCounterpartyIds(payload.id);
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
                        const parsedTargetId = z.uuid().safeParse(req.params.id as string);
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
                        const parsedTargetId = z.uuid().safeParse(req.params.id as string);
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
                        const threadId = req.params.id as string;

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
                        const chat =
                            role === 'admin'
                                ? await db.selectChatById(threadId)
                                : await db.selectChat(threadId, payload.id);
                        if (!chat) {
                            return withCors(FORBIDDEN);
                        }

                        const chatSummary =
                            role === 'admin'
                                ? await db.selectChatSummaryById(threadId)
                                : await db.selectChatSummary(threadId, payload.id);
                        if (!chatSummary) {
                            return withCors(NOT_FOUND);
                        }
                        return withCors(Response.json(chatSummary, { status: 200 }));
                    })
                )
            ),
        DELETE: async (req, server) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const threadId = req.params.id as string;

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
                        const chat =
                            role === 'admin'
                                ? await db.selectChatById(threadId)
                                : await db.selectChat(threadId, payload.id);
                        if (!chat) {
                            return withCors(NOT_FOUND);
                        }

                        if (!chat.isGroup) {
                            return withCors(FORBIDDEN);
                        }

                        const isOwner = chat.ownerId === payload.id;
                        const isAdminOrMod = role === 'admin' || role === 'mod';

                        if (!isOwner && !isAdminOrMod) {
                            return withCors(FORBIDDEN);
                        }

                        await db.deleteChat(threadId);

                        server.publish(
                            `chat-${threadId}`,
                            JSON.stringify({
                                event: 'chat.deleted',
                                threadId,
                            })
                        );

                        return withCors(SUCCESS);
                    })
                )
            ),
    },
    '/api/chats/:id/name': {
        PATCH: async (req, server) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const threadId = req.params.id as string;
                        const body: UpdateChatNameBody = await req
                            .json()
                            .then((raw) => updateChatNameSchema.parse(raw));

                        const updated = await db.updateChatName(threadId, payload.id, body.name);
                        if (!updated) {
                            return withCors(NOT_FOUND);
                        }

                        server.publish(
                            `chat-${threadId}`,
                            JSON.stringify({
                                event: 'chat.updated',
                                threadId,
                                name: updated.name,
                            })
                        );

                        return withCors(Response.json(updated, { status: 200 }));
                    })
                )
            ),
    },
    '/api/chats/:id/participants': {
        POST: async (req, server) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const body: AddChatParticipantsBody = await req
                            .json()
                            .then((raw) => addChatParticipantsSchema.parse(raw));

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
                        const chat =
                            role === 'admin'
                                ? await db.selectChatById(req.params.id as string)
                                : await db.selectChat(req.params.id as string, payload.id);
                        if (!chat || !chat.isGroup) {
                            return withCors(FORBIDDEN);
                        }

                        const participantRoles = await db.selectChatParticipantRoles(
                            req.params.id as string
                        );
                        const currentRoles = participantRoles[payload.id as string] ?? [];
                        const isOwner = chat.ownerId === payload.id;
                        const isAdmin = role === 'admin' || currentRoles.includes('admin');

                        if (!isOwner && !isAdmin) {
                            return withCors(FORBIDDEN);
                        }

                        const existingUsers = await db.selectExistingUserIds([
                            payload.id,
                            ...body.participantIds,
                        ]);
                        if (existingUsers.length !== body.participantIds.length + 1) {
                            return withCors(NOT_FOUND);
                        }

                        const messages = await db.addChatParticipants(
                            req.params.id as string,
                            body.participantIds,
                            payload.id
                        );

                        const chatSummary = await db.selectChatSummary(
                            req.params.id as string,
                            payload.id
                        );
                        if (!chatSummary) {
                            return withCors(NOT_FOUND);
                        }

                        if (server) {
                            for (const message of messages) {
                                server.publish(
                                    `chat-${req.params.id as string}`,
                                    JSON.stringify({
                                        event: 'message.created',
                                        message,
                                    })
                                );
                            }

                            server.publish(
                                `chat-${req.params.id as string}`,
                                JSON.stringify({
                                    event: 'chat.members.updated',
                                    threadId: req.params.id as string,
                                })
                            );
                        }

                        return withCors(
                            Response.json({ chat: chatSummary, messages }, { status: 200 })
                        );
                    })
                )
            ),
    },
    '/api/chats/:id/participants/:userId': {
        DELETE: async (req, server) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const participantId = z.uuid().safeParse(req.params.userId);
                        if (!participantId.success) {
                            return withCors(BAD_REQUEST);
                        }

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
                        const chat =
                            role === 'admin'
                                ? await db.selectChatById(req.params.id as string)
                                : await db.selectChat(req.params.id as string, payload.id);
                        if (!chat || !chat.isGroup) {
                            return withCors(FORBIDDEN);
                        }

                        const participantRoles = await db.selectChatParticipantRoles(
                            req.params.id as string
                        );
                        const currentRoles = participantRoles[payload.id as string] ?? [];
                        const isOwner = chat.ownerId === payload.id;
                        const isAdmin = role === 'admin' || currentRoles.includes('admin');
                        const isSelfRemoval = participantId.data === payload.id;

                        const canRemove = isOwner || isAdmin || isSelfRemoval;
                        if (!canRemove) {
                            return withCors(FORBIDDEN);
                        }

                        if (participantId.data === chat.ownerId && !isSelfRemoval) {
                            return withCors(FORBIDDEN);
                        }

                        if (participantId.data === chat.ownerId && isSelfRemoval) {
                            return withCors(
                                Response.json(
                                    { error: 'Owner cannot leave. Delete the chat instead.' },
                                    { status: 400 }
                                )
                            );
                        }

                        const message = await db.removeChatParticipant(
                            req.params.id as string,
                            participantId.data,
                            payload.id
                        );

                        if (server && message) {
                            server.publish(
                                `chat-${req.params.id as string}`,
                                JSON.stringify({
                                    event: 'message.created',
                                    message,
                                })
                            );
                        }

                        if (server) {
                            server.publish(
                                `chat-${req.params.id as string}`,
                                JSON.stringify({
                                    event: 'chat.members.updated',
                                    threadId: req.params.id as string,
                                })
                            );
                        }
                        return withCors(SUCCESS);
                    })
                )
            ),
    },
    '/api/chats/:id/participants/:userId/admin': {
        POST: async (req, server) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const participantId = z.uuid().safeParse(req.params.userId);
                        if (!participantId.success) {
                            return withCors(BAD_REQUEST);
                        }

                        const role = (await db.selectUserRole(payload.id as string))?.toLowerCase();
                        const chat =
                            role === 'admin'
                                ? await db.selectChatById(req.params.id as string)
                                : await db.selectChat(req.params.id as string, payload.id);
                        if (!chat || !chat.isGroup) {
                            return withCors(FORBIDDEN);
                        }

                        const participantRoles = await db.selectChatParticipantRoles(
                            req.params.id as string
                        );
                        const currentRoles = participantRoles[payload.id as string] ?? [];
                        const canManage =
                            chat.ownerId === payload.id ||
                            role === 'admin' ||
                            currentRoles.includes('admin');

                        if (!canManage) {
                            return withCors(FORBIDDEN);
                        }

                        const targetRoles = await db.selectChatParticipantRoles(
                            req.params.id as string
                        );
                        if ((targetRoles[participantId.data] ?? []).includes('owner')) {
                            return withCors(BAD_REQUEST);
                        }

                        await db.promoteChatParticipantToAdmin(
                            req.params.id as string,
                            participantId.data,
                            payload.id
                        );

                        if (server) {
                            server.publish(
                                `chat-${req.params.id as string}`,
                                JSON.stringify({
                                    event: 'chat.members.updated',
                                    threadId: req.params.id as string,
                                })
                            );
                        }

                        const chatSummary = await db.selectChatSummary(
                            req.params.id as string,
                            payload.id
                        );
                        if (!chatSummary) {
                            return withCors(NOT_FOUND);
                        }

                        return withCors(Response.json({ chat: chatSummary }, { status: 200 }));
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
                        const { lat, lng } = user.location;
                        if (lat == null || lng == null) {
                            return withCors(BAD_REQUEST);
                        }

                        const items = await db.selectLibraryItems(lat, lng, user.radius ?? 5000);
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
    '/api/library/mine': {
        GET: async (req) =>
            validate(req, async () =>
                authorize(req, async (session) =>
                    caught(async () => {
                        const payload = session as JwtPayload;
                        const items = await db.selectLibraryItemsByAuthor(payload.id);
                        return withCors(Response.json(items, { status: 200 }));
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

                        const success = await db.updateLibraryItem(
                            req.params.id as string,
                            payload.id,
                            {
                                title: body.title,
                                description: body.description,
                                tags: body.tags,
                                isAvailable: body.isAvailable,
                            }
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
                        const success = await db.deleteLibraryItem(
                            req.params.id as string,
                            payload.id
                        );

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
                        const result = await db.confirmPulse(req.params.id as string, payload.id);

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
        OPTIONS: (req) => validate(req, () => withCors(OPTIONS_RESPONSE)),
    },
};

export const websocketHandlers: bun.WebSocketHandler<unknown> = {
    idleTimeout: 0,
    publishToSelf: true,
    open(ws) {
        ws.subscribe(PULSE_FEED_TOPIC);
    },
    message(ws, message) {
        if (typeof message !== 'string') return;
        void handleSocketMessage(ws, message);
    },
};
