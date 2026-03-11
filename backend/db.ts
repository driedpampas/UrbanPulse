import { sql } from 'bun';

interface User {
    id: string;
    email?: string | null;
    role?: string;
    passwordHash?: string | null;
    displayName?: string | null;
    radius?: number | null;
    location?: { lat: number; lng: number } | null;
    quietHours?: { start: string; end: string } | null;
    quietDays?: number[] | null;
    bio?: string | null;
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

    const shouldClearQuietHours = user.quietHours === null;
    const shouldClearQuietDays = user.quietDays === null;

    let quietHours = null;
    if (user.quietHours) {
        const { start, end } = user.quietHours;
        quietHours =
            start < end ? `{ "[${start},${end})" }` : `{ "[${start},24:00)", "[00:00,${end})" }`;
    }

    let quietDays = null;
    if (user.quietDays && user.quietDays.length > 0) {
        quietDays = `{${user.quietDays.join(',')}}`;
    }

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
        WHEN ${shouldClearQuietHours} THEN '{}'::app.timerange[] 
        WHEN ${quietHours}::text IS NOT NULL THEN ${quietHours}::app.timerange[]
        ELSE quiet_hours 
      END,

      quiet_days = CASE 
        WHEN ${shouldClearQuietDays} THEN '{}'::int[] 
        WHEN ${quietDays}::text IS NOT NULL THEN ${quietDays}::int[] 
        ELSE quiet_days 
      END

      WHERE id = ${user.id}
    `;
    } catch (err) {
        throw err;
    }
}
