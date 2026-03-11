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

export async function selectFullUser(id: string): Promise<User | null> {
    const [rawUser] = await sql`
    SELECT id, role, display_name, distance_limit_meters, (ST_AsGeoJSON(location)::json->'coordinates') AS location, quiet_hours, quiet_days, bio FROM users WHERE id = ${id}
    `;
    if (!rawUser) return null;

    const qh = rawUser.quiet_hours
        .replace('[', '(')
        .replace(']', ')')
        .replace('{', '[')
        .replace('}', ']');

    const strs = JSON.parse(qh);

    let quietHours = null;

    if (strs.length == 1) {
        const sl = strs[0].split(',');
        quietHours = { start: sl[0].substring(0, 8), end: sl[1].substring(0, 8) };
    } else if (strs.length == 2) {
        const s1 = strs[0].split(',');
        const s2 = strs[1].split(',');

        quietHours = { start: s1[0].substring(1, 9), end: s2[1].substring(0, 8) };
    }

    var user: User = {
        id: rawUser.id,
        role: rawUser.role,
        displayName: rawUser.display_name,
        radius: rawUser.distance_limit_meters,
        location: { lat: rawUser.location[0], lng: rawUser.location[1] },
        quietHours: quietHours,
        quietDays: rawUser.quiet_days,
        bio: rawUser.bio,
    };

    return user;
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
