import type postgres from 'postgres';
import { buildResourceTokenSet, findMatchedRequestedResources } from '../resourceMatching';
import { sql } from './client';
import { TRUST_SCORE_INCREMENT, TRUST_SCORE_SUCCESS_THRESHOLD } from './constants';
import {
    isSuppressedByQuietWindow,
    mapAcceptedInteractionRow,
    mapAuthorPulseRow,
    mapPulseInteractionRow,
    mapPulseRow,
} from './mappers';
import { ensureSchema } from './schema';
import type {
    AcceptedInteraction,
    AcceptedInteractionRow,
    AuthorPulseRequest,
    HeroCandidateRow,
    HeroMatchUser,
    PulseCreateParams,
    PulseFeedItem,
    PulseInteraction,
    PulseInteractionRow,
    PulseRow,
    PulseType,
    UserResourceRow,
} from './types';

export async function selectPulses(
    limit = 50,
    lat?: number | null,
    lng?: number | null,
    radius?: number | null,
    offset = 0,
    type?: PulseType | null,
    excludePets = false
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

        COALESCE(pulses.is_emergency, false) AS "is_emergency",
        COALESCE(pulses.is_solved, false) AS "is_solved",
        COALESCE(pulses.required_skills, '[]'::jsonb) AS "required_skills"
    FROM app.pulses AS pulses
    LEFT JOIN app.users AS users ON users.id = pulses.author_id
    WHERE (
        (${lat ?? null}::double precision IS NULL OR 
        ${lng ?? null}::double precision IS NULL OR 
        ${radius ?? null}::double precision IS NULL OR
        ST_DWithin(
            pulses.location,
            ST_SetSRID(ST_MakePoint(${lng ?? null}::double precision, ${lat ?? null}::double precision), 4326)::geography,
            ${radius ?? null}::double precision
        ))
        AND (${type ?? null}::text IS NULL OR LOWER(pulses.pulse_type) = LOWER(${type ?? null}::text))
        AND (${excludePets}::boolean IS FALSE OR LOWER(pulses.pulse_type) != 'pet')
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
            ST_X(location::geometry) AS lng,
            COALESCE(pulses.is_verified_info, false) AS verified,
            COALESCE(pulses.confirmation_count, 0) AS confirmations,

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

export async function insertPulse(params: PulseCreateParams): Promise<PulseFeedItem> {
    const lat = params.location.lat ?? null;
    const lng = params.location.lng ?? null;
    const isEmergency = params.isEmergency ?? params.type.toLowerCase() === 'emergency';

    const [insertedPulse] = await sql`
    INSERT INTO app.pulses (
        author_id,
        content,
        location,
        pulse_type,

        is_emergency,
        is_solved,
        required_skills
    )
    VALUES (
        ${params.authorId},
        ${params.content},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${params.type},

        ${isEmergency},
        false,
        ${JSON.stringify(params.requiredSkills)}::jsonb
    )
    RETURNING id
    `;

    const pulse = await selectPulseById(insertedPulse?.id);
    if (!pulse) {
        throw new Error('Failed to retrieve inserted pulse');
    }
    return pulse;
}

export async function updatePulse(
    pulseId: string,
    authorId: string,
    updates: {
        content?: string;
        isEmergency?: boolean;
        requiredSkills?: string[];
    }
): Promise<PulseFeedItem | null> {
    await ensureSchema();

    const content = updates.content ?? null;
    const isEmergency = updates.isEmergency ?? null;
    const requiredSkills =
        updates.requiredSkills !== undefined ? JSON.stringify(updates.requiredSkills) : null;

    const [updated] = await sql`
        UPDATE app.pulses
        SET
            content = COALESCE(${content}, content),
            is_emergency = COALESCE(${isEmergency}::boolean, is_emergency),

            required_skills = COALESCE(${requiredSkills}::jsonb, required_skills)
        WHERE id = ${pulseId}::uuid
          AND author_id = ${authorId}::uuid
        RETURNING id::text AS id
    `;

    if (!updated) {
        return null;
    }

    return await selectPulseById(updated.id);
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
                candidate.quiet_days ?? null,
                candidate.quiet_hours ?? null,
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

export async function confirmPulse(
    pulseId: string,
    userId: string
): Promise<{ success: boolean; alreadyConfirmed?: boolean }> {
    return await sql.begin(async (tx) => {
        const [inserted] = await tx`
            INSERT INTO app.pulse_confirmations (pulse_id, user_id)
            VALUES (${pulseId}::uuid, ${userId}::uuid)
            ON CONFLICT DO NOTHING
            RETURNING pulse_id;
        `;

        if (!inserted) {
            return { success: false, alreadyConfirmed: true };
        }

        await tx`
            UPDATE app.pulses
            SET confirmation_count = confirmation_count + 1,
                is_verified_info = CASE
                    WHEN (confirmation_count + 1) >= 3 THEN true
                    ELSE is_verified_info
                END
            WHERE id = ${pulseId}::uuid
            RETURNING id;
        `;

        return { success: true };
    });
}

export async function solvePulse(pulseId: string, authorId: string): Promise<boolean> {
    const [solved] = await sql`
        UPDATE app.pulses
        SET is_solved = true
        WHERE id = ${pulseId}::uuid AND author_id = ${authorId}::uuid
        RETURNING id;
    `;

    return Boolean(solved);
}

export async function selectPulseInteractionsByAuthor(
    authorId: string
): Promise<PulseInteraction[]> {
    const rows = (await sql`
        SELECT
            i.id,
            i.pulse_id,
            i.author_id,
            i.helper_id,
            COALESCE(NULLIF(u.display_name, ''), i.helper_id::text) AS helper_name,
            i.status,
            ROUND(EXTRACT(EPOCH FROM i.accepted_at) * 1000)::bigint AS accepted_at,
            ROUND(EXTRACT(EPOCH FROM i.confirmed_at) * 1000)::bigint AS confirmed_at,
            i.trust_awarded
        FROM app.pulse_interactions AS i
        LEFT JOIN app.users AS u ON u.id = i.helper_id
        WHERE i.author_id = ${authorId}::uuid
        ORDER BY i.accepted_at DESC
    `) as PulseInteractionRow[];

    return rows.map((row) => mapPulseInteractionRow(row));
}

export async function selectPulseInteractionsByHelper(
    helperId: string
): Promise<AcceptedInteraction[]> {
    const rows = (await sql`
        SELECT
            i.id,
            i.pulse_id,
            i.author_id,
            i.helper_id,
            COALESCE(NULLIF(helper_user.display_name, ''), i.helper_id::text) AS helper_name,
            i.status,
            ROUND(EXTRACT(EPOCH FROM i.accepted_at) * 1000)::bigint AS accepted_at,
            ROUND(EXTRACT(EPOCH FROM i.confirmed_at) * 1000)::bigint AS confirmed_at,
            i.trust_awarded,
            p.content AS pulse_content,
            LOWER(p.pulse_type) AS pulse_type,
            ROUND(EXTRACT(EPOCH FROM p.created_at) * 1000)::bigint AS pulse_timestamp,

            p.is_solved AS pulse_is_solved,
            COALESCE(NULLIF(author_user.display_name, ''), i.author_id::text) AS author_name
        FROM app.pulse_interactions AS i
        JOIN app.pulses AS p ON p.id = i.pulse_id
        LEFT JOIN app.users AS helper_user ON helper_user.id = i.helper_id
        LEFT JOIN app.users AS author_user ON author_user.id = i.author_id
        WHERE i.helper_id = ${helperId}::uuid
        ORDER BY i.accepted_at DESC
    `) as AcceptedInteractionRow[];

    return rows.map((row) => mapAcceptedInteractionRow(row));
}

export async function selectPulseInteraction(id: string): Promise<PulseInteraction | null> {
    const [row] = (await sql`
        SELECT
            i.id,
            i.pulse_id,
            i.author_id,
            i.helper_id,
            COALESCE(NULLIF(u.display_name, ''), i.helper_id::text) AS helper_name,
            i.status,
            ROUND(EXTRACT(EPOCH FROM i.accepted_at) * 1000)::bigint AS accepted_at,
            ROUND(EXTRACT(EPOCH FROM i.confirmed_at) * 1000)::bigint AS confirmed_at,
            i.trust_awarded
        FROM app.pulse_interactions AS i
        LEFT JOIN app.users AS u ON u.id = i.helper_id
        WHERE i.id = ${id}::uuid
        LIMIT 1
    `) as PulseInteractionRow[];

    return row ? mapPulseInteractionRow(row) : null;
}

export async function insertPulseInteraction(params: {
    pulseId: string;
    helperId: string;
}): Promise<{
    success: boolean;
    solved?: boolean;
    nonRequestType?: boolean;
    alreadyAccepted?: boolean;
    interaction?: PulseInteraction;
}> {
    return await sql.begin(async (tx) => {
        const [pulse] = (await tx`
            SELECT id, author_id, is_solved, LOWER(pulse_type) AS pulse_type
            FROM app.pulses
            WHERE id = ${params.pulseId}::uuid
            FOR UPDATE
        `) as Array<{ id: string; author_id: string; is_solved: boolean; pulse_type: string }>;

        if (!pulse) return { success: false };
        if (pulse.is_solved) return { success: false, solved: true };
        if (pulse.pulse_type !== 'need') return { success: false, nonRequestType: true };

        const [existing] = (await tx`
            SELECT id FROM app.pulse_interactions
            WHERE pulse_id = ${params.pulseId}::uuid AND helper_id = ${params.helperId}::uuid
            LIMIT 1
        `) as Array<{ id: string }>;

        if (existing) {
            return { success: false, alreadyAccepted: true };
        }

        const [inserted] = (await tx`
            INSERT INTO app.pulse_interactions (pulse_id, author_id, helper_id)
            VALUES (${params.pulseId}::uuid, ${pulse.author_id}::uuid, ${params.helperId}::uuid)
            RETURNING id::text AS id
        `) as Array<{ id: string }>;

        if (!inserted) {
            return { success: false };
        }

        const interaction = await selectPulseInteraction(inserted.id);
        return interaction ? { success: true, interaction } : { success: false };
    });
}

async function applyTrustProgressionForInteraction(
    tx: postgres.TransactionSql, // SqlRunner
    helperId: string
): Promise<{ trust_score: number; awarded: number }> {
    const [user] = (await tx`
        SELECT trust_score
        FROM app.users
        WHERE id = ${helperId}::uuid
        FOR UPDATE
    `) as Array<{ trust_score: number }>;

    const currentTrust = Number(user?.trust_score ?? 0);
    const awarded = TRUST_SCORE_INCREMENT;
    const newTrust = currentTrust + awarded;

    await tx`
        UPDATE app.users
        SET trust_score = ${newTrust},
            is_verified_neighbor = CASE
                WHEN ${newTrust} >= ${TRUST_SCORE_SUCCESS_THRESHOLD} THEN true
                ELSE is_verified_neighbor
            END
        WHERE id = ${helperId}::uuid
    `;

    return { trust_score: newTrust, awarded };
}

export async function confirmPulseInteraction(params: {
    pulseId: string;
    interactionId: string;
    authorId: string;
}): Promise<{
    success: boolean;
    interaction?: PulseInteraction;
    solved?: boolean;
    nonRequestType?: boolean;
}> {
    return await sql.begin(async (tx) => {
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
              AND author_id = ${params.authorId}::uuid
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

        const updatedInteraction = await selectPulseInteraction(interaction.id);
        return updatedInteraction
            ? { success: true, interaction: updatedInteraction }
            : { success: false };
    });
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

export async function selectPulseInteractions(
    pulseId: string,
    userId: string
): Promise<PulseInteraction[]> {
    const [pulse] = (await sql`
        SELECT author_id FROM app.pulses WHERE id = ${pulseId}::uuid
    `) as Array<{ author_id: string }>;

    if (!pulse) return [];

    const rows = (await sql`
        SELECT
            i.id,
            i.pulse_id,
            i.author_id,
            i.helper_id,
            COALESCE(NULLIF(u.display_name, ''), i.helper_id::text) AS helper_name,
            i.status,
            ROUND(EXTRACT(EPOCH FROM i.accepted_at) * 1000)::bigint AS accepted_at,
            ROUND(EXTRACT(EPOCH FROM i.confirmed_at) * 1000)::bigint AS confirmed_at,
            i.trust_awarded
        FROM app.pulse_interactions AS i
        LEFT JOIN app.users AS u ON u.id = i.helper_id
        WHERE i.pulse_id = ${pulseId}::uuid
          AND (i.author_id = ${userId}::uuid OR i.helper_id = ${userId}::uuid)
        ORDER BY i.accepted_at DESC
    `) as PulseInteractionRow[];

    return rows.map((row) => mapPulseInteractionRow(row));
}

export async function selectPulseInteractionsAsAdmin(pulseId: string): Promise<PulseInteraction[]> {
    const rows = (await sql`
        SELECT
            i.id,
            i.pulse_id,
            i.author_id,
            i.helper_id,
            COALESCE(NULLIF(u.display_name, ''), i.helper_id::text) AS helper_name,
            i.status,
            ROUND(EXTRACT(EPOCH FROM i.accepted_at) * 1000)::bigint AS accepted_at,
            ROUND(EXTRACT(EPOCH FROM i.confirmed_at) * 1000)::bigint AS confirmed_at,
            i.trust_awarded
        FROM app.pulse_interactions AS i
        LEFT JOIN app.users AS u ON u.id = i.helper_id
        WHERE i.pulse_id = ${pulseId}::uuid
        ORDER BY i.accepted_at DESC
    `) as PulseInteractionRow[];

    return rows.map((row) => mapPulseInteractionRow(row));
}

export async function submitInteractionFeedback(params: {
    interactionId: string;
    actorId: string;
    positive: boolean;
}): Promise<{
    success: boolean;
    notFound?: boolean;
    forbidden?: boolean;
    positiveRequired?: boolean;
    solved?: boolean;
    nonRequestType?: boolean;
    interaction?: PulseInteraction;
    trustIncremented?: boolean;
    helperSuccessfulCount?: number;
    helperTrustScore?: number;
}> {
    return await sql.begin(async (tx) => {
        const [interaction] = (await tx`
            SELECT id, pulse_id, author_id, helper_id, status
            FROM app.pulse_interactions
            WHERE id = ${params.interactionId}::uuid
            FOR UPDATE
        `) as Array<{
            id: string;
            pulse_id: string;
            author_id: string;
            helper_id: string;
            status: string;
        }>;

        if (!interaction) return { success: false, notFound: true };
        if (interaction.author_id !== params.actorId) return { success: false, forbidden: true };
        if (!params.positive) return { success: false, positiveRequired: true };
        if (interaction.status === 'successful') return { success: false };

        const [pulse] = (await tx`
            SELECT id, is_solved, pulse_type
            FROM app.pulses
            WHERE id = ${interaction.pulse_id}::uuid
            FOR UPDATE
        `) as Array<{ id: string; is_solved: boolean; pulse_type: string }>;

        if (!pulse) return { success: false };
        if (pulse.is_solved) return { success: false, solved: true };
        if (pulse.pulse_type?.toLowerCase() !== 'need')
            return { success: false, nonRequestType: true };

        const trustProgress = await applyTrustProgressionForInteraction(tx, interaction.helper_id);

        await tx`
            UPDATE app.pulse_interactions
            SET status = 'successful',
                confirmed_at = now(),
                trust_awarded = ${trustProgress.awarded}
            WHERE id = ${interaction.id}::uuid
        `;

        const [helperStats] = (await tx`
            SELECT
                (SELECT COUNT(*) FROM app.pulse_interactions WHERE helper_id = ${interaction.helper_id}::uuid AND status = 'successful') AS successful_count,
                trust_score
            FROM app.users
            WHERE id = ${interaction.helper_id}::uuid
        `) as Array<{ successful_count: number; trust_score: number }>;

        const updatedInteraction = await selectPulseInteraction(interaction.id);

        return {
            success: true,
            interaction: updatedInteraction as PulseInteraction,
            trustIncremented: true,
            helperSuccessfulCount: Number(helperStats?.successful_count ?? 0),
            helperTrustScore: Number(helperStats?.trust_score ?? 0),
        };
    });
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
