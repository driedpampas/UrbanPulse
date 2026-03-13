import { sql } from 'bun';

const SEARCH_LIMIT = 50;

interface Location {
    lat: number | null;
    lng: number | null;
}

interface Timerange {
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
    bio?: string | null;
    verified?: boolean;
}

interface UserSearchParams {
    displayName: string | null;
    role: string | null;
    radius: number | null;
    location: Location | null;
    availableHours: Timerange[] | null;
    availableDays: number[] | null;
    bio: string | null;
    verified: boolean | null;
}

interface UserRow {
    id: string;
    email?: string | null;
    role?: string;
    display_name?: string | null;
    distance_limit_meters?: number | null;
    location?: [number, number] | null;
    quiet_hours?: Timerange[] | null;
    quiet_days?: number[] | null;
    bio?: string | null;
}

function toLocation(coords: [number, number] | null | undefined): Location | null {
    if (!Array.isArray(coords) || coords.length < 2) {
        return null;
    }

    return {
        lng: coords[0],
        lat: coords[1],
    };
}

function mapUserRow(rawUser: UserRow): User {
    return {
        id: rawUser.id,
        email: rawUser.email,
        role: rawUser.role,
        displayName: rawUser.display_name,
        radius: rawUser.distance_limit_meters,
        location: toLocation(rawUser.location),
        quietHours: rawUser.quiet_hours,
        quietDays: rawUser.quiet_days,
        bio: rawUser.bio,
    };
}

export async function insertUser(email: string, hashedPass: string, displayname: string) {
    return await sql`
    INSERT INTO users (email, display_name, password_hash)
    VALUES (${email}, ${displayname}, ${hashedPass})
    RETURNING id, role
    `;
}

export async function selectId(email: string) {
    return await sql`
    SELECT id FROM users WHERE email = ${email}
    `;
}

export async function selectPasswordHash(id: string) {
    return await sql`
    SELECT password_hash FROM users WHERE id = ${id}
    `;
}

export async function selectFullUser(id: string): Promise<User | null> {
    const [rawUser] = (await sql`
SELECT id,
       email,
       ROLE,
       display_name,
       distance_limit_meters,
       (ST_AsGeoJSON(LOCATION)::JSON->'coordinates') AS LOCATION,

    (SELECT COALESCE(jsonb_agg(jsonb_build_object('start', lower(rng)::text, 'end', upper(rng)::text)), '[]'::JSONB)
     FROM unnest(quiet_hours) AS rng) AS quiet_hours,
             COALESCE(to_jsonb(quiet_days), '[]'::JSONB) AS quiet_days,
       bio
FROM users
WHERE id = ${id}
        `) as UserRow[];

    if (!rawUser) {
        return null;
    }

    return mapUserRow(rawUser);
}

export async function searchUsers(userSearch: UserSearchParams): Promise<User[]> {
    const displayNameFilter = userSearch.displayName ? `%${userSearch.displayName}%` : null;
    const bioFilter = userSearch.bio ? `%${userSearch.bio}%` : null;

    const results = (await sql`

SELECT id,
       ROLE,
       display_name,
       distance_limit_meters,
       (ST_AsGeoJSON(LOCATION)::JSON->'coordinates') AS LOCATION,

    (SELECT COALESCE(jsonb_agg(jsonb_build_object('start', lower(rng)::text, 'end', upper(rng)::text)), '[]'::JSONB)
     FROM unnest(quiet_hours) AS rng) AS quiet_hours,
             COALESCE(to_jsonb(quiet_days), '[]'::JSONB) AS quiet_days,
       bio
FROM users
WHERE (${userSearch.displayName}::text IS NULL
       OR display_name ILIKE ${displayNameFilter})
    AND (${userSearch.role}::text IS NULL
         OR ROLE = ${userSearch.role})
    AND (${userSearch.verified}::boolean IS NULL
         OR is_verified_neighbor = ${userSearch.verified})
    AND (${userSearch.location} IS NULL
            OR ST_DWithin(LOCATION, ST_SetSRID(ST_MakePoint(${userSearch.location?.lng ?? null}, ${userSearch.location?.lat ?? null}), 4326)::geography, ${userSearch.radius}))
    AND (${userSearch.availableDays} IS NULL
         OR NOT quiet_days && ${userSearch.availableDays}::int[])
    AND (${userSearch.bio}::text IS NULL
         OR bio ILIKE ${bioFilter})
LIMIT ${SEARCH_LIMIT}
        `) as UserRow[];

    return results.map((rawUser) => mapUserRow(rawUser));
}

export async function selectUserAuth(email: string) {
    return await sql`
    SELECT id, password_hash, role FROM users WHERE email = ${email}
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
    const quietHours = user.quietHours ? JSON.stringify(user.quietHours) : null;
    const quietDays = user.quietDays ?? null;

    const shouldClearQuietHours = user.quietHours === null;
    const shouldClearQuietDays = user.quietDays === null;

    await sql`

UPDATE app.users
SET display_name = COALESCE(${displayName}, display_name),
    bio = COALESCE(${bio}, bio),
    distance_limit_meters = COALESCE(${radius}, distance_limit_meters),
    LOCATION = CASE
                   WHEN ${lat}::numeric IS NOT NULL
                        AND ${lng}::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                   ELSE LOCATION
               END,
               quiet_hours = CASE
                                 WHEN ${shouldClearQuietHours} THEN '{}'::timemultirange
                                 WHEN ${quietHours}::JSONB IS NOT NULL THEN jsonb_to_timemultirange(${quietHours}::JSONB)
                                 ELSE quiet_hours
                             END,
                             quiet_days = CASE
                                              WHEN ${shouldClearQuietDays} THEN '{}'::integer[]
                                              WHEN ${quietDays}::text IS NOT NULL THEN ${quietDays}::integer[]
                                              ELSE quiet_days
                                          END
WHERE id = ${user.id}
    `;
}
