import { sql } from 'drizzle-orm';
import {
    boolean,
    customType,
    index,
    integer,
    jsonb,
    pgSchema,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

const geography = customType<{ data: string; driverData: string }>({
    dataType() {
        return 'geography(Point, 4326)';
    },
});

const timeMultirange = customType<{ data: unknown; driverData: unknown }>({
    dataType() {
        return 'app.timemultirange';
    },
});

export const app = pgSchema('app');

export const messageReportStatusEnum = app.enum('message_report_status', [
    'pending',
    'reviewed',
    'action_taken',
]);

export const users = app.table(
    'users',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        email: text('email').notNull(),
        role: text('role').notNull().default('user'),
        passwordHash: text('password_hash').notNull(),
        isEmailVerified: boolean('is_email_verified').notNull().default(false),
        verificationToken: text('verification_token'),
        passwordResetToken: text('password_reset_token'),
        passwordResetExpires: timestamp('password_reset_expires', {
            withTimezone: true,
            mode: 'date',
        }),
        displayName: text('display_name'),
        distanceLimitMeters: integer('distance_limit_meters'),
        location: geography('location'),
        quietHours: timeMultirange('quiet_hours'),
        quietDays: integer('quiet_days').array(),
        timezone: text('timezone').notNull().default('UTC'),
        trustScore: integer('trust_score').notNull().default(0),
        bio: text('bio'),
        isVerifiedNeighbor: boolean('is_verified_neighbor').notNull().default(false),
        deletionRequestedAt: timestamp('deletion_requested_at', {
            withTimezone: true,
            mode: 'date',
        }),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex('users_email_unique').on(table.email),
        index('users_role_idx').on(table.role),
        index('users_trust_score_idx').on(table.trustScore),
        index('users_deletion_requested_at_idx').on(table.deletionRequestedAt),
    ]
);

export const pulses = app.table(
    'pulses',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        authorId: uuid('author_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        pulseType: text('pulse_type').notNull(),
        content: text('content').notNull(),
        location: geography('location').notNull(),
        isVerifiedInfo: boolean('is_verified_info').notNull().default(false),
        confirmationCount: integer('confirmation_count').notNull().default(0),
        urgencyLevel: integer('urgency_level').notNull().default(1),
        isEmergency: boolean('is_emergency').notNull().default(false),
        isSolved: boolean('is_solved').notNull().default(false),
        requiredSkills: jsonb('required_skills')
            .$type<string[]>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('pulses_created_at_idx').on(table.createdAt),
        index('pulses_author_id_idx').on(table.authorId),
        index('pulses_is_emergency_idx').on(table.isEmergency),
        index('pulses_is_solved_idx').on(table.isSolved),
    ]
);

export const chatThreads = app.table('chat_threads', {
    id: uuid('id').defaultRandom().primaryKey(),
    isGroup: boolean('is_group').notNull().default(false),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const chatParticipants = app.table(
    'chat_participants',
    {
        threadId: uuid('thread_id')
            .notNull()
            .references(() => chatThreads.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.threadId, table.userId] })]
);

export const chatParticipantRoles = app.table(
    'chat_participant_roles',
    {
        threadId: uuid('thread_id')
            .notNull()
            .references(() => chatThreads.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        role: text('role').notNull(),
        assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
        assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.threadId, table.userId, table.role] })]
);

export const messages = app.table(
    'messages',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        threadId: uuid('thread_id')
            .notNull()
            .references(() => chatThreads.id, { onDelete: 'cascade' }),
        senderId: uuid('sender_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        content: text('content').notNull(),
        isEdited: boolean('is_edited').notNull().default(false),
        messageType: text('message_type').notNull().default('text'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('messages_thread_id_idx').on(table.threadId),
        index('messages_sender_id_idx').on(table.senderId),
    ]
);

export const messageEditsHistory = app.table(
    'message_edits_history',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        messageId: uuid('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        oldContent: text('old_content').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [index('message_edits_history_message_id_idx').on(table.messageId)]
);

export const blockedUsers = app.table(
    'blocked_users',
    {
        blockerId: uuid('blocker_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        blockedId: uuid('blocked_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.blockerId, table.blockedId] }),
        index('blocked_users_blocked_id_idx').on(table.blockedId),
    ]
);

export const hiddenMessages = app.table(
    'hidden_messages',
    {
        messageId: uuid('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        hiddenAt: timestamp('hidden_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.messageId, table.userId] })]
);

export const libraryItems = app.table(
    'library_items',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        authorId: uuid('author_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        itemType: text('item_type').notNull(),
        title: text('title').notNull(),
        description: text('description'),
        tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
        isAvailable: boolean('is_available').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('idx_library_items_type').on(table.itemType),
        index('library_items_author_id_idx').on(table.authorId),
    ]
);

export const pulseConfirmations = app.table(
    'pulse_confirmations',
    {
        pulseId: uuid('pulse_id')
            .notNull()
            .references(() => pulses.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.pulseId, table.userId] })]
);

export const pulseInteractions = app.table(
    'pulse_interactions',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        pulseId: uuid('pulse_id')
            .notNull()
            .references(() => pulses.id, { onDelete: 'cascade' }),
        authorId: uuid('author_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        helperId: uuid('helper_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        status: text('status').notNull().default('accepted'),
        acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
        trustAwarded: integer('trust_awarded').notNull().default(0),
    },
    (table) => [
        uniqueIndex('pulse_interactions_unique_accept').on(table.pulseId, table.helperId),
        index('pulse_interactions_author_id_idx').on(table.authorId),
        index('pulse_interactions_helper_id_idx').on(table.helperId),
        index('pulse_interactions_pulse_id_idx').on(table.pulseId),
    ]
);

export const reports = app.table(
    'reports',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        targetId: uuid('target_id').notNull(),
        targetType: text('target_type').notNull(),
        reason: text('reason').notNull(),
        reportedBy: uuid('reported_by')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        status: text('status').notNull().default('pending'),
        content: text('content').notNull(),
    },
    (table) => [
        index('reports_target_id_idx').on(table.targetId),
        index('reports_reported_by_idx').on(table.reportedBy),
        index('reports_status_idx').on(table.status),
    ]
);

export const messageReports = app.table(
    'message_reports',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        reporterId: uuid('reporter_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        offenderId: uuid('offender_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        messageId: uuid('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        reason: text('reason').notNull(),
        status: messageReportStatusEnum('status').notNull().default('pending'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('message_reports_reporter_id_idx').on(table.reporterId),
        index('message_reports_offender_id_idx').on(table.offenderId),
        index('message_reports_message_id_idx').on(table.messageId),
        index('message_reports_status_created_at_idx').on(table.status, table.createdAt),
        index('message_reports_created_at_idx').on(table.createdAt),
    ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Pulse = typeof pulses.$inferSelect;
export type NewPulse = typeof pulses.$inferInsert;
export type ChatThread = typeof chatThreads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type LibraryItem = typeof libraryItems.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type MessageReport = typeof messageReports.$inferSelect;
export type PulseInteraction = typeof pulseInteractions.$inferSelect;
