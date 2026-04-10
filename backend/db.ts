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

export async function selectPulses(limit = 50): Promise<PulseFeedItem[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;

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
    ORDER BY pulses.created_at DESC, pulses.id DESC
    LIMIT ${safeLimit}
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

export async function insertPulse(params: PulseCreateParams): Promise<PulseFeedItem> {
    const lat = params.location.lat;
    const lng = params.location.lng;

    if (lat === null || lat === undefined || lng === null || lng === undefined) {
        throw new Error('Pulse location is required');
    }

    const [insertedPulse] = await sql`
    INSERT INTO app.pulses (author_id, content, location, pulse_type, urgency_level)
    VALUES (${params.authorId}, ${params.content}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${params.type}, ${params.urgencyLevel})
    RETURNING id
    `;

    if (!insertedPulse?.id) {
        throw new Error('Failed to insert pulse');
    }

    const createdPulse = await selectPulseById(insertedPulse.id);
    if (!createdPulse) {
        throw new Error('Inserted pulse could not be loaded');
    }

    return createdPulse;
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
