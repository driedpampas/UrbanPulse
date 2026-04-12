import { z } from 'zod';
import type { UserSearchParams } from '../db';

const PULSE_TYPES = ['need', 'emergency', 'skill', 'item', 'update'] as const;
const PULSE_TYPE_ALIASES = ['Need', 'Emergency', 'Skill', 'Item', 'Update'] as const;

export const registerUserSchema = z.strictObject({
    email: z.string().email(),
    displayName: z.string().nonempty(),
    password: z.string().min(8),
});

export const loginUserSchema = z.strictObject({
    email: z.string().email(),
    password: z.string(),
});

export const verifyEmailQuerySchema = z.strictObject({
    token: z.string().trim().min(1),
});

export const passwordRequestSchema = z.strictObject({});

export const passwordConfirmSchema = z.strictObject({
    token: z.string().trim().min(1),
    newPassword: z.string().trim().min(8),
});

export const updateEmailSchema = z.strictObject({
    email: z.string().email(),
});

export const pulseTypeSchema = z.union([z.enum(PULSE_TYPES), z.enum(PULSE_TYPE_ALIASES)]);

export const createPulseSchema = z.strictObject({
    type: pulseTypeSchema,
    isEmergency: z.boolean().optional(),
    timezone: z.string().trim().min(1).optional(),
    urgencyLevel: z.number().int().min(1).max(5).optional(),
    content: z.string().nonempty(),
    location: z.object({
        lat: z.number(),
        lng: z.number(),
    }),
    requiredSkills: z.array(z.string()).optional(),
    selectedResources: z.array(z.string()).optional(),
});

export const pulseMatchSchema = z.strictObject({
    resources: z.array(z.string().trim().min(1)).min(1).max(30),
    timezone: z.string().trim().min(1).optional(),
    location: z
        .object({
            lat: z.number(),
            lng: z.number(),
        })
        .optional(),
});

export const pulseListQuerySchema = z.strictObject({
    limit: z.coerce.number().optional(),
    offset: z.coerce.number().optional(),
});

export const resourceCatalogQuerySchema = z.strictObject({
    q: z.string().trim().optional(),
    limit: z.coerce.number().optional(),
});

export const createChatSchema = z.strictObject({
    isGroup: z.boolean(),
    participantIds: z.array(z.uuid()).min(1).max(50),
});

export const messageNotificationPayloadSchema = z.strictObject({
    event: z.literal('notification.message'),
    message: z.strictObject({
        id: z.uuid(),
        threadId: z.uuid(),
        senderId: z.uuid(),
        content: z.string(),
        messageType: z.enum(['text', 'notice']).optional(),
        timestamp: z.union([z.number(), z.string()]),
    }),
    senderName: z.string(),
    threadName: z.string().optional(),
});

export const sendMessageResponseSchema = z.strictObject({
    message: messageNotificationPayloadSchema.shape.message,
    senderName: z.string(),
    threadName: z.string().optional(),
});

export const createMessageSchema = z.strictObject({
    content: z.string().trim().min(1).max(5000),
});

export const deleteMessageSchema = z.strictObject({
    messageId: z.uuid(),
    scope: z.enum(['me', 'everyone']).optional(),
});

export const addChatParticipantsSchema = z.strictObject({
    participantIds: z.array(z.uuid()).min(1).max(20),
});

export const subscribeChatSocketSchema = z.strictObject({
    action: z.literal('chat.subscribe'),
    threadId: z.uuid(),
    token: z.string().nonempty(),
});

export const unsubscribeChatSocketSchema = z.strictObject({
    action: z.literal('chat.unsubscribe'),
    threadId: z.uuid(),
});

export const identifySocketSchema = z.strictObject({
    action: z.literal('auth.identify'),
    token: z.string().nonempty(),
});

export const chatSocketMessageSchema = z.union([
    subscribeChatSocketSchema,
    unsubscribeChatSocketSchema,
    identifySocketSchema,
]);

export const updateUserSchema = z.strictObject({
    displayName: z.string().nonempty().optional(),
    bio: z.string().optional(),
    radius: z.number().min(0).optional(),
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
    timezone: z.string().trim().min(1).optional(),
});

export const updatePassSchema = z
    .object({
        newPassword: z.string().nonempty().min(8),
        oldPassword: z.string().nonempty(),
    })
    .strict();

export const searchUsersSchema = z.strictObject({
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

export const createLibraryItemSchema = z.strictObject({
    type: z.enum(['item', 'skill']),
    title: z.string().nonempty().max(255),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string()).max(10),
});

export const updateLibraryItemSchema = z
    .strictObject({
        title: z.string().nonempty().max(255).optional(),
        description: z.string().max(2000).optional(),
        tags: z.array(z.string()).max(10).optional(),
        isAvailable: z.boolean().optional(),
    })
    .refine(
        (body) =>
            body.title !== undefined ||
            body.description !== undefined ||
            body.tags !== undefined ||
            body.isAvailable !== undefined,
        {
            message: 'At least one field must be provided for update.',
        }
    );

export const createReportSchema = z.strictObject({
    targetId: z.uuid(),
    targetType: z.enum(['pulse', 'user', 'message']),
    reason: z.string().nonempty().max(500),
    content: z.string().nonempty(),
});

export const updateReportStatusSchema = z.strictObject({
    status: z.enum(['resolved', 'dismissed']),
});

export type RegisterUserBody = z.infer<typeof registerUserSchema>;
export type LoginUserBody = z.infer<typeof loginUserSchema>;
export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;
export type PasswordRequestBody = z.infer<typeof passwordRequestSchema>;
export type PasswordConfirmBody = z.infer<typeof passwordConfirmSchema>;
export type UpdateEmailBody = z.infer<typeof updateEmailSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
export type UpdatePassBody = z.infer<typeof updatePassSchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersSchema>;
export type CreatePulseBody = z.infer<typeof createPulseSchema>;
export type PulseMatchBody = z.infer<typeof pulseMatchSchema>;
export type PulseListQuery = z.infer<typeof pulseListQuerySchema>;
export type ResourceCatalogQuery = z.infer<typeof resourceCatalogQuerySchema>;
export type CreateChatBody = z.infer<typeof createChatSchema>;
export type CreateMessageBody = z.infer<typeof createMessageSchema>;
export type DeleteMessageBody = z.infer<typeof deleteMessageSchema>;
export type AddChatParticipantsBody = z.infer<typeof addChatParticipantsSchema>;
export type CreateLibraryItemBody = z.infer<typeof createLibraryItemSchema>;
export type UpdateLibraryItemBody = z.infer<typeof updateLibraryItemSchema>;
export type CreateReportBody = z.infer<typeof createReportSchema>;
export type UpdateReportStatusBody = z.infer<typeof updateReportStatusSchema>;

export const adminRoleSchema = z.enum(['admin', 'mod', 'user', 'banned']);

export const updateAdminUserRoleBodySchema = z.strictObject({
    role: adminRoleSchema,
});

export const adminUsersQuerySchema = z.strictObject({
    id: z.string().uuid().nullish(),
    displayName: z.string().nullish(),
    role: z.string().nullish(),
    limit: z.coerce.number().optional(),
    offset: z.coerce.number().optional(),
});

export function buildSearchParams(query: SearchUsersQuery): UserSearchParams {
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
