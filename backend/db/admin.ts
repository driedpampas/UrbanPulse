import type postgres from 'postgres';
import { sql } from './client';
import { SEARCH_LIMIT } from './constants';
import { mapAcceptedInteractionRow, mapAdminMessageReportRow, mapReportRow } from './mappers';
import { selectPulseById, selectPulseInteraction } from './pulses';
import { ensureSchema } from './schema';
import type {
    AcceptedInteraction,
    AcceptedInteractionRow,
    AdminMessageReport,
    AdminMessageReportRow,
    MessageReportAction,
    MessageReportStatus,
    PulseFeedItem,
    PulseInteraction,
    Report,
    ReportRow,
    User,
    UserSearchParams,
} from './types';
import { searchUsers } from './users';

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

        if (!row) {
            throw new Error('Failed to retrieve inserted report.');
        }
        return mapReportRow(row);
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

    if (!row) {
        throw new Error('Failed to insert message report.');
    }

    return mapAdminMessageReportRow({
        id: row.id,
        message_id: row.message_id,
        message_content: details?.message_content ?? '',
        reason: row.reason,
        status: row.status,
        created_at: row.created_at,
        reporter_id: row.reporter_id,
        reporter_name: details?.reporter_name ?? `Neighbor ${params.reporterId.slice(0, 6)}`,
        offender_id: row.offender_id,
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

async function applyTrustProgressionForInteraction(
    tx: postgres.TransactionSql,
    helperId: string
): Promise<{ trust_score: number; awarded: number }> {
    const [user] = (await tx`
        SELECT trust_score
        FROM app.users
        WHERE id = ${helperId}::uuid
        FOR UPDATE
    `) as Array<{ trust_score: number }>;

    const currentTrust = Number(user?.trust_score ?? 0);
    const awarded = 1; // TRUST_SCORE_INCREMENT
    const newTrust = currentTrust + awarded;

    await tx`
        UPDATE app.users
        SET trust_score = ${newTrust},
            is_verified_neighbor = CASE
                WHEN ${newTrust} >= 3 THEN true
                ELSE is_verified_neighbor
            END
        WHERE id = ${helperId}::uuid
    `;

    return { trust_score: newTrust, awarded };
}

export async function confirmPulseInteractionAsAdmin(params: {
    pulseId: string;
    interactionId: string;
}): Promise<{
    success: boolean;
    interaction?: PulseInteraction;
    solved?: boolean;
    nonRequestType?: boolean;
}> {
    const result = await sql.begin(async (tx) => {
        const [pulse] = (await tx`
            SELECT id, is_solved, pulse_type
            FROM app.pulses
            WHERE id = ${params.pulseId}::uuid
            FOR UPDATE
        `) as Array<{ id: string; is_solved: boolean; pulse_type: string }>;

        if (!pulse) return { success: false };
        if (pulse.is_solved) return { success: false, solved: true };
        if (pulse.pulse_type?.toLowerCase() !== 'need')
            return { success: false, nonRequestType: true };

        const [interaction] = (await tx`
            SELECT id, helper_id, status
            FROM app.pulse_interactions
            WHERE id = ${params.interactionId}::uuid 
              AND pulse_id = ${params.pulseId}::uuid
            FOR UPDATE
        `) as Array<{ id: string; helper_id: string; status: string }>;

        if (!interaction || interaction.status === 'successful') {
            return { success: false };
        }

        const trustProgress = await applyTrustProgressionForInteraction(tx, interaction.helper_id);

        await tx`
            UPDATE app.pulse_interactions
            SET status = 'successful',
                confirmed_at = now(),
                trust_awarded = ${trustProgress.awarded}
            WHERE id = ${interaction.id}::uuid
        `;

        return { success: true, interactionId: interaction.id };
    });

    if (!result.success) return result;

    const interaction = await selectPulseInteraction(result.interactionId as string);
    return interaction ? { success: true, interaction } : { success: false };
}
