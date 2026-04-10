import { sql } from 'bun';

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
}

export interface Message {
    id: string;
    threadId: string;
    senderId: string;
    content: string;
    timestamp: number;
}

export type DeleteMessageScope = 'me' | 'everyone';

export interface Chat {
    id: string;
    participants: {
        userId: string;
    }[];
    isGroup: boolean;
    timestamp: number;
}

export interface ChatSummary {
    id: string;
    participants: {
        userId: string;
        displayName: string | null;
    }[];
    isGroup: boolean;
    timestamp: number;
}

interface User {
    id: string;
    email?: string | null;
    role?: string;
    passwordHash?: string | null;
    displayName?: string | null;
    skillsAndResources?: string[] | null;
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
};

type UserRow = {
    id: string;
    email?: string | null;
    role?: string;
    skills_and_resources?: string[] | null;
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
};

type ChatThreadRow = {
    id: string;
    is_group: boolean;
    timestamp: number | string | Date;
};

type ChatSummaryRow = {
    id: string;
    is_group: boolean;
    timestamp: number | string | Date;
    participants: Array<{
        userId: string;
        displayName: string | null;
    }>;
};

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
        COALESCE(pulses.urgency_level, 1) AS "urgencyLevel"
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
        COALESCE(pulses.urgency_level, 1) AS "urgencyLevel"
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
    const chats = (await sql`
        SELECT
            ct.id,
            ct.is_group,
            ROUND(EXTRACT(EPOCH FROM ct.created_at) * 1000)::bigint AS "timestamp",
            jsonb_agg(
                jsonb_build_object(
                    'userId', cp.user_id::text,
                    'displayName', NULLIF(users.display_name, '')
                )
                ORDER BY cp.joined_at
            ) AS participants
        FROM app.chat_threads AS ct
        JOIN app.chat_participants AS cp ON cp.thread_id = ct.id
        LEFT JOIN app.users AS users ON users.id = cp.user_id
        WHERE ct.id IN (
            SELECT thread_id
            FROM app.chat_participants
            WHERE user_id = ${userId}
        )
        GROUP BY ct.id, ct.is_group, ct.created_at
        ORDER BY "timestamp" DESC, ct.id DESC
    `) as ChatSummaryRow[];

    return chats.map((chat) => ({
        id: chat.id,
        isGroup: chat.is_group,
        timestamp: Number(chat.timestamp),
        participants: chat.participants.map((participant) => ({
            userId: participant.userId,
            displayName: participant.displayName,
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

export async function selectMessage(messageId: string, currentUser: string): Promise<Message | null> {
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
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        return (await tx`
            SELECT cp.thread_id, cp.user_id, ct.is_group,
            ROUND(EXTRACT(EPOCH FROM ct.created_at) * 1000)::bigint AS "timestamp"
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

    return {
        id: chatId,
        participants,
        isGroup: chatRows[0]!.is_group,
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
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        await tx`
            INSERT INTO app.chat_threads (id, is_group)
            VALUES (${threadId}::uuid, ${isGroup});
        `;

        await tx`
            INSERT INTO app.chat_participants (thread_id, user_id)
            SELECT ${threadId}::uuid, users.user_id::uuid
            FROM unnest(string_to_array(${csvParticipantIds}, ',')::uuid[]) AS users(user_id);
        `;
    });

    return (await selectChat(threadId, currentUser))!;
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

export async function insertMessage(threadId: string, senderId: string, content: string): Promise<Message> {
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
    INSERT INTO app.pulses (author_id, content, location, pulse_type, urgency_level)
    VALUES (${params.authorId}, ${params.content}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${params.type}, ${params.urgencyLevel})
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
      COALESCE(quiet_days, '[]'::jsonb) AS quiet_days,
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

export async function searchUsers(userSearch: UserSearchParams): Promise<User[]> {
    const availableDaysQuery = (userSearch.availableDays ?? []).map((day) => Number(day));
    const results = (await sql`
    SELECT 
        id,
        email,
        role,
        skills_and_resources,
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
        AND (${userSearch.email}::text IS NULL OR email ILIKE ${`%${userSearch.email}%`})
        AND ((${userSearch.displayName}::text IS NULL OR display_name ILIKE ${`%${userSearch.displayName}%`})
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
                quiet_days && app.jsonb_to_integer_array(${availableDaysQuery as number[]}::jsonb)
            ))
        )
        AND (
            ${userSearch.availableHours}::jsonb IS NULL
            OR ( quiet_hours != '{}'::app.timemultirange AND NOT (quiet_hours && app.text_array_to_timemultirange(${userSearch.availableHours}::jsonb)))
        )
        AND (${userSearch.bio}::text IS NULL OR bio ILIKE ${`%${userSearch.bio}%`})
        AND (${userSearch.created_before}::timestamptz IS NULL OR created_at <= ${userSearch.created_before}::timestamptz)
        AND (${userSearch.created_after}::timestamptz IS NULL OR created_at >= ${userSearch.created_after}::timestamptz)
        AND (
            ${userSearch.anySkillRes}::jsonb IS NULL 
            OR ${userSearch.skillsAndResources}::jsonb IS NULL OR
            (skills_and_resources != '[]'::jsonb AND (
                (${userSearch.anySkillRes}::boolean AND 
                    (skills_and_resources::text ILIKE ANY (app.jsonb_to_wildcard_text_array(${userSearch.skillsAndResources}::jsonb)))
                ) OR (NOT ${userSearch.anySkillRes}::boolean AND 
                    (skills_and_resources::text ILIKE ALL (app.jsonb_to_wildcard_text_array(${userSearch.skillsAndResources}::jsonb)))
                )
            ))
        )
        ) OR id = ${userSearch.id})
    LIMIT ${SEARCH_LIMIT}
    `) as UserRow[];

    return results.map((rawUser) => {
        return {
            id: rawUser.id,
            email: rawUser.email,
            role: rawUser.role,
            skillsAndResources: rawUser.skills_and_resources,
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
    const quietHours = user.quietHours ? user.quietHours : null;
    const quietDays = user.quietDays ? user.quietDays : null;
    const skillres = user.skillsAndResources ? user.skillsAndResources : null;

    const shouldClearQuietHours = user.quietHours === null;
    const shouldClearQuietDays = user.quietDays === null;
    const shouldClearSkillRes = user.skillsAndResources === null;
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
                WHEN ${quietHours}::jsonb IS NOT NULL THEN app.jsonb_to_timemultirange(${quietHours}::jsonb)
        ELSE quiet_hours 
      END,

      quiet_days = CASE 
        WHEN ${shouldClearQuietDays} THEN '{}'::integer[]
        WHEN ${quietDays}::jsonb IS NOT NULL THEN app.jsonb_to_integer_array(${quietDays}::jsonb)
        ELSE quiet_days 
      END,

      skills_and_resources = CASE
        WHEN ${shouldClearSkillRes} THEN '[]'::jsonb
        WHEN ${skillres}::jsonb IS NOT NULL THEN ${skillres}::jsonb
        ELSE skills_and_resources
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
        AND (${userSearch.email}::text IS NULL OR email ILIKE ${`%${userSearch.email}%`})
        AND ((${userSearch.displayName}::text IS NULL OR display_name ILIKE ${`%${userSearch.displayName}%`})
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
                quiet_days && app.jsonb_to_integer_array(${availableDaysQuery as number[]}::jsonb)
            ))
        )
        AND (
            ${userSearch.availableHours}::jsonb IS NULL
            OR ( quiet_hours != '{}'::app.timemultirange AND NOT (quiet_hours && app.text_array_to_timemultirange(${userSearch.availableHours}::jsonb)))
        )
        AND (${userSearch.bio}::text IS NULL OR bio ILIKE ${`%${userSearch.bio}%`})
        AND (${userSearch.created_before}::timestamptz IS NULL OR created_at <= ${userSearch.created_before}::timestamptz)
        AND (${userSearch.created_after}::timestamptz IS NULL OR created_at >= ${userSearch.created_after}::timestamptz)
        AND (
            ${userSearch.anySkillRes}::jsonb IS NULL 
            OR ${userSearch.skillsAndResources}::jsonb IS NULL OR
            (skills_and_resources != '[]'::jsonb AND (
                (${userSearch.anySkillRes}::boolean AND 
                    (skills_and_resources::text ILIKE ANY (app.jsonb_to_wildcard_text_array(${userSearch.skillsAndResources}::jsonb)))
                ) OR (NOT ${userSearch.anySkillRes}::boolean AND 
                    (skills_and_resources::text ILIKE ALL (app.jsonb_to_wildcard_text_array(${userSearch.skillsAndResources}::jsonb)))
                )
            ))
        )
        ) OR id = ${userSearch.id}))
    `;
}
