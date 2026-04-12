import { sql as drizzleSql } from 'drizzle-orm';
import { db } from './drizzle/client';
import { buildResourceTokenSet, findMatchedRequestedResources } from './resourceMatching';

type SqlRunner = {
    <T = any>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
    begin<T>(callback: (tx: SqlRunner) => Promise<T>): Promise<T>;
};

function createSqlRunner(client: {
    execute: (query: ReturnType<typeof drizzleSql>) => Promise<any>;
    transaction?: <T>(
        callback: (tx: {
            execute: (query: ReturnType<typeof drizzleSql>) => Promise<any>;
        }) => Promise<T>
    ) => Promise<T>;
}): SqlRunner {
    const runner = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = drizzleSql(strings, ...values);
        return await client.execute(query);
    }) as SqlRunner;

    runner.begin = async <T>(callback: (tx: SqlRunner) => Promise<T>) => {
        if (!client.transaction) {
            throw new Error('Transactions are not supported by this database client.');
        }

        return await client.transaction(async (tx) => callback(createSqlRunner(tx)));
    };

    return runner;
}

const sql = createSqlRunner(db);

const SEARCH_LIMIT = 50;
const PULSE_CONFIRMATION_THRESHOLD = 3;
const TRUST_SCORE_SUCCESS_THRESHOLD = 3;
const TRUST_SCORE_INCREMENT = 1;

export interface Location {
    lat?: number | null;
    lng?: number | null;
}

export interface Timerange {
    start: string;
    end: string;
}

export const PULSE_TYPE_VALUES = ['update', 'emergency', 'skill', 'item', 'need'] as const;

export type PulseType = (typeof PULSE_TYPE_VALUES)[number];

export interface PulseFeedItem {
    id: string;
    userId: string;
    userName: string;
    type: PulseType;
    content: string;
    timestamp: number;
    lat: number;
    lng: number;
    verified: boolean;
    confirmations: number;
    urgencyLevel: number;
    isEmergency: boolean;
    isSolved: boolean;
    requiredSkills: string[];
}

export interface HeroMatchUser {
    id: string;
    displayName: string | null;
    matchedResources: string[];
    suppressedByQuietHours: boolean;
}

export type InteractionStatus = 'accepted' | 'successful';

export interface PulseInteraction {
    id: string;
    pulseId: string;
    authorId: string;
    helperId: string;
    helperName: string;
    status: InteractionStatus;
    acceptedAt: number;
    confirmedAt: number | null;
    trustAwarded: number;
}

export interface AuthorPulseRequest extends PulseFeedItem {
    acceptedCount: number;
    successfulCount: number;
}

export interface AcceptedInteraction {
    interaction: PulseInteraction;
    pulse: {
        id: string;
        content: string;
        type: PulseType;
        timestamp: number;
        urgencyLevel: number;
        isSolved: boolean;
    };
    author: {
        id: string;
        name: string;
    };
}

export interface Message {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    isEdited: boolean;
    messageType: 'text' | 'notice';
    timestamp: number;
}

export type DeleteMessageScope = 'me' | 'everyone';

export type EditMessageResult =
    | { success: true; message: Message }
    | { success: false; reason: 'not_found' | 'forbidden' };

export type ChatParticipantRole = 'owner' | 'admin';

export interface Chat {
    id: string;
    participants: {
        userId: string;
    }[];
    participantRoles: Record<string, ChatParticipantRole[]>;
    ownerId: string | null;
    isGroup: boolean;
    timestamp: number;
}

export interface ChatSummary {
    id: string;
    participants: {
        userId: string;
        displayName: string | null;
        roles: ChatParticipantRole[];
    }[];
    ownerId: string | null;
    isGroup: boolean;
    timestamp: number;
}

export interface LibraryItem {
    id: string;
    userId: string;
    userName: string;
    type: 'item' | 'skill';
    title: string;
    description: string;
    tags: string[];
    available: boolean;
    createdAt: number;
}

export interface ResourceCatalogEntry {
    value: string;
    type: 'item' | 'skill';
}

interface UpdateLibraryItemParams {
    title?: string;
    description?: string;
    tags?: string[];
    isAvailable?: boolean;
}

interface User {
    id: string;
    email?: string | null;
    role?: string;
    passwordHash?: string | null;
    isEmailVerified?: boolean;
    verificationToken?: string | null;
    passwordResetToken?: string | null;
    passwordResetExpires?: Date | null;
    displayName?: string | null;
    radius?: number | null;
    location?: Location | null;
    quietHours?: Timerange[] | null;
    quietDays?: number[] | null;
    timezone?: string | null;
    trustScore?: number | null;
    bio?: string | null;
    verified?: boolean;
    createdAt?: Date;
    deletionRequestedAt?: number | null;
}

export interface UserSearchParams {
    id: string | null;
    min_trust: string | null;
    max_trust: string | null;
    anySkillRes: string | null;
    skillsAndResources: string[] | null;
    created_before: string | null;
    created_after: string | null;
    email: string | null;
    displayName: string | null;
    role: string | null;
    radius: string | null;
    location: {
        lat: string | null;
        lng: string | null;
    } | null;
    availableHours: string[] | null;
    availableDays: string[] | null;
    bio: string | null;
    verified: string | null;
}

interface PulseCreateParams {
    authorId: string;
    content: string;
    location: Location;
    type: string;
    isEmergency?: boolean;
    urgencyLevel: number;
    requiredSkills: string[];
}

type PulseRow = {
    id: string;
    userId?: string;
    author_id?: string;
    userName?: string | null;
    content?: string | null;
    timestamp?: number | string | Date;
    lat?: number | string | null;
    lng?: number | string | null;
    verified?: boolean | null;
    confirmations?: number | string | null;
    urgencyLevel?: number | string | null;
    urgency_level?: number | string | null;
    isEmergency?: boolean | null;
    is_emergency?: boolean | null;
    isSolved?: boolean | null;
    is_solved?: boolean | null;
    type?: string | null;
    required_skills?: string[] | null;
    accepted_count?: number | string | null;
    successful_count?: number | string | null;
};

type HeroCandidateRow = {
    id: string;
    display_name?: string | null;
    quiet_hours?: Timerange[] | null;
    quiet_days?: number[] | null;
    timezone?: string | null;
};

type UserResourceRow = {
    author_id: string;
    title: string;
    tags: string[] | null;
};

type PulseInteractionRow = {
    id: string;
    pulse_id: string;
    author_id: string;
    helper_id: string;
    helper_name?: string | null;
    status: string;
    accepted_at: number | string | Date;
    confirmed_at: number | string | Date | null;
    trust_awarded?: number | string | null;
};

type AcceptedInteractionRow = PulseInteractionRow & {
    pulse_content: string;
    pulse_type: string;
    pulse_timestamp: number | string | Date;
    pulse_urgency_level: number | string | null;
    pulse_is_solved: boolean | null;
    author_name?: string | null;
};

type UserRow = {
    id: string;
    email?: string | null;
    role?: string;
    is_email_verified?: boolean | null;
    verification_token?: string | null;
    password_reset_token?: string | null;
    password_reset_expires?: Date | string | number | null;
    created_at?: Date | string | number;
    trust_score?: number | string | null;
    display_name?: string | null;
    is_verified_neighbor?: boolean | null;
    distance_limit_meters?: number | string | null;
    lat?: number | string | null;
    lng?: number | string | null;
    quiet_hours?: Timerange[] | null;
    quiet_days?: number[] | null;
    timezone?: string | null;
    bio?: string | null;
    deletion_requested_at?: Date | string | number | null;
};

type MessageRow = {
    id: string;
    thread_id: string;
    sender_id: string;
    content: string;
    is_edited?: boolean | null;
    message_type?: string | null;
    timestamp: number | string | Date;
};

type ChatParticipantRow = {
    thread_id: string;
    user_id: string;
    created_at: number | string | Date;
    roles?: string[];
};

type ChatThreadRow = {
    id: string;
    is_group: boolean;
    timestamp: number | string | Date;
    owner_id?: string | null;
};

type ChatRoleRow = {
    thread_id: string;
    user_id: string;
    role: string;
};

type LibraryItemRow = {
    id: string;
    author_id: string;
    userName?: string | null;
    item_type: string;
    title: string;
    description: string | null;
    tags: string[] | null;
    is_available: boolean;
    created_at: Date | string | number;
};

type LibraryResourceRow = {
    item_type: string;
    title: string;
    tags: string[] | null;
};

type ChatSummaryRow = {
    id: string;
    is_group: boolean;
    timestamp: number | string | Date;
    participants:
    | Array<{
        userId: string;
        displayName: string | null;
        roles: string[];
    }>
    | unknown;
    owner_id: string | null;
};
export interface Report {
    id: string;
    targetId: string;
    targetType: 'pulse' | 'user' | 'message';
    reason: string;
    reportedBy: string;
    timestamp: number;
    status: 'pending' | 'resolved' | 'dismissed';
    content: string;
}

export type MessageReportStatus = 'pending' | 'reviewed' | 'action_taken';
export type MessageReportAction = 'ban_user' | 'delete_message' | 'dismiss';

export interface AdminMessageReport {
    id: string;
    messageId: string;
    messageContent: string;
    reason: string;
    status: MessageReportStatus;
    timestamp: number;
    reporter: {
        id: string;
        name: string;
    };
    offender: {
        id: string;
        name: string;
    };
}

export interface ScheduledUserDeletion {
    user: User;
    requestedAt: number;
    purgeAt: number;
}

type ReportRow = {
    id: string;
    target_id: string;
    target_type: string;
    reason: string;
    reported_by: string;
    created_at: number | string | Date;
    status: string;
    content: string;
};

type AdminMessageReportRow = {
    id: string;
    message_id: string;
    message_content: string;
    reason: string;
    status: string;
    created_at: number | string | Date;
    reporter_id: string;
    reporter_name: string;
    offender_id: string;
    offender_name: string;
};

function mapReportRow(row: ReportRow): Report {
    return {
        id: row.id,
        targetId: row.target_id,
        targetType: row.target_type as 'pulse' | 'user' | 'message',
        reason: row.reason,
        reportedBy: row.reported_by,
        timestamp: Number(row.created_at),
        status: row.status as 'pending' | 'resolved' | 'dismissed',
        content: row.content,
    };
}

function mapAdminMessageReportRow(row: AdminMessageReportRow): AdminMessageReport {
    return {
        id: row.id,
        messageId: row.message_id,
        messageContent: row.message_content,
        reason: row.reason,
        status: row.status as MessageReportStatus,
        timestamp: Number(row.created_at),
        reporter: {
            id: row.reporter_id,
            name: row.reporter_name,
        },
        offender: {
            id: row.offender_id,
            name: row.offender_name,
        },
    };
}

function mapPulseRow(rawPulse: PulseRow): PulseFeedItem {
    const normalizedType = String(rawPulse.type ?? 'update').toLowerCase() as PulseType;
    const isEmergency =
        Boolean(rawPulse.isEmergency ?? rawPulse.is_emergency) || normalizedType === 'emergency';

    return {
        id: String(rawPulse.id),
        userId: String(rawPulse.userId ?? rawPulse.author_id ?? ''),
        userName:
            typeof rawPulse.userName === 'string' && rawPulse.userName.trim().length > 0
                ? rawPulse.userName.trim()
                : String(rawPulse.userId ?? rawPulse.author_id ?? ''),
        type: PULSE_TYPE_VALUES.includes(normalizedType) ? normalizedType : 'update',
        content: String(rawPulse.content ?? ''),
        timestamp: Number(rawPulse.timestamp ?? Date.now()),
        lat: Number(rawPulse.lat ?? 0),
        lng: Number(rawPulse.lng ?? 0),
        verified: Boolean(rawPulse.verified),
        confirmations: Number(rawPulse.confirmations ?? 0),
        urgencyLevel: Number(rawPulse.urgencyLevel ?? rawPulse.urgency_level ?? 1),
        isEmergency,
        isSolved: Boolean(rawPulse.isSolved ?? rawPulse.is_solved),
        requiredSkills: rawPulse.required_skills ?? [],
    };
}

function mapAuthorPulseRow(rawPulse: PulseRow): AuthorPulseRequest {
    return {
        ...mapPulseRow(rawPulse),
        acceptedCount: Number(rawPulse.accepted_count ?? 0),
        successfulCount: Number(rawPulse.successful_count ?? 0),
    };
}

function mapPulseInteractionRow(row: PulseInteractionRow): PulseInteraction {
    const status: InteractionStatus = row.status === 'successful' ? 'successful' : 'accepted';
    const helperFallback = `Neighbor ${row.helper_id.slice(0, 6)}`;

    return {
        id: row.id,
        pulseId: row.pulse_id,
        authorId: row.author_id,
        helperId: row.helper_id,
        helperName: row.helper_name?.trim() || helperFallback,
        status,
        acceptedAt: Number(row.accepted_at),
        confirmedAt: row.confirmed_at !== null ? Number(row.confirmed_at) : null,
        trustAwarded: Number(row.trust_awarded ?? 0),
    };
}

function mapAcceptedInteractionRow(row: AcceptedInteractionRow): AcceptedInteraction {
    const interaction = mapPulseInteractionRow(row);
    const normalizedType = String(row.pulse_type ?? 'update').toLowerCase() as PulseType;

    return {
        interaction,
        pulse: {
            id: row.pulse_id,
            content: row.pulse_content,
            type: PULSE_TYPE_VALUES.includes(normalizedType) ? normalizedType : 'update',
            timestamp: Number(row.pulse_timestamp),
            urgencyLevel: Number(row.pulse_urgency_level ?? 1),
            isSolved: Boolean(row.pulse_is_solved),
        },
        author: {
            id: row.author_id,
            name: row.author_name?.trim() || `Neighbor ${row.author_id.slice(0, 6)}`,
        },
    };
}

function normalizeResourceText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeQuietDays(days: Array<number | string> | null | undefined): number[] {
    return Array.from(
        new Set(
            (days ?? [])
                .map((day) => Number(day))
                .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        )
    );
}

function parseClockMinutes(clock: string | undefined): number | null {
    if (!clock) {
        return null;
    }

    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(clock.trim());
    if (!match) {
        return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) {
        return null;
    }

    if (hour === 24 && minute === 0) {
        return 24 * 60;
    }

    if (hour < 0 || hour > 23) {
        return null;
    }

    return hour * 60 + minute;
}

function isMinuteWithinRange(minute: number, start: number, end: number): boolean {
    if (start === end) {
        return true;
    }

    if (start < end) {
        return minute >= start && minute < end;
    }

    return minute >= start || minute < end;
}

function isWithinQuietHours(
    quietHours: Array<{ start?: string; end?: string }> | null | undefined,
    minuteOfDay: number
): boolean {
    if (!quietHours || quietHours.length === 0) {
        return false;
    }

    for (const range of quietHours) {
        const start = parseClockMinutes(range.start);
        const end = parseClockMinutes(range.end);
        if (start === null || end === null) {
            continue;
        }
        if (isMinuteWithinRange(minuteOfDay, start, end)) {
            return true;
        }
    }

    return false;
}

const WEEKDAY_INDEX: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
};

function getLocalQuietWindowContext(
    now: Date,
    timezone?: string | null
): {
    day: number;
    minuteOfDay: number;
} {
    if (!timezone) {
        return {
            day: now.getDay(),
            minuteOfDay: now.getHours() * 60 + now.getMinutes(),
        };
    }

    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(now);

        const weekdayPart = parts.find((part) => part.type === 'weekday')?.value.toLowerCase();
        const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? NaN);
        const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? NaN);

        if (
            weekdayPart &&
            weekdayPart in WEEKDAY_INDEX &&
            !Number.isNaN(hour) &&
            !Number.isNaN(minute)
        ) {
            const mappedDay = WEEKDAY_INDEX[weekdayPart];
            if (mappedDay === undefined) {
                throw new Error('Invalid weekday mapping');
            }

            return {
                day: mappedDay,
                minuteOfDay: hour * 60 + minute,
            };
        }
    } catch {
        // Fall back to server-local context when timezone is invalid.
    }

    return {
        day: now.getDay(),
        minuteOfDay: now.getHours() * 60 + now.getMinutes(),
    };
}

function isSuppressedByQuietWindow(
    quietDays: Array<number | string> | null | undefined,
    quietHours: Array<{ start?: string; end?: string }> | null | undefined,
    timezone?: string | null,
    now: Date = new Date()
): boolean {
    const local = getLocalQuietWindowContext(now, timezone);
    if (normalizeQuietDays(quietDays).includes(local.day)) {
        return true;
    }

    return isWithinQuietHours(quietHours, local.minuteOfDay);
}

function mapMessageRow(rawMessage: MessageRow): Message {
    return {
        id: String(rawMessage.id),
        threadId: String(rawMessage.thread_id),
        senderId: String(rawMessage.sender_id),
        content: String(rawMessage.content),
        isEdited: Boolean(rawMessage.is_edited),
        messageType: (rawMessage.message_type as 'text' | 'notice') ?? 'text',
        timestamp: Number(rawMessage.timestamp ?? Date.now()),
    };
}

function normalizeChatRoles(roles: string[] | null | undefined): ChatParticipantRole[] {
    return Array.from(
        new Set(
            (roles ?? []).filter(
                (role): role is ChatParticipantRole => role === 'owner' || role === 'admin'
            )
        )
    );
}

let isSchemaEnsured = false;
async function ensureSchema() {
    if (isSchemaEnsured) return;

    await sql.begin(async (tx) => {
        await tx`CREATE SCHEMA IF NOT EXISTS app`;

        // Check chat_threads.owner_id
        const ownerIdCol = await tx`
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'app' AND table_name = 'chat_threads' AND column_name = 'owner_id'
            LIMIT 1
        `;
        if (ownerIdCol.length === 0) {
            await tx`
                ALTER TABLE app.chat_threads
                ADD COLUMN owner_id uuid REFERENCES app.users(id) ON DELETE SET NULL
            `;
        }

        // Check chat_participant_roles table
        const rolesTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'chat_participant_roles'
            LIMIT 1
        `;
        if (rolesTable.length === 0) {
            await tx`
                CREATE TABLE app.chat_participant_roles (
                    thread_id uuid NOT NULL REFERENCES app.chat_threads(id) ON DELETE CASCADE,
                    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    role text NOT NULL,
                    assigned_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
                    assigned_at timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (thread_id, user_id, role)
                )
            `;
        }

        // Check pulse_confirmations table
        const confirmationsTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'pulse_confirmations'
            LIMIT 1
        `;
        if (confirmationsTable.length === 0) {
            await tx`
                CREATE TABLE app.pulse_confirmations (
                    pulse_id uuid NOT NULL REFERENCES app.pulses(id) ON DELETE CASCADE,
                    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    confirmed_at timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (pulse_id, user_id)
                )
            `;
        }

        // Check reports table
        const reportsTable = await tx`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'app' AND table_name = 'reports'
            LIMIT 1
        `;
        if (reportsTable.length === 0) {
            await tx`
                CREATE TABLE app.reports (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    target_id uuid NOT NULL,
                    target_type text NOT NULL,
                    reason text NOT NULL,
                    reported_by uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    status text NOT NULL DEFAULT 'pending',
                    content text NOT NULL
                )
            `;
        }

        const messageReportStatusType = await tx`
            SELECT 1
            FROM pg_type AS t
            JOIN pg_namespace AS n ON n.oid = t.typnamespace
            WHERE t.typname = 'message_report_status'
              AND n.nspname = 'app'
            LIMIT 1
        `;
        if (messageReportStatusType.length === 0) {
            await tx`
                CREATE TYPE app.message_report_status AS ENUM ('pending', 'reviewed', 'action_taken')
            `;
        }

        const messageReportsTable = await tx`
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'message_reports'
            LIMIT 1
        `;
        if (messageReportsTable.length === 0) {
            await tx`
                CREATE TABLE app.message_reports (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    reporter_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    offender_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    message_id uuid NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
                    reason text NOT NULL,
                    status app.message_report_status NOT NULL DEFAULT 'pending',
                    created_at timestamptz NOT NULL DEFAULT now()
                )
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_reporter_id_idx
            ON app.message_reports (reporter_id)
        `;
        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_offender_id_idx
            ON app.message_reports (offender_id)
        `;
        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_message_id_idx
            ON app.message_reports (message_id)
        `;
        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_status_created_at_idx
            ON app.message_reports (status, created_at)
        `;
        await tx`
            CREATE INDEX IF NOT EXISTS message_reports_created_at_idx
            ON app.message_reports (created_at)
        `;

        // Check pulse_interactions table
        const interactionsTable = await tx`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'pulse_interactions'
            LIMIT 1
        `;
        if (interactionsTable.length === 0) {
            await tx`
                CREATE TABLE app.pulse_interactions (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    pulse_id uuid NOT NULL REFERENCES app.pulses(id) ON DELETE CASCADE,
                    author_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    helper_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                    status text NOT NULL DEFAULT 'accepted',
                    accepted_at timestamptz NOT NULL DEFAULT now(),
                    confirmed_at timestamptz,
                    trust_awarded integer NOT NULL DEFAULT 0,
                    CONSTRAINT pulse_interactions_unique_accept UNIQUE (pulse_id, helper_id),
                    CONSTRAINT pulse_interactions_status_check CHECK (status IN ('accepted', 'successful'))
                )
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS pulse_interactions_author_id_idx
            ON app.pulse_interactions (author_id)
        `;

        await tx`
            CREATE INDEX IF NOT EXISTS pulse_interactions_helper_id_idx
            ON app.pulse_interactions (helper_id)
        `;

        await tx`
            CREATE INDEX IF NOT EXISTS pulse_interactions_pulse_id_idx
            ON app.pulse_interactions (pulse_id)
        `;

        // Check app.messages.message_type
        const messageEditedCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'messages' AND column_name = 'is_edited'
            LIMIT 1
        `;
        if (messageEditedCol.length === 0) {
            await tx`
                ALTER TABLE app.messages
                ADD COLUMN is_edited boolean NOT NULL DEFAULT false
            `;
        }

        const messageTypeCol = await tx`
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'app' AND table_name = 'messages' AND column_name = 'message_type'
            LIMIT 1
        `;
        if (messageTypeCol.length === 0) {
            await tx`
                ALTER TABLE app.messages
                ADD COLUMN message_type text NOT NULL DEFAULT 'text'
            `;
        }

        const messageEditsHistoryTable = await tx`
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'app' AND table_name = 'message_edits_history'
            LIMIT 1
        `;
        if (messageEditsHistoryTable.length === 0) {
            await tx`
                CREATE TABLE app.message_edits_history (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    message_id uuid NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
                    old_content text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now()
                )
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS message_edits_history_message_id_idx
            ON app.message_edits_history (message_id)
        `;

        const deletionRequestedAtCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'deletion_requested_at'
            LIMIT 1
        `;
        if (deletionRequestedAtCol.length === 0) {
            await tx`
                ALTER TABLE app.users
                ADD COLUMN deletion_requested_at timestamptz
            `;
        }

        await tx`
            CREATE INDEX IF NOT EXISTS users_deletion_requested_at_idx
            ON app.users (deletion_requested_at)
        `;

        const timezoneCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'timezone'
            LIMIT 1
        `;
        if (timezoneCol.length === 0) {
            await tx`
                ALTER TABLE app.users
                ADD COLUMN timezone text
            `;
        }

        await tx`
            UPDATE app.users
            SET timezone = COALESCE(NULLIF(timezone, ''), 'UTC')
            WHERE timezone IS NULL OR timezone = ''
        `;

        await tx`
            ALTER TABLE app.users
            ALTER COLUMN timezone SET DEFAULT 'UTC'
        `;

        await tx`
            ALTER TABLE app.users
            ALTER COLUMN timezone SET NOT NULL
        `;

        const usersRoleConstraint = (await tx`
            SELECT pg_get_constraintdef(c.oid) AS constraint_def
            FROM pg_constraint AS c
            WHERE c.conrelid = 'app.users'::regclass
              AND c.conname = 'users_role_check'
            LIMIT 1
        `) as Array<{ constraint_def?: string | null }>;

        const usersRoleConstraintDef = String(
            usersRoleConstraint[0]?.constraint_def ?? ''
        ).toLowerCase();

        await tx`
            UPDATE app.users
            SET role = 'user'
            WHERE LOWER(role) = 'resident'
        `;

        const usersRoleConstraintNeedsUpdate =
            usersRoleConstraint.length === 0 ||
            !usersRoleConstraintDef.includes('admin') ||
            !usersRoleConstraintDef.includes('mod') ||
            !usersRoleConstraintDef.includes('banned') ||
            !usersRoleConstraintDef.includes('user') ||
            usersRoleConstraintDef.includes('resident');

        if (usersRoleConstraintNeedsUpdate) {
            await tx`
                ALTER TABLE app.users
                DROP CONSTRAINT IF EXISTS users_role_check
            `;

            await tx`
                ALTER TABLE app.users
                ADD CONSTRAINT users_role_check CHECK (
                    LOWER(role) = ANY (ARRAY['admin', 'mod', 'user', 'banned'])
                )
            `;
        }

        const pulseEmergencyCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'pulses' AND column_name = 'is_emergency'
            LIMIT 1
        `;
        if (pulseEmergencyCol.length === 0) {
            await tx`
                ALTER TABLE app.pulses
                ADD COLUMN is_emergency boolean
            `;
        }

        await tx`
            UPDATE app.pulses
            SET is_emergency = CASE
                WHEN LOWER(COALESCE(pulse_type, '')) = 'emergency' THEN true
                ELSE COALESCE(is_emergency, false)
            END
            WHERE is_emergency IS NULL OR LOWER(COALESCE(pulse_type, '')) = 'emergency'
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_emergency SET DEFAULT false
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_emergency SET NOT NULL
        `;

        const pulseSolvedCol = await tx`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app' AND table_name = 'pulses' AND column_name = 'is_solved'
            LIMIT 1
        `;
        if (pulseSolvedCol.length === 0) {
            await tx`
                ALTER TABLE app.pulses
                ADD COLUMN is_solved boolean
            `;
        }

        await tx`
            UPDATE app.pulses
            SET is_solved = COALESCE(is_solved, false)
            WHERE is_solved IS NULL
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_solved SET DEFAULT false
        `;

        await tx`
            ALTER TABLE app.pulses
            ALTER COLUMN is_solved SET NOT NULL
        `;

        await tx`
            CREATE INDEX IF NOT EXISTS pulses_is_emergency_idx
            ON app.pulses (is_emergency)
        `;

        await tx`
            CREATE INDEX IF NOT EXISTS pulses_is_solved_idx
            ON app.pulses (is_solved)
        `;

        const pulseTypeConstraint = (await tx`
            SELECT pg_get_constraintdef(c.oid) AS constraint_def
            FROM pg_constraint AS c
            WHERE c.conrelid = 'app.pulses'::regclass
              AND c.conname = 'pulses_pulse_type_check'
            LIMIT 1
        `) as Array<{ constraint_def?: string | null }>;

        if (
            pulseTypeConstraint.length === 0 ||
            !String(pulseTypeConstraint[0]?.constraint_def ?? '')
                .toLowerCase()
                .includes('need')
        ) {
            await tx`
                ALTER TABLE app.pulses
                DROP CONSTRAINT IF EXISTS pulses_pulse_type_check
            `;

            await tx`
                ALTER TABLE app.pulses
                ADD CONSTRAINT pulses_pulse_type_check CHECK (
                    LOWER(pulse_type) = ANY (
                        ARRAY['update', 'emergency', 'skill', 'item', 'need']
                    )
                )
            `;
        }
    });

    isSchemaEnsured = true;
}

async function getChatParticipantRoles(
    threadId: string
): Promise<Map<string, ChatParticipantRole[]>> {
    const rows = (await sql`
        SELECT thread_id::text AS thread_id, user_id::text AS user_id, role
        FROM app.chat_participant_roles
        WHERE thread_id = ${threadId}::uuid
    `) as ChatRoleRow[];

    const rolesByUser = new Map<string, ChatParticipantRole[]>();
    for (const row of rows) {
        if (row.role !== 'owner' && row.role !== 'admin') continue;
        const current = rolesByUser.get(row.user_id) ?? [];
        if (!current.includes(row.role)) {
            current.push(row.role as ChatParticipantRole);
            rolesByUser.set(row.user_id, current);
        }
    }

    return rolesByUser;
}

function mapLibraryItemRow(row: LibraryItemRow): LibraryItem {
    return {
        id: row.id,
        userId: row.author_id,
        userName: row.userName ?? row.author_id,
        type: row.item_type as 'item' | 'skill',
        title: row.title,
        description: row.description ?? '',
        tags: row.tags ?? [],
        available: row.is_available,
        createdAt: Number(row.created_at ?? Date.now()),
    };
}

export async function selectPulses(
    limit = 50,
    lat?: number | null,
    lng?: number | null,
    radius?: number | null,
    offset = 0
): Promise<PulseFeedItem[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const pulses = (await sql`
    SELECT
        pulses.id,
        pulses.author_id AS "userId",
        COALESCE(NULLIF(users.display_name, ''), pulses.author_id::text) AS "userName",
        LOWER(pulses.pulse_type) AS type,
        pulses.content,
        ROUND(EXTRACT(EPOCH FROM pulses.created_at) * 1000)::bigint AS "timestamp",
        ST_Y(pulses.location::geometry) AS lat,
        ST_X(pulses.location::geometry) AS lng,
        COALESCE(pulses.is_verified_info, false) AS verified,
        COALESCE(pulses.confirmation_count, 0) AS confirmations,
        COALESCE(pulses.urgency_level, 1) AS "urgencyLevel",
        COALESCE(pulses.is_emergency, false) AS "is_emergency",
        COALESCE(pulses.is_solved, false) AS "is_solved",
        COALESCE(pulses.required_skills, '[]'::jsonb) AS "required_skills"
    FROM app.pulses AS pulses
    LEFT JOIN app.users AS users ON users.id = pulses.author_id
    WHERE (
        ${lat}::double precision IS NULL OR 
        ${lng}::double precision IS NULL OR 
        ${radius}::double precision IS NULL OR
        ST_DWithin(
            pulses.location,
            ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography,
            ${radius}::double precision
        )
    )
    ORDER BY pulses.created_at DESC, pulses.id DESC
    LIMIT ${safeLimit}
    OFFSET ${safeOffset}
    `) as PulseRow[];

    return pulses.map((pulse) => mapPulseRow(pulse));
}

export async function selectPulseById(id: string): Promise<PulseFeedItem | null> {
    const [pulse] = (await sql`
    SELECT
        pulses.id,
        pulses.author_id AS "userId",
        COALESCE(NULLIF(users.display_name, ''), pulses.author_id::text) AS "userName",
        LOWER(pulses.pulse_type) AS type,
        pulses.content,
        ROUND(EXTRACT(EPOCH FROM pulses.created_at) * 1000)::bigint AS "timestamp",
        ST_Y(pulses.location::geometry) AS lat,
        ST_X(pulses.location::geometry) AS lng,
        COALESCE(pulses.is_verified_info, false) AS verified,
        COALESCE(pulses.confirmation_count, 0) AS confirmations,
        COALESCE(pulses.urgency_level, 1) AS "urgencyLevel",
        COALESCE(pulses.is_emergency, false) AS "is_emergency",
        COALESCE(pulses.is_solved, false) AS "is_solved",
        COALESCE(pulses.required_skills, '[]'::jsonb) AS "required_skills"
    FROM app.pulses AS pulses
    LEFT JOIN app.users AS users ON users.id = pulses.author_id
    WHERE pulses.id = ${id}
    LIMIT 1
    `) as PulseRow[];

    return pulse ? mapPulseRow(pulse) : null;
}

export async function selectPulsesByAuthor(
    authorId: string,
    limit = 50,
    offset = 0
): Promise<AuthorPulseRequest[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const pulses = (await sql`
        SELECT
            pulses.id,
            pulses.author_id AS "userId",
            COALESCE(NULLIF(users.display_name, ''), pulses.author_id::text) AS "userName",
            LOWER(pulses.pulse_type) AS type,
            pulses.content,
            ROUND(EXTRACT(EPOCH FROM pulses.created_at) * 1000)::bigint AS "timestamp",
            ST_Y(pulses.location::geometry) AS lat,
            ST_X(pulses.location::geometry) AS lng,
            COALESCE(pulses.is_verified_info, false) AS verified,
            COALESCE(pulses.confirmation_count, 0) AS confirmations,
            COALESCE(pulses.urgency_level, 1) AS "urgencyLevel",
            COALESCE(pulses.is_emergency, false) AS "is_emergency",
            COALESCE(pulses.is_solved, false) AS "is_solved",
            COALESCE(pulses.required_skills, '[]'::jsonb) AS "required_skills",
            COALESCE(interactions.accepted_count, 0) AS accepted_count,
            COALESCE(interactions.successful_count, 0) AS successful_count
        FROM app.pulses AS pulses
        LEFT JOIN app.users AS users ON users.id = pulses.author_id
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*)::int AS accepted_count,
                COUNT(*) FILTER (WHERE status = 'successful')::int AS successful_count
            FROM app.pulse_interactions
            WHERE pulse_id = pulses.id
        ) AS interactions ON true
        WHERE pulses.author_id = ${authorId}::uuid
        ORDER BY pulses.created_at DESC, pulses.id DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as PulseRow[];

    return pulses.map((pulse) => mapAuthorPulseRow(pulse));
}

export async function selectAdminRequests(limit = 50, offset = 0): Promise<AuthorPulseRequest[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const pulses = (await sql`
        SELECT
            pulses.id,
            pulses.author_id AS "userId",
            COALESCE(NULLIF(users.display_name, ''), pulses.author_id::text) AS "userName",
            LOWER(pulses.pulse_type) AS type,
            pulses.content,
            ROUND(EXTRACT(EPOCH FROM pulses.created_at) * 1000)::bigint AS "timestamp",
            ST_Y(pulses.location::geometry) AS lat,
            ST_X(pulses.location::geometry) AS lng,
            COALESCE(pulses.is_verified_info, false) AS verified,
            COALESCE(pulses.confirmation_count, 0) AS confirmations,
            COALESCE(pulses.urgency_level, 1) AS "urgencyLevel",
            COALESCE(pulses.is_emergency, false) AS "is_emergency",
            COALESCE(pulses.is_solved, false) AS "is_solved",
            COALESCE(pulses.required_skills, '[]'::jsonb) AS "required_skills",
            COALESCE(interactions.accepted_count, 0) AS accepted_count,
            COALESCE(interactions.successful_count, 0) AS successful_count
        FROM app.pulses AS pulses
        LEFT JOIN app.users AS users ON users.id = pulses.author_id
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*)::int AS accepted_count,
                COUNT(*) FILTER (WHERE status = 'successful')::int AS successful_count
            FROM app.pulse_interactions
            WHERE pulse_id = pulses.id
        ) AS interactions ON true
        WHERE LOWER(COALESCE(pulses.pulse_type, 'update')) = 'need'
        ORDER BY pulses.created_at DESC, pulses.id DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as PulseRow[];

    return pulses.map((pulse) => mapAuthorPulseRow(pulse));
}

export async function selectChats(userId: string): Promise<{ chatId: string }[]> {
    const chats = await sql`
        SELECT thread_id AS "chatId"
        FROM app.chat_participants
        WHERE user_id = ${userId}
    `;

    return chats as { chatId: string }[];
}

export async function selectChatSummaries(userId: string): Promise<ChatSummary[]> {
    const chats = (await sql.begin(async (tx) => {
        await ensureSchema();

        return (await tx`
            SELECT
                ct.id,
                ct.is_group,
                ROUND(EXTRACT(EPOCH FROM ct.created_at) * 1000)::bigint AS "timestamp",
                COALESCE(ct.owner_id::text, NULL) AS owner_id,
                ARRAY_AGG(
                    jsonb_build_object(
                        'userId', cp.user_id::text,
                        'displayName', NULLIF(users.display_name, ''),
                        'roles', COALESCE(roles.roles, '[]'::jsonb)
                    )
                    ORDER BY cp.joined_at
                ) AS participants
            FROM app.chat_threads AS ct
            JOIN app.chat_participants AS cp ON cp.thread_id = ct.id
            LEFT JOIN app.users AS users ON users.id = cp.user_id
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(role ORDER BY role) AS roles
                FROM app.chat_participant_roles AS cpr
                WHERE cpr.thread_id = ct.id AND cpr.user_id = cp.user_id
            ) AS roles ON true
            WHERE ct.id IN (
                SELECT thread_id
                FROM app.chat_participants
                WHERE user_id = ${userId}
            )
            GROUP BY ct.id, ct.is_group, ct.created_at, ct.owner_id
            ORDER BY "timestamp" DESC, ct.id DESC
        `) as ChatSummaryRow[];
    })) as ChatSummaryRow[];

    return chats.map((chat) => ({
        id: chat.id,
        isGroup: chat.is_group,
        timestamp: Number(chat.timestamp),
        ownerId: chat.owner_id,
        participants: (
            chat.participants as Array<{
                userId: string;
                displayName: string | null;
                roles: string[];
            }>
        ).map((participant) => ({
            userId: participant.userId,
            displayName: participant.displayName,
            roles: normalizeChatRoles(participant.roles),
        })),
    }));
}

export async function selectChatSummary(
    chatId: string,
    userId: string
): Promise<ChatSummary | null> {
    const [chat] = (await sql.begin(async (tx) => {
        await ensureSchema();

        return (await tx`
            SELECT
                ct.id,
                ct.is_group,
                ROUND(EXTRACT(EPOCH FROM ct.created_at) * 1000)::bigint AS "timestamp",
                COALESCE(ct.owner_id::text, NULL) AS owner_id,
                ARRAY_AGG(
                    jsonb_build_object(
                        'userId', cp.user_id::text,
                        'displayName', NULLIF(users.display_name, ''),
                        'roles', COALESCE(roles.roles, '[]'::jsonb)
                    )
                    ORDER BY cp.joined_at
                ) AS participants
            FROM app.chat_threads AS ct
            JOIN app.chat_participants AS cp ON cp.thread_id = ct.id
            LEFT JOIN app.users AS users ON users.id = cp.user_id
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(role ORDER BY role) AS roles
                FROM app.chat_participant_roles AS cpr
                WHERE cpr.thread_id = ct.id AND cpr.user_id = cp.user_id
            ) AS roles ON true
            WHERE ct.id = ${chatId}::uuid
              AND ct.id IN (
                SELECT thread_id
                FROM app.chat_participants
                WHERE user_id = ${userId}
            )
            GROUP BY ct.id, ct.is_group, ct.created_at, ct.owner_id
        `) as ChatSummaryRow[];
    })) as ChatSummaryRow[];

    if (!chat) return null;

    return {
        id: chat.id,
        isGroup: chat.is_group,
        timestamp: Number(chat.timestamp),
        ownerId: chat.owner_id,
        participants: (
            chat.participants as Array<{
                userId: string;
                displayName: string | null;
                roles: string[];
            }>
        ).map((participant) => ({
            userId: participant.userId,
            displayName: participant.displayName,
            roles: normalizeChatRoles(participant.roles),
        })),
    };
}

export async function selectChatSummaryById(chatId: string): Promise<ChatSummary | null> {
    const [chat] = (await sql.begin(async (tx) => {
        await ensureSchema();

        return (await tx`
            SELECT
                ct.id,
                ct.is_group,
                ROUND(EXTRACT(EPOCH FROM ct.created_at) * 1000)::bigint AS "timestamp",
                COALESCE(ct.owner_id::text, NULL) AS owner_id,
                ARRAY_AGG(
                    jsonb_build_object(
                        'userId', cp.user_id::text,
                        'displayName', NULLIF(users.display_name, ''),
                        'roles', COALESCE(roles.roles, '[]'::jsonb)
                    )
                    ORDER BY cp.joined_at
                ) AS participants
            FROM app.chat_threads AS ct
            JOIN app.chat_participants AS cp ON cp.thread_id = ct.id
            LEFT JOIN app.users AS users ON users.id = cp.user_id
            LEFT JOIN LATERAL (
                SELECT jsonb_agg(role ORDER BY role) AS roles
                FROM app.chat_participant_roles AS cpr
                WHERE cpr.thread_id = ct.id AND cpr.user_id = cp.user_id
            ) AS roles ON true
            WHERE ct.id = ${chatId}::uuid
            GROUP BY ct.id, ct.is_group, ct.created_at, ct.owner_id
        `) as ChatSummaryRow[];
    })) as ChatSummaryRow[];

    if (!chat) return null;

    return {
        id: chat.id,
        isGroup: chat.is_group,
        timestamp: Number(chat.timestamp),
        ownerId: chat.owner_id,
        participants: (
            chat.participants as Array<{
                userId: string;
                displayName: string | null;
                roles: string[];
            }>
        ).map((participant) => ({
            userId: participant.userId,
            displayName: participant.displayName,
            roles: normalizeChatRoles(participant.roles),
        })),
    };
}

export async function selectMessages(threadId: string, currentUser: string): Promise<Message[]> {
    await ensureSchema();
    const messages = (await sql.begin(async (tx) => {
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        return (await tx`
            SELECT id, thread_id, sender_id, content, is_edited, message_type,
            ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS "timestamp"
            FROM app.messages
                        WHERE thread_id = ${threadId}
                            AND NOT EXISTS (
                                SELECT 1
                                FROM app.hidden_messages AS hidden
                                WHERE hidden.message_id = app.messages.id
                                    AND hidden.user_id = ${currentUser}::uuid
                            );
        `) as MessageRow[];
    })) as MessageRow[];

    return messages.map((message) => mapMessageRow(message));
}

export async function selectMessage(
    messageId: string,
    currentUser: string
): Promise<Message | null> {
    const [message] = (await sql.begin(async (tx) => {
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        return (await tx`
                        SELECT m.id, m.thread_id, m.sender_id, m.content, m.is_edited, m.message_type,
                        ROUND(EXTRACT(EPOCH FROM m.created_at) * 1000)::bigint AS "timestamp"
                        FROM app.messages AS m
                        JOIN app.chat_participants AS cp
                            ON cp.thread_id = m.thread_id
                         AND cp.user_id = ${currentUser}::uuid
                        WHERE m.id = ${messageId}
                            AND NOT EXISTS (
                                    SELECT 1
                                    FROM app.hidden_messages AS hidden
                                    WHERE hidden.message_id = m.id
                                        AND hidden.user_id = ${currentUser}::uuid
                            )
                        LIMIT 1;
        `) as MessageRow[];
    })) as MessageRow[];

    return message ? mapMessageRow(message) : null;
}

export async function selectChat(chatId: string, currentUser: string): Promise<Chat | null> {
    const chatRows = (await sql.begin(async (tx) => {
        await ensureSchema();
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        return (await tx`
            SELECT cp.thread_id, cp.user_id, ct.is_group,
            ROUND(EXTRACT(EPOCH FROM ct.created_at) * 1000)::bigint AS "timestamp",
            ct.owner_id
            FROM app.chat_threads AS ct
            JOIN app.chat_participants AS cp ON cp.thread_id = ct.id
            WHERE ct.id = ${chatId};
        `) as Array<ChatParticipantRow & ChatThreadRow>;
    })) as Array<ChatParticipantRow & ChatThreadRow>;

    if (chatRows.length === 0) {
        return null;
    }

    const participants = chatRows.map((row) => ({
        userId: String(row.user_id),
    }));

    const roleRows = (await sql`
        SELECT user_id::text AS user_id, role
        FROM app.chat_participant_roles
        WHERE thread_id = ${chatId}::uuid
    `) as ChatRoleRow[];

    const participantRoles: Record<string, ChatParticipantRole[]> = {};
    for (const roleRow of roleRows) {
        const next = participantRoles[roleRow.user_id] ?? [];
        if (roleRow.role === 'owner' || roleRow.role === 'admin') {
            if (!next.includes(roleRow.role)) next.push(roleRow.role);
        }
        participantRoles[roleRow.user_id] = next;
    }

    return {
        id: chatId,
        participants,
        isGroup: chatRows[0]!.is_group,
        ownerId: chatRows[0]!.owner_id ? String(chatRows[0]!.owner_id) : null,
        participantRoles,
        timestamp: Number(chatRows[0]!.timestamp),
    };
}

export async function selectChatById(chatId: string): Promise<Chat | null> {
    const chatRows = (await sql.begin(async (tx) => {
        await ensureSchema();

        return (await tx`
            SELECT cp.thread_id, cp.user_id, ct.is_group,
            ROUND(EXTRACT(EPOCH FROM ct.created_at) * 1000)::bigint AS "timestamp",
            ct.owner_id
            FROM app.chat_threads AS ct
            JOIN app.chat_participants AS cp ON cp.thread_id = ct.id
            WHERE ct.id = ${chatId};
        `) as Array<ChatParticipantRow & ChatThreadRow>;
    })) as Array<ChatParticipantRow & ChatThreadRow>;

    if (chatRows.length === 0) {
        return null;
    }

    const participants = chatRows.map((row) => ({
        userId: String(row.user_id),
    }));

    const roleRows = (await sql`
        SELECT user_id::text AS user_id, role
        FROM app.chat_participant_roles
        WHERE thread_id = ${chatId}::uuid
    `) as ChatRoleRow[];

    const participantRoles: Record<string, ChatParticipantRole[]> = {};
    for (const roleRow of roleRows) {
        const next = participantRoles[roleRow.user_id] ?? [];
        if (roleRow.role === 'owner' || roleRow.role === 'admin') {
            if (!next.includes(roleRow.role)) next.push(roleRow.role);
        }
        participantRoles[roleRow.user_id] = next;
    }

    return {
        id: chatId,
        participants,
        isGroup: chatRows[0]!.is_group,
        ownerId: chatRows[0]!.owner_id ? String(chatRows[0]!.owner_id) : null,
        participantRoles,
        timestamp: Number(chatRows[0]!.timestamp),
    };
}

export async function selectExistingUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) {
        return [];
    }

    const csvUserIds = userIds.join(',');

    const rows = (await sql`
        SELECT id::text AS id
        FROM app.users
        WHERE id = ANY(string_to_array(${csvUserIds}, ',')::uuid[])
    `) as { id: string }[];

    return rows.map((row) => row.id);
}

export async function findDirectChatId(userAId: string, userBId: string): Promise<string | null> {
    const [row] = (await sql`
        SELECT cp.thread_id AS "chatId"
        FROM app.chat_participants AS cp
        JOIN app.chat_threads AS ct ON ct.id = cp.thread_id
        WHERE cp.user_id IN (${userAId}::uuid, ${userBId}::uuid)
        GROUP BY cp.thread_id
        HAVING COUNT(*) = 2
           AND COUNT(*) FILTER (WHERE cp.user_id = ${userAId}::uuid) = 1
           AND COUNT(*) FILTER (WHERE cp.user_id = ${userBId}::uuid) = 1
           AND BOOL_AND(ct.is_group = false)
           AND (
                SELECT COUNT(*)
                FROM app.chat_participants AS all_cp
                WHERE all_cp.thread_id = cp.thread_id
           ) = 2
        LIMIT 1
    `) as { chatId: string }[];

    return row ? row.chatId : null;
}

export async function insertChat(
    participantIds: string[],
    isGroup: boolean,
    currentUser: string
): Promise<Chat> {
    const threadId = crypto.randomUUID();
    const csvParticipantIds = participantIds.join(',');

    await sql.begin(async (tx) => {
        await ensureSchema();
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        await tx`
            INSERT INTO app.chat_threads (id, is_group, owner_id)
            VALUES (${threadId}::uuid, ${isGroup}, ${currentUser}::uuid);
        `;

        await tx`
            INSERT INTO app.chat_participants (thread_id, user_id)
            SELECT ${threadId}::uuid, users.user_id::uuid
            FROM unnest(string_to_array(${csvParticipantIds}, ',')::uuid[]) AS users(user_id);
        `;

        if (isGroup) {
            await tx`
                INSERT INTO app.chat_participant_roles (thread_id, user_id, role, assigned_by)
                VALUES (${threadId}::uuid, ${currentUser}::uuid, 'owner', ${currentUser}::uuid)
                ON CONFLICT DO NOTHING;
            `;
            await tx`
                INSERT INTO app.chat_participant_roles (thread_id, user_id, role, assigned_by)
                VALUES (${threadId}::uuid, ${currentUser}::uuid, 'admin', ${currentUser}::uuid)
                ON CONFLICT DO NOTHING;
            `;
        }
    });

    if (isGroup) {
        const creator = await selectUserSummary(currentUser);
        const creatorName = creator?.displayName || `Neighbor ${currentUser.slice(0, 6)}`;
        await insertMessage(threadId, currentUser, `${creatorName} created the group`, 'notice');
    }

    return (await selectChat(threadId, currentUser))!;
}

export async function addChatParticipants(
    threadId: string,
    participantIds: string[],
    actorId: string
): Promise<Message[]> {
    if (participantIds.length === 0) {
        return [];
    }

    await sql.begin(async (tx) => {
        await ensureSchema();
        await tx`SELECT set_config('app.current_user_id', ${actorId}, true);`;
        await tx`
            INSERT INTO app.chat_participants (thread_id, user_id)
            SELECT ${threadId}::uuid, users.user_id::uuid
            FROM unnest(string_to_array(${participantIds.join(',')}, ',')::uuid[]) AS users(user_id)
            ON CONFLICT DO NOTHING;
        `;
    });

    const actor = await selectUserSummary(actorId);
    const actorName = actor?.displayName || `Neighbor ${actorId.slice(0, 6)}`;
    const messages: Message[] = [];
    for (const pid of participantIds) {
        const target = await selectUserSummary(pid);
        const targetName = target?.displayName || `Neighbor ${pid.slice(0, 6)}`;
        messages.push(
            await insertMessage(
                threadId,
                actorId,
                `${actorName} added ${targetName} to the chat`,
                'notice'
            )
        );
    }

    return messages;
}

export async function deleteChat(threadId: string): Promise<boolean> {
    const [deleted] = await sql`
        DELETE FROM app.chat_threads
        WHERE id = ${threadId}::uuid
        RETURNING id;
    `;
    return Boolean(deleted);
}

export async function removeChatParticipant(
    threadId: string,
    participantId: string,
    actorId: string
): Promise<Message | null> {
    const [removed] = await sql.begin(async (tx) => {
        await ensureSchema();
        await tx`SELECT set_config('app.current_user_id', ${actorId}, true);`;

        await tx`
            DELETE FROM app.chat_participant_roles
            WHERE thread_id = ${threadId}::uuid AND user_id = ${participantId}::uuid;
        `;

        return await tx`
            DELETE FROM app.chat_participants
            WHERE thread_id = ${threadId}::uuid AND user_id = ${participantId}::uuid
            RETURNING user_id;
        `;
    });

    if (removed) {
        const actor = await selectUserSummary(actorId);
        const actorName = actor?.displayName || `Neighbor ${actorId.slice(0, 6)}`;

        if (actorId === participantId) {
            return await insertMessage(threadId, actorId, `${actorName} left the chat`, 'notice');
        } else {
            const target = await selectUserSummary(participantId);
            const targetName = target?.displayName || `Neighbor ${participantId.slice(0, 6)}`;
            return await insertMessage(
                threadId,
                actorId,
                `${actorName} removed ${targetName} from the chat`,
                'notice'
            );
        }
    }

    return null;
}

export async function promoteChatParticipantToAdmin(
    threadId: string,
    participantId: string,
    actorId: string
): Promise<boolean> {
    await sql.begin(async (tx) => {
        await ensureSchema();
        await tx`SELECT set_config('app.current_user_id', ${actorId}, true);`;
        await tx`
            INSERT INTO app.chat_participant_roles (thread_id, user_id, role, assigned_by)
            VALUES (${threadId}::uuid, ${participantId}::uuid, 'admin', ${actorId}::uuid)
            ON CONFLICT DO NOTHING;
        `;
    });

    return true;
}

export async function selectChatParticipantRoles(
    threadId: string
): Promise<Record<string, ChatParticipantRole[]>> {
    const rows = (await sql`
        SELECT user_id::text AS user_id, role
        FROM app.chat_participant_roles
        WHERE thread_id = ${threadId}::uuid
    `) as ChatRoleRow[];

    const roles: Record<string, ChatParticipantRole[]> = {};
    for (const row of rows) {
        if (row.role !== 'owner' && row.role !== 'admin') continue;
        const next = roles[row.user_id] ?? [];
        if (!next.includes(row.role as ChatParticipantRole)) {
            next.push(row.role as ChatParticipantRole);
        }
        roles[row.user_id] = next;
    }

    return roles;
}

export async function deleteMessage(messageId: string, currentUser: string): Promise<boolean> {
    const [deleted] = await sql.begin(async (tx) => {
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        return await tx`
            DELETE FROM app.messages
            WHERE id = ${messageId}
            RETURNING id;
        `;
    });

    return Boolean(deleted);
}

export async function editMessage(
    messageId: string,
    editorId: string,
    newContent: string
): Promise<EditMessageResult> {
    await ensureSchema();

    return await sql.begin(async (tx) => {
        await tx`
            SELECT set_config('app.current_user_id', ${editorId}, true);
        `;

        const [existingMessage] = (await tx`
            SELECT m.id, m.thread_id, m.sender_id, m.content, m.is_edited, m.message_type,
            ROUND(EXTRACT(EPOCH FROM m.created_at) * 1000)::bigint AS "timestamp"
            FROM app.messages AS m
            JOIN app.chat_participants AS cp
                ON cp.thread_id = m.thread_id
             AND cp.user_id = ${editorId}::uuid
            WHERE m.id = ${messageId}::uuid
                AND NOT EXISTS (
                    SELECT 1
                    FROM app.hidden_messages AS hidden
                    WHERE hidden.message_id = m.id
                        AND hidden.user_id = ${editorId}::uuid
                )
            LIMIT 1
            FOR UPDATE;
        `) as MessageRow[];

        if (!existingMessage) {
            return { success: false, reason: 'not_found' } as const;
        }

        if (String(existingMessage.sender_id) !== editorId) {
            return { success: false, reason: 'forbidden' } as const;
        }

        await tx`
            INSERT INTO app.message_edits_history (message_id, old_content)
            VALUES (${messageId}::uuid, ${existingMessage.content})
        `;

        const [updatedMessage] = (await tx`
            UPDATE app.messages
            SET content = ${newContent},
                is_edited = true
            WHERE id = ${messageId}::uuid
            RETURNING id, thread_id, sender_id, content, is_edited, message_type,
            ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS "timestamp";
        `) as MessageRow[];

        if (!updatedMessage) {
            return { success: false, reason: 'not_found' } as const;
        }

        return { success: true, message: mapMessageRow(updatedMessage) } as const;
    });
}

export async function hideMessageForUser(messageId: string, userId: string): Promise<boolean> {
    const [hidden] = await sql`
        INSERT INTO app.hidden_messages (message_id, user_id)
        VALUES (${messageId}::uuid, ${userId}::uuid)
        ON CONFLICT (message_id, user_id) DO NOTHING
        RETURNING message_id;
    `;

    return Boolean(hidden);
}

export async function selectBlockedCounterpartyIds(userId: string): Promise<string[]> {
    const rows = (await sql`
        SELECT
            CASE
                WHEN blocker_id = ${userId}::uuid THEN blocked_id::text
                ELSE blocker_id::text
            END AS "otherUserId"
        FROM app.blocked_users
        WHERE blocker_id = ${userId}::uuid OR blocked_id = ${userId}::uuid
    `) as { otherUserId: string }[];

    return rows.map((row) => row.otherUserId);
}

export async function isEitherUserBlocked(userAId: string, userBId: string): Promise<boolean> {
    const [row] = (await sql`
        SELECT 1 AS blocked
        FROM app.blocked_users
        WHERE (blocker_id = ${userAId}::uuid AND blocked_id = ${userBId}::uuid)
           OR (blocker_id = ${userBId}::uuid AND blocked_id = ${userAId}::uuid)
        LIMIT 1;
    `) as { blocked: number }[];

    return Boolean(row);
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
    await sql`
        INSERT INTO app.blocked_users (blocker_id, blocked_id)
        VALUES (${blockerId}::uuid, ${blockedId}::uuid)
        ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
    `;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
    const [deleted] = await sql`
        DELETE FROM app.blocked_users
        WHERE blocker_id = ${blockerId}::uuid
          AND blocked_id = ${blockedId}::uuid
        RETURNING blocker_id;
    `;

    return Boolean(deleted);
}

export async function insertMessage(
    threadId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'notice' = 'text'
): Promise<Message> {
    await ensureSchema();
    const [insertedMessage] = (await sql.begin(async (tx) => {
        await tx`
            SELECT set_config('app.current_user_id', ${senderId}, true);
        `;

        return (await tx`
            INSERT INTO app.messages (thread_id, sender_id, content, message_type)
            VALUES (${threadId}, ${senderId}, ${content}, ${messageType})
            RETURNING id, thread_id, sender_id, content, is_edited, message_type,
            ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS "timestamp";
        `) as MessageRow[];
    })) as MessageRow[];

    return mapMessageRow(insertedMessage!);
}

export async function insertPulse(params: PulseCreateParams): Promise<PulseFeedItem> {
    const lat = params.location.lat;
    const lng = params.location.lng;
    const isEmergency = params.isEmergency ?? params.type.toLowerCase() === 'emergency';

    const [insertedPulse] = await sql`
    INSERT INTO app.pulses (
        author_id,
        content,
        location,
        pulse_type,
        urgency_level,
        is_emergency,
        is_solved,
        required_skills
    )
    VALUES (
        ${params.authorId},
        ${params.content},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${params.type},
        ${params.urgencyLevel},
        ${isEmergency},
        false,
        ${JSON.stringify(params.requiredSkills)}::jsonb
    )
    RETURNING id
    `;

    return (await selectPulseById(insertedPulse.id))!;
}

export async function selectPulseMatchingResources(pulseId: string): Promise<string[]> {
    const [row] = (await sql`
        SELECT required_skills
        FROM app.pulses
        WHERE id = ${pulseId}::uuid
        LIMIT 1
    `) as Array<{ required_skills: string[] | null }>;

    return (row?.required_skills ?? []).filter((value) => value.trim().length > 0);
}

async function selectUserResourceRows(userIds: string[]): Promise<UserResourceRow[]> {
    if (userIds.length === 0) {
        return [];
    }

    const csvUserIds = userIds.join(',');
    return (await sql`
        SELECT
            li.author_id::text AS author_id,
            li.title,
            COALESCE(li.tags, '[]'::jsonb) AS tags
        FROM app.library_items AS li
        WHERE li.is_available = true
          AND li.author_id = ANY(string_to_array(${csvUserIds}, ',')::uuid[])
    `) as UserResourceRow[];
}

export async function matchHeroesByResources(params: {
    authorId: string;
    lat: number;
    lng: number;
    requestedResources: string[];
    requesterTimezone?: string | null;
}): Promise<HeroMatchUser[]> {
    const requestedResources = params.requestedResources
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    if (requestedResources.length === 0) {
        return [];
    }

    const candidates = (await sql`
        SELECT
            u.id::text AS id,
            NULLIF(u.display_name, '') AS display_name,
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'start', lower(rng)::text,
                            'end', upper(rng)::text
                        )
                    )
                    FROM unnest(u.quiet_hours) AS rng
                ),
                '[]'::jsonb
            ) AS quiet_hours,
            COALESCE(to_jsonb(u.quiet_days), '[]'::jsonb) AS quiet_days,
            COALESCE(NULLIF(u.timezone, ''), NULL) AS timezone
        FROM app.users AS u
        WHERE u.id != ${params.authorId}::uuid
          AND u.location IS NOT NULL
          AND u.distance_limit_meters IS NOT NULL
          AND ST_DWithin(
              u.location,
              ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
              u.distance_limit_meters
          )
          AND NOT EXISTS (
              SELECT 1
              FROM app.blocked_users bu
              WHERE (bu.blocker_id = u.id AND bu.blocked_id = ${params.authorId}::uuid)
                 OR (bu.blocker_id = ${params.authorId}::uuid AND bu.blocked_id = u.id)
          )
    `) as HeroCandidateRow[];

    if (candidates.length === 0) {
        return [];
    }

    const resourceRows = await selectUserResourceRows(candidates.map((candidate) => candidate.id));
    const resourcesByUser = new Map<string, string[]>();

    for (const row of resourceRows) {
        const current = resourcesByUser.get(row.author_id) ?? [];
        current.push(row.title);
        for (const tag of row.tags ?? []) {
            current.push(tag);
        }
        resourcesByUser.set(row.author_id, current);
    }

    const results: HeroMatchUser[] = [];
    const now = new Date();

    for (const candidate of candidates) {
        const candidateResources = resourcesByUser.get(candidate.id) ?? [];
        const candidateTokenSet = buildResourceTokenSet(candidateResources);
        const matchedResources = findMatchedRequestedResources(
            requestedResources,
            candidateTokenSet
        );

        if (matchedResources.length === 0) {
            continue;
        }

        results.push({
            id: candidate.id,
            displayName: candidate.display_name?.trim() || null,
            matchedResources,
            suppressedByQuietHours: isSuppressedByQuietWindow(
                candidate.quiet_days,
                candidate.quiet_hours,
                candidate.timezone ?? params.requesterTimezone ?? 'UTC',
                now
            ),
        });
    }

    return results;
}

export async function deletePulse(id: string): Promise<boolean> {
    const [deletedPulse] = await sql`
        DELETE FROM app.pulses
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(deletedPulse);
}

export async function findHeroesForPulse(pulseId: string): Promise<string[]> {
    const [pulse] = (await sql`
        SELECT 
            author_id,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng,
            required_skills
        FROM app.pulses
        WHERE id = ${pulseId}
    `) as Array<{ author_id: string; lat: number; lng: number; required_skills: string[] }>;

    if (!pulse || !pulse.required_skills || pulse.required_skills.length === 0) {
        return [];
    }

    const matches = await matchHeroesByResources({
        authorId: pulse.author_id,
        lat: pulse.lat,
        lng: pulse.lng,
        requestedResources: pulse.required_skills,
        requesterTimezone: null,
    });

    return matches.filter((match) => !match.suppressedByQuietHours).map((match) => match.id);
}

export async function insertUser(
    email: string,
    hashedPass: string,
    displayname: string,
    verificationToken: string
) {
    return await sql`
    INSERT INTO app.users (email, display_name, password_hash, verification_token)
    VALUES (${email}, ${displayname}, ${hashedPass}, ${verificationToken})
    RETURNING id, role, is_email_verified
    `;
}

export async function selectId(email: string) {
    return await sql`
    SELECT id FROM app.users WHERE email = ${email}
    `;
}

export async function selectPasswordHash(id: string) {
    return await sql`
    SELECT password_hash FROM app.users WHERE id = ${id}
    `;
}

export async function selectUserEmailById(id: string): Promise<string | null> {
    const [row] = (await sql`
        SELECT email
        FROM app.users
        WHERE id = ${id}
        LIMIT 1
    `) as Array<{ email: string | null }>;

    return row?.email ?? null;
}

export async function storePasswordResetToken(
    id: string,
    token: string,
    expiresAt: Date
): Promise<boolean> {
    const expiresAtIso = expiresAt.toISOString();

    const [updated] = await sql`
        UPDATE app.users
        SET password_reset_token = ${token},
            password_reset_expires = ${expiresAtIso}
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updated);
}

export async function clearPasswordResetToken(id: string): Promise<void> {
    await sql`
        UPDATE app.users
        SET password_reset_token = NULL,
            password_reset_expires = NULL
        WHERE id = ${id}
    `;
}

export async function clearPasswordResetTokenByToken(token: string): Promise<void> {
    await sql`
        UPDATE app.users
        SET password_reset_token = NULL,
            password_reset_expires = NULL
        WHERE password_reset_token = ${token}
    `;
}

export async function selectPasswordResetRecord(token: string): Promise<
    | {
        id: string;
        email: string;
        password_reset_expires: Date | string | number | null;
    }
    | null
> {
    const [row] = (await sql`
        SELECT id::text AS id,
               email,
               password_reset_expires
        FROM app.users
        WHERE password_reset_token = ${token}
        LIMIT 1
    `) as Array<{
        id: string;
        email: string;
        password_reset_expires: Date | string | number | null;
    }>;

    return row ?? null;
}

export async function consumePasswordResetToken(
    token: string,
    hashedPassword: string,
    now: Date
): Promise<boolean> {
    const nowIso = now.toISOString();

    const [updated] = await sql`
        UPDATE app.users
        SET password_hash = ${hashedPassword},
            password_reset_token = NULL,
            password_reset_expires = NULL
        WHERE password_reset_token = ${token}
          AND password_reset_expires IS NOT NULL
          AND password_reset_expires > ${nowIso}
        RETURNING id
    `;

    return Boolean(updated);
}

export async function selectFullUser(id: string): Promise<User | null> {
    await ensureSchema();

    const [rawUser] = (await sql`
    SELECT 
      id,
      email,
    is_email_verified,
      trust_score,
      role,
      display_name,
      is_verified_neighbor,
      distance_limit_meters,
      ST_Y(location::geometry) AS lat,
      ST_X(location::geometry) AS lng,
      COALESCE((SELECT jsonb_agg(
                jsonb_build_object(
                    'start', lower(rng)::text,
                    'end', upper(rng)::text
                )
            )
            FROM unnest(quiet_hours) AS rng), '[]'::jsonb)
      AS quiet_hours, 
      COALESCE(to_jsonb(quiet_days), '[]'::jsonb) AS quiet_days,
    COALESCE(NULLIF(timezone, ''), 'UTC') AS timezone,
      deletion_requested_at,
      bio 
    FROM app.users 
    WHERE 
        id = ${id}
    `) as UserRow[];

    if (!rawUser) {
        return null;
    }

    return {
        id: rawUser.id,
        email: rawUser.email,
        role: rawUser.role,
        isEmailVerified: Boolean(rawUser.is_email_verified),
        displayName: rawUser.display_name,
        verified: rawUser.is_verified_neighbor,
        radius: rawUser.distance_limit_meters,
        location:
            rawUser.lat !== null && rawUser.lng !== null
                ? { lat: rawUser.lat, lng: rawUser.lng }
                : null,
        quietHours: rawUser.quiet_hours ? rawUser.quiet_hours : [],
        quietDays: rawUser.quiet_days,
        timezone: rawUser.timezone ?? 'UTC',
        bio: rawUser.bio,
        deletionRequestedAt: rawUser.deletion_requested_at
            ? Number(rawUser.deletion_requested_at)
            : null,
    } as User;
}

export async function selectUserSummary(
    id: string
): Promise<{ id: string; displayName: string | null } | null> {
    const [row] = (await sql`
        SELECT id::text AS id, NULLIF(display_name, '') AS "displayName"
        FROM app.users
        WHERE id = ${id}
        LIMIT 1
    `) as Array<{ id: string; displayName: string | null }>;

    return row ?? null;
}

export async function selectUserRole(id: string): Promise<string | null> {
    const [row] = (await sql`
    SELECT role FROM app.users WHERE id = ${id}
    `) as Array<{ role: string }>;
    return row?.role ?? null;
}

export async function selectAdminOverview() {
    const [userRow] = (await sql`
        SELECT
            COUNT(*)::int AS total_users,
            COUNT(*) FILTER (WHERE role = 'admin')::int AS admin_users,
            COUNT(*) FILTER (WHERE role = 'mod')::int AS mod_users,
            COUNT(*) FILTER (WHERE is_verified_neighbor)::int AS verified_users
        FROM app.users
    `) as Array<{
        total_users: number;
        admin_users: number;
        mod_users: number;
        verified_users: number;
    }>;

    const [pulseRow] = (await sql`
        SELECT
            COUNT(*)::int AS total_pulses,
            COUNT(*) FILTER (WHERE COALESCE(is_verified_info, false))::int AS verified_pulses
        FROM app.pulses
    `) as Array<{
        total_pulses: number;
        verified_pulses: number;
    }>;

    const [libraryRow] = (await sql`
        SELECT
            COUNT(*)::int AS total_items,
            COUNT(*) FILTER (WHERE is_available)::int AS available_items
        FROM app.library_items
    `) as Array<{
        total_items: number;
        available_items: number;
    }>;

    return {
        totalUsers: userRow?.total_users ?? 0,
        adminUsers: userRow?.admin_users ?? 0,
        modUsers: userRow?.mod_users ?? 0,
        verifiedUsers: userRow?.verified_users ?? 0,
        totalPulses: pulseRow?.total_pulses ?? 0,
        verifiedPulses: pulseRow?.verified_pulses ?? 0,
        totalLibraryItems: libraryRow?.total_items ?? 0,
        availableLibraryItems: libraryRow?.available_items ?? 0,
    };
}

export async function selectAdminUsers(
    search: UserSearchParams,
    limit = SEARCH_LIMIT,
    offset = 0
): Promise<User[]> {
    return searchUsers(search, limit, offset);
}

export async function updateUserRole(id: string, role: string): Promise<boolean> {
    await ensureSchema();

    const normalizedRole = role.toLowerCase();

    if (!['admin', 'mod', 'user', 'banned'].includes(normalizedRole)) {
        return false;
    }

    const isRoleConstraintViolation = (error: unknown): boolean => {
        const value = error as {
            code?: unknown;
            message?: unknown;
            constraint?: unknown;
            cause?: {
                code?: unknown;
                message?: unknown;
                constraint?: unknown;
            };
        } | null;

        const code = String(value?.code ?? value?.cause?.code ?? '');
        const constraint = String(
            value?.constraint ?? value?.cause?.constraint ?? ''
        ).toLowerCase();
        const message = String(value?.message ?? value?.cause?.message ?? '').toLowerCase();

        if (code === '23514') {
            return true;
        }

        if (constraint.includes('user_role') || constraint.includes('users_role')) {
            return true;
        }

        return message.includes('check constraint') && message.includes('role');
    };

    try {
        const [updated] = await sql`
            UPDATE app.users
            SET role = ${normalizedRole}
            WHERE id = ${id}
            RETURNING id
        `;

        return Boolean(updated);
    } catch (error) {
        if (isRoleConstraintViolation(error)) {
            return false;
        }
        throw error;
    }
}

export async function searchUsers(
    userSearch: UserSearchParams,
    limit = SEARCH_LIMIT,
    offset = 0
): Promise<User[]> {
    await ensureSchema();

    const availableDaysQuery = (userSearch.availableDays ?? []).map((day) => Number(day));
    const safeLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(Math.floor(limit), 100))
        : SEARCH_LIMIT;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    const results = (await sql`
    SELECT 
        id,
        email,
        role,
        is_email_verified,
        created_at,
        trust_score,
        display_name,
        is_verified_neighbor,
        distance_limit_meters,
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,
        COALESCE((SELECT jsonb_agg(
            jsonb_build_object(
                'start', lower(rng)::text,
                'end', upper(rng)::text
            )
        ) FROM unnest(quiet_hours) AS rng), '[]'::jsonb) AS quiet_hours, 
        COALESCE((SELECT jsonb_agg(day::text) FROM unnest(quiet_days) AS day), '[]'::jsonb) AS quiet_days,
        COALESCE(NULLIF(timezone, ''), 'UTC') AS timezone,
        bio,
        deletion_requested_at 
    FROM app.users 
    WHERE
        (
        (${userSearch.id}::text IS NULL)
        AND (${userSearch.email}::text IS NULL OR email ILIKE ${userSearch.email ? `%${userSearch.email}%` : null})
        AND ((${userSearch.displayName}::text IS NULL OR display_name ILIKE ${userSearch.displayName ? `%${userSearch.displayName}%` : null})
        AND (${userSearch.min_trust}::text IS NULL OR trust_score >= ${userSearch.min_trust}::numeric)
        AND (${userSearch.max_trust}::text IS NULL OR trust_score <= ${userSearch.max_trust}::numeric)
        AND (${userSearch.role}::text IS NULL OR role = ${userSearch.role})
        AND (${userSearch.verified}::text IS NULL OR is_verified_neighbor = ${userSearch.verified}::boolean)
        AND (
            ${userSearch.radius}::text IS NULL
            OR ${userSearch.location?.lat ?? null}::text IS NULL
            OR ${userSearch.location?.lng ?? null}::text IS NULL
            OR ST_DWithin(
                location,
                ST_SetSRID(
                    ST_MakePoint(
                        (${userSearch.location?.lng ?? null})::double precision,
                        (${userSearch.location?.lat ?? null})::double precision
                    ),
                    4326
                )::geography,
                (${userSearch.radius})::double precision
            )
        )
        AND (
            ${userSearch.availableDays}::jsonb IS NULL
            OR (quiet_days != '{}'::integer[] AND NOT (
                quiet_days && app.jsonb_to_integer_array(${JSON.stringify(availableDaysQuery)}::jsonb)
            ))
        )
        AND (
            ${userSearch.availableHours}::jsonb IS NULL
            OR ( quiet_hours != '{}'::app.timemultirange AND NOT (quiet_hours && app.text_array_to_timemultirange(${userSearch.availableHours ? JSON.stringify(userSearch.availableHours) : null}::jsonb)))
        )
        AND (${userSearch.bio}::text IS NULL OR bio ILIKE ${userSearch.bio ? `%${userSearch.bio}%` : null})
        AND (${userSearch.created_before}::timestamptz IS NULL OR created_at <= ${userSearch.created_before}::timestamptz)
        AND (${userSearch.created_after}::timestamptz IS NULL OR created_at >= ${userSearch.created_after}::timestamptz)
        ) OR id = ${userSearch.id})
    LIMIT ${safeLimit}
    OFFSET ${safeOffset}
    `) as UserRow[];

    return results.map((rawUser) => {
        return {
            id: rawUser.id,
            email: rawUser.email,
            role: rawUser.role,
            isEmailVerified: Boolean(rawUser.is_email_verified),
            trustScore: rawUser.trust_score,
            createdAt: rawUser.created_at,
            displayName: rawUser.display_name,
            verified: rawUser.is_verified_neighbor,
            radius: rawUser.distance_limit_meters,
            location:
                rawUser.lat !== null && rawUser.lng !== null
                    ? { lat: rawUser.lat, lng: rawUser.lng }
                    : null,
            quietHours: rawUser.quiet_hours,
            quietDays: rawUser.quiet_days,
            timezone: rawUser.timezone ?? 'UTC',
            bio: rawUser.bio,
            deletionRequestedAt: rawUser.deletion_requested_at
                ? Number(rawUser.deletion_requested_at)
                : null,
        } as User;
    });
}

export async function selectUserAuth(email: string) {
    return await sql`
    SELECT id, password_hash, role, is_email_verified FROM app.users WHERE email = ${email}
    `;
}

export async function verifyUserEmailByToken(token: string): Promise<boolean> {
    const [verifiedUser] = await sql`
        UPDATE app.users
        SET is_email_verified = true,
            verification_token = NULL
        WHERE verification_token = ${token}
        RETURNING id
    `;

    return Boolean(verifiedUser);
}

export async function updateUserEmailWithVerificationToken(
    id: string,
    email: string,
    verificationToken: string
): Promise<boolean> {
    const [updatedUser] = await sql`
        UPDATE app.users
        SET email = ${email},
            is_email_verified = false,
            verification_token = ${verificationToken}
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updatedUser);
}

export async function updateUserPassword(id: string, newHashedPass: string) {
    await sql`
        UPDATE app.users
        SET password_hash = ${newHashedPass}
        WHERE id = ${id}
    `;
}

export async function updateUserProfile(user: User) {
    const displayName = user.displayName ?? null;
    const bio = user.bio ?? null;
    const radius = user.radius ?? null;
    const lat = user.location?.lat ?? null;
    const lng = user.location?.lng ?? null;
    const quietHoursProvided = user.quietHours !== undefined;
    const quietDaysProvided = user.quietDays !== undefined;
    const timezoneProvided = user.timezone !== undefined;

    const quietHoursJson = JSON.stringify(user.quietHours ?? null);
    const quietDaysJson = JSON.stringify(user.quietDays ?? null);
    const timezone = user.timezone?.trim() || null;

    const shouldClearQuietHours = user.quietHours === null;
    const shouldClearQuietDays = user.quietDays === null;
    await sql`
      UPDATE app.users 
      SET 
        display_name = COALESCE(${displayName}, display_name),
        bio = COALESCE(${bio}, bio),
        distance_limit_meters = COALESCE(${radius}, distance_limit_meters),
        
        location = CASE 
          WHEN ${lat}::numeric IS NOT NULL AND ${lng}::numeric IS NOT NULL 
          THEN ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography 
          ELSE location 
        END,

      quiet_hours = CASE 
                WHEN ${shouldClearQuietHours} THEN '{}'::app.timemultirange 
                WHEN ${quietHoursProvided} THEN app.jsonb_to_timemultirange(${quietHoursJson}::jsonb)
        ELSE quiet_hours 
      END,

      quiet_days = CASE 
        WHEN ${shouldClearQuietDays} THEN '{}'::integer[]
        WHEN ${quietDaysProvided} THEN app.jsonb_to_integer_array(${quietDaysJson}::jsonb)
        ELSE quiet_days 
                        END,

            timezone = CASE
                WHEN ${timezoneProvided} THEN COALESCE(${timezone}, timezone)
                ELSE timezone
            END

      WHERE id = ${user.id}
    `;
}

export async function deleteUser(id: string) {
    const [deleted] = await sql`
        DELETE FROM app.users 
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(deleted);
}

export async function deleteUsers(deleterID: string, userSearch: UserSearchParams) {
    const availableDaysQuery = (userSearch.availableDays ?? []).map((day) => Number(day));
    await sql`
    DELETE
    FROM app.users 
    WHERE id != ${deleterID} AND (
        (
        (${userSearch.id}::text IS NULL)
        AND (${userSearch.email}::text IS NULL OR email ILIKE ${userSearch.email ? `%${userSearch.email}%` : null})
        AND ((${userSearch.displayName}::text IS NULL OR display_name ILIKE ${userSearch.displayName ? `%${userSearch.displayName}%` : null})
        AND (${userSearch.min_trust}::text IS NULL OR trust_score >= ${userSearch.min_trust}::numeric)
        AND (${userSearch.max_trust}::text IS NULL OR trust_score <= ${userSearch.max_trust}::numeric)
        AND (${userSearch.role}::text IS NULL OR role = ${userSearch.role})
        AND (${userSearch.verified}::text IS NULL OR is_verified_neighbor = ${userSearch.verified}::boolean)
        AND (
            ${userSearch.radius}::text IS NULL
            OR ${userSearch.location?.lat ?? null}::text IS NULL
            OR ${userSearch.location?.lng ?? null}::text IS NULL
            OR ST_DWithin(
                location,
                ST_SetSRID(
                    ST_MakePoint(
                        (${userSearch.location?.lng ?? null})::double precision,
                        (${userSearch.location?.lat ?? null})::double precision
                    ),
                    4326
                )::geography,
                (${userSearch.radius})::double precision
            )
        )
        AND (
            ${userSearch.availableDays}::jsonb IS NULL
            OR (quiet_days != '{}'::integer[] AND NOT (
                quiet_days && app.jsonb_to_integer_array(${JSON.stringify(availableDaysQuery)}::jsonb)
            ))
        )
        AND (
            ${userSearch.availableHours}::jsonb IS NULL
            OR ( quiet_hours != '{}'::app.timemultirange AND NOT (quiet_hours && app.text_array_to_timemultirange(${userSearch.availableHours ? JSON.stringify(userSearch.availableHours) : null}::jsonb)))
        )
        AND (${userSearch.bio}::text IS NULL OR bio ILIKE ${userSearch.bio ? `%${userSearch.bio}%` : null})
        AND (${userSearch.created_before}::timestamptz IS NULL OR created_at <= ${userSearch.created_before}::timestamptz)
        AND (${userSearch.created_after}::timestamptz IS NULL OR created_at >= ${userSearch.created_after}::timestamptz)
        ) OR id = ${userSearch.id}))
    `;
}

export async function requestUserDeletion(id: string): Promise<boolean> {
    await ensureSchema();

    const [updated] = await sql`
        UPDATE app.users
        SET deletion_requested_at = COALESCE(deletion_requested_at, now())
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updated);
}

export async function cancelUserDeletion(id: string): Promise<boolean> {
    await ensureSchema();

    const [updated] = await sql`
        UPDATE app.users
        SET deletion_requested_at = NULL
        WHERE id = ${id} AND deletion_requested_at IS NOT NULL
        RETURNING id
    `;

    return Boolean(updated);
}

export async function selectPendingUserDeletions(
    limit = 100,
    offset = 0
): Promise<ScheduledUserDeletion[]> {
    await ensureSchema();

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 100;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const rows = (await sql`
        SELECT
            id,
            email,
            role,
            created_at,
            trust_score,
            display_name,
            is_verified_neighbor,
            distance_limit_meters,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng,
            COALESCE((SELECT jsonb_agg(
                jsonb_build_object(
                    'start', lower(rng)::text,
                    'end', upper(rng)::text
                )
            ) FROM unnest(quiet_hours) AS rng), '[]'::jsonb) AS quiet_hours,
            COALESCE((SELECT jsonb_agg(day::text) FROM unnest(quiet_days) AS day), '[]'::jsonb) AS quiet_days,
            COALESCE(NULLIF(timezone, ''), 'UTC') AS timezone,
            bio,
            deletion_requested_at
        FROM app.users
        WHERE deletion_requested_at IS NOT NULL
        ORDER BY deletion_requested_at ASC, created_at ASC, id ASC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as UserRow[];

    return rows.map((rawUser) => {
        const requestedAt = Number(rawUser.deletion_requested_at ?? Date.now());

        return {
            user: {
                id: rawUser.id,
                email: rawUser.email,
                role: rawUser.role,
                trustScore: rawUser.trust_score,
                createdAt: rawUser.created_at,
                displayName: rawUser.display_name,
                verified: rawUser.is_verified_neighbor,
                radius: rawUser.distance_limit_meters,
                location:
                    rawUser.lat !== null && rawUser.lng !== null
                        ? { lat: rawUser.lat, lng: rawUser.lng }
                        : null,
                quietHours: rawUser.quiet_hours,
                quietDays: rawUser.quiet_days,
                timezone: rawUser.timezone ?? 'UTC',
                bio: rawUser.bio,
                deletionRequestedAt: requestedAt,
            } as User,
            requestedAt,
            purgeAt: requestedAt + 7 * 24 * 60 * 60 * 1000,
        };
    });
}

export async function purgeExpiredUserDeletions(now = Date.now()): Promise<number> {
    await ensureSchema();

    const cutoffIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
        const deleted = await sql`
            DELETE FROM app.users
            WHERE deletion_requested_at IS NOT NULL
              AND deletion_requested_at <= ${cutoffIso}::timestamptz
            RETURNING id
        `;

        return deleted.length;
    } catch (error) {
        const errorCode =
            typeof error === 'object' && error !== null && 'code' in error
                ? String((error as { code?: unknown }).code)
                : null;

        if (errorCode !== '42703') {
            throw error;
        }

        await sql`
            ALTER TABLE app.users
            ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz
        `;
        await sql`
            CREATE INDEX IF NOT EXISTS users_deletion_requested_at_idx
            ON app.users (deletion_requested_at)
        `;

        const deleted = await sql`
            DELETE FROM app.users
            WHERE deletion_requested_at IS NOT NULL
              AND deletion_requested_at <= ${cutoffIso}::timestamptz
            RETURNING id
        `;

        return deleted.length;
    }
}

export async function selectLibraryItems(
    viewerLat: number,
    viewerLng: number,
    radiusMeters: number
): Promise<LibraryItem[]> {
    const rows = (await sql`
        SELECT
            li.id,
            li.author_id,
            COALESCE(u.display_name, li.author_id::text) AS "userName",
            li.item_type,
            li.title,
            li.description,
            li.tags,
            li.is_available,
            ROUND(EXTRACT(EPOCH FROM li.created_at) * 1000)::bigint AS created_at
        FROM app.library_items li
        JOIN app.users u ON u.id = li.author_id
        WHERE ST_DWithin(
            u.location,
            ST_SetSRID(ST_MakePoint(${viewerLng}, ${viewerLat}), 4326)::geography,
            ${radiusMeters}
        )
        ORDER BY li.created_at DESC
    `) as LibraryItemRow[];

    return rows.map(mapLibraryItemRow);
}

export async function selectLibraryItemsByAuthor(authorId: string): Promise<LibraryItem[]> {
    const rows = (await sql`
        SELECT
            li.id,
            li.author_id,
            COALESCE(u.display_name, li.author_id::text) AS "userName",
            li.item_type,
            li.title,
            li.description,
            li.tags,
            li.is_available,
            ROUND(EXTRACT(EPOCH FROM li.created_at) * 1000)::bigint AS created_at
        FROM app.library_items li
        JOIN app.users u ON u.id = li.author_id
        WHERE li.author_id = ${authorId}::uuid
        ORDER BY li.created_at DESC, li.id DESC
    `) as LibraryItemRow[];

    return rows.map(mapLibraryItemRow);
}

export async function selectAdminLibraryItems(limit = 50, offset = 0): Promise<LibraryItem[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const rows = (await sql`
        SELECT
            li.id,
            li.author_id,
            COALESCE(u.display_name, li.author_id::text) AS "userName",
            li.item_type,
            li.title,
            li.description,
            li.tags,
            li.is_available,
            ROUND(EXTRACT(EPOCH FROM li.created_at) * 1000)::bigint AS created_at
        FROM app.library_items li
        JOIN app.users u ON u.id = li.author_id
        ORDER BY li.created_at DESC, li.id DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as LibraryItemRow[];

    return rows.map(mapLibraryItemRow);
}

export async function selectResourceCatalog(
    search?: string,
    limit = 120
): Promise<ResourceCatalogEntry[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 300)) : 120;
    const query = search?.trim() ? `%${search.trim().toLowerCase()}%` : null;

    const rows = (await sql`
        SELECT
            li.item_type,
            li.title,
            li.tags
        FROM app.library_items AS li
        WHERE li.is_available = true
          AND (
              ${query}::text IS NULL
              OR LOWER(li.title) LIKE ${query}
              OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(COALESCE(li.tags, '[]'::jsonb)) AS tag
                  WHERE LOWER(tag) LIKE ${query}
              )
          )
        ORDER BY li.created_at DESC, li.id DESC
        LIMIT ${safeLimit}
    `) as LibraryResourceRow[];

    const seen = new Set<string>();
    const resources: ResourceCatalogEntry[] = [];

    const pushValue = (value: string, type: 'item' | 'skill') => {
        const trimmed = value.trim();
        if (!trimmed) {
            return;
        }

        const normalized = normalizeResourceText(trimmed);
        if (!normalized) {
            return;
        }

        const key = `${type}:${normalized}`;
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        resources.push({ value: trimmed, type });
    };

    for (const row of rows) {
        const type: 'item' | 'skill' = row.item_type === 'skill' ? 'skill' : 'item';
        pushValue(row.title, type);

        for (const tag of row.tags ?? []) {
            pushValue(tag, type);
        }
    }

    return resources.slice(0, safeLimit);
}

export async function insertLibraryItem(params: {
    authorId: string;
    type: 'item' | 'skill';
    title: string;
    description: string;
    tags: string[];
}): Promise<LibraryItem> {
    const [row] = (await sql`
        INSERT INTO app.library_items (author_id, item_type, title, description, tags)
        VALUES (${params.authorId}, ${params.type}, ${params.title}, ${params.description}, ${JSON.stringify(params.tags)}::jsonb)
        RETURNING id
    `) as { id: string }[];

    if (!row) {
        throw new Error('Failed to insert library item.');
    }

    // Fetch full item with userName
    const [fullRow] = (await sql`
        SELECT
            li.id,
            li.author_id,
            COALESCE(u.display_name, li.author_id::text) AS "userName",
            li.item_type,
            li.title,
            li.description,
            li.tags,
            li.is_available,
            ROUND(EXTRACT(EPOCH FROM li.created_at) * 1000)::bigint AS created_at
        FROM app.library_items li
        JOIN app.users u ON u.id = li.author_id
        WHERE li.id = ${row.id}
    `) as LibraryItemRow[];

    return mapLibraryItemRow(fullRow!);
}

export async function updateLibraryItemAvailability(
    itemId: string,
    authorId: string,
    available: boolean
): Promise<boolean> {
    const [updated] = await sql`
        UPDATE app.library_items
        SET is_available = ${available}
        WHERE id = ${itemId} AND (
            author_id = ${authorId}
            OR EXISTS (
                SELECT 1
                FROM app.users
                WHERE id = ${authorId}
                  AND role IN ('admin', 'mod')
            )
        )
        RETURNING id
    `;
    return Boolean(updated);
}

export async function updateLibraryItem(
    itemId: string,
    requesterId: string,
    params: UpdateLibraryItemParams
): Promise<boolean> {
    const title = params.title ?? null;
    const description = params.description ?? null;
    const tagsJson = params.tags !== undefined ? JSON.stringify(params.tags) : null;
    const isAvailable = params.isAvailable ?? null;

    const titleProvided = params.title !== undefined;
    const descriptionProvided = params.description !== undefined;
    const tagsProvided = params.tags !== undefined;
    const availableProvided = params.isAvailable !== undefined;

    const [updated] = await sql`
        UPDATE app.library_items
        SET
            title = CASE WHEN ${titleProvided} THEN ${title} ELSE title END,
            description = CASE WHEN ${descriptionProvided} THEN ${description} ELSE description END,
            tags = CASE WHEN ${tagsProvided} THEN ${tagsJson}::jsonb ELSE tags END,
            is_available = CASE WHEN ${availableProvided} THEN ${isAvailable} ELSE is_available END
        WHERE id = ${itemId} AND (
            author_id = ${requesterId}
            OR EXISTS (
                SELECT 1
                FROM app.users
                WHERE id = ${requesterId}
                  AND role IN ('admin', 'mod')
            )
        )
        RETURNING id
    `;

    return Boolean(updated);
}

export async function deleteLibraryItem(itemId: string, authorId: string): Promise<boolean> {
    const [deleted] = await sql`
        DELETE FROM app.library_items
        WHERE id = ${itemId} AND (author_id = ${authorId} OR EXISTS (SELECT 1 FROM app.users WHERE id = ${authorId} AND role IN ('admin', 'mod')))
        RETURNING id
    `;
    return Boolean(deleted);
}

export async function incrementTrustScore(userId: string, amount: number): Promise<void> {
    await sql`
        UPDATE app.users
        SET trust_score = COALESCE(trust_score, 0) + ${amount}
        WHERE id = ${userId}
    `;
}

export async function confirmPulse(
    pulseId: string,
    userId: string
): Promise<{ success: boolean; alreadyConfirmed: boolean }> {
    return await sql.begin(async (tx) => {
        await ensureSchema();

        // 1. Check if user is author
        const [pulse] = (await tx`
            SELECT author_id::text AS author_id
            FROM app.pulses
            WHERE id = ${pulseId}::uuid
            LIMIT 1
        `) as Array<{ author_id: string }>;

        if (!pulse) return { success: false, alreadyConfirmed: false };
        if (pulse.author_id === userId) return { success: false, alreadyConfirmed: false };

        // 2. Record confirmation (idempotent on duplicate confirm)
        const [inserted] = await tx`
            INSERT INTO app.pulse_confirmations (pulse_id, user_id)
            VALUES (${pulseId}::uuid, ${userId}::uuid)
            ON CONFLICT (pulse_id, user_id) DO NOTHING
            RETURNING 1 AS inserted
        `;

        if (!inserted) {
            return { success: false, alreadyConfirmed: true };
        }

        // 3. Increment confirmation count and auto-verify once threshold is met.
        const [updatedPulse] = await tx`
            UPDATE app.pulses
            SET
                confirmation_count = COALESCE(confirmation_count, 0) + 1,
                is_verified_info = CASE
                    WHEN COALESCE(confirmation_count, 0) + 1 >= ${PULSE_CONFIRMATION_THRESHOLD}
                        THEN true
                    ELSE COALESCE(is_verified_info, false)
                END
            WHERE id = ${pulseId}::uuid
            RETURNING id::text AS id
        `;

        if (!updatedPulse) {
            return { success: false, alreadyConfirmed: false };
        }

        return { success: true, alreadyConfirmed: false };
    });
}

export async function insertPulseInteraction(params: {
    pulseId: string;
    helperId: string;
}): Promise<{
    success: boolean;
    alreadyAccepted: boolean;
    solved?: boolean;
    nonRequestType?: boolean;
    interaction?: PulseInteraction;
}> {
    return await sql.begin(async (tx) => {
        await ensureSchema();

        const [pulse] = (await tx`
            SELECT
                id,
                author_id,
                LOWER(COALESCE(pulse_type, 'update')) AS pulse_type,
                COALESCE(is_solved, false) AS is_solved
            FROM app.pulses
            WHERE id = ${params.pulseId}::uuid
            LIMIT 1
        `) as Array<{ id: string; author_id: string; pulse_type: string; is_solved: boolean }>;

        if (!pulse) {
            return { success: false, alreadyAccepted: false };
        }

        if (pulse.author_id === params.helperId) {
            return { success: false, alreadyAccepted: false };
        }

        if (pulse.is_solved) {
            return { success: false, alreadyAccepted: false, solved: true };
        }

        if (pulse.pulse_type !== 'need') {
            return { success: false, alreadyAccepted: false, nonRequestType: true };
        }

        const [existing] = (await tx`
            SELECT id
            FROM app.pulse_interactions
            WHERE pulse_id = ${params.pulseId}::uuid
              AND helper_id = ${params.helperId}::uuid
            LIMIT 1
        `) as Array<{ id: string }>;

        if (existing) {
            return { success: false, alreadyAccepted: true };
        }

        const [inserted] = (await tx`
            INSERT INTO app.pulse_interactions (pulse_id, author_id, helper_id)
            VALUES (${params.pulseId}::uuid, ${pulse.author_id}::uuid, ${params.helperId}::uuid)
            RETURNING
                id::text AS id,
                pulse_id::text AS pulse_id,
                author_id::text AS author_id,
                helper_id::text AS helper_id,
                'accepted'::text AS status,
                ROUND(EXTRACT(EPOCH FROM accepted_at) * 1000)::bigint AS accepted_at,
                NULL::bigint AS confirmed_at,
                trust_awarded
        `) as PulseInteractionRow[];

        if (!inserted) {
            return { success: false, alreadyAccepted: false };
        }

        const [helper] = (await tx`
            SELECT NULLIF(display_name, '') AS display_name
            FROM app.users
            WHERE id = ${params.helperId}::uuid
            LIMIT 1
        `) as Array<{ display_name: string | null }>;

        const mappedInteraction = mapPulseInteractionRow({
            ...inserted,
            helper_name: helper?.display_name ?? null,
        });

        return { success: true, alreadyAccepted: false, interaction: mappedInteraction };
    });
}

export async function selectPulseInteractions(
    pulseId: string,
    authorId: string
): Promise<PulseInteraction[]> {
    const rows = (await sql`
        SELECT
            pi.id::text AS id,
            pi.pulse_id::text AS pulse_id,
            pi.author_id::text AS author_id,
            pi.helper_id::text AS helper_id,
            NULLIF(helper.display_name, '') AS helper_name,
            pi.status,
            ROUND(EXTRACT(EPOCH FROM pi.accepted_at) * 1000)::bigint AS accepted_at,
            CASE
                WHEN pi.confirmed_at IS NULL THEN NULL
                ELSE ROUND(EXTRACT(EPOCH FROM pi.confirmed_at) * 1000)::bigint
            END AS confirmed_at,
            pi.trust_awarded
        FROM app.pulse_interactions AS pi
        LEFT JOIN app.users AS helper ON helper.id = pi.helper_id
        WHERE pi.pulse_id = ${pulseId}::uuid
          AND pi.author_id = ${authorId}::uuid
        ORDER BY pi.accepted_at ASC, pi.id ASC
    `) as PulseInteractionRow[];

    return rows.map((row) => mapPulseInteractionRow(row));
}

export async function selectPulseInteractionsAsAdmin(pulseId: string): Promise<PulseInteraction[]> {
    const rows = (await sql`
        SELECT
            pi.id::text AS id,
            pi.pulse_id::text AS pulse_id,
            pi.author_id::text AS author_id,
            pi.helper_id::text AS helper_id,
            NULLIF(helper.display_name, '') AS helper_name,
            pi.status,
            ROUND(EXTRACT(EPOCH FROM pi.accepted_at) * 1000)::bigint AS accepted_at,
            CASE
                WHEN pi.confirmed_at IS NULL THEN NULL
                ELSE ROUND(EXTRACT(EPOCH FROM pi.confirmed_at) * 1000)::bigint
            END AS confirmed_at,
            pi.trust_awarded
        FROM app.pulse_interactions AS pi
        LEFT JOIN app.users AS helper ON helper.id = pi.helper_id
        WHERE pi.pulse_id = ${pulseId}::uuid
        ORDER BY pi.accepted_at ASC, pi.id ASC
    `) as PulseInteractionRow[];

    return rows.map((row) => mapPulseInteractionRow(row));
}

async function applyTrustProgressionForInteraction(
    tx: SqlRunner,
    helperId: string,
    interactionId: string
): Promise<{ successfulCount: number; trustAwarded: number; trustScore: number }> {
    const [successfulCountRow] = (await tx`
        SELECT COUNT(*)::int AS successful_count
        FROM app.pulse_interactions
        WHERE helper_id = ${helperId}::uuid
          AND status = 'successful'
    `) as Array<{ successful_count: number }>;

    const successfulCount = Number(successfulCountRow?.successful_count ?? 0);
    const trustAwarded =
        successfulCount > 0 && successfulCount % TRUST_SCORE_SUCCESS_THRESHOLD === 0
            ? TRUST_SCORE_INCREMENT
            : 0;

    await tx`
        UPDATE app.pulse_interactions
        SET trust_awarded = ${trustAwarded}
        WHERE id = ${interactionId}::uuid
          AND helper_id = ${helperId}::uuid
    `;

    if (trustAwarded > 0) {
        const [updatedTrust] = (await tx`
            UPDATE app.users
            SET trust_score = COALESCE(trust_score, 0) + ${trustAwarded}
            WHERE id = ${helperId}::uuid
            RETURNING COALESCE(trust_score, 0)::int AS trust_score
        `) as Array<{ trust_score: number }>;

        return {
            successfulCount,
            trustAwarded,
            trustScore: Number(updatedTrust?.trust_score ?? 0),
        };
    }

    const [existingTrust] = (await tx`
        SELECT COALESCE(trust_score, 0)::int AS trust_score
        FROM app.users
        WHERE id = ${helperId}::uuid
        LIMIT 1
    `) as Array<{ trust_score: number }>;

    return {
        successfulCount,
        trustAwarded,
        trustScore: Number(existingTrust?.trust_score ?? 0),
    };
}

export async function confirmPulseInteraction(params: {
    pulseId: string;
    interactionId: string;
    authorId: string;
}): Promise<{
    success: boolean;
    solved?: boolean;
    nonRequestType?: boolean;
    interaction?: PulseInteraction;
    helperSuccessfulCount?: number;
    helperTrustScore?: number;
    trustIncremented?: boolean;
}> {
    return await sql.begin(async (tx) => {
        await ensureSchema();

        const [interaction] = (await tx`
            SELECT
                pi.id::text AS id,
                pi.pulse_id::text AS pulse_id,
                pi.author_id::text AS author_id,
                pi.helper_id::text AS helper_id,
                NULLIF(helper.display_name, '') AS helper_name,
                pi.status,
                ROUND(EXTRACT(EPOCH FROM pi.accepted_at) * 1000)::bigint AS accepted_at,
                CASE
                    WHEN pi.confirmed_at IS NULL THEN NULL
                    ELSE ROUND(EXTRACT(EPOCH FROM pi.confirmed_at) * 1000)::bigint
                END AS confirmed_at,
                pi.trust_awarded,
                COALESCE(p.is_emergency, false) AS pulse_is_emergency,
                COALESCE(p.is_solved, false) AS pulse_is_solved,
                LOWER(COALESCE(p.pulse_type, 'update')) AS pulse_type
            FROM app.pulse_interactions AS pi
            JOIN app.pulses AS p ON p.id = pi.pulse_id
            LEFT JOIN app.users AS helper ON helper.id = pi.helper_id
            WHERE pi.id = ${params.interactionId}::uuid
              AND pi.pulse_id = ${params.pulseId}::uuid
              AND pi.author_id = ${params.authorId}::uuid
            LIMIT 1
        `) as Array<
            PulseInteractionRow & {
                pulse_is_emergency: boolean;
                pulse_is_solved: boolean;
                pulse_type: string;
            }
        >;

        if (!interaction) {
            return { success: false };
        }

        if (interaction.status === 'successful') {
            return { success: true, interaction: mapPulseInteractionRow(interaction) };
        }

        if (interaction.pulse_is_solved) {
            return { success: false, solved: true };
        }

        if (interaction.pulse_type !== 'need') {
            return { success: false, nonRequestType: true };
        }

        const [updated] = (await tx`
            UPDATE app.pulse_interactions
            SET
                status = 'successful',
                confirmed_at = now()
            WHERE id = ${params.interactionId}::uuid
              AND pulse_id = ${params.pulseId}::uuid
              AND author_id = ${params.authorId}::uuid
            RETURNING
                id::text AS id,
                pulse_id::text AS pulse_id,
                author_id::text AS author_id,
                helper_id::text AS helper_id,
                status,
                ROUND(EXTRACT(EPOCH FROM accepted_at) * 1000)::bigint AS accepted_at,
                ROUND(EXTRACT(EPOCH FROM confirmed_at) * 1000)::bigint AS confirmed_at,
                trust_awarded
        `) as PulseInteractionRow[];

        if (!updated) {
            return { success: false };
        }

        const trustProgress = await applyTrustProgressionForInteraction(
            tx,
            updated.helper_id,
            updated.id
        );

        const mappedInteraction = mapPulseInteractionRow({
            ...updated,
            trust_awarded: trustProgress.trustAwarded,
            helper_name: interaction.helper_name ?? null,
        });

        return {
            success: true,
            interaction: mappedInteraction,
            helperSuccessfulCount: trustProgress.successfulCount,
            helperTrustScore: trustProgress.trustScore,
            trustIncremented: trustProgress.trustAwarded > 0,
        };
    });
}

export async function confirmPulseInteractionAsAdmin(params: {
    pulseId: string;
    interactionId: string;
}): Promise<{
    success: boolean;
    solved?: boolean;
    nonRequestType?: boolean;
    interaction?: PulseInteraction;
    helperSuccessfulCount?: number;
    helperTrustScore?: number;
    trustIncremented?: boolean;
}> {
    return await sql.begin(async (tx) => {
        await ensureSchema();

        const [interaction] = (await tx`
            SELECT
                pi.id::text AS id,
                pi.pulse_id::text AS pulse_id,
                pi.author_id::text AS author_id,
                pi.helper_id::text AS helper_id,
                NULLIF(helper.display_name, '') AS helper_name,
                pi.status,
                ROUND(EXTRACT(EPOCH FROM pi.accepted_at) * 1000)::bigint AS accepted_at,
                CASE
                    WHEN pi.confirmed_at IS NULL THEN NULL
                    ELSE ROUND(EXTRACT(EPOCH FROM pi.confirmed_at) * 1000)::bigint
                END AS confirmed_at,
                pi.trust_awarded,
                COALESCE(p.is_emergency, false) AS pulse_is_emergency,
                COALESCE(p.is_solved, false) AS pulse_is_solved,
                LOWER(COALESCE(p.pulse_type, 'update')) AS pulse_type
            FROM app.pulse_interactions AS pi
            JOIN app.pulses AS p ON p.id = pi.pulse_id
            LEFT JOIN app.users AS helper ON helper.id = pi.helper_id
            WHERE pi.id = ${params.interactionId}::uuid
              AND pi.pulse_id = ${params.pulseId}::uuid
            LIMIT 1
        `) as Array<
            PulseInteractionRow & {
                pulse_is_emergency: boolean;
                pulse_is_solved: boolean;
                pulse_type: string;
            }
        >;

        if (!interaction) {
            return { success: false };
        }

        if (interaction.status === 'successful') {
            return { success: true, interaction: mapPulseInteractionRow(interaction) };
        }

        if (interaction.pulse_is_solved) {
            return { success: false, solved: true };
        }

        if (interaction.pulse_type !== 'need') {
            return { success: false, nonRequestType: true };
        }

        const [updated] = (await tx`
            UPDATE app.pulse_interactions
            SET
                status = 'successful',
                confirmed_at = now()
            WHERE id = ${params.interactionId}::uuid
              AND pulse_id = ${params.pulseId}::uuid
            RETURNING
                id::text AS id,
                pulse_id::text AS pulse_id,
                author_id::text AS author_id,
                helper_id::text AS helper_id,
                status,
                ROUND(EXTRACT(EPOCH FROM accepted_at) * 1000)::bigint AS accepted_at,
                ROUND(EXTRACT(EPOCH FROM confirmed_at) * 1000)::bigint AS confirmed_at,
                trust_awarded
        `) as PulseInteractionRow[];

        if (!updated) {
            return { success: false };
        }

        const trustProgress = await applyTrustProgressionForInteraction(
            tx,
            updated.helper_id,
            updated.id
        );

        const mappedInteraction = mapPulseInteractionRow({
            ...updated,
            trust_awarded: trustProgress.trustAwarded,
            helper_name: interaction.helper_name ?? null,
        });

        return {
            success: true,
            interaction: mappedInteraction,
            helperSuccessfulCount: trustProgress.successfulCount,
            helperTrustScore: trustProgress.trustScore,
            trustIncremented: trustProgress.trustAwarded > 0,
        };
    });
}

export async function submitInteractionFeedback(params: {
    interactionId: string;
    actorId: string;
    positive: boolean;
}): Promise<{
    success: boolean;
    notFound?: boolean;
    forbidden?: boolean;
    solved?: boolean;
    nonRequestType?: boolean;
    positiveRequired?: boolean;
    interaction?: PulseInteraction;
    helperSuccessfulCount?: number;
    helperTrustScore?: number;
    trustIncremented?: boolean;
}> {
    await ensureSchema();

    if (!params.positive) {
        return { success: false, positiveRequired: true };
    }

    const [interaction] = (await sql`
        SELECT
            id::text AS id,
            pulse_id::text AS pulse_id,
            author_id::text AS author_id
        FROM app.pulse_interactions
        WHERE id = ${params.interactionId}::uuid
        LIMIT 1
    `) as Array<{ id: string; pulse_id: string; author_id: string }>;

    if (!interaction) {
        return { success: false, notFound: true };
    }

    if (interaction.author_id === params.actorId) {
        const result = await confirmPulseInteraction({
            pulseId: interaction.pulse_id,
            interactionId: interaction.id,
            authorId: params.actorId,
        });

        if (!result.success && result.solved) {
            return { success: false, solved: true };
        }

        if (!result.success && result.nonRequestType) {
            return { success: false, nonRequestType: true };
        }

        if (!result.success) {
            return { success: false };
        }

        return {
            success: true,
            interaction: result.interaction,
            helperSuccessfulCount: result.helperSuccessfulCount,
            helperTrustScore: result.helperTrustScore,
            trustIncremented: result.trustIncremented,
        };
    }

    const actorRole = (await selectUserRole(params.actorId))?.toLowerCase() ?? '';
    const isAdminActor = actorRole === 'admin' || actorRole === 'mod';

    if (!isAdminActor) {
        return { success: false, forbidden: true };
    }

    const result = await confirmPulseInteractionAsAdmin({
        pulseId: interaction.pulse_id,
        interactionId: interaction.id,
    });

    if (!result.success && result.solved) {
        return { success: false, solved: true };
    }

    if (!result.success && result.nonRequestType) {
        return { success: false, nonRequestType: true };
    }

    if (!result.success) {
        return { success: false };
    }

    return {
        success: true,
        interaction: result.interaction,
        helperSuccessfulCount: result.helperSuccessfulCount,
        helperTrustScore: result.helperTrustScore,
        trustIncremented: result.trustIncremented,
    };
}

export async function markPulseSolved(
    pulseId: string,
    authorId: string
): Promise<{ pulse: PulseFeedItem | null; noSuccessfulInteractions?: boolean }> {
    const [updated] = (await sql`
        UPDATE app.pulses
        SET is_solved = true
        WHERE id = ${pulseId}::uuid
          AND author_id = ${authorId}::uuid
          AND LOWER(COALESCE(pulse_type, 'update')) <> 'update'
          AND EXISTS (
              SELECT 1
              FROM app.pulse_interactions AS pi
              WHERE pi.pulse_id = app.pulses.id
                AND pi.author_id = ${authorId}::uuid
                AND pi.status = 'successful'
          )
        RETURNING id::text AS id
    `) as Array<{ id: string }>;

    if (!updated) {
        const [ownPulse] = (await sql`
            SELECT id::text AS id
            FROM app.pulses
            WHERE id = ${pulseId}::uuid
              AND author_id = ${authorId}::uuid
              AND LOWER(COALESCE(pulse_type, 'update')) <> 'update'
            LIMIT 1
        `) as Array<{ id: string }>;

        if (!ownPulse) {
            return { pulse: null };
        }

        return { pulse: null, noSuccessfulInteractions: true };
    }

    return { pulse: await selectPulseById(updated.id) };
}

export async function markPulseSolvedAsAdmin(
    pulseId: string
): Promise<{ pulse: PulseFeedItem | null; noSuccessfulInteractions?: boolean }> {
    const [updated] = (await sql`
        UPDATE app.pulses
        SET is_solved = true
        WHERE id = ${pulseId}::uuid
          AND LOWER(COALESCE(pulse_type, 'update')) = 'need'
          AND EXISTS (
              SELECT 1
              FROM app.pulse_interactions AS pi
              WHERE pi.pulse_id = app.pulses.id
                AND pi.status = 'successful'
          )
        RETURNING id::text AS id
    `) as Array<{ id: string }>;

    if (!updated) {
        const [requestPulse] = (await sql`
            SELECT id::text AS id
            FROM app.pulses
            WHERE id = ${pulseId}::uuid
              AND LOWER(COALESCE(pulse_type, 'update')) = 'need'
            LIMIT 1
        `) as Array<{ id: string }>;

        if (!requestPulse) {
            return { pulse: null };
        }

        return { pulse: null, noSuccessfulInteractions: true };
    }

    return { pulse: await selectPulseById(updated.id) };
}

export async function selectAcceptedInteractionsForHelper(
    helperId: string,
    limit = 50,
    offset = 0
): Promise<AcceptedInteraction[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const rows = (await sql`
        SELECT
            pi.id::text AS id,
            pi.pulse_id::text AS pulse_id,
            pi.author_id::text AS author_id,
            pi.helper_id::text AS helper_id,
            NULLIF(helper.display_name, '') AS helper_name,
            pi.status,
            ROUND(EXTRACT(EPOCH FROM pi.accepted_at) * 1000)::bigint AS accepted_at,
            CASE
                WHEN pi.confirmed_at IS NULL THEN NULL
                ELSE ROUND(EXTRACT(EPOCH FROM pi.confirmed_at) * 1000)::bigint
            END AS confirmed_at,
            pi.trust_awarded,
            p.content AS pulse_content,
            LOWER(p.pulse_type) AS pulse_type,
            ROUND(EXTRACT(EPOCH FROM p.created_at) * 1000)::bigint AS pulse_timestamp,
            COALESCE(p.urgency_level, 1) AS pulse_urgency_level,
            COALESCE(p.is_solved, false) AS pulse_is_solved,
            COALESCE(NULLIF(author.display_name, ''), pi.author_id::text) AS author_name
        FROM app.pulse_interactions AS pi
        JOIN app.pulses AS p ON p.id = pi.pulse_id
        LEFT JOIN app.users AS author ON author.id = pi.author_id
        LEFT JOIN app.users AS helper ON helper.id = pi.helper_id
        WHERE pi.helper_id = ${helperId}::uuid
        ORDER BY pi.accepted_at DESC, pi.id DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as AcceptedInteractionRow[];

    return rows.map((row) => mapAcceptedInteractionRow(row));
}

export async function insertReport(params: {
    reporterId: string;
    targetId: string;
    targetType: string;
    reason: string;
    content: string;
}): Promise<Report> {
    return await sql.begin(async (tx) => {
        await ensureSchema();

        const [row] = (await tx`
            INSERT INTO app.reports (target_id, target_type, reason, reported_by, content)
            VALUES (${params.targetId}::uuid, ${params.targetType}, ${params.reason}, ${params.reporterId}::uuid, ${params.content})
            RETURNING id, target_id, target_type, reason, reported_by, 
                      ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS "created_at",
                      status, content
        `) as ReportRow[];

        return mapReportRow(row!);
    });
}

export async function selectReports(limit = 50, offset = 0): Promise<Report[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const rows = (await sql`
        SELECT 
            id, target_id, target_type, reason, reported_by, 
            ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS "created_at",
            status, content
        FROM app.reports
        ORDER BY status = 'pending' DESC, created_at DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as ReportRow[];

    return rows.map(mapReportRow);
}

export async function updateReportStatus(id: string, status: string): Promise<boolean> {
    const [updated] = await sql`
        UPDATE app.reports
        SET status = ${status}
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updated);
}

export async function insertMessageReport(params: {
    reporterId: string;
    offenderId: string;
    messageId: string;
    reason: string;
}): Promise<AdminMessageReport> {
    await ensureSchema();

    const [row] = (await sql`
        INSERT INTO app.message_reports (reporter_id, offender_id, message_id, reason)
        VALUES (${params.reporterId}::uuid, ${params.offenderId}::uuid, ${params.messageId}::uuid, ${params.reason})
        RETURNING id::text AS id,
                  message_id::text AS message_id,
                  reason,
                  status::text AS status,
                  ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at,
                  reporter_id::text AS reporter_id,
                  offender_id::text AS offender_id
    `) as Array<{
        id: string;
        message_id: string;
        reason: string;
        status: string;
        created_at: number | string | Date;
        reporter_id: string;
        offender_id: string;
    }>;

    const [details] = (await sql`
        SELECT
            m.content AS message_content,
            COALESCE(NULLIF(reporter.display_name, ''), reporter.email, ${params.reporterId}) AS reporter_name,
            COALESCE(NULLIF(offender.display_name, ''), offender.email, ${params.offenderId}) AS offender_name
        FROM app.messages AS m
        LEFT JOIN app.users AS reporter ON reporter.id = ${params.reporterId}::uuid
        LEFT JOIN app.users AS offender ON offender.id = ${params.offenderId}::uuid
        WHERE m.id = ${params.messageId}::uuid
        LIMIT 1
    `) as Array<{
        message_content: string;
        reporter_name: string;
        offender_name: string;
    }>;

    return mapAdminMessageReportRow({
        id: row!.id,
        message_id: row!.message_id,
        message_content: details?.message_content ?? '',
        reason: row!.reason,
        status: row!.status,
        created_at: row!.created_at,
        reporter_id: row!.reporter_id,
        reporter_name: details?.reporter_name ?? `Neighbor ${params.reporterId.slice(0, 6)}`,
        offender_id: row!.offender_id,
        offender_name: details?.offender_name ?? `Neighbor ${params.offenderId.slice(0, 6)}`,
    });
}

export async function selectAdminMessageReports(params?: {
    limit?: number;
    offset?: number;
    status?: MessageReportStatus;
}): Promise<AdminMessageReport[]> {
    await ensureSchema();

    const safeLimit = Number.isFinite(params?.limit)
        ? Math.max(1, Math.min(Math.floor(params?.limit ?? 50), 100))
        : 50;
    const safeOffset = Number.isFinite(params?.offset)
        ? Math.max(0, Math.floor(params?.offset ?? 0))
        : 0;
    const status = params?.status ?? 'pending';

    const rows = (await sql`
        SELECT
            mr.id::text AS id,
            mr.message_id::text AS message_id,
            m.content AS message_content,
            mr.reason,
            mr.status::text AS status,
            ROUND(EXTRACT(EPOCH FROM mr.created_at) * 1000)::bigint AS created_at,
            mr.reporter_id::text AS reporter_id,
            COALESCE(NULLIF(reporter.display_name, ''), reporter.email, mr.reporter_id::text) AS reporter_name,
            mr.offender_id::text AS offender_id,
            COALESCE(NULLIF(offender.display_name, ''), offender.email, mr.offender_id::text) AS offender_name
        FROM app.message_reports AS mr
        JOIN app.messages AS m ON m.id = mr.message_id
        LEFT JOIN app.users AS reporter ON reporter.id = mr.reporter_id
        LEFT JOIN app.users AS offender ON offender.id = mr.offender_id
        WHERE mr.status = ${status}::app.message_report_status
        ORDER BY mr.created_at DESC, mr.id DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as AdminMessageReportRow[];

    return rows.map(mapAdminMessageReportRow);
}

export async function applyAdminMessageReportAction(params: {
    reportId: string;
    action: MessageReportAction;
}): Promise<{
    success: boolean;
    notFound?: boolean;
    invalidState?: boolean;
}> {
    await ensureSchema();

    return await sql.begin(async (tx) => {
        const [report] = (await tx`
            SELECT id::text AS id,
                   status::text AS status,
                   offender_id::text AS offender_id,
                   message_id::text AS message_id
            FROM app.message_reports
            WHERE id = ${params.reportId}::uuid
            FOR UPDATE
        `) as Array<{
            id: string;
            status: string;
            offender_id: string;
            message_id: string;
        }>;

        if (!report) {
            return { success: false, notFound: true };
        }

        if (report.status !== 'pending') {
            return { success: false, invalidState: true };
        }

        if (params.action === 'ban_user') {
            await tx`
                UPDATE app.users
                SET role = 'banned'
                WHERE id = ${report.offender_id}::uuid
            `;

            await tx`
                UPDATE app.message_reports
                SET status = 'action_taken'
                WHERE id = ${report.id}::uuid
            `;

            return { success: true };
        }

        if (params.action === 'delete_message') {
            await tx`
                INSERT INTO app.hidden_messages (message_id, user_id)
                SELECT m.id, cp.user_id
                FROM app.messages AS m
                JOIN app.chat_participants AS cp ON cp.thread_id = m.thread_id
                WHERE m.id = ${report.message_id}::uuid
                ON CONFLICT (message_id, user_id) DO NOTHING
            `;

            await tx`
                UPDATE app.message_reports
                SET status = 'action_taken'
                WHERE id = ${report.id}::uuid
            `;

            return { success: true };
        }

        await tx`
            UPDATE app.message_reports
            SET status = 'reviewed'
            WHERE id = ${report.id}::uuid
        `;

        return { success: true };
    });
}

export async function deleteReport(id: string): Promise<boolean> {
    const [deleted] = await sql`
        DELETE FROM app.reports
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(deleted);
}
