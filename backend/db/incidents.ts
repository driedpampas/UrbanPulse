import { sql } from './client';
import { ensureSchema } from './schema';
import type { IncidentApprovalState, IncidentFeedItem, IncidentType } from './types';

export async function selectIncidentTypes(): Promise<IncidentType[]> {
    await ensureSchema();
    const rows = await sql`
        SELECT id::text, label
        FROM app.incident_type
        ORDER BY label ASC
    `;
    return rows.map((r) => ({ id: r.id as string, label: r.label as string }));
}

export async function insertIncidentType(label: string): Promise<IncidentType> {
    await ensureSchema();
    const [row] = await sql`
        INSERT INTO app.incident_type (label)
        VALUES (${label})
        RETURNING id::text, label
    `;
    if (!row) throw new Error('Failed to insert incident type');
    return { id: row.id as string, label: row.label as string };
}

export async function deleteIncidentType(id: string): Promise<boolean> {
    await ensureSchema();
    const [deleted] = await sql`
        DELETE FROM app.incident_type
        WHERE id = ${id}::uuid
        RETURNING id
    `;
    return Boolean(deleted);
}

export async function updateIncidentType(id: string, label: string): Promise<boolean> {
    await ensureSchema();
    const [updated] = await sql`
        UPDATE app.incident_type
        SET label = ${label}
        WHERE id = ${id}::uuid
        RETURNING id
    `;
    return Boolean(updated);
}

function toApprovalState(hasAdmin: boolean, hasAuthority: boolean): IncidentApprovalState {
    if (hasAdmin) return 'admin_approved';
    if (hasAuthority) return 'first_responder_approved';
    return 'community_only';
}

export async function selectIncidentsByPoint(
    lat: number,
    lng: number,
    confirmed: boolean,
    requestingUserId: string
): Promise<IncidentFeedItem[]> {
    await ensureSchema();
    const rows = (await sql`
        SELECT
            i.id::text,
            i.type::text                 AS "typeId",
            it.label                     AS "typeLabel",
            i.confidence_score           AS "confidenceScore",
            i.confirmed,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'userId',                 ir.id_user::text,
                        'userName',               NULLIF(u.display_name, ''),
                        'profilePictureFilename', u.profile_picture_filename,
                        'title',                  ir.title,
                        'description',            ir.description,
                        'createdAt',              EXTRACT(EPOCH FROM ir.created_at) * 1000
                    )
                    ORDER BY ir.created_at DESC
                ) FILTER (WHERE ir.id_incident IS NOT NULL),
                '[]'::jsonb
            )                            AS reports,
            iv.approved                  AS "userVote",
            BOOL_OR(u.role::text = 'admin')                      AS "hasAdmin",
            BOOL_OR(u.role::text IN ('admin', 'first_responder')) AS "hasAuthority"
        FROM app.incidents i
        JOIN app.incident_type it ON i.type = it.id
        LEFT JOIN app.incident_reports ir ON ir.id_incident = i.id
        LEFT JOIN app.users u ON ir.id_user = u.id
        LEFT JOIN app.incident_votes iv
            ON iv.id_incident = i.id
            AND iv.id_user = ${requestingUserId}::uuid
        WHERE i.confirmed = ${confirmed}
          AND ST_Contains(
                i.location::geometry,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
              )
        GROUP BY i.id, it.label, iv.approved
        ORDER BY i.confidence_score DESC
    `) as Array<{
        id: string;
        typeId: string;
        typeLabel: string;
        confidenceScore: number;
        confirmed: boolean;
        reports: unknown;
        userVote: boolean | null;
        hasAdmin: boolean;
        hasAuthority: boolean;
    }>;

    return rows.map((r) => ({
        id: r.id,
        typeId: r.typeId,
        typeLabel: r.typeLabel,
        confidenceScore: r.confidenceScore,
        confirmed: r.confirmed,
        approvalState: toApprovalState(r.hasAdmin, r.hasAuthority),
        reports: r.reports as IncidentFeedItem['reports'],
        userVote: r.userVote,
    }));
}

export async function insertIncidentReport(
    userId: string,
    typeId: string,
    title: string,
    description: string,
    lat: number,
    lng: number
): Promise<{ confirmedIncidentIds: string[] }> {
    await ensureSchema();

    // Capture confirmed IDs near the point before the insert
    const pointGeog = sql`ST_Buffer(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 200)`;
    const before = (await sql`
        SELECT id::text FROM app.incidents
        WHERE confirmed = true
          AND ST_DWithin(location, ${pointGeog}, 0)
    `) as Array<{ id: string }>;
    const beforeIds = new Set(before.map((r) => r.id));

    // 100-metre radius polygon around the given point
    const locationExpr = sql`ST_Buffer(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 100)::geography`;
    await sql`
        SELECT app.incident_report_insert(
            ${userId}::uuid,
            ${typeId}::uuid,
            ${title},
            ${description},
            ${locationExpr}::geography(Polygon, 4326)
        )
    `;

    const after = (await sql`
        SELECT id::text FROM app.incidents
        WHERE confirmed = true
          AND ST_DWithin(location, ${pointGeog}, 0)
    `) as Array<{ id: string }>;

    const confirmedIncidentIds = after.map((r) => r.id).filter((id) => !beforeIds.has(id));

    return { confirmedIncidentIds };
}

export async function insertIncidentReportForPolygon(
    userId: string,
    typeId: string,
    title: string,
    description: string,
    polygonWkt: string
): Promise<{ confirmedIncidentIds: string[] }> {
    await ensureSchema();

    const before = (await sql`
        SELECT id::text FROM app.incidents
        WHERE confirmed = true
          AND ST_Intersects(location, ST_GeogFromText(${polygonWkt}))
    `) as Array<{ id: string }>;
    const beforeIds = new Set(before.map((r) => r.id));

    const locationExpr = sql`ST_GeogFromText(${polygonWkt})`;
    await sql`
        SELECT app.incident_report_insert(
            ${userId}::uuid,
            ${typeId}::uuid,
            ${title},
            ${description},
            ${locationExpr}::geography(Polygon, 4326)
        )
    `;

    const after = (await sql`
        SELECT id::text FROM app.incidents
        WHERE confirmed = true
          AND ST_Intersects(location, ST_GeogFromText(${polygonWkt}))
    `) as Array<{ id: string }>;

    const confirmedIncidentIds = after.map((r) => r.id).filter((id) => !beforeIds.has(id));

    return { confirmedIncidentIds };
}

export async function insertIncidentVote(
    userId: string,
    incidentId: string,
    approved: boolean
): Promise<{ exists: boolean; confirmedIncidentIds: string[] }> {
    await ensureSchema();

    const existing = (await sql`
        SELECT id::text, confirmed FROM app.incidents WHERE id = ${incidentId}::uuid LIMIT 1
    `) as Array<{ id: string; confirmed: boolean }>;

    if (existing.length === 0) {
        return { exists: false, confirmedIncidentIds: [] };
    }

    const wasConfirmed = existing[0]?.confirmed ?? false;

    await sql`
        SELECT app.incident_votes_insert(
            ${userId}::uuid,
            ${incidentId}::uuid,
            ${approved}
        )
    `;

    const after = (await sql`
        SELECT id::text, confirmed FROM app.incidents WHERE id = ${incidentId}::uuid LIMIT 1
    `) as Array<{ id: string; confirmed: boolean }>;

    const nowConfirmed = after.length > 0 && (after[0]?.confirmed ?? false);
    const confirmedIncidentIds = !wasConfirmed && nowConfirmed ? [incidentId] : [];

    return { exists: true, confirmedIncidentIds };
}

export async function selectUsersInIncidentPolygon(incidentId: string): Promise<string[]> {
    await ensureSchema();
    const rows = (await sql`
        SELECT uc.user_id::text AS id
        FROM app.user_crisis uc
        JOIN app.incidents i ON ST_Contains(i.location::geometry, uc.location::geometry)
        WHERE i.id = ${incidentId}::uuid
    `) as Array<{ id: string }>;
    return rows.map((r) => r.id);
}

export async function selectSectorWkts(boundaryWkt: string, stepDeg: number): Promise<string[]> {
    await ensureSchema();
    const rows = (await sql`
        WITH boundary AS (
            SELECT ST_SetSRID(ST_GeomFromText(${boundaryWkt}), 4326) AS geom
        ),
        env AS (
            SELECT
                ST_XMin(geom)  AS xmin,
                ST_YMin(geom)  AS ymin,
                ST_XMax(geom)  AS xmax,
                ST_YMax(geom)  AS ymax,
                geom
            FROM boundary
        ),
        grid AS (
            SELECT ST_MakeEnvelope(
                xmin + xi::float * ${stepDeg},
                ymin + yi::float * ${stepDeg},
                xmin + (xi::float + 1) * ${stepDeg},
                ymin + (yi::float + 1) * ${stepDeg},
                4326
            ) AS cell
            FROM env,
            generate_series(0, CEIL((xmax - xmin) / ${stepDeg})::integer - 1) AS xi,
            generate_series(0, CEIL((ymax - ymin) / ${stepDeg})::integer - 1) AS yi
        ),
        intersected AS (
            SELECT ST_MakeValid(ST_Intersection(cell, env.geom)) AS sector
            FROM grid, env
            WHERE ST_Intersects(cell, env.geom)
              AND ST_Area(ST_Intersection(cell, env.geom)) > 0.05 * ST_Area(cell)
        )
        SELECT ST_AsText(sector) AS wkt
        FROM intersected
        WHERE ST_GeometryType(sector) LIKE 'ST_Polygon%'
          AND ST_Area(sector) > 0
    `) as Array<{ wkt: string }>;
    return rows.map((r) => r.wkt);
}
