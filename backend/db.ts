import { sql as drizzleSql } from 'drizzle-orm';
import { db } from './drizzle/client';

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

export interface Location {
    lat?: number | null;
    lng?: number | null;
}

export interface Timerange {
    start: string;
    end: string;
}

export const PULSE_TYPE_VALUES = ['update', 'emergency', 'skill', 'item', 'pet', 'need'] as const;

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
    requiredSkills: string[];
}

export interface Message {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    timestamp: number;
}

export type DeleteMessageScope = 'me' | 'everyone';

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
    displayName?: string | null;
    radius?: number | null;
    location?: Location | null;
    quietHours?: Timerange[] | null;
    quietDays?: number[] | null;
    trustScore?: number | null;
    bio?: string | null;
    verified?: boolean;
    createdAt?: Date;
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
    type?: string | null;
    required_skills?: string[] | null;
};

type UserRow = {
    id: string;
    email?: string | null;
    role?: string;
    created_at?: Date | string | number;
    trust_score?: number | string | null;
    display_name?: string | null;
    is_verified_neighbor?: boolean | null;
    distance_limit_meters?: number | string | null;
    lat?: number | string | null;
    lng?: number | string | null;
    quiet_hours?: Timerange[] | null;
    quiet_days?: number[] | null;
    bio?: string | null;
};

type MessageRow = {
    id: string;
    thread_id: string;
    sender_id: string;
    content: string;
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

function mapPulseRow(rawPulse: PulseRow): PulseFeedItem {
    const normalizedType = String(rawPulse.type ?? 'update').toLowerCase() as PulseType;

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
        requiredSkills: rawPulse.required_skills ?? [],
    };
}

function mapMessageRow(rawMessage: MessageRow): Message {
    return {
        id: String(rawMessage.id),
        threadId: String(rawMessage.thread_id),
        senderId: String(rawMessage.sender_id),
        content: String(rawMessage.content),
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

async function ensureChatParticipantRoleTable(tx: SqlRunner) {
    await tx`
        ALTER TABLE app.chat_threads
        ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES app.users(id) ON DELETE SET NULL
    `;

    await tx`
        CREATE TABLE IF NOT EXISTS app.chat_participant_roles (
            thread_id uuid NOT NULL REFERENCES app.chat_threads(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
            role text NOT NULL,
            assigned_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
            assigned_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (thread_id, user_id, role)
        )
    `;
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
        COALESCE(pulses.required_skills, '[]'::jsonb) AS "required_skills"
    FROM app.pulses AS pulses
    LEFT JOIN app.users AS users ON users.id = pulses.author_id
    WHERE pulses.id = ${id}
    LIMIT 1
    `) as PulseRow[];

    return pulse ? mapPulseRow(pulse) : null;
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
        await ensureChatParticipantRoleTable(tx);

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

export async function selectMessages(threadId: string, currentUser: string): Promise<Message[]> {
    const messages = (await sql.begin(async (tx) => {
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        return (await tx`
            SELECT id, thread_id, sender_id, content,
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
            SELECT id, thread_id, sender_id, content,
            ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS "timestamp"
            FROM app.messages
            WHERE id = ${messageId};
        `) as MessageRow[];
    })) as MessageRow[];

    return message ? mapMessageRow(message) : null;
}

export async function selectChat(chatId: string, currentUser: string): Promise<Chat | null> {
    const chatRows = (await sql.begin(async (tx) => {
        await ensureChatParticipantRoleTable(tx);
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
        await ensureChatParticipantRoleTable(tx);
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

    return (await selectChat(threadId, currentUser))!;
}

export async function addChatParticipants(
    threadId: string,
    participantIds: string[],
    actorId: string
): Promise<boolean> {
    if (participantIds.length === 0) {
        return true;
    }

    await sql.begin(async (tx) => {
        await ensureChatParticipantRoleTable(tx);
        await tx`SELECT set_config('app.current_user_id', ${actorId}, true);`;
        await tx`
            INSERT INTO app.chat_participants (thread_id, user_id)
            SELECT ${threadId}::uuid, users.user_id::uuid
            FROM unnest(string_to_array(${participantIds.join(',')}, ',')::uuid[]) AS users(user_id)
            ON CONFLICT DO NOTHING;
        `;
    });

    return true;
}

export async function removeChatParticipant(
    threadId: string,
    participantId: string,
    actorId: string
): Promise<boolean> {
    const [removed] = await sql.begin(async (tx) => {
        await ensureChatParticipantRoleTable(tx);
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

    return Boolean(removed);
}

export async function promoteChatParticipantToAdmin(
    threadId: string,
    participantId: string,
    actorId: string
): Promise<boolean> {
    await sql.begin(async (tx) => {
        await ensureChatParticipantRoleTable(tx);
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
    content: string
): Promise<Message> {
    const [insertedMessage] = (await sql.begin(async (tx) => {
        await tx`
            SELECT set_config('app.current_user_id', ${senderId}, true);
        `;

        return (await tx`
            INSERT INTO app.messages (thread_id, sender_id, content)
            VALUES (${threadId}, ${senderId}, ${content})
            RETURNING id, thread_id, sender_id, content,
            ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS "timestamp";
        `) as MessageRow[];
    })) as MessageRow[];

    return mapMessageRow(insertedMessage!);
}

export async function insertPulse(params: PulseCreateParams): Promise<PulseFeedItem> {
    const lat = params.location.lat;
    const lng = params.location.lng;

    const [insertedPulse] = await sql`
    INSERT INTO app.pulses (author_id, content, location, pulse_type, urgency_level, required_skills)
    VALUES (${params.authorId}, ${params.content}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${params.type}, ${params.urgencyLevel}, ${JSON.stringify(params.requiredSkills)}::jsonb)
    RETURNING id
    `;

    return (await selectPulseById(insertedPulse.id))!;
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

    const heroes = (await sql`
        SELECT u.id::text
        FROM app.users u
        WHERE u.id != ${pulse.author_id}::uuid
          AND u.location IS NOT NULL
          AND u.distance_limit_meters IS NOT NULL
          AND ST_DWithin(
            u.location,
            ST_SetSRID(ST_MakePoint(${pulse.lng}, ${pulse.lat}), 4326)::geography,
            u.distance_limit_meters
          )
          AND NOT EXISTS (
            SELECT 1 FROM app.blocked_users bu
            WHERE (bu.blocker_id = u.id AND bu.blocked_id = ${pulse.author_id}::uuid)
               OR (bu.blocker_id = ${pulse.author_id}::uuid AND bu.blocked_id = u.id)
          )
    `) as { id: string }[];

    return heroes.map((h) => h.id);
}

export async function insertUser(email: string, hashedPass: string, displayname: string) {
    return await sql`
    INSERT INTO app.users (email, display_name, password_hash)
    VALUES (${email}, ${displayname}, ${hashedPass})
    RETURNING id, role
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

export async function selectFullUser(id: string): Promise<User | null> {
    const [rawUser] = (await sql`
    SELECT 
      id,
      email,
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
        displayName: rawUser.display_name,
        verified: rawUser.is_verified_neighbor,
        radius: rawUser.distance_limit_meters,
        location:
            rawUser.lat !== null && rawUser.lng !== null
                ? { lat: rawUser.lat, lng: rawUser.lng }
                : null,
        quietHours: rawUser.quiet_hours ? rawUser.quiet_hours : [],
        quietDays: rawUser.quiet_days,
        bio: rawUser.bio,
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

export async function updateUserRole(id: string, role: string): Promise<boolean> {
    const [updated] = await sql`
        UPDATE app.users
        SET role = ${role}
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updated);
}

export async function searchUsers(
    userSearch: UserSearchParams,
    limit = SEARCH_LIMIT,
    offset = 0
): Promise<User[]> {
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
        bio 
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
            bio: rawUser.bio,
        } as User;
    });
}

export async function selectUserAuth(email: string) {
    return await sql`
    SELECT id, password_hash, role FROM app.users WHERE email = ${email}
    `;
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

    const quietHoursJson = JSON.stringify(user.quietHours ?? null);
    const quietDaysJson = JSON.stringify(user.quietDays ?? null);

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
            END

      WHERE id = ${user.id}
    `;
}

export async function deleteUser(id: string) {
    return await sql`
        DELETE FROM app.users 
        WHERE id = ${id}
    `;
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
        await tx`CREATE SCHEMA IF NOT EXISTS app`;
        await tx`
            CREATE TABLE IF NOT EXISTS app.pulse_confirmations (
                pulse_id uuid NOT NULL REFERENCES app.pulses(id) ON DELETE CASCADE,
                user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
                confirmed_at timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (pulse_id, user_id)
            )
        `;

        // 1. Check if user already confirmed or is author
        const [pulse] = await tx`
            SELECT author_id, urgency_level
            FROM app.pulses
            WHERE id = ${pulseId}
        `;

        if (!pulse) return { success: false, alreadyConfirmed: false };
        if (pulse.author_id === userId) return { success: false, alreadyConfirmed: false };

        const [existing] = await tx`
            SELECT 1 FROM app.pulse_confirmations
            WHERE pulse_id = ${pulseId} AND user_id = ${userId}
        `;

        if (existing) return { success: false, alreadyConfirmed: true };

        // 2. Record confirmation
        await tx`
            INSERT INTO app.pulse_confirmations (pulse_id, user_id)
            VALUES (${pulseId}, ${userId})
        `;

        // 3. Increment pulse count
        await tx`
            UPDATE app.pulses
            SET confirmation_count = COALESCE(confirmation_count, 0) + 1
            WHERE id = ${pulseId}
        `;

        // 4. Award trust score to author
        // High urgency (>= 4) gets +3, others +1
        const trustAward = (pulse.urgency_level ?? 1) >= 4 ? 3 : 1;
        await tx`
            UPDATE app.users
            SET trust_score = COALESCE(trust_score, 0) + ${trustAward}
            WHERE id = ${pulse.author_id}
        `;

        return { success: true, alreadyConfirmed: false };
    });
}

export async function insertReport(params: {
    reporterId: string;
    targetId: string;
    targetType: string;
    reason: string;
    content: string;
}): Promise<Report> {
    return await sql.begin(async (tx) => {
        await tx`
            CREATE TABLE IF NOT EXISTS app.reports (
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

export async function deleteReport(id: string): Promise<boolean> {
    const [deleted] = await sql`
        DELETE FROM app.reports
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(deleted);
}
