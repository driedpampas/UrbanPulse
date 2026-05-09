import { sql } from './client';
import { mapMessageRow, normalizeChatRoles } from './mappers';
import { ensureSchema } from './schema';
import type {
    Chat,
    ChatParticipantRole,
    ChatParticipantRow,
    ChatRoleRow,
    ChatSummary,
    ChatSummaryRow,
    ChatThreadRow,
    EditMessageResult,
    Message,
    MessageRow,
} from './types';
import { selectUserSummary } from './users.ts';

export async function selectChats(userId: string): Promise<{ chatId: string }[]> {
    const chats = await sql`
        SELECT thread_id AS "chatId"
        FROM app.chat_participants
        WHERE user_id = ${userId}
    `;

    return chats as unknown as { chatId: string }[];
}

export async function selectChatSummaries(userId: string): Promise<ChatSummary[]> {
    const chats = (await sql.begin(async (tx) => {
        await ensureSchema();

        return (await tx`
            SELECT
                ct.id,
                ct.is_group,
                NULLIF(BTRIM(ct.name), '') AS name,
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
            GROUP BY ct.id, ct.is_group, ct.name, ct.created_at, ct.owner_id
            ORDER BY "timestamp" DESC, ct.id DESC
        `) as ChatSummaryRow[];
    })) as ChatSummaryRow[];

    return chats.map((chat) => ({
        id: chat.id,
        isGroup: chat.is_group,
        name: chat.name,
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
                NULLIF(BTRIM(ct.name), '') AS name,
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
            GROUP BY ct.id, ct.is_group, ct.name, ct.created_at, ct.owner_id
        `) as ChatSummaryRow[];
    })) as ChatSummaryRow[];

    if (!chat) return null;

    return {
        id: chat.id,
        isGroup: chat.is_group,
        name: chat.name,
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
                NULLIF(BTRIM(ct.name), '') AS name,
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
            GROUP BY ct.id, ct.is_group, ct.name, ct.created_at, ct.owner_id
        `) as ChatSummaryRow[];
    })) as ChatSummaryRow[];

    if (!chat) return null;

    return {
        id: chat.id,
        isGroup: chat.is_group,
        name: chat.name,
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
            SELECT
                m.id,
                m.thread_id,
                m.sender_id,
                m.content,
                m.is_edited,
                m.message_type,
                m.reply_to_id,
                reply.sender_id AS reply_to_sender_id,
                COALESCE(
                    NULLIF(reply_sender.display_name, ''),
                    CASE
                        WHEN reply.sender_id IS NULL THEN NULL
                        ELSE 'Neighbor ' || LEFT(reply.sender_id::text, 6)
                    END
                ) AS reply_to_sender_name,
                CASE
                    WHEN m.reply_to_id IS NULL OR reply_hidden.message_id IS NOT NULL THEN NULL
                    ELSE LEFT(reply.content, 220)
                END AS reply_to_snippet,
                CASE
                    WHEN m.reply_to_id IS NULL THEN false
                    WHEN reply_hidden.message_id IS NOT NULL THEN true
                    ELSE false
                END AS reply_to_unavailable,
                ROUND(EXTRACT(EPOCH FROM m.created_at) * 1000)::bigint AS "timestamp"
            FROM app.messages AS m
            LEFT JOIN app.messages AS reply
                ON reply.id = m.reply_to_id
            LEFT JOIN app.users AS reply_sender
                ON reply_sender.id = reply.sender_id
            LEFT JOIN app.hidden_messages AS reply_hidden
                ON reply_hidden.message_id = reply.id
               AND reply_hidden.user_id = ${currentUser}::uuid
            WHERE m.thread_id = ${threadId}::uuid
                AND NOT EXISTS (
                    SELECT 1
                    FROM app.hidden_messages AS hidden
                    WHERE hidden.message_id = m.id
                        AND hidden.user_id = ${currentUser}::uuid
                )
            ORDER BY m.created_at ASC, m.id ASC;
        `) as MessageRow[];
    })) as MessageRow[];

    return messages.map((message) => mapMessageRow(message));
}

export async function selectMessage(
    messageId: string,
    currentUser: string
): Promise<Message | null> {
    await ensureSchema();
    const [message] = (await sql.begin(async (tx) => {
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        return (await tx`
            SELECT
                m.id,
                m.thread_id,
                m.sender_id,
                m.content,
                m.is_edited,
                m.message_type,
                m.reply_to_id,
                reply.sender_id AS reply_to_sender_id,
                COALESCE(
                    NULLIF(reply_sender.display_name, ''),
                    CASE
                        WHEN reply.sender_id IS NULL THEN NULL
                        ELSE 'Neighbor ' || LEFT(reply.sender_id::text, 6)
                    END
                ) AS reply_to_sender_name,
                CASE
                    WHEN m.reply_to_id IS NULL OR reply_hidden.message_id IS NOT NULL THEN NULL
                    ELSE LEFT(reply.content, 220)
                END AS reply_to_snippet,
                CASE
                    WHEN m.reply_to_id IS NULL THEN false
                    WHEN reply_hidden.message_id IS NOT NULL THEN true
                    ELSE false
                END AS reply_to_unavailable,
                ROUND(EXTRACT(EPOCH FROM m.created_at) * 1000)::bigint AS "timestamp"
            FROM app.messages AS m
            JOIN app.chat_participants AS cp
                ON cp.thread_id = m.thread_id
               AND cp.user_id = ${currentUser}::uuid
            LEFT JOIN app.messages AS reply
                ON reply.id = m.reply_to_id
            LEFT JOIN app.users AS reply_sender
                ON reply_sender.id = reply.sender_id
            LEFT JOIN app.hidden_messages AS reply_hidden
                ON reply_hidden.message_id = reply.id
               AND reply_hidden.user_id = ${currentUser}::uuid
            WHERE m.id = ${messageId}::uuid
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

export async function selectThreadMessageById(
    threadId: string,
    messageId: string
): Promise<{ id: string; threadId: string } | null> {
    await ensureSchema();

    const [message] = (await sql`
        SELECT id::text AS id, thread_id::text AS thread_id
        FROM app.messages
        WHERE id = ${messageId}::uuid
            AND thread_id = ${threadId}::uuid
        LIMIT 1;
    `) as Array<{ id: string; thread_id: string }>;

    if (!message) {
        return null;
    }

    return {
        id: message.id,
        threadId: message.thread_id,
    };
}

export async function selectChat(chatId: string, currentUser: string): Promise<Chat | null> {
    const chatRows = (await sql.begin(async (tx) => {
        await ensureSchema();
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        return (await tx`
            SELECT cp.thread_id, cp.user_id, ct.is_group,
            NULLIF(BTRIM(ct.name), '') AS name,
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
            if (!next.includes(roleRow.role as ChatParticipantRole))
                next.push(roleRow.role as ChatParticipantRole);
        }
        participantRoles[roleRow.user_id] = next;
    }

    const firstRow = chatRows[0];
    if (!firstRow) return null;

    return {
        id: chatId,
        participants,
        isGroup: !!firstRow.is_group,
        ownerId: firstRow.owner_id ? String(firstRow.owner_id) : null,
        name: firstRow.name?.trim() ? String(firstRow.name) : null,
        participantRoles,
        timestamp: Number(firstRow.timestamp),
    };
}

export async function selectChatById(chatId: string): Promise<Chat | null> {
    const chatRows = (await sql.begin(async (tx) => {
        await ensureSchema();

        return (await tx`
            SELECT cp.thread_id, cp.user_id, ct.is_group,
            NULLIF(BTRIM(ct.name), '') AS name,
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
            if (!next.includes(roleRow.role as ChatParticipantRole))
                next.push(roleRow.role as ChatParticipantRole);
        }
        participantRoles[roleRow.user_id] = next;
    }

    const firstRow = chatRows[0];
    if (!firstRow) return null;

    return {
        id: chatId,
        participants,
        isGroup: !!firstRow.is_group,
        ownerId: firstRow.owner_id ? String(firstRow.owner_id) : null,
        name: firstRow.name?.trim() ? String(firstRow.name) : null,
        participantRoles,
        timestamp: Number(firstRow.timestamp),
    };
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
    currentUser: string,
    name?: string
): Promise<Chat> {
    const threadId = crypto.randomUUID();
    const csvParticipantIds = participantIds.join(',');
    const normalizedName =
        isGroup && typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;

    await sql.begin(async (tx) => {
        await ensureSchema();
        await tx`
            SELECT set_config('app.current_user_id', ${currentUser}, true);
        `;

        await tx`
            INSERT INTO app.chat_threads (id, is_group, owner_id, name)
            VALUES (${threadId}::uuid, ${isGroup}, ${currentUser}::uuid, ${normalizedName});
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

    const chat = await selectChat(threadId, currentUser);
    if (!chat) {
        throw new Error('Failed to create or retrieve chat');
    }
    return chat;
}

export async function updateChatName(threadId: string, ownerId: string, newName: string) {
    await ensureSchema();

    const [updated] = (await sql`
        UPDATE app.chat_threads
        SET name = ${newName}
        WHERE id = ${threadId}::uuid
          AND is_group = true
          AND (owner_id = ${ownerId}::uuid OR owner_id IS NULL)
        RETURNING id::text AS id, NULLIF(BTRIM(name), '') AS name;
    `) as Array<{ id: string; name: string | null }>;

    return updated
        ? {
              threadId: updated.id,
              name: updated.name ?? '',
          }
        : null;
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
            WITH updated AS (
                UPDATE app.messages
                SET content = ${newContent},
                    is_edited = true
                WHERE id = ${messageId}::uuid
                RETURNING id, thread_id, sender_id, content, is_edited, message_type, reply_to_id, created_at
            )
            SELECT
                updated.id,
                updated.thread_id,
                updated.sender_id,
                updated.content,
                updated.is_edited,
                updated.message_type,
                updated.reply_to_id,
                reply.sender_id AS reply_to_sender_id,
                COALESCE(
                    NULLIF(reply_sender.display_name, ''),
                    CASE
                        WHEN reply.sender_id IS NULL THEN NULL
                        ELSE 'Neighbor ' || LEFT(reply.sender_id::text, 6)
                    END
                ) AS reply_to_sender_name,
                CASE
                    WHEN updated.reply_to_id IS NULL OR reply_hidden.message_id IS NOT NULL THEN NULL
                    ELSE LEFT(reply.content, 220)
                END AS reply_to_snippet,
                CASE
                    WHEN updated.reply_to_id IS NULL THEN false
                    WHEN reply_hidden.message_id IS NOT NULL THEN true
                    ELSE false
                END AS reply_to_unavailable,
                ROUND(EXTRACT(EPOCH FROM updated.created_at) * 1000)::bigint AS "timestamp"
            FROM updated
            LEFT JOIN app.messages AS reply
                ON reply.id = updated.reply_to_id
            LEFT JOIN app.users AS reply_sender
                ON reply_sender.id = reply.sender_id
            LEFT JOIN app.hidden_messages AS reply_hidden
                ON reply_hidden.message_id = reply.id
               AND reply_hidden.user_id = ${editorId}::uuid;
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

export async function insertMessage(
    threadId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'notice' = 'text',
    replyToId: string | null = null
): Promise<Message> {
    await ensureSchema();

    const [row] = (await sql`
        INSERT INTO app.messages (thread_id, sender_id, content, message_type, reply_to_id)
        VALUES (${threadId}::uuid, ${senderId}::uuid, ${content}, ${messageType}, ${replyToId}::uuid)
        RETURNING id::text AS id,
                  thread_id::text AS thread_id,
                  sender_id::text AS sender_id,
                  content,
                  is_edited,
                  message_type,
                  reply_to_id::text AS reply_to_id,
                  ROUND(EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS timestamp
    `) as MessageRow[];

    if (!row) {
        throw new Error('Failed to insert message');
    }

    if (replyToId) {
        const [replyDetails] = (await sql`
            SELECT
                m.sender_id::text AS reply_to_sender_id,
                COALESCE(NULLIF(u.display_name, ''), 'Neighbor ' || LEFT(m.sender_id::text, 6)) AS reply_to_sender_name,
                LEFT(m.content, 220) AS reply_to_snippet
            FROM app.messages AS m
            LEFT JOIN app.users AS u ON u.id = m.sender_id
            WHERE m.id = ${replyToId}::uuid
            LIMIT 1
        `) as Array<{
            reply_to_sender_id: string;
            reply_to_sender_name: string;
            reply_to_snippet: string;
        }>;

        if (replyDetails) {
            return mapMessageRow({
                ...row,
                reply_to_sender_id: replyDetails.reply_to_sender_id,
                reply_to_sender_name: replyDetails.reply_to_sender_name,
                reply_to_snippet: replyDetails.reply_to_snippet,
                reply_to_unavailable: false,
            });
        }
    }

    return mapMessageRow(row);
}

export async function selectBlockedCounterpartyIds(userId: string): Promise<string[]> {
    const rows = (await sql`
        SELECT
            CASE
                WHEN blocker_id = ${userId}::uuid THEN blocked_id::text
                ELSE blocker_id::text
            END AS counterparty_id
        FROM app.blocked_users
        WHERE blocker_id = ${userId}::uuid OR blocked_id = ${userId}::uuid
    `) as Array<{ counterparty_id: string }>;

    return rows.map((r) => r.counterparty_id);
}

export async function isEitherUserBlocked(userAId: string, userBId: string): Promise<boolean> {
    const [row] = (await sql`
        SELECT 1
        FROM app.blocked_users
        WHERE (blocker_id = ${userAId}::uuid AND blocked_id = ${userBId}::uuid)
           OR (blocker_id = ${userBId}::uuid AND blocked_id = ${userAId}::uuid)
        LIMIT 1
    `) as Array<{ 1: number }>;

    return Boolean(row);
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
    await sql`
        INSERT INTO app.blocked_users (blocker_id, blocked_id)
        VALUES (${blockerId}::uuid, ${blockedId}::uuid)
        ON CONFLICT DO NOTHING
    `;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
    const [deleted] = await sql`
        DELETE FROM app.blocked_users
        WHERE blocker_id = ${blockerId}::uuid AND blocked_id = ${blockedId}::uuid
        RETURNING blocker_id
    `;

    return Boolean(deleted);
}
