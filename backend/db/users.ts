import { sql } from './client';
import { SEARCH_LIMIT } from './constants';
import { ensureSchema } from './schema';
import type { ScheduledUserDeletion, User, UserRow, UserSearchParams } from './types';

export async function insertUser(
    email: string,
    hashedPass: string,
    displayname: string,
    verificationToken: string
) {
    return await sql`
    INSERT INTO app.users (email, display_name, password_hash, verification_token, location)
    VALUES (
        ${email},
        ${displayname},
        ${hashedPass},
        ${verificationToken},
        ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography
    )
    RETURNING id, email, display_name AS "displayName", role, trust_score AS "trustScore"
    `;
}

export async function selectUserEmailById(id: string): Promise<string | null> {
    const [row] = (await sql`
    SELECT email FROM app.users WHERE id = ${id}
    `) as Array<{ email: string }>;
    return row?.email ?? null;
}

export async function selectUserSummary(
    id: string
): Promise<{ id: string; displayName: string | null } | null> {
    const [row] = (await sql`
        SELECT id::text AS id, NULLIF(display_name, '') AS "displayName"
        FROM app.users
        WHERE id = ${id}
        LIMIT 1
    `) as Array<{ id: string; displayName: string | null }>;

    return row ?? null;
}

export async function selectUserRole(id: string): Promise<string | null> {
    const [row] = (await sql`
    SELECT role FROM app.users WHERE id = ${id}
    `) as Array<{ role: string }>;
    return row?.role ?? null;
}

export async function selectUserProfilePicture(userId: string): Promise<{
    filename: string;
    mimeType: string;
    sizeBytes: number;
} | null> {
    await ensureSchema();

    const [row] = (await sql`
        SELECT
            profile_picture_filename,
            profile_picture_mime_type,
            profile_picture_size_bytes
        FROM app.users
        WHERE id = ${userId}
        LIMIT 1
    `) as Array<{
        profile_picture_filename: string | null;
        profile_picture_mime_type: string | null;
        profile_picture_size_bytes: number | null;
    }>;

    if (!row?.profile_picture_filename || !row.profile_picture_mime_type) {
        return null;
    }

    return {
        filename: row.profile_picture_filename,
        mimeType: row.profile_picture_mime_type,
        sizeBytes: row.profile_picture_size_bytes ?? 0,
    };
}

export async function setUserProfilePicture(
    userId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number
): Promise<boolean> {
    await ensureSchema();

    const [row] = await sql`
        UPDATE app.users
        SET profile_picture_filename = ${filename},
            profile_picture_mime_type = ${mimeType},
            profile_picture_size_bytes = ${sizeBytes},
            profile_picture_updated_at = now()
        WHERE id = ${userId}
        RETURNING id
    `;

    return Boolean(row);
}

export async function clearUserProfilePicture(userId: string): Promise<boolean> {
    await ensureSchema();

    const [row] = await sql`
        UPDATE app.users
        SET profile_picture_filename = NULL,
            profile_picture_mime_type = NULL,
            profile_picture_size_bytes = NULL,
            profile_picture_updated_at = NULL
        WHERE id = ${userId}
        RETURNING id
    `;

    return Boolean(row);
}

export async function selectUserById(id: string): Promise<User | null> {
    const [row] = (await sql`
    SELECT
        id,
        email,
        role,
        is_email_verified,
        verification_token,
        password_reset_token,
        password_reset_expires,
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
        COALESCE(NULLIF(timezone, ''), 'UTC') AS timezone,
        bio,
        profile_picture_filename,
        profile_picture_mime_type,
        profile_picture_size_bytes,
        profile_picture_updated_at,
        deletion_requested_at
    FROM app.users
    WHERE id = ${id}
    LIMIT 1
    `) as UserRow[];

    if (!row) return null;

    return {
        id: row.id,
        email: row.email,
        role: row.role,
        trustScore: row.trust_score ? Number(row.trust_score) : 0,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        displayName: row.display_name,
        verified: row.is_verified_neighbor ?? false,
        radius: row.distance_limit_meters ? Number(row.distance_limit_meters) : null,
        location:
            row.lat !== null && row.lng !== null
                ? { lat: Number(row.lat), lng: Number(row.lng) }
                : null,
        quietHours: row.quiet_hours,
        quietDays: row.quiet_days ? row.quiet_days.map(Number) : [],
        timezone: row.timezone ?? 'UTC',
        bio: row.bio,
        profilePictureFilename: row.profile_picture_filename,
        profilePictureMimeType: row.profile_picture_mime_type,
        profilePictureSizeBytes: row.profile_picture_size_bytes,
        profilePictureUpdatedAt: row.profile_picture_updated_at
            ? new Date(row.profile_picture_updated_at)
            : null,
        deletionRequestedAt: row.deletion_requested_at ? Number(row.deletion_requested_at) : null,
    };
}

export async function searchUsers(
    search: UserSearchParams,
    limit = SEARCH_LIMIT,
    offset = 0
): Promise<User[]> {
    const safeLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(Math.floor(limit), 100))
        : SEARCH_LIMIT;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const skillsAndResources = search.skillsAndResources ?? [];
    const availableDaysQuery = (search.availableDays ?? []).map((day) => Number(day));

    const rows = (await sql`
    SELECT
        u.id,
        u.email,
        u.role,
        u.created_at,
        u.trust_score,
        u.display_name,
        u.is_verified_neighbor,
        u.distance_limit_meters,
        ST_Y(u.location::geometry) AS lat,
        ST_X(u.location::geometry) AS lng,
        COALESCE((SELECT jsonb_agg(
            jsonb_build_object(
                'start', lower(rng)::text,
                'end', upper(rng)::text
            )
        ) FROM unnest(u.quiet_hours) AS rng), '[]'::jsonb) AS quiet_hours,
        COALESCE((SELECT jsonb_agg(day::text) FROM unnest(u.quiet_days) AS day), '[]'::jsonb) AS quiet_days,
        COALESCE(NULLIF(u.timezone, ''), 'UTC') AS timezone,
        u.bio,
        u.profile_picture_filename,
        u.profile_picture_mime_type,
        u.profile_picture_size_bytes,
        u.profile_picture_updated_at,
        u.deletion_requested_at
    FROM app.users AS u
    WHERE (
        (${search.id}::uuid IS NULL OR u.id = ${search.id}::uuid)
        AND (${search.email}::text IS NULL OR u.email ILIKE ${search.email ? `%${search.email}%` : null})
        AND (${search.displayName}::text IS NULL OR u.display_name ILIKE ${search.displayName ? `%${search.displayName}%` : null})
        AND (${search.min_trust}::numeric IS NULL OR u.trust_score >= ${search.min_trust})
        AND (${search.max_trust}::numeric IS NULL OR u.trust_score <= ${search.max_trust})
        AND (${search.role}::text IS NULL OR u.role = ${search.role})
        AND (${search.verified}::boolean IS NULL OR u.is_verified_neighbor = ${search.verified})
        AND (
            ${search.radius}::numeric IS NULL
            OR ${search.location?.lat ?? null}::double precision IS NULL
            OR ${search.location?.lng ?? null}::double precision IS NULL
            OR ST_DWithin(
                u.location,
                ST_SetSRID(ST_MakePoint(${search.location?.lng ?? null}, ${search.location?.lat ?? null}), 4326)::geography,
                ${search.radius}
            )
        )
        AND (
            ${search.availableDays}::jsonb IS NULL
            OR (u.quiet_days != '{}'::integer[] AND NOT (
                u.quiet_days && app.jsonb_to_integer_array(${JSON.stringify(availableDaysQuery)}::jsonb)
            ))
        )
        AND (
            ${search.availableHours}::jsonb IS NULL
            OR ( u.quiet_hours != '{}'::app.timemultirange AND NOT (u.quiet_hours && app.text_array_to_timemultirange(${search.availableHours ? JSON.stringify(search.availableHours) : null}::jsonb)))
        )
        AND (
            ${skillsAndResources.length === 0}::boolean
            OR EXISTS (
                SELECT 1
                FROM app.library_items AS li
                WHERE li.author_id = u.id
                  AND li.is_available = true
                  AND (
                      ${search.anySkillRes === 'true'}::boolean
                      OR LOWER(li.title) = ANY(string_to_array(LOWER(${skillsAndResources.join(',')}), ','))
                      OR EXISTS (
                          SELECT 1
                          FROM jsonb_array_elements_text(COALESCE(li.tags, '[]'::jsonb)) AS tag
                          WHERE LOWER(tag) = ANY(string_to_array(LOWER(${skillsAndResources.join(',')}), ','))
                      )
                  )
            )
        )
        AND (${search.bio}::text IS NULL OR u.bio ILIKE ${search.bio ? `%${search.bio}%` : null})
        AND (${search.created_before}::timestamptz IS NULL OR u.created_at <= ${search.created_before})
        AND (${search.created_after}::timestamptz IS NULL OR u.created_at >= ${search.created_after})
    )
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT ${safeLimit}
    OFFSET ${safeOffset}
    `) as UserRow[];

    return rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        trustScore: row.trust_score ? Number(row.trust_score) : 0,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        displayName: row.display_name,
        verified: row.is_verified_neighbor ?? false,
        radius: row.distance_limit_meters ? Number(row.distance_limit_meters) : null,
        location:
            row.lat !== null && row.lng !== null
                ? { lat: Number(row.lat), lng: Number(row.lng) }
                : null,
        quietHours: row.quiet_hours,
        quietDays: row.quiet_days ? row.quiet_days.map(Number) : [],
        timezone: row.timezone ?? 'UTC',
        bio: row.bio,
        profilePictureFilename: row.profile_picture_filename,
        profilePictureMimeType: row.profile_picture_mime_type,
        profilePictureSizeBytes: row.profile_picture_size_bytes,
        profilePictureUpdatedAt: row.profile_picture_updated_at
            ? new Date(row.profile_picture_updated_at)
            : null,
        deletionRequestedAt: row.deletion_requested_at ? Number(row.deletion_requested_at) : null,
    }));
}

export async function selectUserAuth(email: string): Promise<
    Array<{
        id: string;
        email: string;
        password_hash: string;
        role: string;
        is_email_verified: boolean;
    }>
> {
    return (await sql`
        SELECT id, email, password_hash, role, is_email_verified
        FROM app.users
        WHERE email = ${email}
        LIMIT 1
    `) as Array<{
        id: string;
        email: string;
        password_hash: string;
        role: string;
        is_email_verified: boolean;
    }>;
}

export async function selectUserVerificationStateById(
    id: string
): Promise<{ email: string; is_email_verified: boolean } | null> {
    const [user] = (await sql`
        SELECT email,
               is_email_verified
        FROM app.users
        WHERE id = ${id}
        LIMIT 1
    `) as Array<{ email: string; is_email_verified: boolean }>;

    return user ?? null;
}

export async function updateUserVerificationToken(
    id: string,
    verificationToken: string
): Promise<boolean> {
    const [updatedUser] = await sql`
        UPDATE app.users
        SET verification_token = ${verificationToken}
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updatedUser);
}

export async function updateUserEmailWithVerificationToken(
    id: string,
    email: string,
    verificationToken: string
): Promise<boolean> {
    const [updatedUser] = await sql`
        UPDATE app.users
        SET email = ${email},
            is_email_verified = false,
            verification_token = ${verificationToken}
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updatedUser);
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
    const quietHoursProvided = user.quietHours !== undefined;
    const quietDaysProvided = user.quietDays !== undefined;
    const timezoneProvided = user.timezone !== undefined;

    const quietHoursJson = JSON.stringify(user.quietHours ?? null);
    const quietDaysJson = JSON.stringify(user.quietDays ?? null);
    const timezone = user.timezone?.trim() || null;

    const shouldClearQuietHours = user.quietHours === null;
    const shouldClearQuietDays = user.quietDays === null;
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
                WHEN ${quietHoursProvided} THEN app.text_array_to_timemultirange(${quietHoursJson}::jsonb)
        ELSE quiet_hours 
      END,

      quiet_days = CASE 
        WHEN ${shouldClearQuietDays} THEN '{}'::integer[]
        WHEN ${quietDaysProvided} THEN app.jsonb_to_integer_array(${quietDaysJson}::jsonb)
        ELSE quiet_days 
                        END,

            timezone = CASE
                WHEN ${timezoneProvided} THEN COALESCE(${timezone}, timezone)
                ELSE timezone
            END

      WHERE id = ${user.id}
    `;
}

export async function deleteUser(id: string) {
    const [deleted] = await sql`
        DELETE FROM app.users 
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(deleted);
}

export async function deleteUsers(deleterID: string, userSearch: UserSearchParams) {
    const availableDaysQuery = (userSearch.availableDays ?? []).map((day) => Number(day));
    await sql`
    DELETE
    FROM app.users 
    WHERE id != ${deleterID} AND (
        (
        (${userSearch.id}::text IS NULL)
        AND (${userSearch.email}::text IS NULL OR email ILIKE ${userSearch.email ? `%${userSearch.email}%` : null})
        AND ((${userSearch.displayName}::text IS NULL OR display_name ILIKE ${userSearch.displayName ? `%${userSearch.displayName}%` : null})
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
                quiet_days && app.jsonb_to_integer_array(${JSON.stringify(availableDaysQuery)}::jsonb)
            ))
        )
        AND (
            ${userSearch.availableHours}::jsonb IS NULL
            OR ( quiet_hours != '{}'::app.timemultirange AND NOT (quiet_hours && app.text_array_to_timemultirange(${userSearch.availableHours ? JSON.stringify(userSearch.availableHours) : null}::jsonb)))
        )
        AND (${userSearch.bio}::text IS NULL OR bio ILIKE ${userSearch.bio ? `%${userSearch.bio}%` : null})
        AND (${userSearch.created_before}::timestamptz IS NULL OR created_at <= ${userSearch.created_before}::timestamptz)
        AND (${userSearch.created_after}::timestamptz IS NULL OR created_at >= ${userSearch.created_after}::timestamptz)
        ) OR id = ${userSearch.id}))
    `;
}

export async function requestUserDeletion(id: string): Promise<boolean> {
    await ensureSchema();

    const [updated] = await sql`
        UPDATE app.users
        SET deletion_requested_at = COALESCE(deletion_requested_at, now())
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updated);
}

export async function cancelUserDeletion(id: string): Promise<boolean> {
    await ensureSchema();

    const [updated] = await sql`
        UPDATE app.users
        SET deletion_requested_at = NULL
        WHERE id = ${id} AND deletion_requested_at IS NOT NULL
        RETURNING id
    `;

    return Boolean(updated);
}

export async function selectPendingUserDeletions(
    limit = 100,
    offset = 0
): Promise<ScheduledUserDeletion[]> {
    await ensureSchema();

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 100;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const rows = (await sql`
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
            COALESCE(NULLIF(timezone, ''), 'UTC') AS timezone,
            bio,
            profile_picture_filename,
            profile_picture_mime_type,
            profile_picture_size_bytes,
            profile_picture_updated_at,
            deletion_requested_at
        FROM app.users
        WHERE deletion_requested_at IS NOT NULL
        ORDER BY deletion_requested_at ASC, created_at ASC, id ASC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as UserRow[];

    return rows.map((rawUser) => {
        const requestedAt = Number(rawUser.deletion_requested_at ?? Date.now());

        return {
            user: {
                id: rawUser.id,
                email: rawUser.email,
                role: rawUser.role,
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
                timezone: rawUser.timezone ?? 'UTC',
                bio: rawUser.bio,
                profilePictureFilename: rawUser.profile_picture_filename,
                profilePictureMimeType: rawUser.profile_picture_mime_type,
                profilePictureSizeBytes: rawUser.profile_picture_size_bytes,
                profilePictureUpdatedAt: rawUser.profile_picture_updated_at
                    ? new Date(rawUser.profile_picture_updated_at)
                    : null,
                deletionRequestedAt: requestedAt,
            } as User,
            requestedAt,
            purgeAt: requestedAt + 7 * 24 * 60 * 60 * 1000,
        };
    });
}

export async function purgeExpiredUserDeletions(now = Date.now()): Promise<number> {
    await ensureSchema();

    const cutoffIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
        const deleted = await sql`
            DELETE FROM app.users
            WHERE deletion_requested_at IS NOT NULL
              AND deletion_requested_at <= ${cutoffIso}::timestamptz
            RETURNING id
        `;

        return deleted.length;
    } catch (error) {
        const errorCode =
            typeof error === 'object' && error !== null && 'code' in error
                ? String((error as { code?: unknown }).code)
                : null;

        if (errorCode !== '42703') {
            throw error;
        }

        await sql`
            ALTER TABLE app.users
            ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz
        `;
        await sql`
            CREATE INDEX IF NOT EXISTS users_deletion_requested_at_idx
            ON app.users (deletion_requested_at)
        `;

        const deleted = await sql`
            DELETE FROM app.users
            WHERE deletion_requested_at IS NOT NULL
              AND deletion_requested_at <= ${cutoffIso}::timestamptz
            RETURNING id
        `;

        return deleted.length;
    }
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

export async function storePasswordResetToken(
    id: string,
    token: string,
    expiresAt: Date
): Promise<boolean> {
    const expiresAtIso = expiresAt.toISOString();

    const [updated] = await sql`
        UPDATE app.users
        SET password_reset_token = ${token},
            password_reset_expires = ${expiresAtIso}
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(updated);
}

export async function clearPasswordResetToken(id: string): Promise<void> {
    await sql`
        UPDATE app.users
        SET password_reset_token = NULL,
            password_reset_expires = NULL
        WHERE id = ${id}
    `;
}

export async function clearPasswordResetTokenByToken(token: string): Promise<void> {
    await sql`
        UPDATE app.users
        SET password_reset_token = NULL,
            password_reset_expires = NULL
        WHERE password_reset_token = ${token}
    `;
}

export async function selectPasswordResetRecord(token: string): Promise<{
    id: string;
    email: string;
    password_reset_expires: Date | string | number | null;
} | null> {
    const [row] = (await sql`
        SELECT id::text AS id,
               email,
               password_reset_expires
        FROM app.users
        WHERE password_reset_token = ${token}
        LIMIT 1
    `) as Array<{
        id: string;
        email: string;
        password_reset_expires: Date | string | number | null;
    }>;

    return row ?? null;
}

export async function consumePasswordResetToken(
    token: string,
    hashedPassword: string,
    now: Date
): Promise<boolean> {
    const nowIso = now.toISOString();

    const [updated] = await sql`
        UPDATE app.users
        SET password_hash = ${hashedPassword},
            password_reset_token = NULL,
            password_reset_expires = NULL
        WHERE password_reset_token = ${token}
          AND password_reset_expires IS NOT NULL
          AND password_reset_expires > ${nowIso}
        RETURNING id
    `;

    return Boolean(updated);
}

export async function selectFullUser(id: string): Promise<User | null> {
    await ensureSchema();

    const [rawUser] = (await sql`
    SELECT 
      id,
      email,
    is_email_verified,
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
      COALESCE(to_jsonb(quiet_days), '[]'::jsonb) AS quiet_days,
    COALESCE(NULLIF(timezone, ''), 'UTC') AS timezone,
      deletion_requested_at,
            bio,
            profile_picture_filename,
            profile_picture_mime_type,
            profile_picture_size_bytes,
            profile_picture_updated_at
    FROM app.users 
    WHERE 
        id = ${id}
    `) as UserRow[];

    if (!rawUser) {
        return null;
    }

    return {
        id: rawUser.id,
        email: rawUser.email,
        role: rawUser.role,
        isEmailVerified: Boolean(rawUser.is_email_verified),
        displayName: rawUser.display_name,
        verified: rawUser.is_verified_neighbor,
        radius: rawUser.distance_limit_meters,
        location:
            rawUser.lat !== null && rawUser.lng !== null
                ? { lat: rawUser.lat, lng: rawUser.lng }
                : null,
        quietHours: rawUser.quiet_hours ? rawUser.quiet_hours : [],
        quietDays: rawUser.quiet_days,
        timezone: rawUser.timezone ?? 'UTC',
        bio: rawUser.bio,
        profilePictureFilename: rawUser.profile_picture_filename,
        profilePictureMimeType: rawUser.profile_picture_mime_type,
        profilePictureSizeBytes: rawUser.profile_picture_size_bytes,
        profilePictureUpdatedAt: rawUser.profile_picture_updated_at
            ? new Date(rawUser.profile_picture_updated_at)
            : null,
        deletionRequestedAt: rawUser.deletion_requested_at
            ? Number(rawUser.deletion_requested_at)
            : null,
    } as User;
}

export async function verifyUserEmailByToken(token: string): Promise<boolean> {
    const [updated] = await sql`
        UPDATE app.users
        SET is_email_verified = true,
            verification_token = NULL
        WHERE verification_token = ${token}
        RETURNING id
    `;

    return Boolean(updated);
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
