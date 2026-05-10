-- Migration 008: Incident stored procedures
-- Adds two stored procedures to enforce mutual exclusivity between
-- incident_reports and incident_votes for the same (incident_id, user_id) pair.

-- ------------------------------------------------------------
-- 1. incident_report_insert
--    Finds or creates an incident row, removes any conflicting vote,
--    then inserts the report if one does not already exist.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incident_report_insert(
    p_user_id       uuid,
    p_incident_type uuid,
    p_title         varchar,
    p_description   varchar,
    p_location      geography(Polygon, 4326)
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_incident_id uuid;
BEGIN
    -- 1. Find existing incident or create a new one
    SELECT id
        INTO v_incident_id
        FROM app.incidents
        WHERE type = p_incident_type
          AND location = p_location
        LIMIT 1;

    IF v_incident_id IS NULL THEN
        INSERT INTO app.incidents (type, location, confidence_score, confirmed)
        VALUES (p_incident_type, p_location, 0, false)
        RETURNING id INTO v_incident_id;
    END IF;

    -- 2. If a vote exists for this (incident, user) pair, remove it
    DELETE FROM app.incident_votes
    WHERE id_incident = v_incident_id
      AND id_user = p_user_id;

    -- 3. Insert the report if one doesn't already exist
    INSERT INTO app.incident_reports (id_incident, id_user, title, description)
    VALUES (v_incident_id, p_user_id, p_title, p_description)
    ON CONFLICT (id_incident, id_user) DO NOTHING;
END;
$$;

-- ------------------------------------------------------------
-- 2. incident_votes_insert
--    Only acts if the incident exists.
--    If approved = false: delete the user's report (if any) and insert the vote.
--    If approved = true AND a report for (incident, user) exists: no-op.
--    If approved = true AND no report for (incident, user): insert the vote.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.incident_votes_insert(
    p_user_id     uuid,
    p_incident_id uuid,
    p_approve     boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Guard: incident must exist
    IF NOT EXISTS (
        SELECT 1 FROM app.incidents WHERE id = p_incident_id
    ) THEN
        RETURN;
    END IF;

    -- 2. If not approving: delete the user's report and cast the reject vote
    IF p_approve = false THEN
        DELETE FROM app.incident_reports
        WHERE id_incident = p_incident_id
          AND id_user = p_user_id;

        -- The confidence trigger may have cascade-deleted the incident
        -- when the report was removed. Re-check before inserting the vote.
        IF NOT EXISTS (
            SELECT 1 FROM app.incidents WHERE id = p_incident_id
        ) THEN
            RETURN;
        END IF;

        INSERT INTO app.incident_votes (id_incident, id_user, approved)
        VALUES (p_incident_id, p_user_id, p_approve)
        ON CONFLICT (id_incident, id_user) DO NOTHING;

    -- 3. If approving: only a no-op if user already has a report (report takes precedence)
    ELSIF NOT EXISTS (
        SELECT 1 FROM app.incident_reports
        WHERE id_incident = p_incident_id
          AND id_user = p_user_id
    ) THEN
        INSERT INTO app.incident_votes (id_incident, id_user, approved)
        VALUES (p_incident_id, p_user_id, p_approve)
        ON CONFLICT (id_incident, id_user) DO NOTHING;
    END IF;
END;
$$;
