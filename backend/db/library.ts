import { sql } from './client';
import { mapLibraryItemRow, normalizeResourceText } from './mappers';
import type {
    LibraryItem,
    LibraryItemRow,
    ResourceCatalogEntry,
    LibraryResourceRow,
    UpdateLibraryItemParams,
} from './types';

export async function selectLibraryItems(
    viewerLat: number,
    viewerLng: number,
    radiusMeters: number
): Promise<LibraryItem[]> {
    const rows = (await sql`
        SELECT
            li.id,
            li.author_id,
            COALESCE(u.display_name, li.author_id::text) AS "userName",
            li.item_type,
            li.title,
            li.description,
            li.tags,
            li.is_available,
            ROUND(EXTRACT(EPOCH FROM li.created_at) * 1000)::bigint AS created_at
        FROM app.library_items li
        JOIN app.users u ON u.id = li.author_id
        WHERE ST_DWithin(
            u.location,
            ST_SetSRID(ST_MakePoint(${viewerLng}, ${viewerLat}), 4326)::geography,
            ${radiusMeters}
        )
        ORDER BY li.created_at DESC
    `) as LibraryItemRow[];

    return rows.map(mapLibraryItemRow);
}

export async function selectLibraryItemsByAuthor(authorId: string): Promise<LibraryItem[]> {
    const rows = (await sql`
        SELECT
            li.id,
            li.author_id,
            COALESCE(u.display_name, li.author_id::text) AS "userName",
            li.item_type,
            li.title,
            li.description,
            li.tags,
            li.is_available,
            ROUND(EXTRACT(EPOCH FROM li.created_at) * 1000)::bigint AS created_at
        FROM app.library_items li
        JOIN app.users u ON u.id = li.author_id
        WHERE li.author_id = ${authorId}::uuid
        ORDER BY li.created_at DESC, li.id DESC
    `) as LibraryItemRow[];

    return rows.map(mapLibraryItemRow);
}

export async function selectAdminLibraryItems(limit = 50, offset = 0): Promise<LibraryItem[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;

    const rows = (await sql`
        SELECT
            li.id,
            li.author_id,
            COALESCE(u.display_name, li.author_id::text) AS "userName",
            li.item_type,
            li.title,
            li.description,
            li.tags,
            li.is_available,
            ROUND(EXTRACT(EPOCH FROM li.created_at) * 1000)::bigint AS created_at
        FROM app.library_items li
        JOIN app.users u ON u.id = li.author_id
        ORDER BY li.created_at DESC, li.id DESC
        LIMIT ${safeLimit}
        OFFSET ${safeOffset}
    `) as LibraryItemRow[];

    return rows.map(mapLibraryItemRow);
}

export async function selectResourceCatalog(
    search?: string,
    limit = 120
): Promise<ResourceCatalogEntry[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 300)) : 120;
    const query = search?.trim() ? `%${search.trim().toLowerCase()}%` : null;

    const rows = (await sql`
        SELECT
            li.item_type,
            li.title,
            li.tags
        FROM app.library_items AS li
        WHERE li.is_available = true
          AND (
              ${query}::text IS NULL
              OR LOWER(li.title) LIKE ${query}
              OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(COALESCE(li.tags, '[]'::jsonb)) AS tag
                  WHERE LOWER(tag) LIKE ${query}
              )
          )
        ORDER BY li.created_at DESC, li.id DESC
        LIMIT ${safeLimit}
    `) as LibraryResourceRow[];

    const seen = new Set<string>();
    const resources: ResourceCatalogEntry[] = [];

    const pushValue = (value: string, type: 'item' | 'skill') => {
        const trimmed = value.trim();
        if (!trimmed) {
            return;
        }

        const normalized = normalizeResourceText(trimmed);
        if (!normalized) {
            return;
        }

        const key = `${type}:${normalized}`;
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        resources.push({ value: trimmed, type });
    };

    for (const row of rows) {
        const type: 'item' | 'skill' = row.item_type === 'skill' ? 'skill' : 'item';
        pushValue(row.title, type);

        for (const tag of row.tags ?? []) {
            pushValue(tag, type);
        }
    }

    return resources.slice(0, safeLimit);
}

export async function insertLibraryItem(params: {
    authorId: string;
    type: 'item' | 'skill';
    title: string;
    description: string;
    tags: string[];
}): Promise<LibraryItem> {
    const [row] = (await sql`
        INSERT INTO app.library_items (author_id, item_type, title, description, tags)
        VALUES (${params.authorId}, ${params.type}, ${params.title}, ${params.description}, ${JSON.stringify(params.tags)}::jsonb)
        RETURNING id
    `) as { id: string }[];

    if (!row) {
        throw new Error('Failed to insert library item.');
    }

    // Fetch full item with userName
    const [fullRow] = (await sql`
        SELECT
            li.id,
            li.author_id,
            COALESCE(u.display_name, li.author_id::text) AS "userName",
            li.item_type,
            li.title,
            li.description,
            li.tags,
            li.is_available,
            ROUND(EXTRACT(EPOCH FROM li.created_at) * 1000)::bigint AS created_at
        FROM app.library_items li
        JOIN app.users u ON u.id = li.author_id
        WHERE li.id = ${row.id}
    `) as LibraryItemRow[];

    return mapLibraryItemRow(fullRow!);
}

export async function updateLibraryItemAvailability(
    itemId: string,
    authorId: string,
    available: boolean
): Promise<boolean> {
    const [updated] = await sql`
        UPDATE app.library_items
        SET is_available = ${available}
        WHERE id = ${itemId} AND (
            author_id = ${authorId}
            OR EXISTS (
                SELECT 1
                FROM app.users
                WHERE id = ${authorId}
                  AND role IN ('admin', 'mod')
            )
        )
        RETURNING id
    `;

    return Boolean(updated);
}

export async function updateLibraryItem(
    itemId: string,
    requesterId: string,
    params: UpdateLibraryItemParams
): Promise<boolean> {
    const title = params.title ?? null;
    const description = params.description ?? null;
    const tagsJson = params.tags !== undefined ? JSON.stringify(params.tags) : null;
    const isAvailable = params.isAvailable ?? null;

    const titleProvided = params.title !== undefined;
    const descriptionProvided = params.description !== undefined;
    const tagsProvided = params.tags !== undefined;
    const availableProvided = params.isAvailable !== undefined;

    const [updated] = await sql`
        UPDATE app.library_items
        SET
            title = CASE WHEN ${titleProvided} THEN ${title} ELSE title END,
            description = CASE WHEN ${descriptionProvided} THEN ${description} ELSE description END,
            tags = CASE WHEN ${tagsProvided} THEN ${tagsJson}::jsonb ELSE tags END,
            is_available = CASE WHEN ${availableProvided} THEN ${isAvailable} ELSE is_available END
        WHERE id = ${itemId} AND (
            author_id = ${requesterId}
            OR EXISTS (
                SELECT 1
                FROM app.users
                WHERE id = ${requesterId}
                  AND role IN ('admin', 'mod')
            )
        )
        RETURNING id
    `;

    return Boolean(updated);
}

export async function deleteLibraryItem(itemId: string, authorId: string): Promise<boolean> {
    const [deleted] = await sql`
        DELETE FROM app.library_items
        WHERE id = ${itemId} AND (
            author_id = ${authorId}
            OR EXISTS (
                SELECT 1
                FROM app.users
                WHERE id = ${authorId}
                  AND role IN ('admin', 'mod')
            )
        )
        RETURNING id
    `;

    return Boolean(deleted);
}
