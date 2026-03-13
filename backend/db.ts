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
    const [rawUser] = await sql`
    SELECT 
      id,
      email,
      role,
      display_name,
      distance_limit_meters,
      (ST_AsGeoJSON(location)::json->'coordinates') AS location, 
      SELECT jsonb_agg(sonb_build_object('start', lower(rng)::text, 'end', upper(rng)::text)) FROM unnest(quiet_hours) AS rng, 
      quiet_days, 
      bio 
    FROM users 
    WHERE 
        id = ${id}
    `;

    return {
        id: rawUser.id,
        email: rawUser.email,
        role: rawUser.role,
        displayName: rawUser.display_name,
        radius: rawUser.distance_limit_meters,
        location: rawUser.coordinates,
        quietHours: rawUser.quiet_hours,
        quietDays: rawUser.quiet_days,
        bio: rawUser.bio,
    } as User;
}

export async function searchUsers(userSearch: UserSearchParams): Promise<User[]> {
    const results = await sql`
    SELECT 
      id,
      role,
      display_name,
      distance_limit_meters,
      (ST_AsGeoJSON(location)::json->'coordinates') AS location, 
      SELECT jsonb_agg(
                jsonb_build_object(
                    'start', lower(rng)::text,
                    'end', upper(rng)::text
                )
            )
            FROM unnest(quiet_hours) AS rng,
      AS quiet_hours, 
      quiet_days, 
      bio 
    FROM users 
    WHERE 
      (${userSearch.displayName}::text IS NULL OR display_name ILIKE ${'%' + userSearch.displayName + '%'})
      AND (${userSearch.role}::text IS NULL OR role = ${userSearch.role})
      AND (${userSearch.verified}::boolean IS NULL OR is_verified_neighbor = ${userSearch.verified})
      AND (${userSearch.location} IS NULL OR ST_DWithin(
        location,
        ST_SetSRID(ST_MakePoint(${userSearch.location?.lng ?? null}, ${userSearch.location?.lat ?? null}), 4326)::geography,
        ${userSearch.radius}
      ))
      AND (${userSearch.availableDays} IS NULL OR NOT quiet_days && ${userSearch.availableDays}::int[])
      AND (${userSearch.bio}::text IS NULL OR bio ILIKE ${'%' + userSearch.bio + '%'})
    LIMIT ${SEARCH_LIMIT}
    `;

    return results.map((rawUser: any) => {

        return {
            id: rawUser.id,
            role: rawUser.role,
            displayName: rawUser.display_name,
            radius: rawUser.distance_limit_meters,
            location: rawUser.coordinates,
            quietHours: rawUser.quiet_hours,
            quietDays: rawUser.quiet_days,
            bio: rawUser.bio,
        } as User;
    });
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
        WHEN ${shouldClearQuietHours} THEN '{}'::timemultirange 
        WHEN ${quietHours}::jsondb IS NOT NULL THEN jsondb_to_timemultirange(${quietHours}::jsonb)
        ELSE quiet_hours 
      END,

      quiet_days = CASE 
        WHEN ${shouldClearQuietDays} THEN '{}'::integer[] 
        WHEN ${quietDays}::text IS NOT NULL THEN ${quietDays}::integer[] 
        ELSE quiet_days 
      END

      WHERE id = ${user.id}
    `;
    } catch (err) {
        throw err;
    }
}
