import { sql } from './client';
import { ensureSchema } from './schema';
import type { LostDocument, LostDocumentRow, LostDocumentStatus } from './types';

export async function insertLostDocument(params: {
    userId: string;
    title: string;
    description: string;
    lat: number;
    lng: number;
    imagePath: string;
    redactedImagePath: string;
}): Promise<string> {
    await ensureSchema();

    const [row] = await sql`
        INSERT INTO app.lost_documents (
            user_id, title, description, location, image_path, redacted_image_path
        ) VALUES (
            ${params.userId},
            ${params.title},
            ${params.description},
            ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
            ${params.imagePath},
            ${params.redactedImagePath}
        )
        RETURNING id
    `;

    if (!row) throw new Error('Failed to insert lost document');
    return row.id;
}

export async function selectLostDocuments(limit = 50, offset = 0): Promise<LostDocument[]> {
    await ensureSchema();

    const rows = (await sql`
        SELECT 
            ld.id,
            ld.user_id,
            u.display_name as user_name,
            ld.title,
            ld.description,
            ST_Y(ld.location::geometry) as lat,
            ST_X(ld.location::geometry) as lng,
            ld.image_path,
            ld.redacted_image_path,
            ld.status,
            ld.matched_user_id,
            ld.created_at
        FROM app.lost_documents ld
        LEFT JOIN app.users u ON u.id = ld.user_id
        ORDER BY ld.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
    `) as LostDocumentRow[];

    return rows.map(mapRowToLostDocument);
}

export async function selectLostDocumentById(id: string): Promise<LostDocument | null> {
    await ensureSchema();

    const [row] = (await sql`
        SELECT 
            ld.id,
            ld.user_id,
            u.display_name as user_name,
            ld.title,
            ld.description,
            ST_Y(ld.location::geometry) as lat,
            ST_X(ld.location::geometry) as lng,
            ld.image_path,
            ld.redacted_image_path,
            ld.status,
            ld.matched_user_id,
            ld.created_at
        FROM app.lost_documents ld
        LEFT JOIN app.users u ON u.id = ld.user_id
        WHERE ld.id = ${id}
    `) as LostDocumentRow[];

    if (!row) return null;
    return mapRowToLostDocument(row);
}

export async function updateLostDocumentStatus(
    id: string,
    status: LostDocumentStatus
): Promise<boolean> {
    await ensureSchema();

    const [row] = await sql`
        UPDATE app.lost_documents
        SET status = ${status}
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(row);
}

export async function setMatchedUser(id: string, matchedUserId: string): Promise<boolean> {
    await ensureSchema();

    const [row] = await sql`
        UPDATE app.lost_documents
        SET matched_user_id = ${matchedUserId},
            status = 'matched'
        WHERE id = ${id}
        RETURNING id
    `;

    return Boolean(row);
}

function mapRowToLostDocument(row: LostDocumentRow): LostDocument {
    return {
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        title: row.title,
        description: row.description,
        lat: Number(row.lat),
        lng: Number(row.lng),
        imagePath: row.image_path,
        redactedImagePath: row.redacted_image_path,
        status: row.status as LostDocumentStatus,
        matchedUserId: row.matched_user_id,
        createdAt: new Date(row.created_at).getTime(),
    };
}
