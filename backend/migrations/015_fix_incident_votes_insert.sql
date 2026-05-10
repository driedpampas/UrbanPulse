-- Migration 015: Fix FK violation in incident_votes_insert
-- When a user votes approved=false, their incident report is deleted first.
-- The confidence trigger on incident_reports may cascade-delete the incident
-- if the score drops to 0. The subsequent INSERT into incident_votes then fails
-- with a FK violation because the incident no longer exists.
-- Fix: re-check incident existence after the DELETE before inserting the vote.

CREATE OR REPLACE FUNCTION app.incident_votes_insert(
    p_user_id     uuid,
    p_incident_id uuid,
    p_approve     boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM app.incidents WHERE id = p_incident_id
    ) THEN
        RETURN;
    END IF;

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
        ON CONFLICT (id_incident, id_user) DO UPDATE SET approved = EXCLUDED.approved;

    ELSE
        INSERT INTO app.incident_votes (id_incident, id_user, approved)
        VALUES (p_incident_id, p_user_id, p_approve)
        ON CONFLICT (id_incident, id_user) DO UPDATE SET approved = EXCLUDED.approved;
    END IF;
END;
$$;
