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
    created_at?: Date;
}

interface UserSearchParams {
    id: string | null;
    min_trust: string | null;
    max_trust: string | null;
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
    const [rawUser] = await sql`
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
    `;

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
    const availableDaysQuery = userSearch.availableDays as any;
    const results = await sql`
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
        AND (${userSearch.email}::text IS NULL OR email ILIKE ${'%' + userSearch.email + '%'})
        AND ((${userSearch.displayName}::text IS NULL OR display_name ILIKE ${'%' + userSearch.displayName + '%'})
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
        AND (${userSearch.bio}::text IS NULL OR bio ILIKE ${'%' + userSearch.bio + '%'})
        AND (${userSearch.created_before}::timestamptz IS NULL OR created_at <= ${userSearch.created_before}::timestamptz)
        AND (${userSearch.created_after}::timestamptz IS NULL OR created_at >= ${userSearch.created_after}::timestamptz)
        ) OR id = ${userSearch.id})
    LIMIT ${SEARCH_LIMIT}
    `;

    return results.map((rawUser: any) => {

        return {
            id: rawUser.id,
            email: rawUser.email,
            role: rawUser.role,
            trustScore: rawUser.trust_score,
            created_at: rawUser.created_at,
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

    const shouldClearQuietHours = user.quietHours === null;
    const shouldClearQuietDays = user.quietDays === null;



    try {
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
      END

      WHERE id = ${user.id}
    `;
    } catch (err) {
        throw err;
    }
}
